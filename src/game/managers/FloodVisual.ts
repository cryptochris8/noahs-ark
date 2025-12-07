/**
 * FloodVisual - Visual flood water effect using a large transparent block entity
 *
 * This creates a large semi-transparent water surface that rises with the flood.
 * Uses a single entity for performance rather than many individual water blocks.
 */

import {
  Entity,
  RigidBodyType,
  type World,
} from 'hytopia';

// Map configuration based on environment variable
const MAP_NAME = process.env.MAP_NAME || 'plains-of-shinar';

// Map-specific flood visual dimensions
const MAP_DIMENSIONS: Record<string, { halfWidth: number; halfDepth: number }> = {
  'plains-of-shinar': {
    halfWidth: 80,   // X: -80 to +80 (covers 150x150 map with margin)
    halfDepth: 80,   // Z: -80 to +80
  },
  'original': {
    halfWidth: 50,   // X: -50 to +50
    halfDepth: 60,   // Z: -60 to +60
  },
};

const currentMapDimensions = MAP_DIMENSIONS[MAP_NAME] || MAP_DIMENSIONS['plains-of-shinar'];

export default class FloodVisual {
  private _world: World;
  private _waterEntity: Entity | null = null;
  private _currentHeight: number;
  private _isSpawned: boolean = false;

  // Configuration - map-specific dimensions
  private readonly MAP_HALF_WIDTH = currentMapDimensions.halfWidth;
  private readonly MAP_HALF_DEPTH = currentMapDimensions.halfDepth;
  private readonly WATER_THICKNESS = 0.5; // Thin horizontal plane
  private readonly WATER_OPACITY = 0.6;   // Semi-transparent

  constructor(world: World, startHeight: number = 2) {
    this._world = world;
    this._currentHeight = startHeight;
  }

  /**
   * Spawn the water visual entity
   */
  public spawn(): void {
    if (this._isSpawned) return;

    this._waterEntity = new Entity({
      name: 'FloodWater',
      blockTextureUri: 'blocks/water.png',
      blockHalfExtents: {
        x: this.MAP_HALF_WIDTH,
        y: this.WATER_THICKNESS,
        z: this.MAP_HALF_DEPTH,
      },
      rigidBodyOptions: {
        type: RigidBodyType.KINEMATIC_POSITION,
        // No colliders - purely visual
        colliders: [],
      },
    });

    // Spawn at current flood height
    this._waterEntity.spawn(this._world, {
      x: 0,
      y: this._currentHeight,
      z: 0,
    });

    // Apply transparency
    this._waterEntity.setOpacity(this.WATER_OPACITY);

    // Optional: Add blue tint for extra water look
    this._waterEntity.setTintColor({ r: 60, g: 140, b: 220 });

    this._isSpawned = true;
    console.log(`[FloodVisual] Spawned water at Y=${this._currentHeight}`);
  }

  /**
   * Despawn the water visual
   */
  public despawn(): void {
    if (!this._isSpawned || !this._waterEntity) return;

    this._waterEntity.despawn();
    this._waterEntity = null;
    this._isSpawned = false;
    console.log('[FloodVisual] Despawned water');
  }

  /**
   * Update the water height
   */
  public setHeight(height: number): void {
    this._currentHeight = height;

    if (this._waterEntity && this._isSpawned) {
      this._waterEntity.setPosition({
        x: 0,
        y: height,
        z: 0,
      });
    }
  }

  /**
   * Get current water height
   */
  public get height(): number {
    return this._currentHeight;
  }

  /**
   * Check if water is spawned
   */
  public get isSpawned(): boolean {
    return this._isSpawned;
  }

  /**
   * Test method: Animate water rising by 1 block per second
   */
  public startTestRise(targetHeight: number = 30): void {
    console.log(`[FloodVisual] Starting test rise to Y=${targetHeight}`);

    const riseInterval = setInterval(() => {
      if (this._currentHeight >= targetHeight) {
        clearInterval(riseInterval);
        console.log('[FloodVisual] Test rise complete');
        return;
      }

      this._currentHeight += 0.1; // Rise 0.1 blocks per 100ms = 1 block/sec
      this.setHeight(this._currentHeight);
    }, 100);
  }
}
