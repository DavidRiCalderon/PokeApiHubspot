// src/service/external/hubspotService/MoveHubspotService.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { RepositoryMove } from "../../../repository/RepositoryMove";
import { pool } from "../../../repository/database";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;
const HUBSPOT_MOVE_OBJECT_ENV = process.env.HUBSPOT_MOVE_OBJECT || ""; // si ya lo conoces, pon 2-xxxxxx aquí

type HubSpotSchema = {
  name: string;                    // ej: "move"
  labels?: { singular?: string; plural?: string };
  objectTypeId: string;            // ej: "2-1234567"
  fullyQualifiedName: string;      // ej: "p12345678_move"
};

type HubSpotSchemasResponse = {
  results: HubSpotSchema[];
};

type HubSpotBatchCreateInput = {
  objectWriteTraceId?: string;
  properties: Record<string, any>;
};

type HubSpotBatchCreateResponse = {
  results?: Array<{ id: string; properties?: Record<string, any> }>;
  errors?: any[];
  status?: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class MoveHubspotService {
  private cachedMoveObjectType: string | null = null;

  constructor(private repo = new RepositoryMove(pool)) {}

  private async resolveMoveObjectType(): Promise<string> {
    // 1) Si viene por ENV y parece un ID válido, úsalo
    if (HUBSPOT_MOVE_OBJECT_ENV && /^(2-\d+|p\d+_move)$/i.test(HUBSPOT_MOVE_OBJECT_ENV)) {
      this.cachedMoveObjectType = HUBSPOT_MOVE_OBJECT_ENV;
      return HUBSPOT_MOVE_OBJECT_ENV;
    }
    if (this.cachedMoveObjectType) return this.cachedMoveObjectType;

    // 2) Descubrirlo por schemas
    const resp = await axios.get<HubSpotSchemasResponse>(
      "https://api.hubapi.com/crm/v3/schemas",
      {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
        validateStatus: (s) => s >= 200 && s < 300,
      }
    );

    const schemas = resp.data?.results || [];

    // Busca por name "move" o por label "Move"
    const match =
      schemas.find(s => s.name?.toLowerCase() === "move") ||
      schemas.find(s => s.labels?.singular?.toLowerCase() === "move");

    if (!match) {
      throw new Error(
        "No se encontró el custom object 'move' en /crm/v3/schemas. " +
        "Verifica que exista y que el token tenga permisos."
      );
    }

    // Usa objectTypeId (forma más corta) o el fullyQualifiedName
    this.cachedMoveObjectType = match.objectTypeId || match.fullyQualifiedName;
    if (!this.cachedMoveObjectType) {
      throw new Error("Schema de 'move' encontrado pero sin objectTypeId/fullyQualifiedName.");
    }

    console.log(`ℹ️ HubSpot move objectType resuelto: ${this.cachedMoveObjectType}`);
    return this.cachedMoveObjectType;
  }

  /**
   * Sube los Move locales a HubSpot como custom object "move" (resuelto),
   * captura hs_object_id y lo guarda en id_move_hubspot.
   */
  async syncMovesBatch(): Promise<void> {
    const pending = await this.repo.findNotSynced(5000);
    if (pending.length === 0) {
      console.log("✅ No hay moves pendientes de subir a HubSpot.");
      return;
    }

    const objectType = await this.resolveMoveObjectType(); // ← clave
    const url = `https://api.hubapi.com/crm/v3/objects/${encodeURIComponent(objectType)}/batch/create`;

    const batches = chunk(pending, 100);

    for (const batch of batches) {
      const inputs: HubSpotBatchCreateInput[] = batch.map((mv) => ({
        objectWriteTraceId: String(mv.idMove),
        properties: {
          // Usa los internal names reales de tu objeto custom en HubSpot:
          id: mv.idMove,              // "Move Id" (prop numérica/entera)
          name: mv.name,              // "Name"
          pp: mv.pp,                  // "PP"
          power: mv.power ?? 0,       // "Power" (si es nullable, decide si mandar null o 0)
        },
      }));

      try {
        const resp = await axios.post<HubSpotBatchCreateResponse>(
          url,
          { inputs },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            validateStatus: (s) => s >= 200 && s < 300,
          }
        );

        const body = resp.data;

        if (!body?.results?.length) {
          console.warn("⚠️ HubSpot no devolvió results para este batch de moves.");
        } else {
          for (let i = 0; i < Math.min(batch.length, body.results.length); i++) {
            const local = batch[i];
            const remote = body.results[i];
            const hubspotId = Number(remote.id); // BIGINT en DB

            try {
              await this.repo.saveHubspotId(local.idMove, hubspotId);
              console.log(`🏷️ Move ${local.idMove} (${local.name}) → HubSpot ${objectType} id=${hubspotId}`);
            } catch (e) {
              console.error(
                `❌ Error guardando id_move_hubspot para Move ${local.idMove}:`,
                e instanceof Error ? e.message : e
              );
            }
          }
        }

        if (body?.errors?.length) {
          console.error("⚠️ HubSpot batch create (move) devolvió errores parciales:", body.errors);
        } else {
          console.log(`✅ Batch de moves subido correctamente (${batch.length} items).`);
        }
      } catch (e: any) {
        const msg = e?.response?.data ?? e?.message ?? e;
        console.error("❌ Error llamando a HubSpot batch create (move):", msg);
      }
    }

    console.log("🎉 Sincronización de moves completa.");
  }
}
