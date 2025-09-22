import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { PokeLocation } from "../model/PokeLocation";

// Tipos de fila para mapear consultas
type LocationIdRow = RowDataPacket & { id_location: number };
type PokemonIdRow = RowDataPacket & { id_pokemon: number };
type AssocRow = RowDataPacket & {
  idPokemon: number;
  idLocation: number;
  contactHubspotId: string;  // lo leemos como string para no truncar (luego casteamos a string en payload)
  companyHubspotId: string;
};


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

    /**
   * Devuelve pares (contactHubspotId, companyHubspotId) a partir de PokeLocation,
   * sólo cuando ambos IDs de HubSpot existen en las tablas padre.
   */
  async findAssociations(limit = 5000): Promise<
    Array<{ contactHubspotId: string; companyHubspotId: string; idPokemon: number; idLocation: number }>
  > {
    const safeLimit = Math.max(1, Math.floor(limit));
    const sql = `
      SELECT
        pl.id_pokemon,
        pl.id_location,
        p.id_poke_hubspot   AS contactHubspotId,
        l.id_location_hubspot AS companyHubspotId
      FROM Poke_location pl
      INNER JOIN Pokemon  p ON p.id_pokemon  = pl.id_pokemon
      INNER JOIN Location l ON l.id_location = pl.id_location
      WHERE p.id_poke_hubspot IS NOT NULL
        AND l.id_location_hubspot IS NOT NULL
      ORDER BY pl.id_location, pl.id_pokemon
      LIMIT ?
    `;
    const [rows] = await this.pool.query<AssocRow[]>(sql, [safeLimit]);

    return rows.map(r => ({
      idPokemon: r.idPokemon,
      idLocation: r.idLocation,
      contactHubspotId: String(r.contactHubspotId),
      companyHubspotId: String(r.companyHubspotId),
    }));
  }
}


