// src/service/external/hubspotService/AssociationService.ts
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { pool } from "../../../repository/database";
import { RepositoryPokeLocation } from "../../../repository/RepositoryPokeLocation";

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN!;

type AssocInput = {
  from: { id: string };
  to: { id: string };
  types: Array<{
    associationCategory: "HUBSPOT_DEFINED" | "USER_DEFINED";
    associationTypeId: number;
  }>;
};

type AssocBatchResponse = {
  results?: any[];
  errors?: any[];
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class AssociationService {
  constructor(private repo = new RepositoryPokeLocation(pool)) {}

  /**
   * Crea asociaciones Contact → Company (typeId 279) en lotes.
   */
  async associateContactsToCompanies(batchSize = 100): Promise<void> {
    const pairs = await this.repo.findAssociations(5000);
    if (pairs.length === 0) {
      console.log("✅ No hay pares (contact, company) con IDs de HubSpot para asociar.");
      return;
    }

    const inputs: AssocInput[] = pairs.map(p => ({
      from: { id: p.contactHubspotId },  // Contact
      to:   { id: p.companyHubspotId },  // Company
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 279 }], // Contact→Company
    }));

    const url = "https://api.hubapi.com/crm/v4/associations/contacts/companies/batch/create";
    const batches = chunk(inputs, batchSize);

    for (const b of batches) {
      try {
        const resp = await axios.post<AssocBatchResponse>(
          url,
          { inputs: b },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            validateStatus: s => s >= 200 && s < 300,
          }
        );
        if (resp.data?.errors?.length) {
          console.error("⚠️ Errores creando asociaciones Contact→Company:", resp.data.errors);
        } else {
          console.log(`✅ Asociaciones Contact→Company creadas: ${b.length}`);
        }
      } catch (e: any) {
        console.error("❌ Error en batch Contact→Company:", e?.response?.data ?? e?.message ?? e);
      }
    }
  }

  /**
   * Crea asociaciones Company → Contact (typeId 280) en lotes.
   * Úsalo si quieres la asociación explícita en ambos sentidos.
   */
  async associateCompaniesToContacts(batchSize = 100): Promise<void> {
    const pairs = await this.repo.findAssociations(5000);
    if (pairs.length === 0) {
      console.log("✅ No hay pares (company, contact) con IDs de HubSpot para asociar.");
      return;
    }

    const inputs: AssocInput[] = pairs.map(p => ({
      from: { id: p.companyHubspotId },  // Company
      to:   { id: p.contactHubspotId },  // Contact
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 280 }], // Company→Contact
    }));

    const url = "https://api.hubapi.com/crm/v4/associations/companies/contacts/batch/create";
    const batches = chunk(inputs, batchSize);

    for (const b of batches) {
      try {
        const resp = await axios.post<AssocBatchResponse>(
          url,
          { inputs: b },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            validateStatus: s => s >= 200 && s < 300,
          }
        );
        if (resp.data?.errors?.length) {
          console.error("⚠️ Errores creando asociaciones Company→Contact:", resp.data.errors);
        } else {
          console.log(`✅ Asociaciones Company→Contact creadas: ${b.length}`);
        }
      } catch (e: any) {
        console.error("❌ Error en batch Company→Contact:", e?.response?.data ?? e?.message ?? e);
      }
    }
  }

  /**
   * Atajo: crea ambas direcciones (primero Contact→Company y luego Company→Contact).
   */
  async associateBothDirections(): Promise<void> {
    await this.associateContactsToCompanies();
    await this.associateCompaniesToContacts();
    console.log("🎉 Asociaciones en ambas direcciones completadas.");
  }
}
