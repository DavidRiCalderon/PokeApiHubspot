// Objeto de dominio (usado en tu app)
export interface Pokemon {
  idPokemon : number;          // opcional porque es autoincrement
  name: string;
  hp: number;
  attack: number;
  defense: number;
  specialDefense: number;
  specialAttack: number;
  speed: number;
  idPokeHubspot?: number | null; // puede ser null en la BD
}

// Objeto tal como viene de la BD
export interface PokemonDBRow {
  id_pokemon: number;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  special_defense: number;
  special_attack: number;
  speed: number;
  id_poke_hubspot?: number | null;
}
