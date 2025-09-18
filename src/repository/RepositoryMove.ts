import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Move } from "../model/Move";

export class RepositoryMove {
  constructor(private pool: Pool) {}

  /**
   * Inserta un Move. Si ya existe por 'name' (UNIQUE), no falla:
   * - Devuelve el id insertado
   * - O, si se ignoró por duplicado, busca y devuelve el id existente
   */
  async createMove(move: Move): Promise<number> {
    const hasId = typeof move.idMove === "number";

    const cols = [
      hasId ? "id_move" : null,
      "name",
      "pp",
      "power",
      "id_move_hubspot",
    ].filter(Boolean) as string[];

    const placeholders = cols.map(() => "?").join(", ");

    const sql = `
      INSERT IGNORE INTO Move (${cols.join(", ")})
      VALUES (${placeholders})
    `;

    const params = [
      ...(hasId ? [move.idMove] : []),
      move.name,
      move.pp,
      move.power,
      move.idMoveHubspot ?? null,
    ];

    const [res] = await this.pool.execute<ResultSetHeader>(sql, params);

    if (res.affectedRows > 0) {
      // Se insertó (no fue ignorado)
      return hasId ? (move.idMove as number) : res.insertId;
    }

    // Duplicado por name → obtener id existente
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id_move FROM Move WHERE name = ? LIMIT 1",
      [move.name]
    );

    if (rows.length === 0) {
      throw new Error(`No se pudo insertar ni consultar el move: ${move.name}`);
    }

    return rows[0].id_move as number;
  }
}
