USE pokeApi;
-- tabla Pokemon-----------------------------------
SELECT 
* 
FROM Pokemon;

-- tabla Move--------------------------------
SELECT 
* 
FROM Move;

SELECT COUNT(*) AS total_registros
FROM Move;

-- tabla Poke_Move--------------------------------------
SELECT 
* 
FROM Poke_move 
WHERE id_pokemon > "54";

SELECT COUNT(*) AS total_registros
FROM Poke_move ;

-- type-------------------------------------------------------------
SELECT 
* 
FROM Type;

SELECT COUNT(*) AS total_registros
FROM Type;

-- Pokemon_type----------------------------------------------------------

SELECT 
* 
FROM Pokemon_type;

SELECT COUNT(*) AS total_registros
FROM Pokemon_type;

-- location--------------------------------------------------------------------
-- DROP TABLE Location;
SELECT 
* 
FROM Location;

SELECT COUNT(*) AS total_registros
FROM Location;

-- Poke_location---------------------------------------------------------
-- DROP TABLE Poke_location;
SELECT 
* 
FROM Poke_location;

SELECT COUNT(*) AS total_registros
FROM Poke_location;

ALTER TABLE Location
  MODIFY COLUMN id_location_hubspot BIGINT UNSIGNED NULL;
  
  SELECT
        pl.id_pokemon,
        pl.id_location,
        p.id_poke_hubspot   AS contactHubspotId,
        l.id_location_hubspot AS companyHubspotId
      FROM Poke_location pl
      INNER JOIN Pokemon  p ON p.id_pokemon  = pl.id_pokemon
      INNER JOIN Location l ON l.id_location = pl.id_location
      WHERE p.id_poke_hubspot IS NOT NULL
        AND l.id_location_hubspot IS NOT NULL
      ORDER BY pl.id_location, pl.id_pokemon
      LIMIT 100;
-- borrar idHubspot---------------
UPDATE Pokemon
SET id_poke_hubspot = NULL
WHERE id_pokemon > 0;

-- borrar idHubspot---------------
UPDATE Location
SET id_location_Hubspot = NULL
WHERE id_location > 0;

-- borrar idHubspot---------------
UPDATE Move
SET id_move_hubspot = NULL
WHERE id_move > 0;