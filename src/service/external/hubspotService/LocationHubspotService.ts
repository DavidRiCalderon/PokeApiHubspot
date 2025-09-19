// src/service/external/hubspotService/HubspotCompanyService.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { RepositoryLocation } from "../../../repository/RepositoryLocation";
import { pool } from "../../../repository/database"; // <-- ajusta el path si tu pool está en otro lugar

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;
const HUBSPOT_BATCH_URL =
  "https://api.hubapi.com/crm/v3/objects/companies/batch/create";

// Input para batch/create
type HubSpotBatchCreateInput = {
  objectWriteTraceId?: string; // lo usamos para correlación con el id local
  properties: Record<string, any>;
};

// Respuesta de batch/create (simplificada a lo que usamos)
type HubSpotBatchCreateResponse = {
  results?: Array<{
    id: string; // hs_object_id
    properties?: Record<string, any>;
    createdAt?: string;
    updatedAt?: string;
    archived?: boolean;
  }>;
  errors?: any[];
  status?: string; // "PENDING" | "COMPLETE" | etc
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class HubspotCompanyService {
  constructor(private repoLoc = new RepositoryLocation(pool)) {}

  /**
   * Sube Locations como Companies en HubSpot (batch) y persiste el hs_object_id en la DB local.
   * - Mapea: name -> name, region -> country, generation -> generation
   * - idLocation -> phone (para verlo en HubSpot)
   * - Correlación por orden y objectWriteTraceId
   */
  async syncLocationsAsCompaniesBatch(): Promise<void> {
    // 1) Leer pendientes (sin hs id)
    const pending = await this.repoLoc.findNotSynced(5000);
    if (pending.length === 0) {
      console.log("✅ No hay locations pendientes de subir a HubSpot.");
      return;
    }

    // 2) Partir en lotes de 100 (límite típico de HubSpot batch)
    const batches = chunk(pending, 100);

    for (const batch of batches) {
      // 3) Construir inputs: usamos phone = idLocation y guardamos objectWriteTraceId
      const inputs: HubSpotBatchCreateInput[] = batch.map((loc) => ({
        objectWriteTraceId: String(loc.idLocation),
        properties: {
          name: loc.name,
          country: loc.region,         // region -> country
          generation: loc.generation,  // asegúrate que exista la propiedad en tu portal
          phone: String(loc.idLocation) // id local visible en HubSpot
        },
      }));

      try {
        const resp = await axios.post<HubSpotBatchCreateResponse>(
          HUBSPOT_BATCH_URL,
          { inputs },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            // axios lanza error si status >= 400, así que si estamos aquí es 2xx
            validateStatus: (s) => s >= 200 && s < 300,
          }
        );

        const body = resp.data;

        if (!body?.results?.length) {
          console.warn("⚠️ HubSpot no devolvió results en este batch.");
        } else {
          // 4) Correlacionar y guardar hs_object_id en la DB
          // Estrategia: HubSpot usualmente responde en el mismo orden de inputs
          // (además mandamos objectWriteTraceId para debugging/correlación).
          for (let i = 0; i < Math.min(batch.length, body.results.length); i++) {
            const local = batch[i];
            const remote = body.results[i];
            const hubspotId = Number(remote.id); // tu modelo usa number | null

            try {
              await this.repoLoc.saveHubspotId(local.idLocation, hubspotId);
              console.log(
                `🏷️ Location ${local.idLocation} (${local.name}) → HubSpot Company hs_object_id=${hubspotId}`
              );
            } catch (e) {
              console.error(
                `❌ Error guardando hs_object_id para Location ${local.idLocation}:`,
                e instanceof Error ? e.message : e
              );
            }
          }
        }

        if (body?.errors?.length) {
          console.error("⚠️ HubSpot batch create devolvió errores parciales:", body.errors);
        } else {
          console.log(`✅ Batch subido correctamente (${batch.length} companies).`);
        }
      } catch (e: any) {
        const msg = e?.response?.data ?? e?.message ?? e;
        console.error("❌ Error llamando a HubSpot batch create:", msg);
      }
    }

    console.log("🎉 Sincronización completa.");
  }
}
