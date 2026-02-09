/**
 * WebSocket Message Flow Tests
 *
 * These tests simulate the actual message flow between client and server,
 * using the REAL RoomManager, GameRoom, and scoring logic - not mocks.
 * Tests verify the complete lifecycle of game interactions.
 */

import { shuffleInfluencerDeck } from "../src/server";
import {
  calculateScore,
  areAllScoresUpdated,
} from "../src/components/Scoring/scoring";
import { parseContent } from "../src/utils/utils";
import { RoomManager } from "../src/components/RoomManager";
import { GameRoom } from "../src/components/Room/GameRoom";
import type {
  Player,
  Room,
  InfluencerCard,
  ShuffledDeck,
} from "../src/types/types";
import influencerCards from "../src/data/influencerCards.json";

/**
 * ServerSimulator - Uses REAL RoomManager and GameRoom classes
 * This simulates the server's message handling while using actual implementation code.
 */
class ServerSimulator {
  private playerIdCounter = 0;
  private instanceId: string;

  // Use the REAL RoomManager - same code the server uses
  readonly roomManager: RoomManager;

  // Track connection to player ID mapping
  readonly connectionToPlayerId: Map<string, string> = new Map();

  // Track scored rounds per room
  readonly scoredRounds: Map<string, Set<number>> = new Map();
  readonly roomRounds: Map<string, number> = new Map();

  // Track global players list
  players: Player[] = [];

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    // Create REAL RoomManager - this is the same class the server uses
    this.roomManager = new RoomManager({
      deletionDelayMs: 30000,
    });
  }

  generatePlayerId(): string {
    this.playerIdCounter++;
    return `player_${Date.now()}_${this.instanceId}_${this.playerIdCounter}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Handle playerEnters - uses REAL GameRoom via RoomManager
   */
  handlePlayerEnters(
    connectionId: string,
    parsedContent: any,
  ): { response: any; broadcast: any } {
    const roomName = parsedContent.room;

    // Use REAL RoomManager to get or create room
    const gameRoom = this.roomManager.getOrCreateGameRoom(roomName);

    // Check for duplicate player ID
    let clientPlayerId = parsedContent.player?.id;
    const existingPlayer = gameRoom.getPlayer(clientPlayerId);

    if (existingPlayer && clientPlayerId) {
      clientPlayerId = this.generatePlayerId();
    }

    const player: Player = {
      ...parsedContent.player,
      id: clientPlayerId || connectionId,
      room: roomName,
      score: 0,
      streak: 0,
      hasStreak: false,
      isReady: false,
      tacticUsed: [],
      wasCorrect: false,
      scoreUpdated: false,
      streakUpdated: false,
    };

    this.connectionToPlayerId.set(connectionId, player.id);

    // Use REAL GameRoom.addPlayer method
    gameRoom.addPlayer(player);
    this.players.push(player);

    // Return response using REAL GameRoom.toRoomUpdate()
    return {
      response: { type: "playerId", id: player.id },
      broadcast: gameRoom.toRoomUpdate(),
    };
  }

  /**
   * Handle playerReady - uses REAL GameRoom methods
   */
  handlePlayerReady(connectionId: string, parsedContent: any): any {
    const playerId =
      this.connectionToPlayerId.get(connectionId) || connectionId;
    const roomName = parsedContent.room;
    const gameRoom = this.roomManager.getRoom(roomName);

    if (!gameRoom) return null;

    const clientPlayer = parsedContent.players?.find(
      (p: Player) => p.id === playerId,
    );
    const tacticUsed = clientPlayer?.tacticUsed || [];

    // Use REAL GameRoom.updatePlayer method
    gameRoom.updatePlayer(playerId, { isReady: true, tacticUsed });

    // Also update global players list
    this.players = this.players.map((player) => {
      if (player.id === playerId) {
        return { ...player, isReady: true, tacticUsed };
      }
      return player;
    });

    return {
      type: "playerReady",
      room: roomName,
      roomData: gameRoom.players,
      sender: connectionId,
    };
  }

  /**
   * Handle influencer - uses REAL GameRoom properties
   */
  handleInfluencer(parsedContent: any): any {
    const roomName = parsedContent.room;
    const gameRoom =
      this.roomManager.getRoom(roomName) ||
      this.roomManager.gameRooms.values().next().value;

    const influencerCard: InfluencerCard = {
      villain: parsedContent.villain || "",
      tactic: parsedContent.tactic || parsedContent.newsCard?.tacticUsed || [],
    };

    if (gameRoom) {
      // Set REAL GameRoom properties
      gameRoom.influencerCard = influencerCard;
      gameRoom.currentNewsCard = parsedContent.newsCard;
      gameRoom.currentTheme = parsedContent.villain;
    }

    return { type: "villain", villain: parsedContent.villain };
  }

  /**
   * Handle endOfRound - uses REAL calculateScore function and GameRoom
   */
  handleEndOfRound(parsedContent: any): any {
    const roomName = parsedContent.room;
    const gameRoom = this.roomManager.getRoom(roomName);

    if (!gameRoom) return null;

    const playersToScore = parsedContent.players || gameRoom.players;
    const roomKey = roomName;

    const lastRound = this.roomRounds.get(roomKey) ?? 0;
    const roundNumber = parsedContent.round || lastRound + 1;

    // Check if round already scored using tracking
    if (!this.scoredRounds.has(roomKey)) {
      this.scoredRounds.set(roomKey, new Set());
    }

    const scoredRoundsForRoom = this.scoredRounds.get(roomKey)!;
    if (scoredRoundsForRoom.has(roundNumber)) {
      return null; // Already scored - duplicate protection
    }

    scoredRoundsForRoom.add(roundNumber);

    // Use REAL GameRoom's influencerCard
    const influencerCard = gameRoom.influencerCard || {
      villain: "",
      tactic: [],
    };

    // Call the REAL calculateScore function - this is the actual scoring logic
    const updatedPlayers = calculateScore(
      playersToScore,
      gameRoom.players,
      influencerCard,
      roundNumber,
    );

    // Make a deep copy of the scored players to return (before resetting)
    const scoredPlayersForResponse = updatedPlayers.map((p) => ({ ...p }));

    // Update REAL GameRoom
    gameRoom.players.length = 0;
    gameRoom.players.push(...updatedPlayers);

    this.roomRounds.set(roomKey, roundNumber);
    gameRoom.currentRound = roundNumber + 1;

    // Reset players for next round (mimics real server behavior)
    gameRoom.players.forEach((p) => {
      p.tacticUsed = [];
      p.isReady = false;
      p.scoreUpdated = false;
      p.streakUpdated = false;
    });

    return {
      type: "scoreUpdate",
      room: roomName,
      players: scoredPlayersForResponse,
    };
  }

  /**
   * Handle playerLeaves - uses REAL RoomManager method
   */
  handlePlayerLeaves(connectionId: string, parsedContent: any): any {
    const playerId =
      this.connectionToPlayerId.get(connectionId) || connectionId;
    const roomName = parsedContent.room;

    // Use REAL RoomManager.removePlayerFromRoom
    const result = this.roomManager.removePlayerFromRoom(playerId, roomName);

    // Clean up
    this.players = this.players.filter((p) => p.id !== playerId);
    this.connectionToPlayerId.delete(connectionId);

    // Clean up tracking if room is empty
    if (result.gameRoom?.isEmpty) {
      this.scoredRounds.delete(roomName);
      this.roomRounds.delete(roomName);
    }

    return {
      type: "roomUpdate",
      room: roomName,
      count: result.gameRoom?.count || 0,
      players: result.gameRoom?.players || [],
    };
  }

  /**
   * Get a room - delegates to REAL RoomManager
   */
  getRoom(roomName: string): GameRoom | undefined {
    return this.roomManager.getRoom(roomName);
  }

  /**
   * Get all rooms count
   */
  get roomCount(): number {
    return this.roomManager.roomCount;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    this.roomManager.cleanup();
  }
}

describe("WebSocket Message Flow Tests - Real Implementation", () => {
  // ============================================
  // PLAYER CONNECTION FLOW
  // ============================================
  describe("Player Connection Flow", () => {
    let server: ServerSimulator;

    afterEach(() => {
      server?.cleanup();
    });

    it("should handle complete player join flow using real GameRoom", () => {
      server = new ServerSimulator("test-room");

      const joinMessage = {
        type: "playerEnters",
        player: {
          name: "Alice",
          avatar: "hero1.png",
          room: "test-room",
        },
        room: "test-room",
      };

      const result = server.handlePlayerEnters("conn-1", joinMessage);

      // Verify response
      expect(result.response.type).toBe("playerId");
      expect(result.response.id).toBeDefined();

      // Verify broadcast uses real GameRoom.toRoomUpdate() format
      expect(result.broadcast.type).toBe("roomUpdate");
      expect(result.broadcast.count).toBe(1);
      expect(result.broadcast.players.length).toBe(1);
      expect(result.broadcast.deck).toBeDefined();
      expect(result.broadcast.deck.isShuffled).toBe(true);
      expect(result.broadcast.currentRound).toBe(1);

      // Verify real GameRoom was created
      const gameRoom = server.getRoom("test-room");
      expect(gameRoom).toBeInstanceOf(GameRoom);
      expect(gameRoom?.count).toBe(1);
    });

    it("should assign unique IDs when client IDs collide", () => {
      server = new ServerSimulator("collision-room");

      // First player joins with ID "same-id"
      const join1 = {
        type: "playerEnters",
        player: {
          id: "same-id",
          name: "Alice",
          avatar: "a.png",
          room: "collision-room",
        },
        room: "collision-room",
      };
      server.handlePlayerEnters("conn-1", join1);

      // Second player tries to join with same ID
      const join2 = {
        type: "playerEnters",
        player: {
          id: "same-id",
          name: "Bob",
          avatar: "b.png",
          room: "collision-room",
        },
        room: "collision-room",
      };
      server.handlePlayerEnters("conn-2", join2);

      // Verify using real GameRoom
      const gameRoom = server.getRoom("collision-room");
      expect(gameRoom?.count).toBe(2);
      expect(gameRoom?.players[0].id).not.toBe(gameRoom?.players[1].id);
    });

    it("should handle multiple players joining the same room", () => {
      server = new ServerSimulator("multi-room");

      const players = ["Alice", "Bob", "Charlie", "Diana"];

      players.forEach((name, i) => {
        const joinMessage = {
          type: "playerEnters",
          player: { name, avatar: `avatar${i}.png`, room: "multi-room" },
          room: "multi-room",
        };
        server.handlePlayerEnters(`conn-${i}`, joinMessage);
      });

      // Verify using real GameRoom
      const gameRoom = server.getRoom("multi-room");
      expect(gameRoom?.count).toBe(4);
      expect(gameRoom?.players.map((p) => p.name)).toEqual(players);
    });

    it("should prevent more than 5 players (real GameRoom.isFull)", () => {
      server = new ServerSimulator("full-room");

      // Add 5 players
      for (let i = 0; i < 5; i++) {
        server.handlePlayerEnters(`conn-${i}`, {
          type: "playerEnters",
          player: { name: `Player${i}`, avatar: "a.png", room: "full-room" },
          room: "full-room",
        });
      }

      const gameRoom = server.getRoom("full-room");
      expect(gameRoom?.isFull).toBe(true);
      expect(gameRoom?.count).toBe(5);

      // Try to add 6th player - should fail via real GameRoom.addPlayer
      const result = server.handlePlayerEnters("conn-6", {
        type: "playerEnters",
        player: { name: "Player6", avatar: "a.png", room: "full-room" },
        room: "full-room",
      });

      // Player wasn't added due to isFull check in GameRoom
      expect(gameRoom?.count).toBe(5);
    });
  });

  // ============================================
  // READY STATE FLOW
  // ============================================
  describe("Ready State Flow", () => {
    let server: ServerSimulator;

    afterEach(() => {
      server?.cleanup();
    });

    it("should update player ready state with selected tactics using real GameRoom", () => {
      server = new ServerSimulator("ready-room");

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "ready-room" },
        room: "ready-room",
      });

      const playerId = server.connectionToPlayerId.get("conn-1");

      // Player marks ready with tactics
      const readyMessage = {
        type: "playerReady",
        room: "ready-room",
        players: [
          {
            id: playerId,
            tacticUsed: ["fear-mongering", "clickbait"],
          },
        ],
      };

      const result = server.handlePlayerReady("conn-1", readyMessage);

      expect(result.type).toBe("playerReady");
      expect(result.roomData[0].isReady).toBe(true);
      expect(result.roomData[0].tacticUsed).toEqual([
        "fear-mongering",
        "clickbait",
      ]);

      // Verify via real GameRoom
      const gameRoom = server.getRoom("ready-room");
      const player = gameRoom?.getPlayer(playerId!);
      expect(player?.isReady).toBe(true);
      expect(player?.tacticUsed).toEqual(["fear-mongering", "clickbait"]);
    });

    it("should track all players ready state independently", () => {
      server = new ServerSimulator("all-ready-room");

      // Two players join
      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "all-ready-room" },
        room: "all-ready-room",
      });
      server.handlePlayerEnters("conn-2", {
        type: "playerEnters",
        player: { name: "Bob", avatar: "b.png", room: "all-ready-room" },
        room: "all-ready-room",
      });

      // Only Alice marks ready
      const aliceId = server.connectionToPlayerId.get("conn-1");
      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "all-ready-room",
        players: [{ id: aliceId, tacticUsed: ["true"] }],
      });

      // Verify via real GameRoom
      const gameRoom = server.getRoom("all-ready-room");
      const alice = gameRoom?.getPlayer(aliceId!);
      const bob = gameRoom?.players.find((p) => p.id !== aliceId);

      expect(alice?.isReady).toBe(true);
      expect(bob?.isReady).toBe(false);
    });
  });

  // ============================================
  // FULL ROUND FLOW - Tests REAL calculateScore
  // ============================================
  describe("Full Round Flow (Real Scoring)", () => {
    let server: ServerSimulator;

    afterEach(() => {
      server?.cleanup();
    });

    it("should process a complete game round with REAL calculateScore function", () => {
      server = new ServerSimulator("round-room");
      const realCard = influencerCards.influencerCards[0];

      // Setup: Two players join
      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "round-room" },
        room: "round-room",
      });
      server.handlePlayerEnters("conn-2", {
        type: "playerEnters",
        player: { name: "Bob", avatar: "b.png", room: "round-room" },
        room: "round-room",
      });

      const aliceId = server.connectionToPlayerId.get("conn-1")!;
      const bobId = server.connectionToPlayerId.get("conn-2")!;

      // Step 1: Set the influencer card
      server.handleInfluencer({
        type: "influencer",
        newsCard: realCard,
        villain: realCard.villain,
        tactic: realCard.tacticUsed,
        room: "round-room",
      });

      // Step 2: Players mark ready with their tactic choices
      // Alice gets it right
      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "round-room",
        players: [{ id: aliceId, tacticUsed: realCard.tacticUsed }],
      });

      // Bob gets it wrong
      server.handlePlayerReady("conn-2", {
        type: "playerReady",
        room: "round-room",
        players: [{ id: bobId, tacticUsed: ["wrong-tactic"] }],
      });

      // Step 3: End of round scoring - uses REAL calculateScore
      const gameRoom = server.getRoom("round-room");
      const scoreResult = server.handleEndOfRound({
        type: "endOfRound",
        room: "round-room",
        round: 1,
        players: gameRoom!.players,
      });

      // Verify scoring happened with REAL logic
      expect(scoreResult.type).toBe("scoreUpdate");

      const alice = scoreResult.players.find((p: Player) => p.id === aliceId);
      const bob = scoreResult.players.find((p: Player) => p.id === bobId);

      // Alice should have positive score (correct answer via REAL scoring)
      expect(alice.score).toBeGreaterThan(0);
      expect(alice.wasCorrect).toBe(true);
      expect(alice.scoreUpdated).toBe(true);

      // Bob should have zero or negative score (wrong answer via REAL scoring)
      expect(bob.score).toBeLessThanOrEqual(0);
      expect(bob.wasCorrect).toBe(false);
    });

    it("should prevent duplicate round scoring", () => {
      server = new ServerSimulator("dup-room");
      const realCard = influencerCards.influencerCards[0];

      // Setup
      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "dup-room" },
        room: "dup-room",
      });

      const aliceId = server.connectionToPlayerId.get("conn-1")!;

      server.handleInfluencer({
        type: "influencer",
        newsCard: realCard,
        villain: realCard.villain,
        tactic: realCard.tacticUsed,
        room: "dup-room",
      });

      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "dup-room",
        players: [{ id: aliceId, tacticUsed: realCard.tacticUsed }],
      });

      // First scoring
      const gameRoom = server.getRoom("dup-room");
      const result1 = server.handleEndOfRound({
        type: "endOfRound",
        room: "dup-room",
        round: 1,
        players: gameRoom!.players,
      });

      expect(result1).not.toBeNull();

      // Try to score same round again
      const result2 = server.handleEndOfRound({
        type: "endOfRound",
        room: "dup-room",
        round: 1,
        players: gameRoom!.players,
      });

      // Should return null (no scoring happened)
      expect(result2).toBeNull();
    });

    it("should correctly calculate scores with REAL card tactics", () => {
      server = new ServerSimulator("real-card-room");

      // Find a card with specific known tactics
      const fearCard = influencerCards.influencerCards.find((c: any) =>
        c.tacticUsed.includes("fear-mongering"),
      );
      expect(fearCard).toBeDefined();

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Tester", avatar: "a.png", room: "real-card-room" },
        room: "real-card-room",
      });

      const playerId = server.connectionToPlayerId.get("conn-1")!;

      server.handleInfluencer({
        type: "influencer",
        newsCard: fearCard,
        villain: fearCard!.villain,
        tactic: fearCard!.tacticUsed,
        room: "real-card-room",
      });

      // Player correctly identifies fear-mongering
      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "real-card-room",
        players: [{ id: playerId, tacticUsed: fearCard!.tacticUsed }],
      });

      const gameRoom = server.getRoom("real-card-room");
      const result = server.handleEndOfRound({
        type: "endOfRound",
        room: "real-card-room",
        round: 1,
        players: gameRoom!.players,
      });

      // REAL scoring: each correct tactic = 2 * 50 = 100 points
      const player = result.players[0];
      expect(player.wasCorrect).toBe(true);
      expect(player.score).toBe(fearCard!.tacticUsed.length * 100);
    });
  });

  // ============================================
  // MULTI-ROUND GAME FLOW
  // ============================================
  describe("Multi-Round Game Flow", () => {
    let server: ServerSimulator;

    afterEach(() => {
      server?.cleanup();
    });

    it("should track scores across multiple rounds correctly", () => {
      server = new ServerSimulator("multi-round-room");
      const cards = influencerCards.influencerCards.slice(0, 3);

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "multi-round-room" },
        room: "multi-round-room",
      });

      const aliceId = server.connectionToPlayerId.get("conn-1")!;
      let cumulativeScore = 0;

      // Play 3 rounds
      for (let round = 1; round <= 3; round++) {
        const card = cards[round - 1];

        // Set influencer card
        server.handleInfluencer({
          type: "influencer",
          newsCard: card,
          villain: card.villain,
          tactic: card.tacticUsed,
          room: "multi-round-room",
        });

        // Player answers correctly
        server.handlePlayerReady("conn-1", {
          type: "playerReady",
          room: "multi-round-room",
          players: [{ id: aliceId, tacticUsed: card.tacticUsed }],
        });

        const gameRoom = server.getRoom("multi-round-room");
        const result = server.handleEndOfRound({
          type: "endOfRound",
          room: "multi-round-room",
          round,
          players: gameRoom!.players,
        });

        // Score should increase via REAL calculateScore
        expect(result.players[0].score).toBeGreaterThan(cumulativeScore);
        cumulativeScore = result.players[0].score;
      }

      // After 3 correct rounds, should have accumulated score
      expect(cumulativeScore).toBeGreaterThan(0);
    });

    it("should advance room currentRound after each round using real GameRoom", () => {
      server = new ServerSimulator("advance-room");
      const card = influencerCards.influencerCards[0];

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "advance-room" },
        room: "advance-room",
      });

      const aliceId = server.connectionToPlayerId.get("conn-1")!;

      // Initial round should be 1 (real GameRoom default)
      let gameRoom = server.getRoom("advance-room");
      expect(gameRoom?.currentRound).toBe(1);

      // Complete round 1
      server.handleInfluencer({
        type: "influencer",
        newsCard: card,
        villain: card.villain,
        tactic: card.tacticUsed,
        room: "advance-room",
      });

      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "advance-room",
        players: [{ id: aliceId, tacticUsed: card.tacticUsed }],
      });

      server.handleEndOfRound({
        type: "endOfRound",
        room: "advance-room",
        round: 1,
        players: gameRoom!.players,
      });

      // Round should advance to 2 (real GameRoom state)
      gameRoom = server.getRoom("advance-room");
      expect(gameRoom?.currentRound).toBe(2);
    });

    it("should build streak across rounds with REAL scoring logic", () => {
      server = new ServerSimulator("streak-room");
      const cards = influencerCards.influencerCards.slice(0, 5);

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Streaker", avatar: "a.png", room: "streak-room" },
        room: "streak-room",
      });

      const playerId = server.connectionToPlayerId.get("conn-1")!;
      let lastStreak = 0;

      // Play 5 rounds with all correct answers
      for (let round = 1; round <= 5; round++) {
        const card = cards[round - 1];

        server.handleInfluencer({
          type: "influencer",
          newsCard: card,
          villain: card.villain,
          tactic: card.tacticUsed,
          room: "streak-room",
        });

        server.handlePlayerReady("conn-1", {
          type: "playerReady",
          room: "streak-room",
          players: [{ id: playerId, tacticUsed: card.tacticUsed }],
        });

        const gameRoom = server.getRoom("streak-room");
        const result = server.handleEndOfRound({
          type: "endOfRound",
          room: "streak-room",
          round,
          players: gameRoom!.players,
        });

        const player = result.players[0];

        // REAL scoring increments streak on correct answers
        expect(player.streak).toBe(round);

        // hasStreak should be true after 3rd round
        if (round >= 3) {
          expect(player.hasStreak).toBe(true);
        }

        lastStreak = player.streak;
      }

      expect(lastStreak).toBe(5);
    });
  });

  // ============================================
  // PLAYER LEAVE FLOW
  // ============================================
  describe("Player Leave Flow", () => {
    let server: ServerSimulator;

    afterEach(() => {
      server?.cleanup();
    });

    it("should handle player leaving using real RoomManager", () => {
      server = new ServerSimulator("leave-room");

      // Two players join
      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "leave-room" },
        room: "leave-room",
      });
      server.handlePlayerEnters("conn-2", {
        type: "playerEnters",
        player: { name: "Bob", avatar: "b.png", room: "leave-room" },
        room: "leave-room",
      });

      let gameRoom = server.getRoom("leave-room");
      expect(gameRoom?.count).toBe(2);

      // Alice leaves using real RoomManager.removePlayerFromRoom
      const result = server.handlePlayerLeaves("conn-1", {
        type: "playerLeaves",
        room: "leave-room",
      });

      expect(result.type).toBe("roomUpdate");
      expect(result.count).toBe(1);
      expect(result.players.length).toBe(1);
      expect(result.players[0].name).toBe("Bob");

      // Verify via real GameRoom
      gameRoom = server.getRoom("leave-room");
      expect(gameRoom?.count).toBe(1);
    });

    it("should mark room as empty when last player leaves", () => {
      server = new ServerSimulator("cleanup-room");

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "cleanup-room" },
        room: "cleanup-room",
      });

      // Player leaves
      server.handlePlayerLeaves("conn-1", {
        type: "playerLeaves",
        room: "cleanup-room",
      });

      // Room should be empty via real GameRoom.isEmpty
      const gameRoom = server.getRoom("cleanup-room");
      expect(gameRoom?.isEmpty).toBe(true);
      expect(gameRoom?.count).toBe(0);
    });
  });

  // ============================================
  // ROOM ISOLATION VERIFICATION
  // ============================================
  describe("Room Isolation Verification", () => {
    it("should maintain separate state for different rooms using real GameRooms", () => {
      const serverA = new ServerSimulator("room-a");
      const serverB = new ServerSimulator("room-b");
      const cardA = influencerCards.influencerCards[0];
      const cardB = influencerCards.influencerCards[5];

      try {
        // Player joins room A
        serverA.handlePlayerEnters("conn-a1", {
          type: "playerEnters",
          player: { name: "Alice", avatar: "a.png", room: "room-a" },
          room: "room-a",
        });

        // Player joins room B
        serverB.handlePlayerEnters("conn-b1", {
          type: "playerEnters",
          player: { name: "Bob", avatar: "b.png", room: "room-b" },
          room: "room-b",
        });

        // Set different cards for each room
        serverA.handleInfluencer({
          type: "influencer",
          newsCard: cardA,
          villain: cardA.villain,
          tactic: cardA.tacticUsed,
          room: "room-a",
        });

        serverB.handleInfluencer({
          type: "influencer",
          newsCard: cardB,
          villain: cardB.villain,
          tactic: cardB.tacticUsed,
          room: "room-b",
        });

        // Verify isolation via real GameRoom properties
        const roomA = serverA.getRoom("room-a");
        const roomB = serverB.getRoom("room-b");

        expect(roomA?.influencerCard?.villain).toBe(cardA.villain);
        expect(roomB?.influencerCard?.villain).toBe(cardB.villain);

        // Decks should be different (shuffled independently by real GameRoom)
        expect(roomA?.deck).not.toBe(roomB?.deck);
        expect(roomA?.deck.data).not.toBe(roomB?.deck.data);
      } finally {
        serverA.cleanup();
        serverB.cleanup();
      }
    });

    it("should generate unique player IDs per server instance", () => {
      const serverA = new ServerSimulator("id-room-a");
      const serverB = new ServerSimulator("id-room-b");

      try {
        const idA = serverA.generatePlayerId();
        const idB = serverB.generatePlayerId();

        // IDs should contain their room identifier
        expect(idA).toContain("id-room-a");
        expect(idB).toContain("id-room-b");

        // IDs should be different
        expect(idA).not.toBe(idB);
      } finally {
        serverA.cleanup();
        serverB.cleanup();
      }
    });
  });

  // ============================================
  // DECK INTEGRITY TESTS
  // ============================================
  describe("Deck Integrity Across Rooms", () => {
    it("should give each room its own independently shuffled deck via real GameRoom", () => {
      const server1 = new ServerSimulator("deck-room-1");
      const server2 = new ServerSimulator("deck-room-2");

      try {
        // Players join each room
        server1.handlePlayerEnters("conn-1", {
          type: "playerEnters",
          player: { name: "Alice", avatar: "a.png", room: "deck-room-1" },
          room: "deck-room-1",
        });

        server2.handlePlayerEnters("conn-2", {
          type: "playerEnters",
          player: { name: "Bob", avatar: "b.png", room: "deck-room-2" },
          room: "deck-room-2",
        });

        // Get real GameRoom instances
        const room1 = server1.getRoom("deck-room-1");
        const room2 = server2.getRoom("deck-room-2");

        // Both rooms should have decks (created by real GameRoom constructor)
        expect(room1?.deck).toBeDefined();
        expect(room2?.deck).toBeDefined();
        expect(room1?.deck.isShuffled).toBe(true);
        expect(room2?.deck.isShuffled).toBe(true);

        // Decks should be different arrays
        expect(room1?.deck.data).not.toBe(room2?.deck.data);

        // Verify cards have required properties (real data integrity)
        const card1 = (room1?.deck.data as any[])[0];
        const card2 = (room2?.deck.data as any[])[0];

        expect(card1).toHaveProperty("id");
        expect(card1).toHaveProperty("villain");
        expect(card1).toHaveProperty("tacticUsed");

        expect(card2).toHaveProperty("id");
        expect(card2).toHaveProperty("villain");
        expect(card2).toHaveProperty("tacticUsed");
      } finally {
        server1.cleanup();
        server2.cleanup();
      }
    });
  });

  // ============================================
  // REAL SCORING VALIDATION TESTS
  // ============================================
  describe("Real Scoring Validation", () => {
    let server: ServerSimulator;

    afterEach(() => {
      server?.cleanup();
    });

    it("should award exactly 100 points per correct tactic (REAL scoring constants)", () => {
      server = new ServerSimulator("exact-score-room");

      // Find a card with exactly 2 tactics
      const twoTacticCard = influencerCards.influencerCards.find(
        (c: any) => c.tacticUsed.length === 2,
      );
      expect(twoTacticCard).toBeDefined();

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Scorer", avatar: "a.png", room: "exact-score-room" },
        room: "exact-score-room",
      });

      const playerId = server.connectionToPlayerId.get("conn-1")!;

      server.handleInfluencer({
        type: "influencer",
        newsCard: twoTacticCard,
        villain: twoTacticCard!.villain,
        tactic: twoTacticCard!.tacticUsed,
        room: "exact-score-room",
      });

      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "exact-score-room",
        players: [{ id: playerId, tacticUsed: twoTacticCard!.tacticUsed }],
      });

      const gameRoom = server.getRoom("exact-score-room");
      const result = server.handleEndOfRound({
        type: "endOfRound",
        room: "exact-score-room",
        round: 1,
        players: gameRoom!.players,
      });

      // REAL scoring: CORRECT_ANSWER (2) * 50 * 2 tactics = 200 points
      expect(result.players[0].score).toBe(200);
    });

    it("should deduct exactly 50 points per wrong tactic (REAL scoring constants)", () => {
      server = new ServerSimulator("penalty-room");

      const card = influencerCards.influencerCards[0];

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Loser", avatar: "a.png", room: "penalty-room" },
        room: "penalty-room",
      });

      const playerId = server.connectionToPlayerId.get("conn-1")!;

      server.handleInfluencer({
        type: "influencer",
        newsCard: card,
        villain: card.villain,
        tactic: card.tacticUsed,
        room: "penalty-room",
      });

      // Give player starting score and wrong tactics
      const gameRoom = server.getRoom("penalty-room");
      gameRoom!.players[0].score = 200;

      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "penalty-room",
        players: [{ id: playerId, tacticUsed: ["wrong1", "wrong2"] }],
      });

      const result = server.handleEndOfRound({
        type: "endOfRound",
        room: "penalty-room",
        round: 1,
        players: gameRoom!.players,
      });

      // REAL scoring: WRONG_ANSWER (-1) * 50 * 2 wrong = -100 points
      // Starting with 200, ending with 100
      expect(result.players[0].score).toBe(100);
      expect(result.players[0].wasCorrect).toBe(false);
    });

    it("should not allow score below 0 (REAL scoring floor)", () => {
      server = new ServerSimulator("floor-room");

      const card = influencerCards.influencerCards[0];

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Floored", avatar: "a.png", room: "floor-room" },
        room: "floor-room",
      });

      const playerId = server.connectionToPlayerId.get("conn-1")!;

      server.handleInfluencer({
        type: "influencer",
        newsCard: card,
        villain: card.villain,
        tactic: card.tacticUsed,
        room: "floor-room",
      });

      // Give player low starting score
      const gameRoom = server.getRoom("floor-room");
      gameRoom!.players[0].score = 10;

      // Many wrong answers
      server.handlePlayerReady("conn-1", {
        type: "playerReady",
        room: "floor-room",
        players: [{ id: playerId, tacticUsed: ["wrong1", "wrong2", "wrong3"] }],
      });

      const result = server.handleEndOfRound({
        type: "endOfRound",
        room: "floor-room",
        round: 1,
        players: gameRoom!.players,
      });

      // REAL scoring ensures score can't go below 0
      expect(result.players[0].score).toBe(0);
    });
  });
});
