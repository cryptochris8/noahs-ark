/**
 * GameManager - Main game state and logic coordinator for Noah's Ark Rush
 */

import {
  Audio,
  PlayerEntity,
  GameServer,
  type World,
  type Player,
  type Vector3Like,
} from 'hytopia';

import GameConfig, { type DifficultyKey } from './GameConfig';
import AnimalManager from './managers/AnimalManager';
import FloodManager from './managers/FloodManager';
import WeatherManager from './managers/WeatherManager';
import PowerUpManager from './managers/PowerUpManager';
import ScoreManager from './managers/ScoreManager';
import LeaderboardManager, { type LeaderboardEntry } from './managers/LeaderboardManager';
import ArkGoalZone from './entities/ArkGoalZone';
import AnimalEntity from './entities/AnimalEntity';

export enum GameState {
  WAITING = 'waiting',
  COUNTDOWN = 'countdown',
  PLAYING = 'playing',
  VICTORY = 'victory',
  DEFEAT = 'defeat',
}

// Map configuration based on environment variable
const MAP_NAME = process.env.MAP_NAME || 'mount-ararat';

// Map-specific configurations
const MAP_CONFIGS: Record<string, {
  arkPosition: Vector3Like;      // Where the Ark model sits
  goalZonePosition: Vector3Like; // Where players deliver animals (drop-off platform)
  playerSpawn: Vector3Like;
  arkModelOffset: Vector3Like;
  arkModelRotationY: number; // Rotation in degrees around Y axis
}> = {
  'plains-of-shinar': {
    arkPosition: { x: 0, y: 34, z: 60 },       // Northern plateau (Ark model)
    goalZonePosition: { x: 0, y: 29, z: 48 },  // Drop-off platform below the Ark
    playerSpawn: { x: 0, y: 12, z: -50 },      // Southern flood plain (near start)
    arkModelOffset: { x: 0, y: 5, z: -5 },     // Raise 5 blocks, move forward 5 blocks toward water
    arkModelRotationY: 135,                     // Rotate 135 degrees to align with land
  },
  'mount-ararat': {
    arkPosition: { x: 0, y: 34, z: 0 },        // CENTER of dual-sided mountain
    goalZonePosition: { x: 0, y: 32, z: 0 },   // Drop-off at center Ark plateau
    playerSpawn: { x: 0, y: 12, z: -50 },      // Southern Tier 1 area (solo mode) - Y=12 above terrain
    arkModelOffset: { x: 0, y: 3, z: 0 },      // Slight elevation for model
    arkModelRotationY: 135,                     // Angled orientation
  },
  'original': {
    arkPosition: { x: 0, y: 35, z: 20 },
    goalZonePosition: { x: 0, y: 35, z: 20 },  // Same as ark position for original map
    playerSpawn: { x: 0, y: 38, z: 15 },
    arkModelOffset: { x: 0, y: -2, z: 0 },
    arkModelRotationY: 90,
  },
};

const currentConfig = MAP_CONFIGS[MAP_NAME] || MAP_CONFIGS['plains-of-shinar'];

// Ark position - where the model sits
const ARK_POSITION: Vector3Like = currentConfig.arkPosition;
// Goal zone position - where players deliver animals (drop-off platform)
const GOAL_ZONE_POSITION: Vector3Like = currentConfig.goalZonePosition;
// Ark model configuration
const ARK_MODEL_URI = 'models/structures/noahs-ark.glb';
const ARK_MODEL_SCALE = 0.5; // 50% of original size
const ARK_MODEL_OFFSET: Vector3Like = currentConfig.arkModelOffset;
const ARK_MODEL_ROTATION_Y: number = currentConfig.arkModelRotationY;
// Spawn position
const PLAYER_SPAWN_POSITION: Vector3Like = currentConfig.playerSpawn;
const COUNTDOWN_SECONDS = 5;

export default class GameManager {
  private static _instance: GameManager;

  private _world: World | null = null;
  private _animalManager: AnimalManager | null = null;
  private _floodManager: FloodManager | null = null;
  private _weatherManager: WeatherManager | null = null;
  private _powerUpManager: PowerUpManager | null = null;
  private _scoreManager: ScoreManager | null = null;
  private _leaderboardManager: LeaderboardManager | null = null;
  private _arkGoalZone: ArkGoalZone | null = null;
  private _state: GameState = GameState.WAITING;
  private _difficulty: DifficultyKey = 'normal';
  private _requiredPairs: number = 0;
  private _gameStartTime: number = 0;
  private _countdownInterval: NodeJS.Timeout | null = null;
  private _uiUpdateInterval: NodeJS.Timeout | null = null;
  private _restartTimeout: NodeJS.Timeout | null = null;
  private _restartCountdownInterval: NodeJS.Timeout | null = null;

  // Sound effects
  private _victorySound: Audio;
  private _defeatSound: Audio;
  private _floodWarningSound: Audio;
  private _countdownSound: Audio;
  private _gameStartSound: Audio;
  private _animalPickupSound: Audio;
  private _animalReleaseSound: Audio;
  private _powerUpSound: Audio;
  private _animalSounds: Map<string, Audio> = new Map();

  private constructor() {
    // Initialize sound effects
    this._victorySound = new Audio({
      uri: 'audio/sfx/victory.mp3',
      loop: false,
      volume: 1.0,
    });
    this._defeatSound = new Audio({
      uri: 'audio/sfx/game-over.mp3',
      loop: false,
      volume: 1.0,
    });
    this._floodWarningSound = new Audio({
      uri: 'audio/sfx/flood-warning.mp3',
      loop: false,
      volume: 0.8,
    });
    this._countdownSound = new Audio({
      uri: 'audio/sfx/countdown.mp3',
      loop: false,
      volume: 0.5,
    });
    this._gameStartSound = new Audio({
      uri: 'audio/sfx/game-start.mp3',
      loop: false,
      volume: 0.8,
    });
    this._animalPickupSound = new Audio({
      uri: 'audio/sfx/animal-pickup.mp3',
      loop: false,
      volume: 0.6,
    });
    this._animalReleaseSound = new Audio({
      uri: 'audio/sfx/animal-release.mp3',
      loop: false,
      volume: 0.4,
    });
    this._powerUpSound = new Audio({
      uri: 'audio/sfx/power-up.mp3',
      loop: false,
      volume: 0.8,
    });

    // Initialize animal-specific sounds
    // Each animal type can have its own sound file in assets/audio/sfx/animals/
    const animalTypes = [
      'sheep', 'cow', 'pig', 'chicken', 'horse', 'donkey', 'rabbit',
      'fox', 'wolf', 'bear', 'raccoon', 'beaver', 'ocelot', 'capybara',
      'turtle', 'frog', 'lizard', 'penguin', 'flamingo', 'peacock',
      'bat', 'crab', 'dog'
    ];
    for (const animalType of animalTypes) {
      this._animalSounds.set(animalType, new Audio({
        uri: `audio/sfx/animals/${animalType}.mp3`,
        loop: false,
        volume: 0.7,
      }));
    }
  }

  public static get instance(): GameManager {
    if (!GameManager._instance) {
      GameManager._instance = new GameManager();
    }
    return GameManager._instance;
  }

  public get world(): World | null {
    return this._world;
  }

  public get state(): GameState {
    return this._state;
  }

  public get animalManager(): AnimalManager | null {
    return this._animalManager;
  }

  public get floodManager(): FloodManager | null {
    return this._floodManager;
  }

  public get weatherManager(): WeatherManager | null {
    return this._weatherManager;
  }

  public get powerUpManager(): PowerUpManager | null {
    return this._powerUpManager;
  }

  public get scoreManager(): ScoreManager | null {
    return this._scoreManager;
  }

  public get leaderboardManager(): LeaderboardManager | null {
    return this._leaderboardManager;
  }

  public get pairsCollected(): number {
    return this._animalManager?.getTotalPairsCollected() ?? 0;
  }

  public get requiredPairs(): number {
    return this._requiredPairs;
  }

  public get elapsedTimeSeconds(): number {
    if (this._gameStartTime === 0) return 0;
    return Math.floor((Date.now() - this._gameStartTime) / 1000);
  }

  /**
   * Initialize the game manager with a world
   */
  public setup(world: World, difficulty: DifficultyKey = 'normal'): void {
    this._world = world;
    this._difficulty = difficulty;

    const config = GameConfig.instance;
    const difficultyConfig = config.getDifficultyConfig(difficulty);
    this._requiredPairs = difficultyConfig.required_pairs_total;

    // Create managers
    this._animalManager = new AnimalManager(world);
    this._floodManager = new FloodManager(world, difficulty);
    this._weatherManager = new WeatherManager(world);
    this._powerUpManager = new PowerUpManager(world);
    this._scoreManager = new ScoreManager(difficulty);
    this._leaderboardManager = new LeaderboardManager();

    // Load leaderboard data
    this._leaderboardManager.load();

    // Connect managers for power-up effects
    this._powerUpManager.setFloodManager(this._floodManager);
    this._powerUpManager.setAnimalManager(this._animalManager);

    // Set up flood freeze check for power-up
    this._floodManager.setFloodFrozenCheck(() => {
      return this._powerUpManager?.isFloodFrozen() ?? false;
    });
    this._arkGoalZone = new ArkGoalZone(world, {
      position: GOAL_ZONE_POSITION,  // Drop-off platform position
      arkModelPosition: ARK_POSITION,  // Actual Ark model position
      modelUri: ARK_MODEL_URI,
      modelScale: ARK_MODEL_SCALE,
      modelOffset: ARK_MODEL_OFFSET,
      modelRotationY: ARK_MODEL_ROTATION_Y,
    });

    // Set up flood callbacks
    this._floodManager.onFloodRise((height, max) => {
      this._broadcastUIUpdate();

      // Notify animals to flee from the rising water
      if (this._animalManager) {
        this._animalManager.updateFloodLevel(height);
      }

      // Update weather based on flood progress
      if (this._weatherManager) {
        this._weatherManager.setFloodProgress(this._floodManager?.progress ?? 0);
      }

      // Check if flood reached the ark (defeat condition)
      if (height >= ARK_POSITION.y - 2) {
        this._handleDefeat();
      }
    });

    this._floodManager.onFloodWarning(() => {
      this._floodWarningSound.play(world, true);
      this._broadcastMessage('The flood is rising!', '00AAFF');
    });

    this._floodManager.onPlayerDrowned((player) => {
      this._handlePlayerDrowned(player);
    });

    // Set up ark goal zone callbacks
    this._arkGoalZone.onPairCompleted((animalType, animal1, animal2) => {
      this._handlePairCompleted(animalType, animal1, animal2);
    });

    this._arkGoalZone.onWrongPair((animal) => {
      if (animal.followingPlayer) {
        this._world?.chatManager.sendPlayerMessage(
          animal.followingPlayer,
          'You need two of the same animal!',
          'FF5555'
        );
      }
    });

    // Set up power-up callbacks
    this._powerUpManager.onPowerUpCollected((player, type, config) => {
      // Play power-up sound
      this._powerUpSound.play(world, true);

      // Award points for collecting power-up
      if (this._scoreManager && GameConfig.instance.scoring.enabled) {
        const points = this._scoreManager.awardPowerUpCollection(player);
        this._world?.chatManager.sendPlayerMessage(player, `+${points} points!`, '00FFAA');
      }
      // UI update will happen automatically through broadcastUIUpdate
    });

    this._powerUpManager.onPowerUpExpired((player, type) => {
      const typeConfig = GameConfig.instance.powerups.types[type];
      if (typeConfig) {
        this._world?.chatManager.sendPlayerMessage(
          player,
          `${typeConfig.display_name} expired!`,
          'AAAAAA'
        );
      }
    });

    // Play background music
    new Audio({
      uri: 'audio/music/lumine wave - Everlasting Hope - Instrumental version.mp3',
      loop: true,
      volume: 0.1,
    }).play(world);

    this._state = GameState.WAITING;
  }

  /**
   * Start the game countdown
   */
  public startCountdown(): void {
    if (this._state !== GameState.WAITING) return;

    this._state = GameState.COUNTDOWN;
    let countdown = COUNTDOWN_SECONDS;

    // Play countdown sound
    if (this._world) {
      this._countdownSound.play(this._world, true);
    }
    this._broadcastMessage(`Game starting in ${countdown}...`, 'FFFF00');

    this._countdownInterval = setInterval(() => {
      countdown--;

      if (countdown > 0) {
        // Play countdown beep
        if (this._world) {
          this._countdownSound.play(this._world, true);
        }
        this._broadcastMessage(`${countdown}...`, 'FFFF00');
      } else {
        if (this._countdownInterval) {
          clearInterval(this._countdownInterval);
          this._countdownInterval = null;
        }
        this._startGame();
      }
    }, 1000);
  }

  /**
   * Actually start the game
   */
  private _startGame(): void {
    if (!this._world || !this._animalManager || !this._floodManager || !this._arkGoalZone) return;

    this._state = GameState.PLAYING;
    this._gameStartTime = Date.now();

    // Play game start sound
    this._gameStartSound.play(this._world, true);

    // Spawn animals
    this._animalManager.spawnInitialAnimals();

    // Activate ark goal zone
    this._arkGoalZone.activate();

    // Start the flood
    if (GameConfig.instance.flood.enabled) {
      this._floodManager.start();
    }

    // Start weather system (rain and sky darkening)
    if (this._weatherManager) {
      this._weatherManager.start();
    }

    // Start power-up system
    if (this._powerUpManager && GameConfig.instance.powerups.enabled) {
      this._powerUpManager.start();
    }

    // Start scoring system
    if (this._scoreManager && GameConfig.instance.scoring.enabled) {
      this._scoreManager.startGame(600); // 10 minute max game time for time bonus calculation
    }

    // Start UI update loop
    this._uiUpdateInterval = setInterval(() => this._broadcastUIUpdate(), 500);

    // Broadcast game start
    this._broadcastMessage('Find pairs of animals and bring them to the Ark!', '00FF00');
    this._broadcastUIUpdate();
  }

  /**
   * Handle when a player delivers a valid pair
   */
  private _handlePairCompleted(animalType: string, animal1: AnimalEntity, animal2: AnimalEntity): void {
    if (!this._animalManager || !this._world) return;

    // Record the pair
    this._animalManager.recordPairCollected(animalType);

    // Get the display name
    const animalConfig = GameConfig.instance.getAnimalTypeById(animalType);
    const displayName = animalConfig?.display_name ?? animalType;

    // Get the player who delivered (before releasing)
    const deliveryPlayer = animal1.followingPlayer || animal2.followingPlayer;

    // Release animals from player
    animal1.stopFollowing();
    animal2.stopFollowing();

    // Remove and potentially respawn animals
    this._animalManager.removeAnimal(animal1);
    this._animalManager.removeAnimal(animal2);
    this._animalManager.respawnAnimalsIfNeeded(animalType);

    // Award points for pair delivery
    if (deliveryPlayer && this._scoreManager && GameConfig.instance.scoring.enabled) {
      const points = this._scoreManager.awardPairDelivery(deliveryPlayer);
      this._world?.chatManager.sendPlayerMessage(deliveryPlayer, `+${points} points for ${displayName} pair!`, 'FFD700');
    }

    // Broadcast success
    this._broadcastMessage(`${displayName} pair saved!`, 'FFD700');
    this._broadcastUIUpdate();

    // Check for victory
    if (this.pairsCollected >= this._requiredPairs) {
      this._handleVictory();
    }
  }

  /**
   * Handle victory condition
   */
  private async _handleVictory(): Promise<void> {
    if (this._state !== GameState.PLAYING) return;

    this._state = GameState.VICTORY;
    this._stopGame();

    const timeSeconds = this.elapsedTimeSeconds;
    const minutes = Math.floor(timeSeconds / 60);
    const seconds = timeSeconds % 60;

    // Play victory sound
    if (this._world) {
      this._victorySound.play(this._world, true);
    }

    // Award completion bonuses and submit to leaderboard
    const playerScores: Array<{ playerName: string; score: number; rank: number | null }> = [];
    if (this._world && this._scoreManager && GameConfig.instance.scoring.enabled) {
      const players = GameServer.instance.playerManager.getConnectedPlayersByWorld(this._world);

      for (const player of players) {
        // Award completion bonus
        const bonusPoints = this._scoreManager.awardCompletionBonus(player, timeSeconds);
        const totalScore = this._scoreManager.getPlayerScore(player.id);

        this._world.chatManager.sendPlayerMessage(
          player,
          `Victory Bonus: +${bonusPoints} | Final Score: ${totalScore}`,
          '00FF00'
        );

        // Submit to leaderboard
        if (this._leaderboardManager && GameConfig.instance.leaderboard.enabled) {
          const rank = await this._leaderboardManager.submitScore(
            player.username,
            totalScore,
            this.pairsCollected,
            timeSeconds,
            this._difficulty
          );

          playerScores.push({
            playerName: player.username,
            score: totalScore,
            rank,
          });

          if (rank !== null) {
            this._world.chatManager.sendPlayerMessage(
              player,
              `You made the leaderboard! Rank #${rank}`,
              'FFD700'
            );
          }
        }
      }
    }

    this._broadcastMessage('VICTORY! All pairs have been saved!', '00FF00');
    this._broadcastMessage(`Time: ${minutes}:${seconds.toString().padStart(2, '0')}`, '00FF00');

    // Get leaderboard for UI
    const leaderboard = await this._leaderboardManager?.getTopScores(10) ?? [];

    // Send victory UI update with scores
    this._broadcastUIData({
      type: 'game-over',
      victory: true,
      time: timeSeconds,
      pairsCollected: this.pairsCollected,
      playerScores,
      leaderboard,
    });

    // Auto-restart after 25 seconds
    this._scheduleAutoRestart(25);
  }

  /**
   * Handle defeat condition
   * @param reason - The reason for defeat ('drowned' or 'flood')
   */
  private async _handleDefeat(reason: 'drowned' | 'flood' = 'flood'): Promise<void> {
    if (this._state !== GameState.PLAYING) return;

    this._state = GameState.DEFEAT;
    this._stopGame();

    const timeSeconds = this.elapsedTimeSeconds;

    // Play defeat sound
    if (this._world) {
      this._defeatSound.play(this._world, true);
    }

    // Gather final scores (no completion bonus on defeat)
    const playerScores: Array<{ playerName: string; score: number; rank: number | null }> = [];
    if (this._world && this._scoreManager && GameConfig.instance.scoring.enabled) {
      const players = GameServer.instance.playerManager.getConnectedPlayersByWorld(this._world);

      for (const player of players) {
        const totalScore = this._scoreManager.getPlayerScore(player.id);

        this._world.chatManager.sendPlayerMessage(
          player,
          `Final Score: ${totalScore}`,
          'FFAA00'
        );

        // Still submit to leaderboard (they earned points during gameplay)
        if (this._leaderboardManager && GameConfig.instance.leaderboard.enabled && totalScore > 0) {
          const rank = await this._leaderboardManager.submitScore(
            player.username,
            totalScore,
            this.pairsCollected,
            timeSeconds,
            this._difficulty
          );

          playerScores.push({
            playerName: player.username,
            score: totalScore,
            rank,
          });

          if (rank !== null) {
            this._world.chatManager.sendPlayerMessage(
              player,
              `You made the leaderboard! Rank #${rank}`,
              'FFD700'
            );
          }
        }
      }
    }

    // Show appropriate defeat message based on reason
    const defeatMessage = reason === 'drowned'
      ? 'DEFEAT! You drowned in the flood!'
      : 'DEFEAT! The flood has reached the Ark!';
    this._broadcastMessage(defeatMessage, 'FF0000');
    this._broadcastMessage(`Pairs saved: ${this.pairsCollected}/${this._requiredPairs}`, 'FFAA00');

    // Get leaderboard for UI
    const leaderboard = await this._leaderboardManager?.getTopScores(10) ?? [];

    // Send defeat UI update with scores
    this._broadcastUIData({
      type: 'game-over',
      victory: false,
      defeatReason: reason,
      pairsCollected: this.pairsCollected,
      requiredPairs: this._requiredPairs,
      playerScores,
      leaderboard,
    });

    // Auto-restart after 25 seconds
    this._scheduleAutoRestart(25);
  }

  /**
   * Handle when a player drowns (stamina reaches zero)
   * Drowning now triggers game over - single life design for leaderboard integrity
   */
  private _handlePlayerDrowned(player: Player): void {
    if (!this._world || this._state !== GameState.PLAYING) return;

    // Release any animals following this player
    if (this._animalManager) {
      this._animalManager.releaseAnimalsFromPlayer(player);
    }

    // Notify the player they drowned
    this._world.chatManager.sendPlayerMessage(player, 'You drowned!', 'FF4444');

    // Trigger game over (single life - no respawning)
    this._handleDefeat('drowned');
  }

  /**
   * Schedule an automatic restart after the specified number of seconds
   */
  private _scheduleAutoRestart(seconds: number): void {
    // Clear any existing restart timers
    this._clearRestartTimers();

    let remainingSeconds = seconds;

    // Send initial countdown
    this._broadcastUIData({
      type: 'restart-countdown',
      remainingSeconds,
    });

    // Countdown interval - update UI every second
    this._restartCountdownInterval = setInterval(() => {
      remainingSeconds--;

      if (remainingSeconds > 0) {
        this._broadcastUIData({
          type: 'restart-countdown',
          remainingSeconds,
        });
      } else {
        // Clear the interval when we reach 0
        if (this._restartCountdownInterval) {
          clearInterval(this._restartCountdownInterval);
          this._restartCountdownInterval = null;
        }
      }
    }, 1000);

    // Actual restart timer
    this._restartTimeout = setTimeout(() => {
      this._restartTimeout = null;

      // Clear countdown interval
      if (this._restartCountdownInterval) {
        clearInterval(this._restartCountdownInterval);
        this._restartCountdownInterval = null;
      }

      // Reset and start a new game
      this.reset();
      this.startCountdown();
    }, seconds * 1000);
  }

  /**
   * Clear restart timers
   */
  private _clearRestartTimers(): void {
    if (this._restartTimeout) {
      clearTimeout(this._restartTimeout);
      this._restartTimeout = null;
    }

    if (this._restartCountdownInterval) {
      clearInterval(this._restartCountdownInterval);
      this._restartCountdownInterval = null;
    }
  }

  /**
   * PRESERVED FOR FUTURE USE: Respawn-based drowning handler
   * If we want to re-enable respawning in the future, uncomment this code
   * and call it from _handlePlayerDrowned instead of _handleDefeat()
   *
   * private _handlePlayerDrownedWithRespawn(player: Player): void {
   *   if (!this._world || this._state !== GameState.PLAYING) return;
   *
   *   // Release any animals following this player
   *   if (this._animalManager) {
   *     this._animalManager.releaseAnimalsFromPlayer(player);
   *   }
   *
   *   // Teleport player back to spawn
   *   const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);
   *   playerEntities.forEach(entity => {
   *     entity.setPosition(PLAYER_SPAWN_POSITION);
   *     // Clear velocity so they don't keep moving
   *     entity.setLinearVelocity({ x: 0, y: 0, z: 0 });
   *   });
   *
   *   // Reset swimming state so they can swim again after respawn
   *   if (this._floodManager) {
   *     this._floodManager.resetPlayerSwimmingState(player.id);
   *   }
   *
   *   // Play defeat sound
   *   this._defeatSound.play(this._world);
   *
   *   // Update their UI
   *   this._sendUIUpdate(player);
   * }
   */

  /**
   * Stop the game (cleanup)
   */
  private _stopGame(): void {
    if (this._floodManager) {
      this._floodManager.stop();
    }

    if (this._weatherManager) {
      this._weatherManager.stop();
    }

    if (this._powerUpManager) {
      this._powerUpManager.stop();
    }

    if (this._arkGoalZone) {
      this._arkGoalZone.deactivate();
    }

    if (this._uiUpdateInterval) {
      clearInterval(this._uiUpdateInterval);
      this._uiUpdateInterval = null;
    }
  }

  /**
   * Reset the game for a new round
   */
  public reset(): void {
    this._stopGame();
    this._clearRestartTimers();

    if (this._animalManager) {
      this._animalManager.despawnAllAnimals();
      this._animalManager.resetPairsCollected();
    }

    if (this._floodManager) {
      this._floodManager.reset();
    }

    if (this._weatherManager) {
      this._weatherManager.reset();
    }

    if (this._powerUpManager) {
      this._powerUpManager.reset();
    }

    if (this._scoreManager) {
      this._scoreManager.reset();
    }

    this._gameStartTime = 0;
    this._state = GameState.WAITING;

    this._broadcastUIData({ type: 'reset' });
  }

  /**
   * Change difficulty and restart the game
   */
  public setDifficulty(difficulty: DifficultyKey): void {
    if (!this._world) return;

    // Stop current game
    this._stopGame();

    // Update difficulty
    this._difficulty = difficulty;
    const difficultyConfig = GameConfig.instance.getDifficultyConfig(difficulty);
    this._requiredPairs = difficultyConfig.required_pairs_total;

    // Recreate flood manager with new difficulty
    if (this._floodManager) {
      this._floodManager.reset();
    }
    this._floodManager = new FloodManager(this._world, difficulty);

    // Set up flood callbacks again
    this._floodManager.onFloodRise((height, max) => {
      this._broadcastUIUpdate();
      if (this._animalManager) {
        this._animalManager.updateFloodLevel(height);
      }
      // Update weather based on flood progress
      if (this._weatherManager) {
        this._weatherManager.setFloodProgress(this._floodManager?.progress ?? 0);
      }
      if (height >= ARK_POSITION.y - 2) {
        this._handleDefeat();
      }
    });

    this._floodManager.onFloodWarning(() => {
      this._floodWarningSound.play(this._world!, true);
      this._broadcastMessage('The flood is rising!', '00AAFF');
    });

    this._floodManager.onPlayerDrowned((player) => {
      this._handlePlayerDrowned(player);
    });

    // Reset animals
    if (this._animalManager) {
      this._animalManager.despawnAllAnimals();
      this._animalManager.resetPairsCollected();
    }

    // Reset weather
    if (this._weatherManager) {
      this._weatherManager.reset();
    }

    this._gameStartTime = 0;
    this._state = GameState.WAITING;

    this._broadcastUIData({ type: 'reset' });
  }

  /**
   * Get current difficulty
   */
  public get difficulty(): DifficultyKey {
    return this._difficulty;
  }

  /**
   * Handle player joining the game
   */
  public onPlayerJoin(player: Player, playerEntity: PlayerEntity): void {
    // Load UI for this player
    player.ui.load('ui/index.html');

    // Register player for scoring
    if (this._scoreManager && GameConfig.instance.scoring.enabled) {
      this._scoreManager.registerPlayer(player);
    }

    // Send initial game state
    this._sendUIUpdate(player);

    // Welcome messages
    this._world?.chatManager.sendPlayerMessage(player, `Welcome to ${GameConfig.instance.gameTitle}!`, '00FF00');
    this._world?.chatManager.sendPlayerMessage(player, 'Use WASD to move, Space to jump, Shift to sprint.', 'AAAAAA');
    this._world?.chatManager.sendPlayerMessage(player, 'Press E near an animal to have it follow you.', 'AAAAAA');
    this._world?.chatManager.sendPlayerMessage(player, 'Bring pairs of animals to the Ark at the top of the hill!', 'FFFF00');

    // Auto-start if this is the first player and game is waiting
    if (this._state === GameState.WAITING) {
      this.startCountdown();
    }
  }

  /**
   * Handle player leaving
   */
  public onPlayerLeave(player: Player): void {
    // Release any animals following this player
    if (this._animalManager) {
      this._animalManager.releaseAnimalsFromPlayer(player);
    }

    // Clean up swimming state
    if (this._floodManager) {
      this._floodManager.removePlayerSwimmingState(player.id);
    }

    // Clean up power-up effects
    if (this._powerUpManager) {
      this._powerUpManager.removePlayer(player.id);
    }

    // Clean up score tracking
    if (this._scoreManager) {
      this._scoreManager.removePlayer(player.id);
    }
  }

  /**
   * Handle player interaction with an animal
   */
  public handleAnimalInteraction(player: Player, animal: AnimalEntity): boolean {
    if (!this._animalManager || this._state !== GameState.PLAYING) return false;

    if (animal.isFollowing) {
      if (animal.followingPlayer === player) {
        // Release this animal
        animal.stopFollowing();
        // Play release sound
        if (this._world) {
          this._animalReleaseSound.play(this._world, true);
        }
        this._world?.chatManager.sendPlayerMessage(player, `${animal.animalType} stopped following you.`, 'AAAAAA');
        return true;
      }
      return false; // Already following another player
    }

    // Try to follow
    const success = this._animalManager.tryFollowPlayer(animal, player);

    if (success) {
      // Play animal-specific sound (falls back to generic pickup if unavailable)
      if (this._world) {
        const animalSound = this._animalSounds.get(animal.animalType);
        if (animalSound) {
          animalSound.play(this._world, true);
        } else {
          this._animalPickupSound.play(this._world, true);
        }
      }
      this._world?.chatManager.sendPlayerMessage(player, `${animal.animalType} is now following you!`, '00FF00');
    } else {
      this._world?.chatManager.sendPlayerMessage(player, 'You can only have 2 animals following you!', 'FF5555');
    }

    return success;
  }

  /**
   * Handle player delivering animals at the ark
   */
  public handleArkDelivery(player: Player): void {
    if (!this._animalManager || !this._arkGoalZone || this._state !== GameState.PLAYING || !this._world) return;

    // Check if player is near the ark (within 15 blocks)
    const playerEntities = this._world.entityManager.getPlayerEntitiesByPlayer(player);
    if (playerEntities.length === 0) return;

    const playerPos = playerEntities[0].position;
    const arkPos = this._arkGoalZone.position;
    const dx = playerPos.x - arkPos.x;
    const dy = playerPos.y - arkPos.y;
    const dz = playerPos.z - arkPos.z;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    const ARK_DELIVERY_RANGE = 15; // Must be within 15 blocks of the ark

    if (distanceSquared > ARK_DELIVERY_RANGE * ARK_DELIVERY_RANGE) {
      this._world.chatManager.sendPlayerMessage(player, 'You must be at the Ark to deliver animals!', 'FFAA00');
      return;
    }

    const followingAnimals = this._animalManager.getAnimalsFollowingPlayer(player);

    if (followingAnimals.length === 0) {
      this._world.chatManager.sendPlayerMessage(player, 'You have no animals to deliver!', 'FF5555');
      return;
    }

    // Check for pairs
    this._arkGoalZone.checkPairFromPlayer(followingAnimals);
  }

  /**
   * Broadcast a message to all players
   */
  private _broadcastMessage(message: string, color: string): void {
    this._world?.chatManager.sendBroadcastMessage(message, color);
  }

  /**
   * Get all animal positions for mini-map UI
   */
  private _getAnimalPositionsForUI(): Array<{x: number, z: number, type: string, isFollowing: boolean}> {
    if (!this._animalManager) return [];

    return this._animalManager.animals.map(animal => ({
      x: Math.round(animal.position.x),
      z: Math.round(animal.position.z),
      type: animal.animalType,
      isFollowing: animal.isFollowing
    }));
  }

  /**
   * Get map bounds based on current map
   * For mount-ararat solo mode, only show south side (Z=-60 to Z=+10)
   * The north side is reserved for future PVP mode
   * Map is 120x120 (-60 to +60 on both axes)
   */
  private _getMapBounds(): {minX: number, maxX: number, minZ: number, maxZ: number} {
    const bounds: Record<string, {minX: number, maxX: number, minZ: number, maxZ: number}> = {
      // Solo mode: Only south side visible (Z=-60 to Z=+10, slightly past Ark at Z=0)
      'mount-ararat': { minX: -65, maxX: 65, minZ: -65, maxZ: 10 },
      'plains-of-shinar': { minX: -80, maxX: 80, minZ: -80, maxZ: 80 }
    };
    return bounds[MAP_NAME] || bounds['mount-ararat'];
  }

  /**
   * Get positions of animals matching the player's single following animal
   * Only returns data when player has exactly 1 animal following
   */
  private _getMatchingAnimalPositions(player: Player): Array<{x: number, z: number}> | null {
    if (!this._animalManager) return null;

    const following = this._animalManager.getAnimalsFollowingPlayer(player);

    // Only show arrows when player has exactly 1 animal
    if (following.length !== 1) return null;

    const targetType = following[0].animalType;

    // Find all other animals of the same type that are NOT following anyone
    const matchingAnimals = this._animalManager.animals
      .filter(a => a.animalType === targetType && !a.isFollowing)
      .map(a => ({
        x: Math.round(a.position.x),
        z: Math.round(a.position.z)
      }));

    // Debug logging
    if (matchingAnimals.length > 0) {
      console.log(`[MatchingAnimals] Player following: ${targetType}, found ${matchingAnimals.length} matching:`, matchingAnimals);
    } else {
      console.log(`[MatchingAnimals] Player following: ${targetType}, NO matching animals found!`);
      // Log all animals of this type for debugging
      const allOfType = this._animalManager.animals.filter(a => a.animalType === targetType);
      console.log(`[MatchingAnimals] Total ${targetType} in world: ${allOfType.length}, following status:`,
        allOfType.map(a => ({ pos: { x: Math.round(a.position.x), z: Math.round(a.position.z) }, isFollowing: a.isFollowing }))
      );
    }

    return matchingAnimals;
  }

  /**
   * Send UI update to a specific player
   */
  private _sendUIUpdate(player: Player): void {
    // Get swimming state for this player
    const isSwimming = this._floodManager?.isPlayerSwimming(player.id) ?? false;
    const swimmingStamina = this._floodManager?.getPlayerSwimmingStamina(player.id) ?? 100;

    // Get animals following this player
    const followingAnimals = this._animalManager?.getAnimalsFollowingPlayer(player).map(a => a.animalType) ?? [];

    // Get player position for mini-map
    const playerEntities = this._world?.entityManager.getPlayerEntitiesByPlayer(player);
    const playerPos = playerEntities && playerEntities.length > 0
      ? { x: Math.round(playerEntities[0].position.x), z: Math.round(playerEntities[0].position.z) }
      : { x: 0, z: 0 };

    // Get score data
    const playerScore = this._scoreManager?.getPlayerScore(player.id) ?? 0;

    player.ui.sendData({
      type: 'game-state',
      state: this._state,
      pairsCollected: this.pairsCollected,
      requiredPairs: this._requiredPairs,
      floodProgress: this._floodManager?.progress ?? 0,
      floodHeight: this._floodManager?.currentHeight ?? 0,
      elapsedTime: this.elapsedTimeSeconds,
      isSwimming: isSwimming,
      swimmingStamina: swimmingStamina,
      followingAnimals: followingAnimals,
      // Mini-map and arrow data
      playerPosition: playerPos,
      animalPositions: this._getAnimalPositionsForUI(),
      arkPosition: { x: GOAL_ZONE_POSITION.x, z: GOAL_ZONE_POSITION.z },
      mapBounds: this._getMapBounds(),
      matchingAnimals: this._getMatchingAnimalPositions(player),
      // Power-up data
      activePowerUps: this._powerUpManager?.getActiveEffectsForUI(player.id) ?? [],
      // Score data
      score: playerScore,
    });
  }

  /**
   * Broadcast UI update to all players
   */
  private _broadcastUIUpdate(): void {
    if (!this._world) return;

    const players = GameServer.instance.playerManager.getConnectedPlayersByWorld(this._world);
    players.forEach(player => this._sendUIUpdate(player));
  }

  /**
   * Broadcast UI data to all players
   */
  private _broadcastUIData(data: Record<string, unknown>): void {
    if (!this._world) return;

    const players = GameServer.instance.playerManager.getConnectedPlayersByWorld(this._world);
    players.forEach(player => player.ui.sendData(data));
  }

  /**
   * Get the spawn position for players
   */
  public getPlayerSpawnPosition(): Vector3Like {
    return PLAYER_SPAWN_POSITION;
  }
}
