# PokeHubSpot Sync (Node + Express + TypeScript)

Sincroniza datos de **Pokémon** con **HubSpot** (Contacts, Companies y Custom Objects) y administra **asociaciones** entre ellos.  
Incluye ingesta desde la PokeAPI → MySQL y endpoints para subir por lotes (limitados a 100) a HubSpot.

---

## 🧱 Stack

- Node.js + Express (TypeScript)
- MySQL (persistencia)
- HubSpot CRM API v3/v4
- Axios, dotenv

---

## 🚀 Quick start

```bash
# 1) Instalar dependencias
npm install

# 2) Crear tu archivo de variables
cp .env.example .env
# ...edita .env con tus credenciales y token de HubSpot

# 3) (Opcional) Crear la base MySQL (si no existe)
# Carga tu script de tablas (Pokemon, Move, Location, junctions, etc.)

# 4) Dev server
npm run dev
# Servidor en http://localhost:4000 
```
## ⚙️ Variables de entorno

PORT=4000
NODE_ENV=development

# Bases de datos
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=pokeapi
DB_PORT=3306

# HubSpot
HUBSPOT_TOKEN=pat-na1-********************************
HUBSPOT_MOVE_OBJECT=2-6035****            # objectTypeId del custom object "move" (o pXXXX_move)
HUBSPOT_ASSOC_LABEL=Move Relation
HUBSPOT_ASSOC_NAME=move_relation

# Límites de subida (opcionales; por defecto 100)
HUBSPOT_COMPANY_UPLOAD_LIMIT=100
HUBSPOT_MOVE_UPLOAD_LIMIT=100

## 🗄️ Esquema MySQL (resumen)

Pokemon(id_pokemon, name, hp, attack, defense, special_defense, special_attack, speed, id_poke_hubspot BIGINT NULL)

Move(id_move, name, pp, power, id_move_hubspot BIGINT NULL)

Location(id_location, name, numbre_areas, region, generation, id_location_Hubspot BIGINT NULL)

Junctions:
    - Poke_move(id_move, id_pokemon) (PK compuesto)

    - Poke_location(id_location, id_pokemon) (PK compuesto)

## ✅ Checklist en HubSpot

### Contacts (Pokémon)

    - Propiedades requeridas (internal name):

    - firstname (usa el nombre del Pokémon)

    - phone → ID local id_pokemon (para correlación)

    - Stats: hp, attack, defense, special_defense, special_attack, speed

    - types (multiselect; valores separados por ;)

### Companies (Locations)

    - name

    - phone → ID local id_location (para correlación)

    - country ← region

    - Custom: generation, number_of_areas (o comenta esas líneas en el código)

### Custom Object Move

    - Objeto move (schema en tu portal)

    - Props internas: id (numérica; correlación con id_move), name, pp, power

    - Se guarda hs_object_id en Move.id_move_hubspot

## 📡 Endpoints

Base URL: http://localhost:4000/api

### Ingesta desde PokeAPI → MySQL

GET /pokemons
Descarga info de la PokeAPI (primeros 100) y guarda en MySQL.

### Health / pendientes

GET /hubspot/companies/pending — cuántas Location faltan por subir.

GET /hubspot/moves/pending — cuántos Move faltan por subir.

GET /hubspot/pokemons/pending — cuántos Pokemon faltan por subir.

GET /health — estado del servicio.

### Sincronización a HubSpot (lotes de 100 por corrida)

POST /hubspot/companies/sync
Carga 100 Locations como Companies en HubSpot.
Límite: HUBSPOT_COMPANY_UPLOAD_LIMIT.

POST /hubspot/moves/sync
Carga 100 Moves al custom object move.
Límite: HUBSPOT_MOVE_UPLOAD_LIMIT.

POST /hubspot/pokemons/sync
Carga 100 Pokémons como Contacts.

### Asociaciones (HubSpot v4)

POST /hubspot/associations-location/contacts-to-companies — Contact → Company

POST /hubspot/associations-location/companies-to-contacts — Company → Contact

POST /hubspot/associations-location/both — ambos sentidos (Contact ↔ Company)

POST /hubspot/associations/pokemons-to-moves — Contact (Pokémon) → Move

POST /hubspot/associations/moves-to-pokemons — Move → Contact (Pokémon)

POST /hubspot/associations/pokemons-moves/both — ambos sentidos (Contact ↔ Move)

## 🧪 Ejemplos (cURL)

# Ingesta PokeAPI → MySQL
curl http://localhost:4000/api/pokemons

# Pendientes
curl http://localhost:4000/api/hubspot/companies/pending
curl http://localhost:4000/api/hubspot/moves/pending
curl http://localhost:4000/api/hubspot/pokemons/pending

# Sincronización
curl -X POST http://localhost:4000/api/hubspot/companies/sync
curl -X POST http://localhost:4000/api/hubspot/moves/sync
curl -X POST http://localhost:4000/api/hubspot/pokemons/sync

# Asociaciones
curl -X POST http://localhost:4000/api/hubspot/associations-location/both
curl -X POST http://localhost:4000/api/hubspot/associations/pokemons-moves/both


# recommended structure

│   .env
│   .env.example
│   .gitignore
│   LICENSE
│   package-lock.json
│   package.json
├───docs
│       abstraccion-links.xlsx
│       pokeApi.drawio.pdf
│       poketablas.sql
│       scripts consultas.sql
│       sources.docx
│       tablas.mwb
│
└───src
    │   app.ts
    │
    ├───model
    │       Location.ts
    │       move.ts
    │       PokeLocation.ts
    │       Pokemon.ts
    │       PokeMove.ts
    │       PokeType.ts
    │       Type.ts
    │
    ├───repository
    │       database.ts
    │       PokeRepository.ts
    │       PokeTypeQuickAccess.ts
    │       RepositoryLocation.ts
    │       RepositoryMove.ts
    │       RepositoryPokeLocation.ts
    │       RepositoryPokeMove.ts
    │       RepositoryType.ts
    │       RespositoryPokeType.ts
    │
    ├───routes
    │   ├───hubspotRoutes
    │   │       HubspotRoutes.ts
    │   │
    │   └───pokeRoutes
    │           PokeRoutes.ts
    │
    └───service
        └───external
            ├───hubspotService
            │       AssociationLocationHubspotService.ts
            │       AssociationMoveHubspotService.ts
            │       LocationHubspotService.ts
            │       MoveHubspotService.ts
            │       PokeHubspotService.ts
            │
            └───pokeServicio
                    LocationBuldServce.ts
                    MoveBuildServce.ts
                    PokeBuildServce.ts
                    typeBuildServce.ts