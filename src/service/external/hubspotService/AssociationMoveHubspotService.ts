// src/service/external/hubspotService/AssociationPokemonMoveService.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { pool } from "../../../repository/database";
import { RepositoryPokeMove } from "../../../repository/RepositoryPokeMove";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;
const HUBSPOT_MOVE_OBJECT_ENV = process.env.HUBSPOT_MOVE_OBJECT || ""; // ej: "2-1234567" o "pXXXX_move"
// Puedes cambiar estos nombres si quieres otra etiqueta
const ASSOC_LABEL = process.env.HUBSPOT_ASSOC_LABEL || "Move Relation";
const ASSOC_NAME  = process.env.HUBSPOT_ASSOC_NAME  || "move_relation";

type AssocLabel = {
  category: "HUBSPOT_DEFINED" | "USER_DEFINED";
  typeId: number;
  label?: string | null;
};

type LabelsResp = {
  results?: AssocLabel[];
};

type SchemasResp = {
  results?: Array<{
    name: string;
    objectTypeId: string;
    fullyQualifiedName: string;
    labels?: { singular?: string; plural?: string };
  }>;
};

type AssocInput = {
  from: { id: string };
  to: { id: string };
  types: Array<{ associationCategory: "HUBSPOT_DEFINED" | "USER_DEFINED"; associationTypeId: number }>;
};

type BatchResp = { results?: any[]; errors?: any[] };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class AssociationPokemonMoveService {
  private moveObjectType: string | null = null; // ej: "2-1234567"
  private contactToMoveTypeId: number | null = null;
  private moveToContactTypeId: number | null = null;

  constructor(private repo = new RepositoryPokeMove(pool)) {}

  /** Resuelve el objectType real del custom object "move" */
  private async resolveMoveObjectType(): Promise<string> {
    // 1) Si viene en ENV y parece válido, úsalo
    if (HUBSPOT_MOVE_OBJECT_ENV && /^(2-\d+|p\d+_move)$/i.test(HUBSPOT_MOVE_OBJECT_ENV)) {
      this.moveObjectType = HUBSPOT_MOVE_OBJECT_ENV;
      return this.moveObjectType;
    }
    if (this.moveObjectType) return this.moveObjectType;

    // 2) Descubre por /schemas
    const s = await axios.get<SchemasResp>("https://api.hubapi.com/crm/v3/schemas", {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
      validateStatus: (st) => st >= 200 && st < 300,
    });

    const schemas = s.data?.results || [];
    const found =
      schemas.find((x) => x.name?.toLowerCase() === "move") ||
      schemas.find((x) => x.labels?.singular?.toLowerCase() === "move");

    if (!found) throw new Error("No se encontró el custom object 'move' en /crm/v3/schemas.");

    this.moveObjectType = found.objectTypeId || found.fullyQualifiedName;
    if (!this.moveObjectType) throw new Error("Schema 'move' sin objectTypeId/fullyQualifiedName.");
    return this.moveObjectType;
  }

  // ===== helpers para labels (association types) =====

  /** Lee labels de una dirección fromType -> toType */
  private async getLabels(fromType: string, toType: string): Promise<AssocLabel[]> {
    const url = `https://api.hubapi.com/crm/v4/associations/${encodeURIComponent(
      fromType
    )}/${encodeURIComponent(toType)}/labels`;

    const r = await axios.get<LabelsResp>(url, {
      headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
      validateStatus: (st) => st >= 200 && st < 300,
    });

    return r.data?.results || [];
  }

  /** Crea una etiqueta USER_DEFINED en la dirección fromType -> toType */
  private async createLabel(fromType: string, toType: string, label: string, name: string, inverseLabel?: string) {
    const url = `https://api.hubapi.com/crm/v4/associations/${encodeURIComponent(
      fromType
    )}/${encodeURIComponent(toType)}/labels`;

    const payload = inverseLabel
      ? { label, inverseLabel, name }
      : { label, name };

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      validateStatus: (st) => st >= 200 && st < 300,
    });
  }

  /**
   * Garantiza que exista un associationTypeId para la dirección indicada.
   * - Si existe una USER_DEFINED con el label deseado, usa su typeId.
   * - Si no existe, la crea y lee de nuevo.
   * - Si existe alguna HUBSPOT_DEFINED (raro en custom), también serviría.
   */
  private async ensureAssocTypeId(
    fromType: string,
    toType: string,
    desiredLabel = ASSOC_LABEL,
    desiredName = ASSOC_NAME,
    inverseLabel?: string // opcional por si quieres pares (p.ej. "Entrenador" / "Pokémon")
  ): Promise<number> {
    // 1) Buscar existente
    let labels = await this.getLabels(fromType, toType);
    let chosen =
      labels.find(l => l.category === "USER_DEFINED" && (l.label || "").toLowerCase() === desiredLabel.toLowerCase())
      || labels.find(l => l.category === "HUBSPOT_DEFINED");

    if (!chosen) {
      // 2) Crear USER_DEFINED
      await this.createLabel(fromType, toType, desiredLabel, desiredName, inverseLabel);
      // 3) Volver a leer
      labels = await this.getLabels(fromType, toType);
      chosen = labels.find(l => l.category === "USER_DEFINED" && (l.label || "").toLowerCase() === desiredLabel.toLowerCase());
    }

    if (!chosen?.typeId) {
      throw new Error(`No pude resolver typeId de la etiqueta '${desiredLabel}' para ${fromType} -> ${toType}`);
    }

    // cache básico para las direcciones principales
    const key = `${fromType}->${toType}`;
    if (key === "contacts->move") this.contactToMoveTypeId = chosen.typeId;
    if (key === "move->contacts") this.moveToContactTypeId = chosen.typeId;

    return chosen.typeId;
  }

  /** Batch associate con labels (types) */
  private async batchAssociateLabeled(
    fromType: string,
    toType: string,
    typeId: number,
    pairs: { fromId: string; toId: string }[],
    batchSize = 100
  ) {
    const url = `https://api.hubapi.com/crm/v4/associations/${encodeURIComponent(
      fromType
    )}/${encodeURIComponent(toType)}/batch/create`;

    const inputs: AssocInput[] = pairs.map((p) => ({
      from: { id: p.fromId },
      to: { id: p.toId },
      types: [{ associationCategory: "USER_DEFINED", associationTypeId: typeId }],
    }));

    for (const b of chunk(inputs, batchSize)) {
      try {
        const resp = await axios.post<BatchResp>(
          url,
          { inputs: b },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            validateStatus: (st) => st >= 200 && st < 300,
          }
        );
        if (resp.data?.errors?.length) {
          console.error(`⚠️ Errores creando asociaciones ${fromType}→${toType}:`, resp.data.errors);
        } else {
          console.log(`✅ Asociaciones ${fromType}→${toType} creadas: ${b.length}`);
        }
      } catch (e: any) {
        console.error(`❌ Error ${fromType}→${toType}:`, e?.response?.data ?? e?.message ?? e);
      }
    }
  }

  /** Crea asociaciones Contact → Move */
  async associateContactsToMoves(batchSize = 100): Promise<void> {
    const moveType = await this.resolveMoveObjectType();

    // Asegura que exista un typeId usable para ESTA dirección (contacts -> move)
    const typeId =
      this.contactToMoveTypeId ??
      (await this.ensureAssocTypeId("contacts", moveType, ASSOC_LABEL, ASSOC_NAME));

    const pairs = await this.repo.findAssociations(5000);
    if (!pairs.length) {
      console.log("✅ No hay pares contact↔︎move con IDs HS para asociar.");
      return;
    }

    const condensed = pairs.map((p) => ({ fromId: p.contactHubspotId, toId: p.moveHubspotId }));
    await this.batchAssociateLabeled("contacts", moveType, typeId, condensed, batchSize);
  }

  /** Crea asociaciones Move → Contact (si quieres explícito en ambos sentidos) */
  async associateMovesToContacts(batchSize = 100): Promise<void> {
    const moveType = await this.resolveMoveObjectType();

    // Asegura que exista un typeId usable para ESTA dirección (move -> contacts)
    const typeId =
      this.moveToContactTypeId ??
      (await this.ensureAssocTypeId(moveType, "contacts", ASSOC_LABEL, ASSOC_NAME));

    const pairs = await this.repo.findAssociations(5000);
    if (!pairs.length) {
      console.log("✅ No hay pares move↔︎contact con IDs HS para asociar.");
      return;
    }

    const condensed = pairs.map((p) => ({ fromId: p.moveHubspotId, toId: p.contactHubspotId }));
    await this.batchAssociateLabeled(moveType, "contacts", typeId, condensed, batchSize);
  }

  /** Atajo para ambas direcciones */
  async associateBothDirections(): Promise<void> {
    await this.associateContactsToMoves();
    await this.associateMovesToContacts();
    console.log("🎉 Asociaciones Pokemon (Contact) ↔︎ Move (Custom) completas.");
  }
}
