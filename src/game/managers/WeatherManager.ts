/**
 * WeatherManager - Handles rain particles and sky darkening based on flood progress
 *
 * As the flood rises, the weather intensifies:
 * - Rain particles increase in rate and density
 * - Sky darkens (ambient light, directional light, skybox intensity decrease)
 * - Fog increases to create an ominous atmosphere
 */

import {
  ParticleEmitter,
  Audio,
  GameServer,
  type World,
  type Player,
} from 'hytopia';

// Weather stages based on flood progress (0.0 - 1.0)
interface WeatherStage {
  minProgress: number;
  maxProgress: number;
  rainRate: number;
  skyboxIntensity: number;
  ambientLightIntensity: number;
  directionalLightIntensity: number;
  fogNear: number;
  fogFar: number;
  fogColor: { r: number; g: number; b: number };
  rainVolume: number;
}

// Weather configuration
const WEATHER_STAGES: WeatherStage[] = [
  {
    // Stage 0: Clear skies (0-10%)
    minProgress: 0,
    maxProgress: 0.1,
    rainRate: 0,
    skyboxIntensity: 1.0,
    ambientLightIntensity: 1.0,
    directionalLightIntensity: 3.0,
    fogNear: 500,
    fogFar: 550,
    fogColor: { r: 200, g: 220, b: 255 },
    rainVolume: 0,
  },
  {
    // Stage 1: Light drizzle (10-30%)
    minProgress: 0.1,
    maxProgress: 0.3,
    rainRate: 50,
    skyboxIntensity: 0.85,
    ambientLightIntensity: 0.9,
    directionalLightIntensity: 2.5,
    fogNear: 400,
    fogFar: 500,
    fogColor: { r: 180, g: 200, b: 230 },
    rainVolume: 0.2,
  },
  {
    // Stage 2: Light rain (30-50%)
    minProgress: 0.3,
    maxProgress: 0.5,
    rainRate: 150,
    skyboxIntensity: 0.7,
    ambientLightIntensity: 0.75,
    directionalLightIntensity: 2.0,
    fogNear: 300,
    fogFar: 400,
    fogColor: { r: 150, g: 170, b: 200 },
    rainVolume: 0.4,
  },
  {
    // Stage 3: Moderate rain (50-70%)
    minProgress: 0.5,
    maxProgress: 0.7,
    rainRate: 300,
    skyboxIntensity: 0.5,
    ambientLightIntensity: 0.6,
    directionalLightIntensity: 1.5,
    fogNear: 200,
    fogFar: 350,
    fogColor: { r: 120, g: 140, b: 180 },
    rainVolume: 0.6,
  },
  {
    // Stage 4: Heavy rain (70-85%)
    minProgress: 0.7,
    maxProgress: 0.85,
    rainRate: 500,
    skyboxIntensity: 0.35,
    ambientLightIntensity: 0.45,
    directionalLightIntensity: 1.0,
    fogNear: 100,
    fogFar: 250,
    fogColor: { r: 100, g: 120, b: 160 },
    rainVolume: 0.8,
  },
  {
    // Stage 5: Torrential downpour (85-100%)
    minProgress: 0.85,
    maxProgress: 1.0,
    rainRate: 800,
    skyboxIntensity: 0.2,
    ambientLightIntensity: 0.3,
    directionalLightIntensity: 0.5,
    fogNear: 50,
    fogFar: 150,
    fogColor: { r: 80, g: 100, b: 140 },
    rainVolume: 1.0,
  },
];

const RAIN_TEXTURE_URI = 'textures/particles/raindrop.png';

export default class WeatherManager {
  private _world: World;
  private _rainEmitter: ParticleEmitter | null = null;
  private _rainAudio: Audio | null = null;
  private _currentProgress: number = 0;
  private _isActive: boolean = false;
  private _updateInterval: NodeJS.Timeout | null = null;

  // Store original world settings to restore later
  private _originalSkyboxIntensity: number = 1.0;
  private _originalAmbientLightIntensity: number = 1.0;
  private _originalDirectionalLightIntensity: number = 3.0;
  private _originalFogNear: number = 500;
  private _originalFogFar: number = 550;

  constructor(world: World) {
    this._world = world;

    // Store original settings
    this._originalSkyboxIntensity = world.skyboxIntensity;
    this._originalAmbientLightIntensity = world.ambientLightIntensity;
    this._originalDirectionalLightIntensity = world.directionalLightIntensity;
    this._originalFogNear = world.fogNear;
    this._originalFogFar = world.fogFar;

    // Create rain particle emitter (positioned above the map center, high up)
    this._rainEmitter = new ParticleEmitter({
      textureUri: RAIN_TEXTURE_URI,
      position: { x: 0, y: 80, z: 0 }, // High above the map
      positionVariance: { x: 100, y: 10, z: 100 }, // Wide spread
      velocity: { x: 0, y: -25, z: 0 }, // Falling down fast
      velocityVariance: { x: 2, y: 5, z: 2 }, // Slight variation
      gravity: { x: 0, y: -5, z: 0 }, // Additional gravity pull
      lifetime: 4, // 4 seconds to fall
      lifetimeVariance: 1,
      rate: 0, // Start with no rain
      maxParticles: 5000,
      sizeStart: 0.15, // Small raindrops
      sizeEnd: 0.1,
      sizeStartVariance: 0.05,
      opacityStart: 0.7,
      opacityEnd: 0.3,
      colorStart: { r: 200, g: 220, b: 255 }, // Light blue-white
      colorEnd: { r: 150, g: 180, b: 220 }, // Slightly darker blue
      transparent: true,
    });

    // Create rain audio (looping ambient rain sound)
    this._rainAudio = new Audio({
      uri: 'audio/sfx/rain-loop.mp3',
      loop: true,
      volume: 0,
    });
  }

  /**
   * Start the weather system
   */
  public start(): void {
    if (this._isActive) return;
    this._isActive = true;

    // Spawn the rain emitter
    if (this._rainEmitter) {
      this._rainEmitter.spawn(this._world);
    }

    // Start rain audio
    if (this._rainAudio) {
      this._rainAudio.play(this._world);
    }

    // Start update loop for smooth transitions
    this._updateInterval = setInterval(() => this._updateWeatherEffects(), 500);

    // Initial update
    this._updateWeatherEffects();
  }

  /**
   * Stop the weather system
   */
  public stop(): void {
    if (!this._isActive) return;
    this._isActive = false;

    // Stop update loop
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
      this._updateInterval = null;
    }

    // Despawn rain emitter
    if (this._rainEmitter && this._rainEmitter.isSpawned) {
      this._rainEmitter.despawn();
    }

    // Stop rain audio
    if (this._rainAudio) {
      this._rainAudio.pause();
    }
  }

  /**
   * Reset weather to clear skies
   */
  public reset(): void {
    this.stop();
    this._currentProgress = 0;

    // Restore original world settings
    this._world.setSkyboxIntensity(this._originalSkyboxIntensity);
    this._world.setAmbientLightIntensity(this._originalAmbientLightIntensity);
    this._world.setDirectionalLightIntensity(this._originalDirectionalLightIntensity);
    this._world.setFogNear(this._originalFogNear);
    this._world.setFogFar(this._originalFogFar);
  }

  /**
   * Update weather based on flood progress (0.0 - 1.0)
   */
  public setFloodProgress(progress: number): void {
    this._currentProgress = Math.max(0, Math.min(1, progress));
  }

  /**
   * Get interpolated weather values based on current progress
   */
  private _getInterpolatedWeather(): WeatherStage {
    const progress = this._currentProgress;

    // Find the current and next stages
    let currentStage = WEATHER_STAGES[0];
    let nextStage = WEATHER_STAGES[1];

    for (let i = 0; i < WEATHER_STAGES.length - 1; i++) {
      if (progress >= WEATHER_STAGES[i].minProgress && progress < WEATHER_STAGES[i + 1].minProgress) {
        currentStage = WEATHER_STAGES[i];
        nextStage = WEATHER_STAGES[i + 1];
        break;
      }
    }

    // If at max progress, use the last stage
    if (progress >= WEATHER_STAGES[WEATHER_STAGES.length - 1].minProgress) {
      return WEATHER_STAGES[WEATHER_STAGES.length - 1];
    }

    // Calculate interpolation factor within this stage
    const stageRange = nextStage.minProgress - currentStage.minProgress;
    const stageProgress = stageRange > 0 ? (progress - currentStage.minProgress) / stageRange : 0;
    const t = Math.max(0, Math.min(1, stageProgress));

    // Interpolate all values
    return {
      minProgress: progress,
      maxProgress: progress,
      rainRate: this._lerp(currentStage.rainRate, nextStage.rainRate, t),
      skyboxIntensity: this._lerp(currentStage.skyboxIntensity, nextStage.skyboxIntensity, t),
      ambientLightIntensity: this._lerp(currentStage.ambientLightIntensity, nextStage.ambientLightIntensity, t),
      directionalLightIntensity: this._lerp(currentStage.directionalLightIntensity, nextStage.directionalLightIntensity, t),
      fogNear: this._lerp(currentStage.fogNear, nextStage.fogNear, t),
      fogFar: this._lerp(currentStage.fogFar, nextStage.fogFar, t),
      fogColor: {
        r: Math.round(this._lerp(currentStage.fogColor.r, nextStage.fogColor.r, t)),
        g: Math.round(this._lerp(currentStage.fogColor.g, nextStage.fogColor.g, t)),
        b: Math.round(this._lerp(currentStage.fogColor.b, nextStage.fogColor.b, t)),
      },
      rainVolume: this._lerp(currentStage.rainVolume, nextStage.rainVolume, t),
    };
  }

  /**
   * Update all weather effects based on current progress
   */
  private _updateWeatherEffects(): void {
    if (!this._isActive) return;

    const weather = this._getInterpolatedWeather();

    // Update rain particle rate
    if (this._rainEmitter && this._rainEmitter.isSpawned) {
      this._rainEmitter.setRate(weather.rainRate);

      // Adjust position variance based on rain intensity
      const spreadFactor = 1 + (weather.rainRate / 200);
      this._rainEmitter.setPositionVariance({
        x: 80 * spreadFactor,
        y: 10,
        z: 80 * spreadFactor,
      });
    }

    // Update world lighting
    this._world.setSkyboxIntensity(weather.skyboxIntensity);
    this._world.setAmbientLightIntensity(weather.ambientLightIntensity);
    this._world.setDirectionalLightIntensity(weather.directionalLightIntensity);

    // Update fog
    this._world.setFogNear(weather.fogNear);
    this._world.setFogFar(weather.fogFar);
    this._world.setFogColor(weather.fogColor);

    // Update rain audio volume based on weather intensity
    if (this._rainAudio) {
      this._rainAudio.setVolume(weather.rainVolume * 0.5); // Scale to max 0.5 volume
    }
  }

  /**
   * Linear interpolation helper
   */
  private _lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Get current weather intensity (0-1) for UI display
   */
  public get weatherIntensity(): number {
    return this._currentProgress;
  }

  /**
   * Check if weather is active
   */
  public get isActive(): boolean {
    return this._isActive;
  }
}
