import type { Player, InfluencerCard, ShuffledDeck } from "../../types/types";
import startingDeck from "../../data/influencerCards.json";

/**
 * GameRoom class encapsulates all state for a single game room.
 * Each room has its own isolated deck, round, players, and game state.
 */
export class GameRoom {
  readonly id: string;
  readonly name: string;

  // Players in this room
  players: Player[] = [];

  // Players who disconnected mid-game (keyed by player name for reconnection)
  disconnectedPlayers: Map<string, Player> = new Map();

  // Deck state - each room gets its own shuffled deck
  deck: ShuffledDeck = {
    type: "shuffledDeck",
    data: [],
    isShuffled: false,
  };

  // Game round state
  currentRound: number = 1;
  maxRounds: number = 5;
  isGameOver: boolean = false;

  // Current card/theme state
  currentNewsCard: any = null;
  currentTheme: string = "all";
  influencerCard: InfluencerCard = { villain: "biost", tactic: [] };

  // Scoring state
  wasScored: boolean = false;
  scoredRounds: Set<number> = new Set();
  lastScoredRound: number = 0;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    // Initialize with a freshly shuffled deck for this room
    this.shuffleDeck();
  }

  /**
   * Shuffles the influencer deck for this room.
   * Creates a deep copy to avoid mutating the original data.
   */
  shuffleDeck(): void {
    const array = JSON.parse(JSON.stringify(startingDeck.influencerCards));
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    this.deck = {
      type: "shuffledDeck",
      data: array,
      isShuffled: true,
    };
  }

  /**
   * Get the player count in this room
   */
  get count(): number {
    return this.players.length;
  }

  /**
   * Check if room is full (max 5 players)
   */
  get isFull(): boolean {
    return this.players.length >= 5;
  }

  /**
   * Check if room is empty (no active AND no disconnected players expecting to reconnect)
   * A room with disconnected players during an in-progress game is NOT considered empty.
   */
  get isEmpty(): boolean {
    return this.players.length === 0 && !this.hasDisconnectedPlayers;
  }

  /**
   * Check if there are no active connections (but there may be disconnected players)
   */
  get hasNoActivePlayers(): boolean {
    return this.players.length === 0;
  }

  /**
   * Check if there are disconnected players waiting to reconnect
   */
  get hasDisconnectedPlayers(): boolean {
    return this.disconnectedPlayers.size > 0 && this.isInProgress && !this.isGameOver;
  }

  /**
   * Check if the game is currently in progress (past round 1 or has scored rounds)
   */
  get isInProgress(): boolean {
    return this.currentRound > 1 || this.scoredRounds.size > 0;
  }

  /**
   * Add a player to the room
   */
  addPlayer(player: Player): boolean {
    if (this.isFull) {
      return false;
    }

    // Check for duplicate player ID
    const existingIndex = this.players.findIndex((p) => p.id === player.id);
    if (existingIndex >= 0) {
      // Update existing player instead of adding duplicate
      this.players[existingIndex] = player;
    } else {
      this.players.push(player);
    }
    return true;
  }

  /**
   * Remove a player from the room by ID
   * If game is in progress, stash the player for possible reconnection
   */
  removePlayer(playerId: string): Player | null {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index >= 0) {
      const [removed] = this.players.splice(index, 1);
      // Stash for reconnection if game is in progress and not over
      if (this.isInProgress && !this.isGameOver && removed.name) {
        this.disconnectedPlayers.set(removed.name, removed);
      }
      return removed;
    }
    return null;
  }

  /**
   * Check if a player name was previously in this room (disconnected mid-game)
   */
  wasPlayerInRoom(playerName: string): boolean {
    return this.disconnectedPlayers.has(playerName);
  }

  /**
   * Reconnect a previously disconnected player by name.
   * Returns the stashed player data if found, or null.
   */
  reconnectPlayer(playerName: string, newPlayerId: string): Player | null {
    const stashed = this.disconnectedPlayers.get(playerName);
    if (!stashed) return null;
    // Update the player ID to the new connection and re-add
    stashed.id = newPlayerId;
    // Reset ready state so the player must explicitly mark ready again
    // This prevents the "stuck ready" loop that triggers repeated endOfRound
    stashed.isReady = false;
    stashed.tacticUsed = [];
    stashed.scoreUpdated = false;
    stashed.streakUpdated = false;
    this.players.push(stashed);
    this.disconnectedPlayers.delete(playerName);
    return stashed;
  }

  /**
   * Find a player by ID
   */
  getPlayer(playerId: string): Player | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  /**
   * Update a specific player
   */
  updatePlayer(playerId: string, updates: Partial<Player>): Player | null {
    const player = this.getPlayer(playerId);
    if (player) {
      Object.assign(player, updates);
      return player;
    }
    return null;
  }

  /**
   * Check if a round has already been scored
   */
  isRoundScored(round: number): boolean {
    return this.scoredRounds.has(round);
  }

  /**
   * Mark a round as scored
   */
  markRoundScored(round: number): void {
    this.scoredRounds.add(round);
    this.lastScoredRound = Math.max(this.lastScoredRound, round);
  }

  /**
   * Advance to the next round
   */
  advanceRound(): void {
    this.currentRound++;
    // Check if the game is over
    if (this.currentRound > this.maxRounds) {
      this.isGameOver = true;
    }
    // Reset player ready states for new round
    this.players.forEach((player) => {
      player.isReady = false;
      player.tacticUsed = [];
      player.scoreUpdated = false;
      player.streakUpdated = false;
    });
  }

  /**
   * Reset the room to initial state (when all players leave)
   */
  reset(): void {
    this.players = [];
    this.disconnectedPlayers.clear();
    this.currentRound = 1;
    this.isGameOver = false;
    this.currentNewsCard = null;
    this.currentTheme = "all";
    this.influencerCard = { villain: "biost", tactic: [] };
    this.wasScored = false;
    this.scoredRounds.clear();
    this.lastScoredRound = 0;
    this.shuffleDeck();
  }

  /**
   * Get the current card index (0-based, corresponds to round - 1)
   */
  get cardIndex(): number {
    return Math.max(0, this.currentRound - 1);
  }

  /**
   * Serialize room data for broadcasting to clients
   */
  toRoomUpdate(): object {
    return {
      type: "roomUpdate",
      room: this.name,
      count: this.count,
      players: this.players,
      deck: this.deck,
      currentRound: this.currentRound,
      maxRounds: this.maxRounds,
      isGameOver: this.isGameOver,
      isFull: this.isFull,
      isInProgress: this.isInProgress,
      disconnectedPlayerNames: Array.from(this.disconnectedPlayers.keys()),
      disconnectedCount: this.disconnectedPlayers.size,
      cardIndex: this.cardIndex,
      newsCard: this.currentNewsCard,
      themeStyle: this.currentTheme,
    };
  }

  /**
   * Convert to legacy Room interface for backward compatibility
   */
  toLegacyRoom(): object {
    return {
      name: this.name,
      count: this.count,
      players: this.players,
      deck: this.deck,
      currentRound: this.currentRound,
      currentNewsCard: this.currentNewsCard,
      currentTheme: this.currentTheme,
      influencerCard: this.influencerCard,
      wasScored: this.wasScored,
    };
  }
}

export default GameRoom;
