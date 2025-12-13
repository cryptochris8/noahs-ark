/**
 * Game Configuration - Loads and provides access to game config values
 */

import gameConfigData from '../data/game_config.json';
import animalsData from '../data/animals.json';
import wavesData from '../data/waves.json';

export interface PlayerConfig {
  base_move_speed: number;
  sprint_multiplier: number;
  stamina_max: number;
  stamina_drain_per_second: number;
  stamina_recovery_per_second: number;
}

export interface FloodConfig {
  enabled: boolean;
  start_delay_seconds: number;
  start_height_y: number;
  rise_speed_blocks_per_second: number;
  max_height_y: number;
  damage_per_second_below_surface: number;
}

export interface SwimmingConfig {
  enabled: boolean;
  buoyancy_impulse: number;
  movement_speed_multiplier: number;
  stamina_drain_per_second: number;
  drowning_damage_per_second: number;
  drowning_starts_at_stamina: number;
  surface_threshold: number;
}

export interface AnimalsConfig {
  max_animals_world: number;
  respawn_on_pair_completion: boolean;
  follow_distance: number;
  follow_speed_multiplier: number;
  catchup_speed_multiplier?: number;
  catchup_distance_threshold?: number;
}

export interface AnimalType {
  id: string;
  display_name: string;
  pairs_required: number;
  spawn_tags: string[];
  preferred_tiers: number[];
}

export interface DifficultyMode {
  description: string;
  required_pairs_total: number;
  flood_rise_speed_blocks_per_second: number;
  flood_start_delay_seconds: number;
  animal_spawn_multiplier: number;
}

export type DifficultyKey = 'easy' | 'normal' | 'hard';

class GameConfig {
  private static _instance: GameConfig;

  public readonly gameTitle: string;
  public readonly mode: string;
  public readonly requiredPairsTotal: number;
  public readonly maxAnimalsFollowing: number;
  public readonly pairCompletionTimeWindowSeconds: number;
  public readonly player: PlayerConfig;
  public readonly flood: FloodConfig;
  public readonly swimming: SwimmingConfig;
  public readonly animals: AnimalsConfig;
  public readonly animalTypes: AnimalType[];
  public readonly difficultyModes: Record<DifficultyKey, DifficultyMode>;

  private constructor() {
    this.gameTitle = gameConfigData.game_title;
    this.mode = gameConfigData.mode;
    this.requiredPairsTotal = gameConfigData.required_pairs_total;
    this.maxAnimalsFollowing = gameConfigData.max_animals_following;
    this.pairCompletionTimeWindowSeconds = gameConfigData.pair_completion_time_window_seconds;
    this.player = gameConfigData.player;
    this.flood = gameConfigData.flood;
    this.swimming = gameConfigData.swimming;
    this.animals = gameConfigData.animals;
    this.animalTypes = animalsData.animal_types;
    this.difficultyModes = wavesData.modes as Record<DifficultyKey, DifficultyMode>;
  }

  public static get instance(): GameConfig {
    if (!GameConfig._instance) {
      GameConfig._instance = new GameConfig();
    }
    return GameConfig._instance;
  }

  public getAnimalTypeById(id: string): AnimalType | undefined {
    return this.animalTypes.find(animal => animal.id === id);
  }

  public getDifficultyConfig(difficulty: DifficultyKey): DifficultyMode {
    return this.difficultyModes[difficulty];
  }

  public getTotalRequiredPairs(): number {
    return this.animalTypes.reduce((sum, animal) => sum + animal.pairs_required, 0);
  }
}

export default GameConfig;
