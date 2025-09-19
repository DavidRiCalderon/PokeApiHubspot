// src/service/external/hubspotService/PokemonHubspotService.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { PokeRepository } from "../../../repository/PokeRepository";
import { pool } from "../../../repository/database";
import { TypeQuickAccess } from "../../../repository/PokeTypeQuickAccess";
// O usa RepositoryPokeType + RepositoryType si prefieres

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;
const CONTACT_BATCH_URL = "https://api.hubapi.com/crm/v3/objects/contacts/batch/create";

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

export class PokemonHubspotService {
  constructor(
    private pokeRepo = new PokeRepository(pool),
    private typeAccess = new TypeQuickAccess(pool)
  ) {}

  /**
   * Sube Pokémon como Contactos en HubSpot.
   * - phone       ← id_pokemon (ID local visible)
   * - name        ← name        (o firstname si no tienes prop 'name' en Contact)
   * - hp/attack/defense/special_* / speed (asegúrate que existan en Contact)
   * - types (multi-checkbox) ← nombres de tipos separados por ';'
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
      // Construir inputs con multi-checkbox 'types'
      const inputs: HubSpotBatchCreateInput[] = [];
      for (const pkm of batch) {
        const typeIds = await this.typeAccess.readTypeIdsByPokemonId(pkm.idPokemon);
        const typeNames = typeIds
          .map((id) => typeMap.get(id))
          .filter((n): n is string => !!n);

        // HubSpot multi-checkbox: string con valores separados por ';'
        const typesMulti = typeNames.join(";");

        inputs.push({
          objectWriteTraceId: String(pkm.idPokemon),
          properties: {
            // Si NO tienes 'name' como propiedad en Contact, usa firstname en su lugar:
            // firstname: pkm.name,
            name: pkm.name, // <- usa 'name' solo si existe en tu Contact

            phone: String(pkm.idPokemon), // ver ID local
            hp: pkm.hp,
            attack: pkm.attack,
            defense: pkm.defense,
            special_defense: pkm.specialDefense,
            special_attack: pkm.specialAttack,
            speed: pkm.speed,

            // multi-checkbox:
            types: typesMulti, // ej: "Fire;Flying"
          },
        });
      }

      try {
        const resp = await axios.post<HubSpotBatchCreateResponse>(
          CONTACT_BATCH_URL,
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
          console.warn("⚠️ HubSpot no devolvió results para este batch de pokémon.");
        } else {
          // Guardar id_poke_hubspot (hs_object_id del contacto)
          for (let i = 0; i < Math.min(batch.length, body.results.length); i++) {
            const local = batch[i];
            const remote = body.results[i];
            const hubspotId = Number(remote.id);

            try {
              await this.pokeRepo.saveHubspotId(local.idPokemon, hubspotId);
              console.log(
                `🏷️ Pokemon ${local.idPokemon} (${local.name}) → Contact id=${hubspotId}`
              );
            } catch (e) {
              console.error(
                `❌ Error guardando id_poke_hubspot para Pokemon ${local.idPokemon}:`,
                e instanceof Error ? e.message : e
              );
            }
          }
        }

        if (body?.errors?.length) {
          console.error("⚠️ HubSpot batch create (contacts) devolvió errores:", body.errors);
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
