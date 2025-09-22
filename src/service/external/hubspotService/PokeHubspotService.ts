import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { PokeRepository } from "../../../repository/PokeRepository";
import { pool } from "../../../repository/database";
import { TypeQuickAccess } from "../../../repository/PokeTypeQuickAccess";

// Endpoints HubSpot (CRM v3 Contacts)
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;
const CONTACT_BATCH_CREATE_URL =
  "https://api.hubapi.com/crm/v3/objects/contacts/batch/create";
const CONTACT_BATCH_READ_URL =
  "https://api.hubapi.com/crm/v3/objects/contacts/batch/read";

// Tipos para batch create / read
type HubSpotBatchCreateInput = {
  objectWriteTraceId?: string;
  properties: Record<string, any>;
};

type HubSpotContactResult = {
  id: string;
  properties?: Record<string, any>;
};

type HubSpotBatchCreateResponse = {
  results?: HubSpotContactResult[];
  errors?: any[];
  status?: string;
};

type HubSpotBatchReadBody = {
  properties?: string[];
  inputs: Array<{ id: string }>;
};

type HubSpotBatchReadResponse = {
  results?: HubSpotContactResult[];
  errors?: any[];
  status?: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Normaliza teléfonos: deja solo dígitos (por si HubSpot formatea)
function normalizeDigits(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\D/g, "").trim();
}

export class PokemonHubspotService {
  constructor(
    private pokeRepo = new PokeRepository(pool),
    private typeAccess = new TypeQuickAccess(pool)
  ) {}

  /**
   * Sube Pokémon como Contactos en HubSpot (lotes de 100):
   *  - firstname       ← name (tu tabla local)
   *  - phone           ← id_pokemon  (clave de correlación)
   *  - hp/attack/defense/special_* / speed
   *  - types (multi-checkbox) ← nombres separados por ';'
   */
  async syncPokemonsAsContactsBatch(): Promise<void> {
    // 1) Cargar pendientes
    const pending = await this.pokeRepo.findNotSynced(5000);
    if (pending.length === 0) {
      console.log("✅ No hay pokémon pendientes de subir a HubSpot.");
      return;
    }

    // 2) Cache de tipos
    const typeMap = await this.typeAccess.loadTypeMap();

    // 3) Lotes de 100
    const batches = chunk(pending, 100);

    for (const batch of batches) {
      // ---- construir inputs con multi-checkbox 'types' ----
      const inputs: HubSpotBatchCreateInput[] = [];

      for (const pkm of batch) {
        const typeIds = await this.typeAccess.readTypeIdsByPokemonId(pkm.idPokemon);
        const typeNames = typeIds.map((id) => typeMap.get(id)).filter((n): n is string => !!n);
        const typesMulti = typeNames.join(";");

        inputs.push({
          objectWriteTraceId: String(pkm.idPokemon),
          properties: {
            firstname: pkm.name,
            phone: String(pkm.idPokemon),
            hp: pkm.hp,
            attack: pkm.attack,
            defense: pkm.defense,
            special_defense: pkm.specialDefense,
            special_attack: pkm.specialAttack,
            speed: pkm.speed,
            types: typesMulti,
          },
        });
      }

      try {
        // ---- batch/create ----
        const createResp = await axios.post<HubSpotBatchCreateResponse>(
          CONTACT_BATCH_CREATE_URL,
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
          console.warn("⚠️ HubSpot no devolvió results para este batch de pokémon.");
          if (createBody?.errors?.length) {
            console.error("⚠️ Errores en batch/create:", createBody.errors);
          }
          continue;
        }

        let remoteResults: HubSpotContactResult[] = createBody.results;
        const missingProps = !remoteResults.some((r) => r.properties && "phone" in r.properties);

        if (missingProps) {
          const ids = remoteResults.map((r) => ({ id: r.id }));
          const readBody: HubSpotBatchReadBody = {
            properties: ["phone"],
            inputs: ids,
          };

          try {
            const readResp = await axios.post<HubSpotBatchReadResponse>(
              CONTACT_BATCH_READ_URL,
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
              console.warn("⚠️ batch/read no devolvió results; continuaré solo con IDs.");
            }
          } catch (e: any) {
            console.warn("⚠️ No se pudo hacer batch/read de contactos recién creados:", e?.response?.data ?? e?.message ?? e);
          }
        }

        // ---- Índice local por idPokemon (string) ----
        const localById = new Map<string, (typeof batch)[number]>();
        for (const pkm of batch) localById.set(String(pkm.idPokemon), pkm);

        // ---- Recorrer resultados remotos y mapear por phone ----
        for (const remote of remoteResults) {
          const hubspotId = Number(remote.id);
          const props = remote.properties || {};
          const key = normalizeDigits(props.phone);

          if (!key) {
            console.warn(`⚠️ Contacto HubSpot id=${hubspotId} no trae phone para correlación.`);
            continue;
          }

          const local = localById.get(key);
          if (!local) {
            console.warn(`⚠️ No hay Pokémon local para key='${key}' (phone). HubSpot id=${hubspotId}`);
            continue;
          }

          try {
            await this.pokeRepo.saveHubspotId(local.idPokemon, hubspotId);
            console.log(`🏷️ Pokemon ${local.idPokemon} (${local.name}) → Contact id=${hubspotId}`);
            localById.delete(key);
          } catch (e) {
            console.error(
              `❌ Error guardando id_poke_hubspot para Pokemon ${local.idPokemon}:`,
              e instanceof Error ? e.message : e
            );
          }
        }

        if (createBody?.errors?.length) {
          console.error("⚠️ HubSpot batch create (contacts) devolvió errores:", createBody.errors);
        } else {
          console.log(`✅ Batch de pokémon subido (${batch.length} contactos).`);
        }
      } catch (e: any) {
        const msg = e?.response?.data ?? e?.message ?? e;
        console.error("❌ Error llamando a HubSpot contacts batch/create:", msg);
      }
    }

    console.log("🎉 Sincronización de pokémon completa.");
  }
}
