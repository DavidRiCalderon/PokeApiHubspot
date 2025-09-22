// src/service/external/hubspotService/MoveHubspotService.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { RepositoryMove } from "../../../repository/RepositoryMove";
import { pool } from "../../../repository/database";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;
const HUBSPOT_MOVE_OBJECT_ENV = process.env.HUBSPOT_MOVE_OBJECT || ""; // ej: "2-1234567" o "p12345678_move"
const HUBSPOT_MOVE_UPLOAD_LIMIT = Number(process.env.HUBSPOT_MOVE_UPLOAD_LIMIT || "100"); // 👈 límite por default

type HubSpotSchema = {
  name: string;                    // ej: "move"
  labels?: { singular?: string; plural?: string };
  objectTypeId: string;            // ej: "2-1234567"
  fullyQualifiedName: string;      // ej: "p12345678_move"
};
type HubSpotSchemasResponse = { results: HubSpotSchema[] };

type HubSpotBatchCreateInput = {
  objectWriteTraceId?: string;
  properties: Record<string, any>;
};
type HubSpotObjectResult = {
  id: string;
  properties?: Record<string, any>;
};
type HubSpotBatchCreateResponse = {
  results?: HubSpotObjectResult[];
  errors?: any[];
  status?: string;
};

type HubSpotBatchReadBody = {
  properties?: string[];
  inputs: Array<{ id: string }>;
};
type HubSpotBatchReadResponse = {
  results?: HubSpotObjectResult[];
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

  /** Resuelve el objectTypeId / fullyQualifiedName del custom object "move" */
  private async resolveMoveObjectType(): Promise<string> {
    // 1) ENV directo
    if (HUBSPOT_MOVE_OBJECT_ENV && /^(2-\d+|p\d+_move)$/i.test(HUBSPOT_MOVE_OBJECT_ENV)) {
      this.cachedMoveObjectType = HUBSPOT_MOVE_OBJECT_ENV;
      return this.cachedMoveObjectType;
    }
    if (this.cachedMoveObjectType) return this.cachedMoveObjectType;

    // 2) Descubrir por /schemas
    const resp = await axios.get<HubSpotSchemasResponse>(
      "https://api.hubapi.com/crm/v3/schemas",
      {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
        validateStatus: (s) => s >= 200 && s < 300,
      }
    );

    const schemas = resp.data?.results || [];
    const match =
      schemas.find(s => s.name?.toLowerCase() === "move") ||
      schemas.find(s => s.labels?.singular?.toLowerCase() === "move");

    if (!match) {
      throw new Error(
        "No se encontró el custom object 'move' en /crm/v3/schemas. " +
        "Verifica que exista y que el token tenga permisos."
      );
    }

    this.cachedMoveObjectType = match.objectTypeId || match.fullyQualifiedName;
    if (!this.cachedMoveObjectType) {
      throw new Error("Schema 'move' encontrado pero sin objectTypeId/fullyQualifiedName.");
    }

    console.log(`ℹ️ HubSpot move objectType resuelto: ${this.cachedMoveObjectType}`);
    return this.cachedMoveObjectType;
  }

  /**
   * Sube los Move locales a HubSpot como custom object "move" (máximo 'limit').
   * Guarda el hs_object_id en `Move.id_move_hubspot`.
   * Correlación: property "id" (HubSpot) ⇔ id_move (MySQL).
   */
  async syncMovesBatch(limit: number = HUBSPOT_MOVE_UPLOAD_LIMIT): Promise<void> {
    const pendingAll = await this.repo.findNotSynced(5000);
    if (pendingAll.length === 0) {
      console.log("✅ No hay moves pendientes de subir a HubSpot.");
      return;
    }

    // 👇 Aplicar límite
    const toProcess = pendingAll.slice(0, Math.max(0, limit));
    if (toProcess.length < pendingAll.length) {
      console.log(
        `🧮 Límite activo: procesaré ${toProcess.length} de ${pendingAll.length} moves pendientes.`
      );
    } else {
      console.log(`🧮 Procesaré ${toProcess.length} moves pendientes (sin recorte).`);
    }

    const objectType = await this.resolveMoveObjectType();
    const createUrl = `https://api.hubapi.com/crm/v3/objects/${encodeURIComponent(objectType)}/batch/create`;
    const readUrl   = `https://api.hubapi.com/crm/v3/objects/${encodeURIComponent(objectType)}/batch/read`;

    // HubSpot permite lotes de hasta 100 inputs por request
    for (const batch of chunk(toProcess, 100)) {
      // Construir inputs con la propiedad *custom object* "id" = id_move (clave de correlación)
      const inputs: HubSpotBatchCreateInput[] = batch.map((mv) => ({
        objectWriteTraceId: String(mv.idMove),
        properties: {
          // 🔴 Usa los *internal names* reales del objeto custom "move" en tu portal:
          id: mv.idMove,            // (custom) clave de correlación
          name: mv.name,            // (custom)
          pp: mv.pp,                // (custom)
          power: mv.power ?? 0,     // (custom) si nullable, decide si envías null o 0
        },
      }));

      try {
        // 1) batch/create
        const resp = await axios.post<HubSpotBatchCreateResponse>(
          createUrl,
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
          if (body?.errors?.length) {
            console.error("⚠️ Errores en batch/create (moves):", body.errors);
          }
          continue;
        }

        // 2) Si create no trae properties.id, pedimos batch/read (prop "id") para correlación robusta
        let remoteResults: HubSpotObjectResult[] = body.results;
        const missingProps = !remoteResults.some(r => r.properties && ("id" in r.properties));

        if (missingProps) {
          const ids = remoteResults.map(r => ({ id: r.id }));
          const readBody: HubSpotBatchReadBody = {
            properties: ["id"], // 👈 necesitamos la propiedad custom "id"
            inputs: ids,
          };

          try {
            const readResp = await axios.post<HubSpotBatchReadResponse>(
              readUrl,
              readBody,
              {
                headers: {
                  Authorization: `Bearer ${HUBSPOT_TOKEN}`,
                  "Content-Type": "application/json",
                },
                validateStatus: (s) => s >= 200 && s < 300,
              }
            );
            if (readResp.data?.results?.length) {
              remoteResults = readResp.data.results;
            } else {
              console.warn("⚠️ batch/read (moves) no devolvió results; continuaré sólo con IDs (menos seguro).");
            }
          } catch (e: any) {
            console.warn("⚠️ No se pudo hacer batch/read de moves recién creados:",
              e?.response?.data ?? e?.message ?? e);
          }
        }

        // 3) Índice local por id_move (string)
        const localById = new Map<string, (typeof batch)[number]>();
        for (const mv of batch) localById.set(String(mv.idMove), mv);

        // 4) Mapear por property "id" y guardar hs_object_id
        for (const remote of remoteResults) {
          const hubspotId = Number(remote.id);
          const props = remote.properties || {};
          const key = (props.id != null) ? String(props.id).trim() : "";

          if (!key) {
            console.warn(`⚠️ ${objectType} HubSpot id=${hubspotId} no trae property "id" para correlación.`);
            continue;
          }

          const local = localById.get(key);
          if (!local) {
            console.warn(`⚠️ No hay Move local para key='${key}' (prop "id"). HubSpot ${objectType} id=${hubspotId}`);
            continue;
          }

          try {
            await this.repo.saveHubspotId(local.idMove, hubspotId);
            console.log(`🏷️ Move ${local.idMove} (${local.name}) → HubSpot ${objectType} hs_object_id=${hubspotId}`);
            localById.delete(key);
          } catch (e) {
            console.error(
              `❌ Error guardando id_move_hubspot para Move ${local.idMove}:`,
              e instanceof Error ? e.message : e
            );
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

    console.log("🎉 Sincronización de moves completa (límite aplicado).");
  }
}
