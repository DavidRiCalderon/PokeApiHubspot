import { Pool, ResultSetHeader } from "mysql2/promise";
import { Pokemon } from "../model/Pokemon";

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

    // si tú mandaste un idPokemon lo retornamos, si no usamos insertId
    return hasId ? (pokemon.idPokemon as number) : res.insertId;
  }
}
