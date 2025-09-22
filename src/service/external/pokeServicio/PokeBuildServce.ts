// src/service/pokeServicio/PokeBuildService.ts
import axios, { AxiosError } from "axios";
import { Pokemon } from "../../../model/Pokemon";
import { PokeRepository } from "../../../repository/PokeRepository";
// ⚠️ Ajusta esta ruta según dónde esté tu database.ts
import { pool } from "../../../repository/database";

// Asegúrate que los nombres de archivo/clase coincidan
import { MoveBuildService, PokemonApiMovesData } from "./MoveBuildServce";
import { TypeBuildService, PokemonApiTypesData } from "./typeBuildServce";
import { LocationBuildService, PokemonApiLocationsData } from "./LocationBuldServce";

export class PokeBuildService {
  private repo: PokeRepository;
  private moveSvc: MoveBuildService;
  private typeSvc: TypeBuildService;
  private locationSvc: LocationBuildService;

  constructor() {
    this.repo = new PokeRepository(pool);
    this.moveSvc = new MoveBuildService();
    this.typeSvc = new TypeBuildService();
    this.locationSvc = new LocationBuildService();
  }

  async fetchFirst100Pokemons(): Promise<Pokemon[]> {
    const pokemons: Pokemon[] = [];
    let id = 1;
    let count = 0;

    while (count < 100) {
      try {
        const response = await axios.get(`https://pokeapi.co/api/v2/pokemon/${id}`);

        if (response.status === 200) {
          // Unimos los tipos mínimos que usamos en los servicios
          const data = response.data as PokemonApiMovesData & PokemonApiTypesData & PokemonApiLocationsData & any;

          const pokemon: Pokemon = {
            idPokemon: data.id,
            name: data.name,
            hp: data.stats.find((s: any) => s.stat.name === "hp").base_stat,
            attack: data.stats.find((s: any) => s.stat.name === "attack").base_stat,
            defense: data.stats.find((s: any) => s.stat.name === "defense").base_stat,
            specialDefense: data.stats.find((s: any) => s.stat.name === "special-defense").base_stat,
            specialAttack: data.stats.find((s: any) => s.stat.name === "special-attack").base_stat,
            speed: data.stats.find((s: any) => s.stat.name === "speed").base_stat,
            idPokeHubspot: null,
          };

          // 1) Guardar el Pokémon
          let dbId: number | undefined;
          try {
            dbId = await this.repo.createPokemon(pokemon);
            console.log(`✅ Guardado en BD: ${pokemon.name} con id ${dbId}`);
          } catch (dbErr) {
            if (dbErr instanceof Error) {
              console.error(`❌ Error al guardar ${pokemon.name}:`, dbErr.message);
            } else {
              console.error("❌ Error desconocido al guardar:", dbErr);
            }
          }

          if (dbId) {
            // 2) Moves + relación Poke_move
            try {
              const moves = await this.moveSvc.fetchMovesFromPokemonData(data, dbId);
              //console.log(`🎯 ${pokemon.name} tiene ${moves.length} movimientos cargados`);
            } catch (e) {
              console.error("⚠️ Error procesando moves:", e instanceof Error ? e.message : e);
            }

            // 3) Types + relación Pokemon_type
            try {
              const types = await this.typeSvc.fetchTypesFromPokemonData(data, dbId);
              //console.log(`🌟 ${pokemon.name} tiene ${types.length} tipos cargados`);
            } catch (e) {
              console.error("⚠️ Error procesando types:", e instanceof Error ? e.message : e);
            }

            // 4) Locations + relación Poke_location
            try {
              const locations = await this.locationSvc.fetchLocationsFromPokemonData(data, dbId);
              //console.log(`📍 ${pokemon.name} tiene ${locations.length} locations cargadas`);
            } catch (e) {
              console.error("⚠️ Error procesando locations:", e instanceof Error ? e.message : e);
            }
          }

          pokemons.push(pokemon);
          count++;
        }
      } catch (err) {
        const error = err as AxiosError;
        console.error(`Pokemon con id ${id} no encontrado`, error.message);
      }

      id++;
    }

    return pokemons;
  }
}
