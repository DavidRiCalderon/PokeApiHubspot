// src/service/external/hubspotService/HubspotCompanyService.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { RepositoryLocation } from "../../../repository/RepositoryLocation";
import { pool } from "../../../repository/database";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;
const COMPANY_BATCH_CREATE_URL = "https://api.hubapi.com/crm/v3/objects/companies/batch/create";
const COMPANY_BATCH_READ_URL   = "https://api.hubapi.com/crm/v3/objects/companies/batch/read";

// Tipos para batch create / read
type HubSpotBatchCreateInput = {
  objectWriteTraceId?: string; // para depurar correlación
  properties: Record<string, any>;
};

type HubSpotCompanyResult = {
  id: string; // hs_object_id
  properties?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  archived?: boolean;
};

type HubSpotBatchCreateResponse = {
  results?: HubSpotCompanyResult[];
  errors?: any[];
  status?: string;
};

type HubSpotBatchReadBody = {
  properties?: string[];
  inputs: Array<{ id: string }>;
};

type HubSpotBatchReadResponse = {
  results?: HubSpotCompanyResult[];
  errors?: any[];
  status?: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Normaliza teléfonos: deja sólo dígitos (por si HubSpot formatea con +, espacios, guiones)
function normalizeDigits(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\D/g, "").trim();
}

export class HubspotCompanyService {
  constructor(private repoLoc = new RepositoryLocation(pool)) {}

  /**
   * Sube Locations como Companies en HubSpot en lotes de 100.
   * Correlación: phone (HubSpot) ⇔ id_location (MySQL).
   *
   * Mapeo sugerido:
   *  - name              ← name
   *  - phone             ← id_location (clave de correlación)
   *  - country           ← region                 (prop por defecto en Company)
   *  - generation        ← generation             (custom; créala o comenta)
   *  - number_of_areas   ← numbre_areas / numberArea (custom; créala o comenta)
   *
   * Luego guarda hs_object_id en `Location.id_location_Hubspot`.
   */
  async syncLocationsAsCompaniesBatch(): Promise<void> {
    // 1) Leer pendientes (sin hs id)
    const pending = await this.repoLoc.findNotSynced(5000);
    if (pending.length === 0) {
      console.log("✅ No hay locations pendientes de subir a HubSpot.");
      return;
    }

    // 2) Partir en lotes de 100
    const batches = chunk(pending, 100);

    for (const batch of batches) {
      // 3) Construir inputs (phone = id_location) y mandar props
      const inputs: HubSpotBatchCreateInput[] = [];

      for (const loc of batch) {
        // tolera ambos nombres (idLocation o id_location) según tu repo
        const idLocal =
          String((loc as any).idLocation ?? (loc as any).id_location ?? "").trim();
        if (!idLocal) {
          console.warn("⚠️ Location sin idLocation/id_location: la salto.");
          continue;
        }

        const numberAreas =
          (loc as any).numberArea ?? (loc as any).numbre_areas ?? null;

        inputs.push({
          objectWriteTraceId: idLocal,
          properties: {
            name: (loc as any).name,
            phone: idLocal,                         // 👈 clave de correlación
            country: (loc as any).region,           // region → country
            generation: (loc as any).generation,    // (custom) crea la prop o comenta esta línea
            number_of_areas: numberAreas,           // (custom) crea la prop o comenta esta línea
          },
        });
      }

      if (inputs.length === 0) {
        console.warn("⚠️ Batch sin inputs válidos; continúo con el siguiente.");
        continue;
      }

      try {
        // 4) batch/create
        const createResp = await axios.post<HubSpotBatchCreateResponse>(
          COMPANY_BATCH_CREATE_URL,
          { inputs },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            validateStatus: (s) => s >= 200 && s < 300,
          }
        );

        const createBody = createResp.data;

        if (!createBody?.results?.length) {
          console.warn("⚠️ HubSpot no devolvió results en este batch.");
          if (createBody?.errors?.length) {
            console.error("⚠️ Errores en batch/create (companies):", createBody.errors);
          }
          continue;
        }

        // 5) Si no vienen properties, pedimos 'phone' por batch/read
        let remoteResults: HubSpotCompanyResult[] = createBody.results;
        const missingProps = !remoteResults.some((r) => r.properties && "phone" in r.properties);

        if (missingProps) {
          const ids = remoteResults.map((r) => ({ id: r.id }));
          const readBody: HubSpotBatchReadBody = {
            properties: ["phone"], // sólo necesitamos correlación
            inputs: ids,
          };

          try {
            const readResp = await axios.post<HubSpotBatchReadResponse>(
              COMPANY_BATCH_READ_URL,
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
              console.warn("⚠️ batch/read (companies) no devolvió results; continuaré sólo con IDs.");
            }
          } catch (e: any) {
            console.warn(
              "⚠️ No se pudo hacer batch/read de companies recién creadas:",
              e?.response?.data ?? e?.message ?? e
            );
          }
        }

        // 6) Índice local por id_location (string)
        const localById = new Map<string, (typeof batch)[number]>();
        for (const loc of batch) {
          const idLocal =
            String((loc as any).idLocation ?? (loc as any).id_location ?? "").trim();
          if (idLocal) localById.set(idLocal, loc);
        }

        // 7) Mapear por phone normalizado y guardar hs_object_id
        for (const remote of remoteResults) {
          const hubspotId = Number(remote.id);
          const props = remote.properties || {};
          const key = normalizeDigits(props.phone);

          if (!key) {
            console.warn(`⚠️ Company HubSpot id=${hubspotId} no trae phone para correlación.`);
            continue;
          }

          const local = localById.get(key);
          if (!local) {
            console.warn(`⚠️ No hay Location local para key='${key}' (phone). HubSpot company id=${hubspotId}`);
            continue;
          }

          const localId =
            (local as any).idLocation ?? (local as any).id_location;

          try {
            await this.repoLoc.saveHubspotId(Number(localId), hubspotId);
            console.log(
              `🏷️ Location ${localId} (${(local as any).name}) → Company hs_object_id=${hubspotId}`
            );
            localById.delete(key);
          } catch (e) {
            console.error(
              `❌ Error guardando id_location_hubspot para Location ${localId}:`,
              e instanceof Error ? e.message : e
            );
          }
        }

        if (createBody?.errors?.length) {
          console.error("⚠️ HubSpot batch create (companies) devolvió errores:", createBody.errors);
        } else {
          console.log(`✅ Batch subido correctamente (${inputs.length} companies).`);
        }
      } catch (e: any) {
        const msg = e?.response?.data ?? e?.message ?? e;
        console.error("❌ Error llamando a HubSpot companies batch/create:", msg);
      }
    }

    console.log("🎉 Sincronización de locations completa.");
  }
}
