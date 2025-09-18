import { Router } from "express";
import { PokeBuildService } from "../../service/external/pokeServicio/PokeBuildServce";

const router = Router();
const service = new PokeBuildService();

router.get("/pokemons", async (req, res) => {
  try {
    console.log("⏳ Iniciando fetch de 100 pokemones...");
    const pokemons = await service.fetchFirst100Pokemons();
    res.json({ total: pokemons.length, data: pokemons });
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Error desconocido" });
    }
  }
});

export default router;
