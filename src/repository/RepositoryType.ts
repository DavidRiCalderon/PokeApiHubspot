import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Type } from "../model/Type";

// Definimos un tipo de fila para consultas
type TypeIdRow = RowDataPacket & { id_type: number };

export class RepositoryType {
  constructor(private pool: Pool) {}

  /**
   * Inserta un tipo (Type). Si ya existe por name_type (UNIQUE),
   * lo ignora y devuelve el id existente.
   */
  async createType(type: Type): Promise<number> {
    const sql = `
      INSERT IGNORE INTO Type (id_type, name_type)
      VALUES (?, ?)
    `;

    const [res] = await this.pool.execute<ResultSetHeader>(sql, [
      type.idType ?? null,
      type.name,
    ]);

    if (res.affectedRows > 0) {
      // Insertó uno nuevo
      return type.idType ?? res.insertId;
    }

    // Ya existía: consultar id
    const [rows] = await this.pool.execute<TypeIdRow[]>(
      "SELECT id_type FROM Type WHERE name_type = ? LIMIT 1",
      [type.name]
    );

    if (rows.length === 0) {
      throw new Error(`No se pudo insertar ni encontrar el type: ${type.name}`);
    }

    return rows[0].id_type;
  }

  /**
   * Obtiene todos los tipos
   */
  async readTypes(): Promise<Type[]> {
    const [rows] = await this.pool.execute<(RowDataPacket & { id_type: number; name_type: string })[]>(
      "SELECT id_type, name_type FROM Type"
    );

    return rows.map((r) => ({
      idType: r.id_type,
      name: r.name_type,
    }));
  }
}
