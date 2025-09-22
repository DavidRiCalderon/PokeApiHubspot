export interface Pokemon {
  idPokemon : number;          
  name: string;
  hp: number;
  attack: number;
  defense: number;
  specialDefense: number;
  specialAttack: number;
  speed: number;
  idPokeHubspot?: number | null; 
}


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
