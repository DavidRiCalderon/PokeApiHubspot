// src/repository/TypeQuickAccess.ts (helper opcional)
import { Pool, RowDataPacket } from "mysql2/promise";

type TypeRow = RowDataPacket & { id_type: number; name_type: string };
type TypeIdRow = RowDataPacket & { id_type: number };

export class TypeQuickAccess {
  constructor(private pool: Pool) {}

  async loadTypeMap(): Promise<Map<number, string>> {
    const [rows] = await this.pool.query<TypeRow[]>(
      `SELECT id_type, name_type FROM Type`
    );
    const map = new Map<number, string>();
    rows.forEach((r) => map.set(r.id_type, r.name_type));
    return map;
  }

  async readTypeIdsByPokemonId(idPokemon: number): Promise<number[]> {
    const [rows] = await this.pool.query<TypeIdRow[]>(
      `SELECT id_type FROM Pokemon_type WHERE id_pokemon = ?`,
      [idPokemon]
    );
    return rows.map((r) => r.id_type);
  }
}
