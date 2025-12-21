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

// Weather configuration - BIBLICAL FLOOD intensity rain!
const WEATHER_STAGES: WeatherStage[] = [
  {
    // Stage 0: Rain begins (0-10%)
    minProgress: 0,
    maxProgress: 0.1,
    rainRate: 2500, // 5x - visible from start
    skyboxIntensity: 0.95,
    ambientLightIntensity: 0.95,
    directionalLightIntensity: 2.8,
    fogNear: 450,
    fogFar: 550,
    fogColor: { r: 200, g: 220, b: 255 },
    rainVolume: 0.25,
  },
  {
    // Stage 1: Steady rain (10-30%)
    minProgress: 0.1,
    maxProgress: 0.3,
    rainRate: 4000,
    skyboxIntensity: 0.85,
    ambientLightIntensity: 0.9,
    directionalLightIntensity: 2.5,
    fogNear: 400,
    fogFar: 500,
    fogColor: { r: 180, g: 200, b: 230 },
    rainVolume: 0.35,
  },
  {
    // Stage 2: Heavy rain (30-50%)
    minProgress: 0.3,
    maxProgress: 0.5,
    rainRate: 6000,
    skyboxIntensity: 0.7,
    ambientLightIntensity: 0.75,
    directionalLightIntensity: 2.0,
    fogNear: 300,
    fogFar: 400,
    fogColor: { r: 150, g: 170, b: 200 },
    rainVolume: 0.5,
  },
  {
    // Stage 3: Downpour (50-70%)
    minProgress: 0.5,
    maxProgress: 0.7,
    rainRate: 8000,
    skyboxIntensity: 0.5,
    ambientLightIntensity: 0.6,
    directionalLightIntensity: 1.5,
    fogNear: 200,
    fogFar: 350,
    fogColor: { r: 120, g: 140, b: 180 },
    rainVolume: 0.7,
  },
  {
    // Stage 4: Deluge (70-85%)
    minProgress: 0.7,
    maxProgress: 0.85,
    rainRate: 10000,
    skyboxIntensity: 0.35,
    ambientLightIntensity: 0.45,
    directionalLightIntensity: 1.0,
    fogNear: 100,
    fogFar: 250,
    fogColor: { r: 100, g: 120, b: 160 },
    rainVolume: 0.85,
  },
  {
    // Stage 5: BIBLICAL FLOOD (85-100%)
    minProgress: 0.85,
    maxProgress: 1.0,
    rainRate: 12500,
    skyboxIntensity: 0.2,
    ambientLightIntensity: 0.3,
    directionalLightIntensity: 0.5,
    fogNear: 50,
    fogFar: 150,
    fogColor: { r: 80, g: 100, b: 140 },
    rainVolume: 1.0,
  },
];

// Use built-in smoke particle texture (works reliably)
// Can be replaced with custom 'particles/raindrop.png' if placed in assets/particles/
const RAIN_TEXTURE_URI = 'particles/smoke.png';

// Rain emitter positions - PERFORMANCE: Reduced from 9 to 5 emitters (44% reduction)
const RAIN_EMITTER_POSITIONS = [
  { x: 0, z: 0 },      // Center
  { x: -35, z: -35 },  // SW
  { x: 35, z: -35 },   // SE
  { x: -35, z: 35 },   // NW
  { x: 35, z: 35 },    // NE
  // Removed 4 cardinal direction emitters for better performance
];

export default class WeatherManager {
  private _world: World;
  private _rainEmitters: ParticleEmitter[] = [];
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

    // Create MULTIPLE rain emitters across the map for dense coverage
    // PERFORMANCE: Reduced emitter count (9→5) and particle budget per emitter (2000→1200)
    for (const pos of RAIN_EMITTER_POSITIONS) {
      const emitter = new ParticleEmitter({
        textureUri: RAIN_TEXTURE_URI,
        position: { x: pos.x, y: 50, z: pos.z },
        positionVariance: { x: 35, y: 5, z: 35 }, // Larger area per emitter
        velocity: { x: -1, y: -8, z: 0 },
        velocityVariance: { x: 1.5, y: 2, z: 1.5 },
        gravity: { x: 0, y: -12, z: 0 },
        lifetime: 4,
        lifetimeVariance: 1,
        rate: 400, // Increased per-emitter rate (5 emitters × 400 = 2000 total base)
        rateVariance: 50,
        maxParticles: 1200, // REDUCED from 2000 (5 emitters × 1200 = 6000 total max)
        sizeStart: 0.25, // Visible drops
        sizeEnd: 0.15,
        sizeStartVariance: 0.08,
        opacityStart: 0.85,
        opacityStartVariance: 0.1,
        opacityEnd: 0.3,
        colorStart: { r: 180, g: 200, b: 255 },
        colorEnd: { r: 150, g: 180, b: 230 },
        transparent: true,
      });
      this._rainEmitters.push(emitter);
    }

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

    // Spawn all rain emitters
    for (const emitter of this._rainEmitters) {
      emitter.spawn(this._world);
    }

    // Start rain audio
    if (this._rainAudio) {
      this._rainAudio.play(this._world);
    }

    // Start update loop for smooth transitions - PERFORMANCE: Reduced to 1 second
    this._updateInterval = setInterval(() => this._updateWeatherEffects(), 1000);

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

    // Despawn all rain emitters
    for (const emitter of this._rainEmitters) {
      if (emitter.isSpawned) {
        emitter.despawn();
      }
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

    // Update rain particle rate on ALL emitters
    // Scale the rate based on weather stage (base rate per emitter scales with flood)
    const ratePerEmitter = Math.round(weather.rainRate / RAIN_EMITTER_POSITIONS.length);

    for (const emitter of this._rainEmitters) {
      if (emitter.isSpawned) {
        emitter.setRate(ratePerEmitter);
      }
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
