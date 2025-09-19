import express from "express";
import dotenv from "dotenv";
import pokeRoutes from "./routes/pokeRoutes/PokeRoutes";
import hubspotRoutes from "./routes/hubspotRoutes/HubspotRoutes";
import { HubspotCompanyService } from "./service/external/hubspotService/LocationHubspotService";


// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Usar las rutas
app.use("/api", pokeRoutes);
app.use("/api", hubspotRoutes);

//hubspot--------------------



// port -----------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});




//----------------------------------------------------------------------------------------

