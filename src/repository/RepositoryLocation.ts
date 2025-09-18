import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Location } from "../model/Location";

// Tipo de fila para consultas
type LocationIdRow = RowDataPacket & { id_location: number };

export class RepositoryLocation {
  constructor(private pool: Pool) {}

  /**
   * Inserta una Location en la tabla.
   * Si ya existe (por UNIQUE name), la ignora y devuelve el id existente.
   */
  async createLocation(location: Location): Promise<number> {
    const sql = `
      INSERT IGNORE INTO Location (
        id_location,
        name,
        numbre_areas,
        region,
        generation,
        id_location_hubspot
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [res] = await this.pool.execute<ResultSetHeader>(sql, [
      location.idLocation ?? null,       // tu schema no es AUTO_INCREMENT, así que ojo aquí
      location.name,
      location.numberArea ?? null,       // si usas number en tu modelo, cámbialo a string si numbre_areas es TEXT
      location.region ?? null,
      location.generation ?? null,
      location.idLocationHubspot ?? null,
    ]);

    if (res.affectedRows > 0) {
      return location.idLocation ?? res.insertId;
    }

    // Ya existía → buscar id por name
    const [rows] = await this.pool.execute<LocationIdRow[]>(
      "SELECT id_location FROM Location WHERE name = ? LIMIT 1",
      [location.name]
    );

    if (rows.length === 0) {
      throw new Error(`No se pudo insertar ni encontrar la Location: ${location.name}`);
    }

    return rows[0].id_location;
  }

  /**
   * Lee todas las Locations
   */
  async readLocations(): Promise<Location[]> {
    const [rows] = await this.pool.execute<(RowDataPacket & {
      id_location: number;
      name: string;
      numbre_areas: number;
      region: string;
      generation: string;
      id_location_hubspot: number | null;
    })[]>(
      "SELECT * FROM Location"
    );

    return rows.map((r) => ({
      idLocation: r.id_location,
      name: r.name,
      numberArea: r.numbre_areas, 
      region: r.region,
      generation: r.generation,
      idLocationHubspot: r.id_location_hubspot,
    }));
  }
}
