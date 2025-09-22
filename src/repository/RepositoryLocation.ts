import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Location } from "../model/Location";

// Tipo de fila mínima
type LocationIdRow = RowDataPacket & { id_location: number };

type LocationRow = RowDataPacket & {
  id_location: number;
  name: string;
  numbre_areas: number | null;
  region: string | null;
  generation: string | null;
  id_location_hubspot: number | null;
};

export class RepositoryLocation {
  constructor(private pool: Pool) {}

  /**
   * Inserta una Location en la tabla.
   * Si ya existe (por UNIQUE name), la ignora y devuelve el id existente.
   * Si no envías id_location, MySQL lo autogenera.
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
      location.idLocation ?? null,       
      location.name,
      location.numberArea ?? 0,          
      location.region ?? null,
      location.generation ?? null,
      location.idLocationHubspot ?? null,
    ]);

    if (res.affectedRows > 0) {
      return location.idLocation ?? Number(res.insertId);
    }

  
    const [rows] = await this.pool.execute<LocationIdRow[]>(
      "SELECT id_location FROM Location WHERE name = ? LIMIT 1",
      [location.name]
    );

    if (rows.length === 0) {
      throw new Error(
        `No se pudo insertar ni encontrar la Location: ${location.name}`
      );
    }

    return rows[0].id_location;
  }

  /**
   * Lee todas las Locations
   */
  async readLocations(): Promise<Location[]> {
    const [rows] = await this.pool.execute<LocationRow[]>(
      "SELECT id_location, name, numbre_areas, region, generation, id_location_hubspot FROM Location"
    );

    return rows.map((r) => ({
      idLocation: r.id_location,
      name: r.name,
      numberArea: r.numbre_areas ?? 0,        
      region: r.region ?? "",
      generation: r.generation ?? "",
      idLocationHubspot: r.id_location_hubspot,
    }));
  }

  /**
   * Trae las Locations que aún no tienen id de HubSpot
   */
  async findNotSynced(limit = 1000): Promise<Location[]> {
  // Sanitizar y asegurar entero
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1000;


  const sql = `
    SELECT id_location, name, numbre_areas, region, generation, id_location_hubspot
    FROM Location
    WHERE id_location_hubspot IS NULL
    ORDER BY id_location ASC
    LIMIT ${safeLimit}
  `;

  const [rows] = await this.pool.query<LocationRow[]>(sql);

  return rows.map((r) => ({
    idLocation: r.id_location,
    name: r.name,
    numberArea: r.numbre_areas ?? 0,
    region: r.region ?? "",
    generation: r.generation ?? "",
    idLocationHubspot: r.id_location_hubspot,
  }));
}

  /**
   * Guarda el hs_object_id devuelto por HubSpot
   */
  async saveHubspotId(localId: number, hubspotId: number): Promise<void> {
    await this.pool.execute<ResultSetHeader>(
      `UPDATE Location
       SET id_location_hubspot = ?
       WHERE id_location = ?`,
      [hubspotId, localId]
    );
  }
}
