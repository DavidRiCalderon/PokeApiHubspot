CREATE DATABASE IF NOT EXISTS pokeApi;
USE pokeApi;

-- POKEMON
CREATE TABLE Pokemon (
    id_pokemon INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    hp INT NOT NULL CHECK (hp >= 0),
    attack INT NOT NULL CHECK (attack >= 0),
    defense INT NOT NULL CHECK (defense >= 0),
    special_defense INT NOT NULL CHECK (special_defense >= 0),
    special_attack INT NOT NULL CHECK (special_attack >= 0),
    speed INT NOT NULL CHECK (speed >= 0),
    id_pokeubspot INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MOVE
CREATE TABLE Move (
    id_move INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    pp INT NOT NULL CHECK (pp >= 0),
    power INT NOT NULL CHECK (power >= 0),
    idMoveHubspot INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LOCATION
CREATE TABLE Location (
    idLocation INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    numbreAreas TEXT,
    region VARCHAR(100),
    generation VARCHAR(50),
    idLocationHubspot INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TYPE
CREATE TABLE Type (
    idType INT AUTO_INCREMENT PRIMARY KEY,
    nameType VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- JUNCTIONS
CREATE TABLE PokeMove (
    idMove INT NOT NULL,
    idPokemon INT NOT NULL,
    PRIMARY KEY (idMove, idPokemon),
    INDEX ix_pokemove_pokemon (idPokemon),
    CONSTRAINT fk_pokemove_move
        FOREIGN KEY (idMove) REFERENCES Move(idMove) ON DELETE CASCADE,
    CONSTRAINT fk_pokemove_pokemon
        FOREIGN KEY (idPokemon) REFERENCES Pokemon(idPokemon) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PokeLocation (
    idLocation INT NOT NULL,
    idPokemon INT NOT NULL,
    PRIMARY KEY (idLocation, idPokemon),
    INDEX ix_pokelocation_pokemon (idPokemon),
    CONSTRAINT fk_pokelocation_location
        FOREIGN KEY (idLocation) REFERENCES Location(idLocation) ON DELETE CASCADE,
    CONSTRAINT fk_pokelocation_pokemon
        FOREIGN KEY (idPokemon) REFERENCES Pokemon(idPokemon) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE PokemonType (
    idType INT NOT NULL,
    idPokemon INT NOT NULL,
    PRIMARY KEY (idType, idPokemon),
    INDEX ix_pokemontype_pokemon (idPokemon),
    CONSTRAINT fk_pokemontype_type
        FOREIGN KEY (idType) REFERENCES Type(idType) ON DELETE CASCADE,
    CONSTRAINT fk_pokemontype_pokemon
        FOREIGN KEY (idPokemon) REFERENCES Pokemon(idPokemon) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
