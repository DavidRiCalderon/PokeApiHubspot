// src/repository/RepositoryPokeMove.ts
import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { PokeMove } from "../model/PokeMove";

// Tipos de fila que extienden RowDataPacket
type MoveIdRow = RowDataPacket & { id_move: number };
type PokemonIdRow = RowDataPacket & { id_pokemon: number };
type AssocRow = RowDataPacket & {
  id_pokemon: number;
  id_move: number;
  contactHubspotId: string | number | null;
  moveHubspotId: string | number | null;
};

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

    /**
   * Devuelve pares listos para asociar:
   *  - Pokemon.id_poke_hubspot  (CONTACT)
   *  - Move.id_move_hubspot     (CUSTOM OBJECT)
   */
  async findAssociations(limit = 5000): Promise<
    Array<{ idPokemon: number; idMove: number; contactHubspotId: string; moveHubspotId: string }>
  > {
    const safeLimit = Math.max(1, Math.floor(limit));
    const sql = `
      SELECT
        pm.id_pokemon,
        pm.id_move,
        p.id_poke_hubspot  AS contactHubspotId,
        m.id_move_hubspot  AS moveHubspotId
      FROM Poke_move pm
      INNER JOIN Pokemon p ON p.id_pokemon = pm.id_pokemon
      INNER JOIN Move    m ON m.id_move    = pm.id_move
      WHERE p.id_poke_hubspot IS NOT NULL
        AND m.id_move_hubspot IS NOT NULL
      ORDER BY pm.id_pokemon, pm.id_move
      LIMIT ?
    `;
    const [rows] = await this.pool.query<AssocRow[]>(sql, [safeLimit]);

    return rows.map(r => ({
      idPokemon: r.id_pokemon,
      idMove: r.id_move,
      contactHubspotId: String(r.contactHubspotId!), // como string para no truncar BIGINT
      moveHubspotId: String(r.moveHubspotId!),
    }));
  }
}


