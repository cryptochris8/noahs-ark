/**
 * ArkGoalZone - Sensor zone that detects when animal pairs are delivered to the Ark
 */

import {
  Collider,
  ColliderShape,
  CollisionGroup,
  Entity,
  BlockType,
  Audio,
  RigidBodyType,
  Quaternion,
  type World,
  type Vector3Like,
  type QuaternionLike,
} from 'hytopia';

import AnimalEntity from './AnimalEntity';
import GameConfig from '../GameConfig';

export type PairCompletedCallback = (animalType: string, animal1: AnimalEntity, animal2: AnimalEntity) => void;
export type WrongPairCallback = (animal: AnimalEntity) => void;

export interface ArkGoalZoneOptions {
  position: Vector3Like;         // Goal zone/drop-off position
  arkModelPosition?: Vector3Like; // Separate position for the Ark model (if different from goal zone)
  size?: Vector3Like;
  modelUri?: string;
  modelScale?: number;
  modelOffset?: Vector3Like;
  modelRotationY?: number; // Rotation in degrees around Y axis
}

export default class ArkGoalZone {
  private _world: World;
  private _position: Vector3Like;
  private _arkModelPosition: Vector3Like;
  private _size: Vector3Like;
  private _collider: Collider | null = null;
  private _animalsInZone: Set<AnimalEntity> = new Set();
  private _recentDeliveries: Map<string, { animal: AnimalEntity; timestamp: number }[]> = new Map();
  private _onPairCompleted: PairCompletedCallback | null = null;
  private _onWrongPair: WrongPairCallback | null = null;
  private _pairSuccessAudio: Audio;
  private _pairFailAudio: Audio;
  private _arkModelEntity: Entity | null = null;
  private _modelUri: string | null;
  private _modelScale: number;
  private _modelOffset: Vector3Like;
  private _modelRotationY: number;

  constructor(world: World, options: ArkGoalZoneOptions) {
    this._world = world;
    this._position = options.position;
    this._arkModelPosition = options.arkModelPosition ?? options.position; // Default to same as goal zone
    this._size = options.size ?? { x: 8, y: 4, z: 8 };
    this._modelUri = options.modelUri ?? null;
    this._modelScale = options.modelScale ?? 1;
    this._modelOffset = options.modelOffset ?? { x: 0, y: 0, z: 0 };
    this._modelRotationY = options.modelRotationY ?? 0;

    // Create success/fail audio
    this._pairSuccessAudio = new Audio({
      uri: 'audio/sfx/pair-saved.mp3',
      loop: false,
      volume: 0.8,
    });

    this._pairFailAudio = new Audio({
      uri: 'audio/sfx/wrong-pair-error.mp3',
      loop: false,
      volume: 0.5,
    });
  }

  public get position(): Vector3Like {
    return this._position;
  }

  /**
   * Set callback for when a valid pair is completed
   */
  public onPairCompleted(callback: PairCompletedCallback): void {
    this._onPairCompleted = callback;
  }

  /**
   * Set callback for when a wrong pair attempt is made
   */
  public onWrongPair(callback: WrongPairCallback): void {
    this._onWrongPair = callback;
  }

  /**
   * Create and activate the goal zone collider
   */
  public activate(): void {
    if (this._collider) return;

    this._collider = new Collider({
      shape: ColliderShape.BLOCK,
      halfExtents: {
        x: this._size.x / 2,
        y: this._size.y / 2,
        z: this._size.z / 2,
      },
      relativePosition: this._position,
      isSensor: true,
      collisionGroups: {
        belongsTo: [CollisionGroup.ENTITY_SENSOR],
        collidesWith: [CollisionGroup.ENTITY],
      },
      onCollision: this._handleCollision.bind(this),
    });

    this._collider.addToSimulation(this._world.simulation);

    // Spawn the ark model if a model URI was provided
    if (this._modelUri) {
      this._arkModelEntity = new Entity({
        name: 'NoahsArk',
        modelUri: this._modelUri,
        modelScale: this._modelScale,
        rigidBodyOptions: {
          type: RigidBodyType.FIXED,
          colliders: [], // No physics colliders - just visual
        },
      });

      // Use ark model position (separate from goal zone position)
      const modelPosition = {
        x: this._arkModelPosition.x + this._modelOffset.x,
        y: this._arkModelPosition.y + this._modelOffset.y,
        z: this._arkModelPosition.z + this._modelOffset.z,
      };

      const rotation = Quaternion.fromEuler(0, this._modelRotationY, 0);
      this._arkModelEntity.spawn(this._world, modelPosition, rotation);
    }
  }

  /**
   * Deactivate and remove the goal zone collider
   */
  public deactivate(): void {
    if (this._collider) {
      this._collider.removeFromSimulation();
      this._collider = null;
    }

    // Despawn the ark model
    if (this._arkModelEntity) {
      this._arkModelEntity.despawn();
      this._arkModelEntity = null;
    }

    this._animalsInZone.clear();
    this._recentDeliveries.clear();
  }

  /**
   * Check if an animal is currently in the goal zone
   */
  public isAnimalInZone(animal: AnimalEntity): boolean {
    return this._animalsInZone.has(animal);
  }

  private _handleCollision(other: BlockType | Entity, started: boolean): void {
    if (!(other instanceof AnimalEntity)) return;

    const animal = other as AnimalEntity;

    if (started) {
      this._onAnimalEntered(animal);
    } else {
      this._onAnimalExited(animal);
    }
  }

  private _onAnimalEntered(animal: AnimalEntity): void {
    // Only process animals that are following a player
    if (!animal.isFollowing) return;

    this._animalsInZone.add(animal);

    const animalType = animal.animalType;
    const now = Date.now();
    const timeWindow = GameConfig.instance.pairCompletionTimeWindowSeconds * 1000;

    // Get recent deliveries of the same type
    const recentOfType = this._recentDeliveries.get(animalType) ?? [];

    // Clean up old entries outside the time window
    const validRecent = recentOfType.filter(entry => now - entry.timestamp < timeWindow);
    this._recentDeliveries.set(animalType, validRecent);

    // Check if there's a matching animal waiting
    if (validRecent.length > 0) {
      // We have a pair!
      const matchingEntry = validRecent.shift()!;
      this._recentDeliveries.set(animalType, validRecent);

      // Trigger pair completed callback
      if (this._onPairCompleted) {
        this._onPairCompleted(animalType, matchingEntry.animal, animal);
      }

      // Play success sound
      this._pairSuccessAudio.play(this._world, true);

      // Remove both animals from the zone tracking
      this._animalsInZone.delete(matchingEntry.animal);
      this._animalsInZone.delete(animal);
    } else {
      // No matching animal yet, add to waiting list
      validRecent.push({ animal, timestamp: now });
      this._recentDeliveries.set(animalType, validRecent);

      // Set a timeout to check if no pair was found
      setTimeout(() => {
        const currentRecent = this._recentDeliveries.get(animalType) ?? [];
        const stillWaiting = currentRecent.find(e => e.animal === animal);

        if (stillWaiting) {
          // Remove from waiting list
          const filtered = currentRecent.filter(e => e.animal !== animal);
          this._recentDeliveries.set(animalType, filtered);

          // If the animal is still in the zone and alone, trigger wrong pair
          if (this._animalsInZone.has(animal) && this._onWrongPair) {
            this._onWrongPair(animal);
            this._pairFailAudio.play(this._world, true);
          }
        }
      }, timeWindow);
    }
  }

  private _onAnimalExited(animal: AnimalEntity): void {
    this._animalsInZone.delete(animal);

    // Remove from recent deliveries if exiting
    const animalType = animal.animalType;
    const recentOfType = this._recentDeliveries.get(animalType) ?? [];
    const filtered = recentOfType.filter(entry => entry.animal !== animal);
    this._recentDeliveries.set(animalType, filtered);
  }

  /**
   * Manually trigger a pair check for animals following a player
   */
  public checkPairFromPlayer(animals: AnimalEntity[]): { success: boolean; animalType?: string } {
    if (animals.length < 2) {
      return { success: false };
    }

    // Check if any two animals of the same type
    for (let i = 0; i < animals.length; i++) {
      for (let j = i + 1; j < animals.length; j++) {
        if (animals[i].animalType === animals[j].animalType) {
          // Found a pair!
          const animalType = animals[i].animalType;

          if (this._onPairCompleted) {
            this._onPairCompleted(animalType, animals[i], animals[j]);
          }

          this._pairSuccessAudio.play(this._world, true);
          return { success: true, animalType };
        }
      }
    }

    // No matching pair found
    if (this._onWrongPair && animals.length > 0) {
      this._onWrongPair(animals[0]);
      this._pairFailAudio.play(this._world, true);
    }

    return { success: false };
  }
}
