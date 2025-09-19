import axios, { AxiosError } from "axios";
import { Location } from "../../../model/Location";
import { RepositoryLocation } from "../../../repository/RepositoryLocation";
import { RepositoryPokeLocation } from "../../../repository/RepositoryPokeLocation";
import { pool } from "../../../repository/database"; 

// Tipo mínimo que necesitamos del JSON de /pokemon/{id}
export type PokemonApiLocationsData = {
  location_area_encounters: string; // URL a /pokemon/{id}/encounters
};

export class LocationBuildService {
  private locRepo: RepositoryLocation;
  private pokeLocRepo: RepositoryPokeLocation;

  constructor() {
    this.locRepo = new RepositoryLocation(pool);
    this.pokeLocRepo = new RepositoryPokeLocation(pool);
  }

  /**
   * Crea relación en Poke_location
   */
  async linkPokemonLocation(pokemonId: number, locationId: number): Promise<boolean> {
    try {
      const inserted = await this.pokeLocRepo.createPokeLocation({
        idPokemon: pokemonId,
        idLocation: locationId,
      });
      return inserted; // true si insertó, false si ya existía
    } catch (err) {
      if (err instanceof Error) {
        console.error(`❌ Error creando relación Poke_location (${pokemonId}, ${locationId}):`, err.message);
      } else {
        console.error("❌ Error desconocido creando relación Poke_location:", err);
      }
      return false;
    }
  }

  /**
   * Desde el 'data' de /pokemon/{id}, recorre encounters -> location-area -> location
   * Persiste Location y crea relación en Poke_location con el pokemonDbId.
   */
  async fetchLocationsFromPokemonData(
    data: PokemonApiLocationsData,
    pokemonDbId: number, // id del Pokémon en tu BD (Pokemon.id_pokemon)
  ): Promise<Location[]> {
    const results: Location[] = [];

    const encountersUrl = data.location_area_encounters;
    if (!encountersUrl) {
      console.warn("⚠️ Este Pokémon no tiene 'location_area_encounters'.");
      return results;
    }

    // 1) Traemos el array de encounters
    let encounters: any[] = [];
    try {
      const encResp = await axios.get(encountersUrl);
      if (encResp.status === 200 && Array.isArray(encResp.data)) {
        encounters = encResp.data;
      } else {
        console.warn("⚠️ Respuesta inesperada en encounters:", encResp.status);
        return results;
      }
    } catch (err) {
      const error = err as AxiosError;
      console.error("❌ Error obteniendo encounters:", error.message);
      return results;
    }

    // 2) Extraemos URLs únicas de location-area
    const locationAreaUrls = new Set<string>();
    for (const e of encounters) {
      const url = e?.location_area?.url;
      if (typeof url === "string") locationAreaUrls.add(url);
    }
    if (locationAreaUrls.size === 0) return results;

    // 3) Para cada location-area, obtener su location.url y coleccionar únicas
    const locationUrls = new Set<string>();
    for (const laUrl of locationAreaUrls) {
      try {
        const laResp = await axios.get(laUrl);
        if (laResp.status === 200) {
          const locUrl = laResp.data?.location?.url;
          if (typeof locUrl === "string") locationUrls.add(locUrl);
        }
      } catch (err) {
        const error = err as AxiosError;
        console.error(`❌ Error obteniendo location-area (${laUrl}):`, error.message);
      }
    }
    if (locationUrls.size === 0) return results;

    // 4) Obtener cada location/{id}, mapear y persistir + relacionar (const m of data.moves.slice(0, 20)
    for (const locUrl of Array.from(locationUrls).slice(0, 5)) {
      try {
        const locResp = await axios.get(locUrl);
        if (locResp.status !== 200) continue;

        const ld = locResp.data; // location data (/api/v2/location/{id})
        const loc: Location = {
          idLocation: ld.id, // ⚠️ tu tabla Location NO es AUTO_INCREMENT, usamos el id de la API
          name: ld.name,
          numberArea: Array.isArray(ld.areas) ? ld.areas.length : 0, // contamos áreas
          region: ld?.region?.name ?? "",
          // game_indices es un array con { game_index, generation }, tomamos la primera generación si existe
          generation: Array.isArray(ld.game_indices) && ld.game_indices[0]?.generation?.name
            ? ld.game_indices[0].generation.name
            : "",
          idLocationHubspot: null,
        };

        // 4.1) Persistir Location
        let dbLocationId = loc.idLocation;
        try {
          dbLocationId = await this.locRepo.createLocation(loc);
        } catch (dbErr) {
          if (dbErr instanceof Error) {
            console.error(`❌ Error BD guardando Location ${loc.name}:`, dbErr.message);
          } else {
            console.error("❌ Error BD desconocido al guardar Location:", dbErr);
          }
          // seguimos al siguiente location
          continue;
        }

        // 4.2) Crear relación en Poke_location
        try {
          const linked = await this.linkPokemonLocation(pokemonDbId, dbLocationId);
          if (linked) {
            console.log(`📍 Relacionado location ${loc.name} (id ${dbLocationId}) con pokemon ${pokemonDbId}`);
          } else {
            console.log(`⚠️ Relación ya existía: location ${loc.name} ↔ pokemon ${pokemonDbId}`);
          }
        } catch (relErr) {
          if (relErr instanceof Error) {
            console.error("❌ Error creando relación Poke_location:", relErr.message);
          } else {
            console.error("❌ Error desconocido creando relación Poke_location:", relErr);
          }
        }

        results.push(loc);
      } catch (err) {
        const error = err as AxiosError;
        console.error(`❌ Error obteniendo location en ${locUrl}:`, error.message);
      }
    }

    return results;
  }
}
