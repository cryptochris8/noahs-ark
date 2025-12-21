/**
 * LeaderboardManager - Handles persistent high score storage and retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import GameConfig, { type LeaderboardConfig, type DifficultyKey } from '../GameConfig';

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  score: number;
  pairsDelivered: number;
  timeSeconds: number;
  difficulty: DifficultyKey;
  date: string;
}

export default class LeaderboardManager {
  private _config: LeaderboardConfig;
  private _entries: LeaderboardEntry[] = [];
  private _filePath: string;
  private _isLoaded: boolean = false;

  constructor() {
    this._config = GameConfig.instance.leaderboard;
    // Store in the project root data folder
    this._filePath = path.join(process.cwd(), 'data', this._config.storage_file);
  }

  /**
   * Load leaderboard from file
   */
  public async load(): Promise<void> {
    if (this._isLoaded) return;

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this._filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this._filePath)) {
        const data = fs.readFileSync(this._filePath, 'utf-8');
        const parsed = JSON.parse(data);
        this._entries = parsed.entries || [];
        this._updateRanks();
      }

      this._isLoaded = true;
    } catch (error) {
      console.error('[LeaderboardManager] Failed to load leaderboard:', error);
      this._entries = [];
      this._isLoaded = true;
    }
  }

  /**
   * Save leaderboard to file
   */
  public async save(): Promise<void> {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this._filePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const data = JSON.stringify({
        version: 1,
        lastUpdated: new Date().toISOString(),
        entries: this._entries,
      }, null, 2);

      fs.writeFileSync(this._filePath, data, 'utf-8');
    } catch (error) {
      console.error('[LeaderboardManager] Failed to save leaderboard:', error);
    }
  }

  /**
   * Submit a new score to the leaderboard
   * Returns the rank if it made the leaderboard, or null if it didn't qualify
   */
  public async submitScore(
    playerName: string,
    score: number,
    pairsDelivered: number,
    timeSeconds: number,
    difficulty: DifficultyKey
  ): Promise<number | null> {
    if (!this._isLoaded) {
      await this.load();
    }

    // Check if score qualifies for leaderboard
    if (!this._qualifiesForLeaderboard(score)) {
      return null;
    }

    // Create new entry
    const entry: LeaderboardEntry = {
      rank: 0, // Will be set by _updateRanks
      playerName,
      score,
      pairsDelivered,
      timeSeconds,
      difficulty,
      date: new Date().toISOString(),
    };

    // Add entry and sort
    this._entries.push(entry);
    this._entries.sort((a, b) => b.score - a.score);

    // Trim to max entries
    if (this._entries.length > this._config.max_entries) {
      this._entries = this._entries.slice(0, this._config.max_entries);
    }

    // Update ranks
    this._updateRanks();

    // Find the rank of the new entry
    const rank = this._entries.findIndex(e =>
      e.playerName === playerName &&
      e.score === score &&
      e.date === entry.date
    );

    // Save to file
    await this.save();

    return rank >= 0 ? rank + 1 : null;
  }

  /**
   * Get the full leaderboard
   */
  public async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!this._isLoaded) {
      await this.load();
    }
    return [...this._entries];
  }

  /**
   * Get top N entries
   */
  public async getTopScores(count: number = 10): Promise<LeaderboardEntry[]> {
    if (!this._isLoaded) {
      await this.load();
    }
    return this._entries.slice(0, Math.min(count, this._entries.length));
  }

  /**
   * Check if a score would make the leaderboard
   */
  public async wouldQualify(score: number): Promise<boolean> {
    if (!this._isLoaded) {
      await this.load();
    }
    return this._qualifiesForLeaderboard(score);
  }

  /**
   * Get a player's best score
   */
  public async getPlayerBestScore(playerName: string): Promise<LeaderboardEntry | null> {
    if (!this._isLoaded) {
      await this.load();
    }
    return this._entries.find(e => e.playerName === playerName) || null;
  }

  /**
   * Clear the entire leaderboard
   */
  public async clear(): Promise<void> {
    this._entries = [];
    await this.save();
  }

  /**
   * Check if score qualifies for leaderboard
   */
  private _qualifiesForLeaderboard(score: number): boolean {
    if (this._entries.length < this._config.max_entries) {
      return true;
    }

    // Check if score beats the lowest entry
    const lowestScore = this._entries[this._entries.length - 1]?.score ?? 0;
    return score > lowestScore;
  }

  /**
   * Update ranks for all entries
   */
  private _updateRanks(): void {
    this._entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });
  }

  /**
   * Format time as M:SS
   */
  public static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
