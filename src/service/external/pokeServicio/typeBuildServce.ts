import { AxiosError } from "axios";
import { Type } from "../../../model/Type";
import { RepositoryType } from "../../../repository/RepositoryType";
import { RepositoryPokeType } from "../../../repository/RespositoryPokeType";
import { pool } from "../../../repository/database"; 


export type PokemonApiTypesData = {
  types: Array<{
    slot: number;
    type: { name: string; url: string }; 
  }>;
};

export class TypeBuildService {
  private typeRepo: RepositoryType;
  private pokeTypeRepo: RepositoryPokeType;

  constructor() {
    this.typeRepo = new RepositoryType(pool);
    this.pokeTypeRepo = new RepositoryPokeType(pool);
  }

  /**
   * Extrae el id numérico del final del URL de la PokeAPI (si existe).
  
   */
  private extractIdFromUrl(url: string): number | undefined {
    const m = url.match(/\/(\d+)\/?$/);
    return m ? Number(m[1]) : undefined;
  }

  /**
   * Crea la relación en la tabla Pokemon_type
   */
  async linkPokemonType(pokemonId: number, typeId: number): Promise<boolean> {
    try {
      const inserted = await this.pokeTypeRepo.createPokeType({
        idPokemon: pokemonId,
        idType: typeId,
      });
      return inserted;
    } catch (err) {
      if (err instanceof Error) {
        console.error(`❌ Error creando relación Pokemon_type (${pokemonId}, ${typeId}):`, err.message);
      } else {
        console.error("❌ Error desconocido creando relación Pokemon_type:", err);
      }
      return false;
    }
  }

  /**
   * Recibe el 'data' del endpoint /pokemon/{id} (ya cargado)
   * Persiste cada Type (si no existe) y crea la relación en Pokemon_type con pokemonDbId.
   */
  async fetchTypesFromPokemonData(
    data: PokemonApiTypesData,
    pokemonDbId: number,
  ): Promise<Type[]> {
    const types: Type[] = [];
    for (const t of data.types) {
      const name = t.type.name;           
      const url = t.type.url;              
      const maybeApiId = this.extractIdFromUrl(url);

      const type: Type = {
        idType: maybeApiId, 
        name: name,
      };

      try {
        // 1) Insertar/obtener id en tabla Type
        const dbTypeId = await this.typeRepo.createType(type);
        type.idType = dbTypeId;

        // 2) Crear relación en Pokemon_type
        const linked = await this.linkPokemonType(pokemonDbId, dbTypeId);
        if (linked) {
          //console.log(`🔗 Relacionado type ${name} (id ${dbTypeId}) con pokemon ${pokemonDbId}`);
        } else {
          console.log(`⚠️ Relación ya existía: type ${name} ↔ pokemon ${pokemonDbId}`);
        }

        types.push(type);
      } catch (err) {
        const error = err as AxiosError | Error;
        console.error(`❌ Error al guardar/enlazar type ${name}:`, "message" in error ? error.message : error);
      }
    }

    return types;
  }
}
