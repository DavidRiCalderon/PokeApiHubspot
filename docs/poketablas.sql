Drop database pokeApi;
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
    id_poke_hubspot bigint
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MOVE
CREATE TABLE Move (
    id_move INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    pp INT NOT NULL CHECK (pp >= 0),
    power INT NOT NULL CHECK (power >= 0),
    id_move_hubspot bigint
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- LOCATION
CREATE TABLE Location (
    id_location INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    numbre_areas TEXT,
    region VARCHAR(100),
    generation VARCHAR(50),
    id_location_Hubspot bigint
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TYPE
CREATE TABLE Type (
    id_type INT AUTO_INCREMENT PRIMARY KEY,
    name_type VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- JUNCTIONS
CREATE TABLE Poke_move (
    id_move INT NOT NULL,
    id_pokemon INT NOT NULL,
    PRIMARY KEY (id_move, id_pokemon),
    INDEX ix_Poke_move_pokemon (id_pokemon),
    CONSTRAINT fk_Poke_move_move
        FOREIGN KEY (id_move) REFERENCES Move(id_move) ON DELETE CASCADE,
    CONSTRAINT fk_Poke_move_pokemon
        FOREIGN KEY (id_pokemon) REFERENCES Pokemon(id_pokemon) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Poke_location (
    id_location INT NOT NULL,
    id_pokemon INT NOT NULL,
    PRIMARY KEY (id_location, id_pokemon),
    INDEX ix_Poke_location_pokemon (id_pokemon),
    CONSTRAINT fk_Poke_location_location
        FOREIGN KEY (id_location) REFERENCES Location(id_location) ON DELETE CASCADE,
    CONSTRAINT fk_Poke_location_pokemon
        FOREIGN KEY (id_pokemon) REFERENCES Pokemon(id_pokemon) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Pokemon_type (
    id_type INT NOT NULL,
    id_pokemon INT NOT NULL,
    PRIMARY KEY (id_type, id_pokemon),
    INDEX ix_pokemon_type_pokemon (id_pokemon),
    CONSTRAINT fk_pokemon_type__type
        FOREIGN KEY (id_type) REFERENCES `Type`(id_type) ON DELETE CASCADE,
    CONSTRAINT fk_pokemon_type__pokemon
        FOREIGN KEY (id_pokemon) REFERENCES Pokemon(id_pokemon) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
