// src/repository/RepositoryMove.ts
import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Move } from "../model/Move";

/**
 * Tabla Move:
 *  id_move INT AUTO_INCREMENT PRIMARY KEY
 *  name VARCHAR(100) UNIQUE NOT NULL
 *  pp INT NOT NULL CHECK (pp >= 0)
 *  power INT NULL
 *  id_move_hubspot BIGINT NULL
 */

// Fila cruda desde MySQL
type MoveRow = RowDataPacket & {
  id_move: number;
  name: string;
  pp: number;
  power: number | null;
  id_move_hubspot: number | null;
};

export class RepositoryMove {
  constructor(private pool: Pool) {}

  /**
   * Inserta un Move. Si existe por UNIQUE(name), lo ignora y devuelve el id existente.
   * - Si envías id_move, MySQL lo usará; si no, lo autogenera (AUTO_INCREMENT).
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
      move.power ?? null,           // power puede ser NULL en la DB
      move.idMoveHubspot ?? null,   // normalmente null al crear
    ];

    const [res] = await this.pool.execute<ResultSetHeader>(sql, params);

    if (res.affectedRows > 0) {
      // Se insertó (no fue ignorado por duplicado)
      return hasId ? (move.idMove as number) : Number(res.insertId);
    }

    // Duplicado por name → obtener id existente
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id_move FROM Move WHERE name = ? LIMIT 1",
      [move.name]
    );

    if (rows.length === 0) {
      throw new Error(`No se pudo insertar ni consultar el move: ${move.name}`);
    }

    return Number((rows[0] as any).id_move);
  }

  /**
   * Lee todos los moves (útil para auditoría).
   */
  async readMoves(): Promise<Move[]> {
    const [rows] = await this.pool.query<MoveRow[]>(
      "SELECT id_move, name, pp, power, id_move_hubspot FROM Move"
    );

    return rows.map((r) => ({
      idMove: r.id_move,
      name: r.name,
      pp: r.pp,
      power: r.power,                   // puede ser null
      idMoveHubspot: r.id_move_hubspot, // BIGINT en DB → number | null en TS
    }));
  }

  /**
   * Trae los moves que aún NO tienen id de HubSpot (id_move_hubspot IS NULL).
   */
  async findNotSynced(limit = 1000): Promise<Move[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1000;

    const sql = `
      SELECT id_move, name, pp, power, id_move_hubspot
      FROM Move
      WHERE id_move_hubspot IS NULL
      ORDER BY id_move ASC
      LIMIT ${safeLimit}
    `;

    const [rows] = await this.pool.query<MoveRow[]>(sql);

    return rows.map((r) => ({
      idMove: r.id_move,
      name: r.name,
      pp: r.pp,
      power: r.power,
      idMoveHubspot: r.id_move_hubspot,
    }));
  }

  /**
   * Guarda el hs_object_id del custom object de HubSpot en la columna id_move_hubspot.
   */
  async saveHubspotId(localId: number, hubspotId: number): Promise<void> {
    await this.pool.execute<ResultSetHeader>(
      `UPDATE Move
         SET id_move_hubspot = ?
       WHERE id_move = ?`,
      [hubspotId, localId]
    );
  }

  /**
   * (Opcional) Actualiza propiedades básicas de un move.
   */
  async updateMoveProps(
    localId: number,
    props: Partial<Pick<Move, "name" | "pp" | "power">>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (props.name !== undefined) { fields.push("name = ?"); values.push(props.name); }
    if (props.pp !== undefined) { fields.push("pp = ?"); values.push(props.pp); }
    if (props.power !== undefined) { fields.push("power = ?"); values.push(props.power); }

    if (fields.length === 0) return;

    values.push(localId);
    const sql = `UPDATE Move SET ${fields.join(", ")} WHERE id_move = ?`;
    await this.pool.execute<ResultSetHeader>(sql, values);
  }
}
