/**
 * AchievementManager - Handles achievement tracking, unlocking, and persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Player } from 'hytopia';
import achievementsData from '../data/achievements.json';

// Achievement definition from JSON
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'milestone' | 'single_game' | 'animal' | 'score';
  points: number;
  requirement: {
    type: string;
    value: number | boolean | string[];
  };
}

// Player's progress on a single achievement
export interface AchievementProgress {
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  target?: number;
}

// Player's cumulative stats
export interface PlayerStats {
  totalPairsDelivered: number;
  totalGamesPlayed: number;
  totalGamesWon: number;
  totalPowerUpsUsed: number;
}

// Full player achievement data (persisted)
export interface PlayerAchievementData {
  playerId: string;
  playerName: string;
  totalPoints: number;
  unlockedCount: number;
  achievements: Record<string, AchievementProgress>;
  stats: PlayerStats;
  lastUpdated: string;
}

// Current game session tracking
export interface GameSessionStats {
  pairsDelivered: number;
  animalsCollected: string[];
  powerUpsUsed: string[];
  drownCount: number;
  startTime: number;
  difficulty: string;
  floodProgress: number;
  score: number;
}

// Callback type for achievement unlocks
export type AchievementUnlockCallback = (
  playerId: string,
  playerName: string,
  achievement: AchievementDefinition
) => void;

export default class AchievementManager {
  private static _instance: AchievementManager;

  private _definitions: AchievementDefinition[];
  private _playerData: Map<string, PlayerAchievementData> = new Map();
  private _sessionStats: Map<string, GameSessionStats> = new Map();
  private _dataDir: string;

  // Callback for when achievement is unlocked
  private _onUnlockCallback: AchievementUnlockCallback | null = null;

  private constructor() {
    this._definitions = achievementsData.achievements as AchievementDefinition[];
    this._dataDir = path.join(process.cwd(), 'data', 'achievements');
    this._ensureDataDir();
  }

  /**
   * Get singleton instance
   */
  public static get instance(): AchievementManager {
    if (!AchievementManager._instance) {
      AchievementManager._instance = new AchievementManager();
    }
    return AchievementManager._instance;
  }

  /**
   * Set callback for achievement unlocks
   */
  public onAchievementUnlock(callback: AchievementUnlockCallback): void {
    this._onUnlockCallback = callback;
  }

  /**
   * Register a player and load their achievement data
   */
  public async registerPlayer(player: Player): Promise<void> {
    const playerId = player.id;
    const playerName = player.username;

    // Load existing data or create new
    const data = await this._loadPlayerData(playerId, playerName);
    this._playerData.set(playerId, data);

    // Initialize session stats
    this._sessionStats.set(playerId, this._createEmptySessionStats());

    console.log(`[AchievementManager] Registered player ${playerName} with ${data.unlockedCount} achievements`);
  }

  /**
   * Remove a player and save their data
   */
  public async removePlayer(playerId: string): Promise<void> {
    const data = this._playerData.get(playerId);
    if (data) {
      await this._savePlayerData(playerId, data);
      this._playerData.delete(playerId);
    }
    this._sessionStats.delete(playerId);
  }

  /**
   * Start a new game session for a player
   */
  public startGameSession(playerId: string, difficulty: string): void {
    this._sessionStats.set(playerId, {
      pairsDelivered: 0,
      animalsCollected: [],
      powerUpsUsed: [],
      drownCount: 0,
      startTime: Date.now(),
      difficulty,
      floodProgress: 0,
      score: 0,
    });
  }

  /**
   * Called when a pair is delivered
   */
  public onPairDelivered(playerId: string, animalType: string): void {
    const session = this._sessionStats.get(playerId);
    const data = this._playerData.get(playerId);
    if (!session || !data) return;

    // Update session stats
    session.pairsDelivered++;
    if (!session.animalsCollected.includes(animalType)) {
      session.animalsCollected.push(animalType);
    }

    // Update cumulative stats
    data.stats.totalPairsDelivered++;

    // Check milestone achievements
    this._checkMilestoneAchievements(playerId);
  }

  /**
   * Called when a power-up is used
   */
  public onPowerUpUsed(playerId: string, powerUpType: string): void {
    const session = this._sessionStats.get(playerId);
    const data = this._playerData.get(playerId);
    if (!session || !data) return;

    // Track unique power-up types used this session
    if (!session.powerUpsUsed.includes(powerUpType)) {
      session.powerUpsUsed.push(powerUpType);
    }

    data.stats.totalPowerUpsUsed++;
  }

  /**
   * Called when player drowns
   */
  public onPlayerDrowned(playerId: string): void {
    const session = this._sessionStats.get(playerId);
    if (!session) return;

    session.drownCount++;
  }

  /**
   * Update flood progress for achievements
   */
  public updateFloodProgress(playerId: string, floodProgress: number): void {
    const session = this._sessionStats.get(playerId);
    if (!session) return;

    session.floodProgress = Math.max(session.floodProgress, floodProgress);
  }

  /**
   * Called when game ends (victory or defeat)
   */
  public async onGameComplete(
    playerId: string,
    victory: boolean,
    finalScore: number,
    madeLeaderboard: boolean
  ): Promise<AchievementDefinition[]> {
    const session = this._sessionStats.get(playerId);
    const data = this._playerData.get(playerId);
    if (!session || !data) return [];

    session.score = finalScore;

    // Update cumulative stats
    data.stats.totalGamesPlayed++;
    if (victory) {
      data.stats.totalGamesWon++;
    }

    const unlockedAchievements: AchievementDefinition[] = [];

    // Check milestone achievements
    const milestoneUnlocks = this._checkMilestoneAchievements(playerId);
    unlockedAchievements.push(...milestoneUnlocks);

    // Only check single-game achievements on victory
    if (victory) {
      const gameUnlocks = this._checkSingleGameAchievements(playerId, session);
      unlockedAchievements.push(...gameUnlocks);

      const animalUnlocks = this._checkAnimalAchievements(playerId, session);
      unlockedAchievements.push(...animalUnlocks);
    }

    // Check score achievements
    const scoreUnlocks = this._checkScoreAchievements(playerId, session, madeLeaderboard);
    unlockedAchievements.push(...scoreUnlocks);

    // Save player data
    await this._savePlayerData(playerId, data);

    return unlockedAchievements;
  }

  /**
   * Get player's achievement data for UI
   */
  public getPlayerAchievements(playerId: string): {
    totalPoints: number;
    unlockedCount: number;
    totalCount: number;
    achievements: Array<{
      id: string;
      name: string;
      description: string;
      icon: string;
      category: string;
      points: number;
      unlocked: boolean;
      unlockedAt?: string;
      progress?: number;
      target?: number;
    }>;
  } {
    const data = this._playerData.get(playerId);
    if (!data) {
      return {
        totalPoints: 0,
        unlockedCount: 0,
        totalCount: this._definitions.length,
        achievements: this._definitions.map(def => ({
          ...def,
          unlocked: false,
        })),
      };
    }

    const achievements = this._definitions.map(def => {
      const progress = data.achievements[def.id];
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        points: def.points,
        unlocked: progress?.unlocked || false,
        unlockedAt: progress?.unlockedAt,
        progress: progress?.progress,
        target: progress?.target,
      };
    });

    return {
      totalPoints: data.totalPoints,
      unlockedCount: data.unlockedCount,
      totalCount: this._definitions.length,
      achievements,
    };
  }

  /**
   * Check and unlock milestone achievements (cumulative stats)
   */
  private _checkMilestoneAchievements(playerId: string): AchievementDefinition[] {
    const data = this._playerData.get(playerId);
    if (!data) return [];

    const unlocked: AchievementDefinition[] = [];

    for (const def of this._definitions) {
      if (def.category !== 'milestone') continue;
      if (data.achievements[def.id]?.unlocked) continue;

      let shouldUnlock = false;
      const req = def.requirement;

      switch (req.type) {
        case 'total_pairs':
          shouldUnlock = data.stats.totalPairsDelivered >= (req.value as number);
          // Update progress
          this._updateProgress(data, def.id, data.stats.totalPairsDelivered, req.value as number);
          break;
        case 'total_games':
          shouldUnlock = data.stats.totalGamesPlayed >= (req.value as number);
          this._updateProgress(data, def.id, data.stats.totalGamesPlayed, req.value as number);
          break;
        case 'total_wins':
          shouldUnlock = data.stats.totalGamesWon >= (req.value as number);
          this._updateProgress(data, def.id, data.stats.totalGamesWon, req.value as number);
          break;
      }

      if (shouldUnlock) {
        this._unlockAchievement(playerId, def);
        unlocked.push(def);
      }
    }

    return unlocked;
  }

  /**
   * Check single-game achievements (requires victory)
   */
  private _checkSingleGameAchievements(
    playerId: string,
    session: GameSessionStats
  ): AchievementDefinition[] {
    const data = this._playerData.get(playerId);
    if (!data) return [];

    const unlocked: AchievementDefinition[] = [];
    const gameTimeSeconds = (Date.now() - session.startTime) / 1000;

    for (const def of this._definitions) {
      if (def.category !== 'single_game') continue;
      if (data.achievements[def.id]?.unlocked) continue;

      let shouldUnlock = false;
      const req = def.requirement;

      switch (req.type) {
        case 'win_time':
          shouldUnlock = gameTimeSeconds <= (req.value as number);
          break;
        case 'no_drowning':
          shouldUnlock = session.drownCount === 0;
          break;
        case 'no_powerups':
          shouldUnlock = session.powerUpsUsed.length === 0;
          break;
        case 'all_powerups':
          const requiredPowerUps = req.value as string[];
          shouldUnlock = requiredPowerUps.every(p => session.powerUpsUsed.includes(p));
          break;
        case 'flood_level':
          shouldUnlock = session.floodProgress >= (req.value as number);
          break;
        case 'hard_mode':
          shouldUnlock = session.difficulty === 'hard';
          break;
      }

      if (shouldUnlock) {
        this._unlockAchievement(playerId, def);
        unlocked.push(def);
      }
    }

    return unlocked;
  }

  /**
   * Check animal collection achievements
   */
  private _checkAnimalAchievements(
    playerId: string,
    session: GameSessionStats
  ): AchievementDefinition[] {
    const data = this._playerData.get(playerId);
    if (!data) return [];

    const unlocked: AchievementDefinition[] = [];

    for (const def of this._definitions) {
      if (def.category !== 'animal') continue;
      if (data.achievements[def.id]?.unlocked) continue;

      const req = def.requirement;
      if (req.type !== 'collect_animals') continue;

      const requiredAnimals = req.value as string[];
      const hasAll = requiredAnimals.every(animal =>
        session.animalsCollected.includes(animal)
      );

      if (hasAll) {
        this._unlockAchievement(playerId, def);
        unlocked.push(def);
      }
    }

    return unlocked;
  }

  /**
   * Check score-based achievements
   */
  private _checkScoreAchievements(
    playerId: string,
    session: GameSessionStats,
    madeLeaderboard: boolean
  ): AchievementDefinition[] {
    const data = this._playerData.get(playerId);
    if (!data) return [];

    const unlocked: AchievementDefinition[] = [];

    for (const def of this._definitions) {
      if (def.category !== 'score') continue;
      if (data.achievements[def.id]?.unlocked) continue;

      let shouldUnlock = false;
      const req = def.requirement;

      switch (req.type) {
        case 'game_score':
          shouldUnlock = session.score >= (req.value as number);
          break;
        case 'leaderboard':
          shouldUnlock = madeLeaderboard;
          break;
      }

      if (shouldUnlock) {
        this._unlockAchievement(playerId, def);
        unlocked.push(def);
      }
    }

    return unlocked;
  }

  /**
   * Unlock an achievement for a player
   */
  private _unlockAchievement(playerId: string, achievement: AchievementDefinition): void {
    const data = this._playerData.get(playerId);
    if (!data) return;

    // Already unlocked
    if (data.achievements[achievement.id]?.unlocked) return;

    // Update achievement progress
    data.achievements[achievement.id] = {
      unlocked: true,
      unlockedAt: new Date().toISOString(),
    };

    // Update totals
    data.totalPoints += achievement.points;
    data.unlockedCount++;

    console.log(`[AchievementManager] ${data.playerName} unlocked "${achievement.name}" (+${achievement.points} pts)`);

    // Fire callback
    if (this._onUnlockCallback) {
      this._onUnlockCallback(playerId, data.playerName, achievement);
    }
  }

  /**
   * Update progress for a milestone achievement
   */
  private _updateProgress(
    data: PlayerAchievementData,
    achievementId: string,
    current: number,
    target: number
  ): void {
    if (!data.achievements[achievementId]) {
      data.achievements[achievementId] = {
        unlocked: false,
        progress: current,
        target: target,
      };
    } else if (!data.achievements[achievementId].unlocked) {
      data.achievements[achievementId].progress = current;
      data.achievements[achievementId].target = target;
    }
  }

  /**
   * Create empty session stats
   */
  private _createEmptySessionStats(): GameSessionStats {
    return {
      pairsDelivered: 0,
      animalsCollected: [],
      powerUpsUsed: [],
      drownCount: 0,
      startTime: Date.now(),
      difficulty: 'normal',
      floodProgress: 0,
      score: 0,
    };
  }

  /**
   * Ensure data directory exists
   */
  private _ensureDataDir(): void {
    if (!fs.existsSync(this._dataDir)) {
      fs.mkdirSync(this._dataDir, { recursive: true });
    }
  }

  /**
   * Load player data from file
   */
  private async _loadPlayerData(playerId: string, playerName: string): Promise<PlayerAchievementData> {
    const filePath = path.join(this._dataDir, `${playerId}.json`);

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as PlayerAchievementData;
        // Update player name in case it changed
        data.playerName = playerName;
        return data;
      }
    } catch (error) {
      console.error(`[AchievementManager] Failed to load data for ${playerId}:`, error);
    }

    // Return new player data
    return this._createEmptyPlayerData(playerId, playerName);
  }

  /**
   * Save player data to file
   */
  private async _savePlayerData(playerId: string, data: PlayerAchievementData): Promise<void> {
    const filePath = path.join(this._dataDir, `${playerId}.json`);

    try {
      this._ensureDataDir();
      data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[AchievementManager] Failed to save data for ${playerId}:`, error);
    }
  }

  /**
   * Create empty player data structure
   */
  private _createEmptyPlayerData(playerId: string, playerName: string): PlayerAchievementData {
    return {
      playerId,
      playerName,
      totalPoints: 0,
      unlockedCount: 0,
      achievements: {},
      stats: {
        totalPairsDelivered: 0,
        totalGamesPlayed: 0,
        totalGamesWon: 0,
        totalPowerUpsUsed: 0,
      },
      lastUpdated: new Date().toISOString(),
    };
  }
}
