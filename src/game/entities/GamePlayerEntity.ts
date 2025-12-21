/**
 * GamePlayerEntity - Player entity with animal interaction capabilities
 */

import {
  DefaultPlayerEntity,
  DefaultPlayerEntityController,
  BaseEntityControllerEvent,
  CollisionGroup,
  type Player,
  type World,
  type Vector3Like,
} from 'hytopia';

import GameManager from '../GameManager';
import AnimalEntity from './AnimalEntity';

const INTERACT_REACH = 3.5;

// Base movement speeds
const BASE_RUN_VELOCITY = 8;
const BASE_WALK_VELOCITY = 4;

// Animation playback rate to match movement velocity
// Default player animations are authored for ~4 units/sec, so we scale accordingly
const BASE_ANIMATION_RATE = 1.5;

export default class GamePlayerEntity extends DefaultPlayerEntity {
  private _lastInteractTime: number = 0;
  private _interactCooldownMs: number = 500;
  private _speedMultiplier: number = 1.0;

  constructor(player: Player) {
    super({
      player,
      name: 'Player',
    });

    // Set up input handling (controller is guaranteed after super for DefaultPlayerEntity)
    this.controller!.on(BaseEntityControllerEvent.TICK_WITH_PLAYER_INPUT, this._onTickWithPlayerInput.bind(this));
  }

  public override spawn(world: World, position: Vector3Like): void {
    super.spawn(world, position);

    // Set animation playback rate to match our movement speeds
    this.setModelAnimationsPlaybackRate(BASE_ANIMATION_RATE * this._speedMultiplier);
  }

  /**
   * Apply a speed multiplier (for Speed Boots power-up)
   */
  public setSpeedMultiplier(multiplier: number): void {
    this._speedMultiplier = multiplier;
    this._updateControllerSpeed();
    this._updateAnimationSpeed();
  }

  /**
   * Reset speed to normal
   */
  public resetSpeed(): void {
    this._speedMultiplier = 1.0;
    this._updateControllerSpeed();
    this._updateAnimationSpeed();
  }

  /**
   * Update the controller's velocity settings
   */
  private _updateControllerSpeed(): void {
    const controller = this.controller as DefaultPlayerEntityController;
    if (!controller) return;

    controller.runVelocity = BASE_RUN_VELOCITY * this._speedMultiplier;
    controller.walkVelocity = BASE_WALK_VELOCITY * this._speedMultiplier;
  }

  /**
   * Update animation playback rate to match movement speed
   */
  private _updateAnimationSpeed(): void {
    this.setModelAnimationsPlaybackRate(BASE_ANIMATION_RATE * this._speedMultiplier);
  }

  private _onTickWithPlayerInput(payload: { input: Record<string, boolean> }): void {
    const { input } = payload;

    // Handle E key for animal interaction
    if (input.e) {
      this._handleInteract();
      input.e = false; // Consume the input
    }

    // Handle F key for ark delivery (when near the ark)
    if (input.f) {
      this._handleArkDelivery();
      input.f = false;
    }
  }

  private _handleInteract(): void {
    if (!this.world) return;

    // Check cooldown
    const now = Date.now();
    if (now - this._lastInteractTime < this._interactCooldownMs) return;
    this._lastInteractTime = now;

    // Raycast to find nearby entities
    const raycastResult = this.world.simulation.raycast(
      {
        x: this.position.x,
        y: this.position.y + 0.5,
        z: this.position.z,
      },
      this.player.camera.facingDirection,
      INTERACT_REACH,
      {
        filterExcludeRigidBody: this.rawRigidBody,
        filterFlags: 8, // Exclude sensors
      }
    );

    if (raycastResult?.hitEntity instanceof AnimalEntity) {
      GameManager.instance.handleAnimalInteraction(this.player, raycastResult.hitEntity);
      return;
    }

    // If no direct hit, check for nearby animals
    const nearbyAnimal = this._findNearbyAnimal();
    if (nearbyAnimal) {
      GameManager.instance.handleAnimalInteraction(this.player, nearbyAnimal);
    }
  }

  private _findNearbyAnimal(): AnimalEntity | null {
    const animalManager = GameManager.instance.animalManager;
    if (!animalManager) return null;

    const myPos = this.position;
    let closestAnimal: AnimalEntity | null = null;
    let closestDistance = INTERACT_REACH * INTERACT_REACH;

    for (const animal of animalManager.animals) {
      if (!animal.isSpawned) continue;

      const animalPos = animal.position;
      const dx = animalPos.x - myPos.x;
      const dy = animalPos.y - myPos.y;
      const dz = animalPos.z - myPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < closestDistance) {
        closestDistance = distSq;
        closestAnimal = animal;
      }
    }

    return closestAnimal;
  }

  private _handleArkDelivery(): void {
    GameManager.instance.handleArkDelivery(this.player);
  }
}
