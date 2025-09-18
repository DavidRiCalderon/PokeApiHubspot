// src/repository/RepositoryPokeMove.ts
import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { PokeMove } from "../model/PokeMove";

// Tipos de fila que extienden RowDataPacket
type MoveIdRow = RowDataPacket & { id_move: number };
type PokemonIdRow = RowDataPacket & { id_pokemon: number };

export class RepositoryPokeMove {
  constructor(private pool: Pool) {}

  /**
   * Crea la relación entre un Pokémon y un Move.
   * Devuelve true si insertó, false si ya existía (por PK compuesta).
   */
  async createPokeMove(pokeMove: PokeMove): Promise<boolean> {
    const sql = `
      INSERT IGNORE INTO Poke_move (id_move, id_pokemon)
      VALUES (?, ?)
    `;
    const [res] = await this.pool.execute<ResultSetHeader>(sql, [
      pokeMove.idMove,
      pokeMove.idPokemon,
    ]);
    return res.affectedRows > 0;
  }

  /**
   * Devuelve los id_move asociados a un Pokémon.
   */
  async readMovesByPokemonId(pokemonId: number): Promise<number[]> {
    const sql = `SELECT id_move FROM Poke_move WHERE id_pokemon = ?`;
    const [rows] = await this.pool.execute<MoveIdRow[]>(sql, [pokemonId]);
    return rows.map(r => r.id_move);
  }

  /**
   * Devuelve los id_pokemon asociados a un Move.
   */
  async readPokemonsByMoveId(moveId: number): Promise<number[]> {
    const sql = `SELECT id_pokemon FROM Poke_move WHERE id_move = ?`;
    const [rows] = await this.pool.execute<PokemonIdRow[]>(sql, [moveId]);
    return rows.map(r => r.id_pokemon);
  }
}
