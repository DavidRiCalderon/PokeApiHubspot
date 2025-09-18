import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { PokeType } from "../model/PokeType";

// Tipos de fila para mapear consultas
type TypeIdRow = RowDataPacket & { id_type: number };
type PokemonIdRow = RowDataPacket & { id_pokemon: number };

export class RepositoryPokeType {
  constructor(private pool: Pool) {}

  /**
   * Crea la relación entre un Pokémon y un Type.
   * Devuelve true si insertó, false si ya existía.
   */
  async createPokeType(pokeType: PokeType): Promise<boolean> {
    const sql = `
      INSERT IGNORE INTO Pokemon_type (id_type, id_pokemon)
      VALUES (?, ?)
    `;
    const [res] = await this.pool.execute<ResultSetHeader>(sql, [
      pokeType.idType,
      pokeType.idPokemon,
    ]);
    return res.affectedRows > 0;
  }

  /**
   * Devuelve los id_type asociados a un Pokémon.
   */
  async readTypesByPokemonId(pokemonId: number): Promise<number[]> {
    const sql = `SELECT id_type FROM Pokemon_type WHERE id_pokemon = ?`;
    const [rows] = await this.pool.execute<TypeIdRow[]>(sql, [pokemonId]);
    return rows.map((r) => r.id_type);
  }

  /**
   * Devuelve los id_pokemon asociados a un Type.
   */
  async readPokemonsByTypeId(typeId: number): Promise<number[]> {
    const sql = `SELECT id_pokemon FROM Pokemon_type WHERE id_type = ?`;
    const [rows] = await this.pool.execute<PokemonIdRow[]>(sql, [typeId]);
    return rows.map((r) => r.id_pokemon);
  }
}
