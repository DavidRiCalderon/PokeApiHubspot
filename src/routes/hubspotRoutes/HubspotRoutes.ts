import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../../repository/database";

// Companies
import { HubspotCompanyService } from "../../service/external/hubspotService/LocationHubspotService";
import { RepositoryLocation } from "../../repository/RepositoryLocation";

// Moves (custom object)
import { RepositoryMove } from "../../repository/RepositoryMove";
import { MoveHubspotService } from "../../service/external/hubspotService/MoveHubspotService";

// Pokemons (contacts)
import { PokeRepository } from "../../repository/PokeRepository";
import { PokemonHubspotService } from "../../service/external/hubspotService/PokeHubspotService";


const router = Router();
//-------------------------------------------------------------------------companies-----------------------------------------------
// Singletons (si prefieres DI, inyecta en app.ts)
const repo = new RepositoryLocation(pool);
const hubspotSvc = new HubspotCompanyService(repo);

// POST /api/hubspot/companies/sync
// Dispara la sincronización batch: DB → HubSpot, y guarda hs_object_id en DB
router.post(
  "/hubspot/companies/sync",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await hubspotSvc.syncLocationsAsCompaniesBatch();
      return res.status(202).json({
        ok: true,
        message: "Sincronización ejecutada (revisa logs del servidor).",
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/hubspot/companies/pending
// Devuelve cuántas locations faltan por subir (id_location_hubspot IS NULL)
router.get(
  "/hubspot/companies/pending",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pending = await repo.findNotSynced(5000);
      return res.json({
        ok: true,
        count: pending.length,
        sample: pending.slice(0, 10).map((l) => l.idLocation),
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/health
router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hubspot-sync", status: "healthy" });
});

//---------------------------------------------------------------------------------move---------------------------------------------


const repoMove = new RepositoryMove(pool);
const moveSvc = new MoveHubspotService(repoMove);

router.get(
  "/hubspot/moves/pending",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pending = await repoMove.findNotSynced(2000);
      res.json({
        ok: true,
        count: pending.length,
        sample: pending.slice(0, 10).map((m) => ({
          id: m.idMove,
          name: m.name,
          pp: m.pp,
          power: m.power,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/hubspot/moves/sync",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await moveSvc.syncMovesBatch();
      res.status(202).json({
        ok: true,
        message: "Sincronización de moves ejecutada (revisa logs).",
      });
    } catch (err) {
      next(err);
    }
  }
);

//---------------------------------------------------------------------------------pokemon--------------------------------------------

const repoPokemon = new PokeRepository(pool);
const pokemonSvc = new PokemonHubspotService(repoPokemon);

router.get(
  "/hubspot/pokemons/pending",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pending = await repoPokemon.findNotSynced(2000);
      res.json({
        ok: true,
        count: pending.length,
        sample: pending.slice(0, 10).map((p) => ({
          id: p.idPokemon,
          name: p.name,
          hp: p.hp,
          attack: p.attack,
          defense: p.defense,
          special_attack: p.specialAttack,
          special_defense: p.specialDefense,
          speed: p.speed,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/hubspot/pokemons/sync",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await pokemonSvc.syncPokemonsAsContactsBatch();
      res.status(202).json({
        ok: true,
        message: "Sincronización de pokemons ejecutada (revisa logs).",
      });
    } catch (err) {
      next(err);
    }
  }
);


export default router;
