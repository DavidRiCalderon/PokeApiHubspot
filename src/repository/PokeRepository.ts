import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Pokemon } from "../model/Pokemon";

type PokemonRow = RowDataPacket & {
  id_pokemon: number;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  special_defense: number;
  special_attack: number;
  speed: number;
  id_poke_hubspot: number | null; 
};

export class PokeRepository {
  constructor(private pool: Pool) {}

  async createPokemon(pokemon: Pokemon): Promise<number> {
    const hasId = typeof pokemon.idPokemon === "number";

    const columns = [
      hasId ? "id_pokemon" : null,
      "name",
      "hp",
      "attack",
      "defense",
      "special_defense",
      "special_attack",
      "speed",
      "id_poke_hubspot",
    ].filter(Boolean) as string[];

    const placeholders = columns.map(() => "?").join(", ");

    const sql = `
      INSERT IGNORE INTO Pokemon (${columns.join(", ")})
      VALUES (${placeholders})
    `;

    const params = [
      ...(hasId ? [pokemon.idPokemon] : []),
      pokemon.name,
      pokemon.hp,
      pokemon.attack,
      pokemon.defense,
      pokemon.specialDefense,
      pokemon.specialAttack,
      pokemon.speed,
      pokemon.idPokeHubspot ?? null,
    ];

    const [res] = await this.pool.execute<ResultSetHeader>(sql, params);
    return hasId ? (pokemon.idPokemon as number) : Number(res.insertId);
  }


  async readPokemons(): Promise<Pokemon[]> {
    const [rows] = await this.pool.query<PokemonRow[]>(
      `SELECT id_pokemon, name, hp, attack, defense, special_defense, special_attack, speed, id_poke_hubspot
       FROM Pokemon`
    );

    return rows.map((r) => ({
      idPokemon: r.id_pokemon,
      name: r.name,
      hp: r.hp,
      attack: r.attack,
      defense: r.defense,
      specialDefense: r.special_defense,
      specialAttack: r.special_attack,
      speed: r.speed,
      idPokeHubspot: r.id_poke_hubspot,
    }));
  }

  async findNotSynced(limit = 1000): Promise<Pokemon[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1000;

    const [rows] = await this.pool.query<PokemonRow[]>(
      `SELECT id_pokemon, name, hp, attack, defense, special_defense, special_attack, speed, id_poke_hubspot
       FROM Pokemon
       WHERE id_poke_hubspot IS NULL
       ORDER BY id_pokemon ASC
       LIMIT ${safeLimit}`
    );

    return rows.map((r) => ({
      idPokemon: r.id_pokemon,
      name: r.name,
      hp: r.hp,
      attack: r.attack,
      defense: r.defense,
      specialDefense: r.special_defense,
      specialAttack: r.special_attack,
      speed: r.speed,
      idPokeHubspot: r.id_poke_hubspot,
    }));
  }

  async saveHubspotId(localId: number, hubspotId: number): Promise<void> {
    await this.pool.execute<ResultSetHeader>(
      `UPDATE Pokemon
         SET id_poke_hubspot = ?
       WHERE id_pokemon = ?`,
      [hubspotId, localId]
    );
  }
}
