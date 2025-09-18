import express from "express";
import dotenv from "dotenv";
import pokeRoutes from "./routes/pokeRoutes/PokeRoutes";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Usar las rutas
app.use("/api", pokeRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
