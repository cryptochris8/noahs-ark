/**
 * ScoreManager - Handles player scoring and point calculations
 */

import type { Player } from 'hytopia';
import GameConfig, { type DifficultyKey, type ScoringConfig } from '../GameConfig';

export interface PlayerScore {
  playerId: string;
  playerName: string;
  score: number;
  pairsDelivered: number;
  powerUpsCollected: number;
  speedBonuses: number;
  lastPairTime: number; // For speed bonus calculation
}

export type ScoreEventCallback = (playerId: string, points: number, reason: string) => void;

export default class ScoreManager {
  private _config: ScoringConfig;
  private _difficulty: DifficultyKey;
  private _playerScores: Map<string, PlayerScore> = new Map();
  private _onScoreChange: ScoreEventCallback | null = null;
  private _gameStartTime: number = 0;
  private _maxGameTime: number = 0; // For time bonus calculation

  constructor(difficulty: DifficultyKey = 'normal') {
    this._config = GameConfig.instance.scoring;
    this._difficulty = difficulty;
  }

  /**
   * Set callback for score changes
   */
  public onScoreChange(callback: ScoreEventCallback): void {
    this._onScoreChange = callback;
  }

  /**
   * Start tracking scores for a new game
   */
  public startGame(maxGameTimeSeconds: number = 600): void {
    this._gameStartTime = Date.now();
    this._maxGameTime = maxGameTimeSeconds;
    this._playerScores.clear();
  }

  /**
   * Register a player for scoring
   */
  public registerPlayer(player: Player): void {
    if (this._playerScores.has(player.id)) return;

    this._playerScores.set(player.id, {
      playerId: player.id,
      playerName: player.username,
      score: 0,
      pairsDelivered: 0,
      powerUpsCollected: 0,
      speedBonuses: 0,
      lastPairTime: Date.now(),
    });
  }

  /**
   * Remove a player from scoring
   */
  public removePlayer(playerId: string): void {
    this._playerScores.delete(playerId);
  }

  /**
   * Award points for delivering a pair to the ark
   */
  public awardPairDelivery(player: Player): number {
    const score = this._getOrCreateScore(player);
    const now = Date.now();

    // Base points for pair delivery
    let points = this._config.points_per_pair;

    // Speed bonus if delivered quickly after last pair
    const timeSinceLastPair = (now - score.lastPairTime) / 1000;
    if (timeSinceLastPair <= this._config.speed_bonus_threshold_seconds) {
      points += this._config.speed_bonus_points;
      score.speedBonuses++;
    }

    // Apply difficulty multiplier
    points = Math.round(points * this._getDifficultyMultiplier());

    score.score += points;
    score.pairsDelivered++;
    score.lastPairTime = now;

    this._notifyScoreChange(player.id, points, 'Pair Delivered');

    return points;
  }

  /**
   * Award points for collecting a power-up
   */
  public awardPowerUpCollection(player: Player): number {
    const score = this._getOrCreateScore(player);

    let points = this._config.powerup_collect_points;
    points = Math.round(points * this._getDifficultyMultiplier());

    score.score += points;
    score.powerUpsCollected++;

    this._notifyScoreChange(player.id, points, 'Power-Up');

    return points;
  }

  /**
   * Award completion bonus when game is won
   */
  public awardCompletionBonus(player: Player, elapsedTimeSeconds: number): number {
    const score = this._getOrCreateScore(player);

    // Base completion bonus
    let points = this._config.completion_bonus;

    // Time bonus based on remaining time
    const remainingTime = Math.max(0, this._maxGameTime - elapsedTimeSeconds);
    const timeBonus = Math.round(remainingTime * this._config.time_bonus_per_second_remaining);
    points += timeBonus;

    // Apply difficulty multiplier
    points = Math.round(points * this._getDifficultyMultiplier());

    score.score += points;

    this._notifyScoreChange(player.id, points, 'Victory Bonus');

    return points;
  }

  /**
   * Get a player's current score
   */
  public getPlayerScore(playerId: string): number {
    return this._playerScores.get(playerId)?.score ?? 0;
  }

  /**
   * Get a player's full score data
   */
  public getPlayerScoreData(playerId: string): PlayerScore | null {
    return this._playerScores.get(playerId) ?? null;
  }

  /**
   * Get all player scores sorted by score (highest first)
   */
  public getAllScores(): PlayerScore[] {
    return Array.from(this._playerScores.values())
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get the top scorer
   */
  public getTopScorer(): PlayerScore | null {
    const scores = this.getAllScores();
    return scores.length > 0 ? scores[0] : null;
  }

  /**
   * Reset all scores
   */
  public reset(): void {
    this._playerScores.clear();
    this._gameStartTime = 0;
  }

  /**
   * Get difficulty multiplier
   */
  private _getDifficultyMultiplier(): number {
    return this._config.difficulty_multipliers[this._difficulty] ?? 1.0;
  }

  /**
   * Get or create score entry for player
   */
  private _getOrCreateScore(player: Player): PlayerScore {
    if (!this._playerScores.has(player.id)) {
      this.registerPlayer(player);
    }
    return this._playerScores.get(player.id)!;
  }

  /**
   * Notify listeners of score change
   */
  private _notifyScoreChange(playerId: string, points: number, reason: string): void {
    if (this._onScoreChange) {
      this._onScoreChange(playerId, points, reason);
    }
  }
}
