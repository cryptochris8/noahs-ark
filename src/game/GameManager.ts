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
import ArkGoalZone from './entities/ArkGoalZone';
import AnimalEntity from './entities/AnimalEntity';

export enum GameState {
  WAITING = 'waiting',
  COUNTDOWN = 'countdown',
  PLAYING = 'playing',
  VICTORY = 'victory',
  DEFEAT = 'defeat',
}

// Ark position - should match the map
const ARK_POSITION: Vector3Like = { x: 0, y: 35, z: 20 };
// Ark model configuration
const ARK_MODEL_URI = 'models/ark.gltf'; // Place your ark model at assets/models/ark.gltf
const ARK_MODEL_SCALE = 2; // Adjust scale as needed
const ARK_MODEL_OFFSET: Vector3Like = { x: 0, y: -2, z: 0 }; // Offset from goal zone position
// Spawn slightly above the player spawn platform (Y=10 in map) so gravity brings them down safely
const PLAYER_SPAWN_POSITION: Vector3Like = { x: 0, y: 12, z: 0 };
const COUNTDOWN_SECONDS = 5;

export default class GameManager {
  private static _instance: GameManager;

  private _world: World | null = null;
  private _animalManager: AnimalManager | null = null;
  private _floodManager: FloodManager | null = null;
  private _arkGoalZone: ArkGoalZone | null = null;
  private _state: GameState = GameState.WAITING;
  private _difficulty: DifficultyKey = 'normal';
  private _requiredPairs: number = 0;
  private _gameStartTime: number = 0;
  private _countdownInterval: NodeJS.Timeout | null = null;
  private _uiUpdateInterval: NodeJS.Timeout | null = null;

  private constructor() {}

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
    this._arkGoalZone = new ArkGoalZone(world, {
      position: ARK_POSITION,
      modelUri: ARK_MODEL_URI,
      modelScale: ARK_MODEL_SCALE,
      modelOffset: ARK_MODEL_OFFSET,
    });

    // Set up flood callbacks
    this._floodManager.onFloodRise((height, max) => {
      this._broadcastUIUpdate();

      // Check if flood reached the ark (defeat condition)
      if (height >= ARK_POSITION.y - 2) {
        this._handleDefeat();
      }
    });

    this._floodManager.onFloodWarning(() => {
      this._broadcastMessage('The flood is rising!', '00AAFF');
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

    // Play background music
    new Audio({
      uri: 'audio/music/hytopia-main-theme.mp3',
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

    this._broadcastMessage(`Game starting in ${countdown}...`, 'FFFF00');

    this._countdownInterval = setInterval(() => {
      countdown--;

      if (countdown > 0) {
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

    // Spawn animals
    this._animalManager.spawnInitialAnimals();

    // Activate ark goal zone
    this._arkGoalZone.activate();

    // Start the flood
    if (GameConfig.instance.flood.enabled) {
      this._floodManager.start();
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

    // Release animals from player
    animal1.stopFollowing();
    animal2.stopFollowing();

    // Remove and potentially respawn animals
    this._animalManager.removeAnimal(animal1);
    this._animalManager.removeAnimal(animal2);
    this._animalManager.respawnAnimalsIfNeeded(animalType);

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
  private _handleVictory(): void {
    if (this._state !== GameState.PLAYING) return;

    this._state = GameState.VICTORY;
    this._stopGame();

    const timeSeconds = this.elapsedTimeSeconds;
    const minutes = Math.floor(timeSeconds / 60);
    const seconds = timeSeconds % 60;

    this._broadcastMessage('VICTORY! All pairs have been saved!', '00FF00');
    this._broadcastMessage(`Time: ${minutes}:${seconds.toString().padStart(2, '0')}`, '00FF00');

    // Send victory UI update
    this._broadcastUIData({
      type: 'game-over',
      victory: true,
      time: timeSeconds,
      pairsCollected: this.pairsCollected,
    });
  }

  /**
   * Handle defeat condition
   */
  private _handleDefeat(): void {
    if (this._state !== GameState.PLAYING) return;

    this._state = GameState.DEFEAT;
    this._stopGame();

    this._broadcastMessage('DEFEAT! The flood has reached the Ark!', 'FF0000');
    this._broadcastMessage(`Pairs saved: ${this.pairsCollected}/${this._requiredPairs}`, 'FFAA00');

    // Send defeat UI update
    this._broadcastUIData({
      type: 'game-over',
      victory: false,
      pairsCollected: this.pairsCollected,
      requiredPairs: this._requiredPairs,
    });
  }

  /**
   * Stop the game (cleanup)
   */
  private _stopGame(): void {
    if (this._floodManager) {
      this._floodManager.stop();
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

    if (this._animalManager) {
      this._animalManager.despawnAllAnimals();
      this._animalManager.resetPairsCollected();
    }

    if (this._floodManager) {
      this._floodManager.reset();
    }

    this._gameStartTime = 0;
    this._state = GameState.WAITING;

    this._broadcastUIData({ type: 'reset' });
  }

  /**
   * Handle player joining the game
   */
  public onPlayerJoin(player: Player, playerEntity: PlayerEntity): void {
    // Load UI for this player
    player.ui.load('ui/index.html');

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
        this._world?.chatManager.sendPlayerMessage(player, `${animal.animalType} stopped following you.`, 'AAAAAA');
        return true;
      }
      return false; // Already following another player
    }

    // Try to follow
    const success = this._animalManager.tryFollowPlayer(animal, player);

    if (success) {
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
    if (!this._animalManager || !this._arkGoalZone || this._state !== GameState.PLAYING) return;

    const followingAnimals = this._animalManager.getAnimalsFollowingPlayer(player);

    if (followingAnimals.length === 0) {
      this._world?.chatManager.sendPlayerMessage(player, 'You have no animals to deliver!', 'FF5555');
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
   * Send UI update to a specific player
   */
  private _sendUIUpdate(player: Player): void {
    player.ui.sendData({
      type: 'game-state',
      state: this._state,
      pairsCollected: this.pairsCollected,
      requiredPairs: this._requiredPairs,
      floodProgress: this._floodManager?.progress ?? 0,
      floodHeight: this._floodManager?.currentHeight ?? 0,
      elapsedTime: this.elapsedTimeSeconds,
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
