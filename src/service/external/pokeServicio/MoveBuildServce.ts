import axios, { AxiosError } from "axios";
import { Move } from "../../../model/Move";
import { RepositoryMove } from "../../../repository/RepositoryMove";
import { RepositoryPokeMove } from "../../../repository/RepositoryPokeMove";
import { pool } from "../../../repository/database"; 


export type PokemonApiMovesData = {
  moves: Array<{ move: { name: string; url: string } }>;
};

export class MoveBuildService {
  private repo: RepositoryMove;
  private pokeMoveRepo: RepositoryPokeMove;

  constructor() {
    this.repo = new RepositoryMove(pool);
    this.pokeMoveRepo = new RepositoryPokeMove(pool);
  }

  /**
   * Crea la relación en la tabla Poke_move
   */
  async linkPokemonMove(pokemonId: number, moveId: number): Promise<boolean> {
    try {
      const inserted = await this.pokeMoveRepo.createPokeMove({
        idPokemon: pokemonId,
        idMove: moveId,
      });
      return inserted; 
    } catch (err) {
      if (err instanceof Error) {
        console.error(`❌ Error creando relación Poke_move (${pokemonId}, ${moveId}):`, err.message);
      } else {
        console.error("❌ Error desconocido creando relación Poke_move:", err);
      }
      return false;
    }
  }

  /**
   * Recibe el 'data' del endpoint /pokemon/{id} (ya cargado)
   * Llama a cada move.move.url, guarda cada move en la BD
   * y crea la relación en Poke_move con el pokemonDbId
   */
  async fetchMovesFromPokemonData(
    data: PokemonApiMovesData,
    pokemonDbId: number,           
  ): Promise<Move[]> {
    const moves: Move[] = [];

    for (const m of data.moves.slice(0, 15)) {
      const moveUrl = m.move.url;

      try {
        const resp = await axios.get(moveUrl);
        if (resp.status !== 200) continue;

        const md = resp.data;
        const move: Move = {
          idMove: md.id,             
          name: md.name,
          pp: md.pp ?? 0,
          power: md.power ?? 0,        
          idMoveHubspot: null,
        };

        // 1) Guardar el move en BD (devuelve id_move de tu tabla)
        try {
          const dbMoveId = await this.repo.createMove(move);
          move.idMove = dbMoveId;

          // 2) Crear relación en Poke_move
          const linked = await this.linkPokemonMove(pokemonDbId, dbMoveId);
          if (linked) {
            //console.log(`🔗 Relacionado move ${move.name} (id ${dbMoveId}) con pokemon ${pokemonDbId}`);
          } else {
            console.log(`⚠️ Relación ya existía: move ${move.name} ↔ pokemon ${pokemonDbId}`);
          }
        } catch (dbErr) {
          if (dbErr instanceof Error) {
            console.error(`❌ Error BD guardando/enlazando ${move.name}:`, dbErr.message);
          } else {
            console.error("❌ Error BD desconocido:", dbErr);
          }
        }

        moves.push(move);
      } catch (err) {
        const error = err as AxiosError;
        console.error(`❌ Error al obtener move en ${moveUrl}:`, error.message);
      }
    }

    return moves;
  }
}
