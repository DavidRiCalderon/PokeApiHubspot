import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { PokeLocation } from "../model/PokeLocation";

// Tipos de fila para mapear consultas
type LocationIdRow = RowDataPacket & { id_location: number };
type PokemonIdRow = RowDataPacket & { id_pokemon: number };

export class RepositoryPokeLocation {
  constructor(private pool: Pool) {}

  /**
   * Crea la relación entre un Pokémon y una Location.
   * Devuelve true si insertó, false si ya existía.
   */
  async createPokeLocation(pokeLocation: PokeLocation): Promise<boolean> {
    const sql = `
      INSERT IGNORE INTO Poke_location (id_location, id_pokemon)
      VALUES (?, ?)
    `;
    const [res] = await this.pool.execute<ResultSetHeader>(sql, [
      pokeLocation.idLocation,
      pokeLocation.idPokemon,
    ]);
    return res.affectedRows > 0;
  }

  /**
   * Devuelve las locations asociadas a un Pokémon.
   */
  async readLocationsByPokemonId(pokemonId: number): Promise<number[]> {
    const sql = `SELECT id_location FROM Poke_location WHERE id_pokemon = ?`;
    const [rows] = await this.pool.execute<LocationIdRow[]>(sql, [pokemonId]);
    return rows.map((r) => r.id_location);
  }

  /**
   * Devuelve los pokémon asociados a una Location.
   */
  async readPokemonsByLocationId(locationId: number): Promise<number[]> {
    const sql = `SELECT id_pokemon FROM Poke_location WHERE id_location = ?`;
    const [rows] = await this.pool.execute<PokemonIdRow[]>(sql, [locationId]);
    return rows.map((r) => r.id_pokemon);
  }
}
