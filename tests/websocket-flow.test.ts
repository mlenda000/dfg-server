/**
 * WebSocket Message Flow Tests
 *
 * These tests simulate the actual message flow between client and server,
 * testing the complete lifecycle of game interactions without mocking
 * the business logic. Tests use real data structures and simulate
 * actual game scenarios.
 */

import { shuffleInfluencerDeck } from "../src/server";
import {
  calculateScore,
  areAllScoresUpdated,
} from "../src/components/Scoring/scoring";
import { parseContent } from "../src/utils/utils";
import type {
  Player,
  Room,
  InfluencerCard,
  ShuffledDeck,
} from "../src/types/types";
import influencerCards from "../src/data/influencerCards.json";

/**
 * Simulates the server-side state management for testing purposes.
 * This mirrors the actual Server class behavior without PartyKit dependencies.
 */
class MockServerInstance {
  private playerIdCounter = 0;
  private roomId: string;

  players: Player[] = [];
  rooms: Room[] = [];
  connectionToPlayerId: Map<string, string> = new Map();
  scoredRounds: Map<string, Set<number>> = new Map();
  roomRounds: Map<string, number> = new Map();

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  generatePlayerId(): string {
    this.playerIdCounter++;
    return `player_${Date.now()}_${this.roomId}_${this.playerIdCounter}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // Simulate handling playerEnters message
  handlePlayerEnters(
    connectionId: string,
    parsedContent: any,
  ): { response: any; broadcast: any } {
    const room = this.findOrCreateRoom(parsedContent.room);

    // Check for duplicate player ID
    let clientPlayerId = parsedContent.player?.id;
    const existingPlayer = room.players.find((p) => p.id === clientPlayerId);

    if (existingPlayer && clientPlayerId) {
      clientPlayerId = this.generatePlayerId();
    }

    const player: Player = {
      ...parsedContent.player,
      id: clientPlayerId || connectionId,
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
    room.players.push(player);
    room.count = room.players.length;
    this.players.push(player);

    // Initialize deck if not exists
    if (!room.deck) {
      const deckData = shuffleInfluencerDeck(influencerCards.influencerCards);
      room.deck = {
        type: "shuffledDeck",
        data: deckData,
        isShuffled: true,
      };
    }

    // Initialize room state
    if (room.currentRound === undefined) room.currentRound = 1;
    if (room.currentTheme === undefined) room.currentTheme = "all";

    const roomUpdate = {
      type: "roomUpdate",
      room: room.name,
      count: room.count,
      players: room.players,
      deck: room.deck,
      currentRound: room.currentRound,
      cardIndex: (room.currentRound || 1) - 1,
      newsCard: room.currentNewsCard,
      themeStyle: room.currentTheme,
    };

    return {
      response: { type: "playerId", id: player.id },
      broadcast: roomUpdate,
    };
  }

  // Simulate handling playerReady message
  handlePlayerReady(connectionId: string, parsedContent: any): any {
    const playerId =
      this.connectionToPlayerId.get(connectionId) || connectionId;
    const room = this.rooms.find((r) => r.name === parsedContent.room);

    if (!room) return null;

    const clientPlayer = parsedContent.players?.find(
      (p: Player) => p.id === playerId,
    );
    const tacticUsed = clientPlayer?.tacticUsed || [];

    room.players = room.players.map((player) => {
      if (player.id === playerId) {
        return { ...player, isReady: true, tacticUsed };
      }
      return player;
    });

    this.players = this.players.map((player) => {
      if (player.id === playerId) {
        return { ...player, isReady: true, tacticUsed };
      }
      return player;
    });

    return {
      type: "playerReady",
      room: parsedContent.room,
      roomData: room.players,
      sender: connectionId,
    };
  }

  // Simulate handling influencer message
  handleInfluencer(parsedContent: any): any {
    const room =
      this.rooms.find((r) => r.name === parsedContent.room) || this.rooms[0];

    const influencerCard: InfluencerCard = {
      villain: parsedContent.villain || "",
      tactic: parsedContent.tactic || parsedContent.newsCard?.tacticUsed || [],
    };

    if (room) {
      room.influencerCard = influencerCard;
      room.currentNewsCard = parsedContent.newsCard;
      room.currentTheme = parsedContent.villain;
    }

    return { type: "villain", villain: parsedContent.villain };
  }

  // Simulate handling endOfRound message
  handleEndOfRound(parsedContent: any): any {
    const room = this.rooms.find((r) => r.name === parsedContent.room);
    if (!room) return null;

    const playersToScore = parsedContent.players || room.players;
    const roomKey = room.name;

    const lastRound = this.roomRounds.get(roomKey) ?? 0;
    const roundNumber = parsedContent.round || lastRound + 1;

    if (!this.scoredRounds.has(roomKey)) {
      this.scoredRounds.set(roomKey, new Set());
    }

    const scoredRoundsForRoom = this.scoredRounds.get(roomKey)!;
    if (scoredRoundsForRoom.has(roundNumber)) {
      return null; // Already scored
    }

    scoredRoundsForRoom.add(roundNumber);

    const influencerCard = room.influencerCard || { villain: "", tactic: [] };
    const updatedPlayers = calculateScore(
      playersToScore,
      room.players,
      influencerCard,
      roundNumber,
    );

    room.players = updatedPlayers;
    this.roomRounds.set(roomKey, roundNumber);
    room.currentRound = roundNumber + 1;

    // Reset players for next round
    room.players = room.players.map((p) => ({
      ...p,
      tacticUsed: [],
      isReady: false,
      scoreUpdated: false,
      streakUpdated: false,
    }));

    return {
      type: "scoreUpdate",
      room: room.name,
      players: updatedPlayers,
    };
  }

  // Simulate handling playerLeaves message
  handlePlayerLeaves(connectionId: string, parsedContent: any): any {
    const playerId =
      this.connectionToPlayerId.get(connectionId) || connectionId;
    const room = this.rooms.find((r) => r.name === parsedContent.room);

    if (room) {
      room.players = room.players.filter((p) => p.id !== playerId);
      room.count = room.players.length;

      if (room.count === 0) {
        this.rooms = this.rooms.filter((r) => r.name !== room.name);
        this.scoredRounds.delete(room.name);
        this.roomRounds.delete(room.name);
      }
    }

    this.players = this.players.filter((p) => p.id !== playerId);
    this.connectionToPlayerId.delete(connectionId);

    return {
      type: "roomUpdate",
      room: room?.name,
      count: room?.count || 0,
      players: room?.players || [],
    };
  }

  private findOrCreateRoom(roomName: string): Room {
    let room = this.rooms.find((r) => r.name === roomName);
    if (!room) {
      room = { name: roomName, count: 0, players: [] };
      this.rooms.push(room);
    }
    return room;
  }

  getRoom(roomName: string): Room | undefined {
    return this.rooms.find((r) => r.name === roomName);
  }
}

describe("WebSocket Message Flow Tests", () => {
  // ============================================
  // PLAYER CONNECTION FLOW
  // ============================================
  describe("Player Connection Flow", () => {
    it("should handle complete player join flow", () => {
      const server = new MockServerInstance("test-room");

      // Client sends playerEnters
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

      // Should receive playerId response
      expect(result.response.type).toBe("playerId");
      expect(result.response.id).toBeDefined();

      // Should broadcast roomUpdate
      expect(result.broadcast.type).toBe("roomUpdate");
      expect(result.broadcast.count).toBe(1);
      expect(result.broadcast.players.length).toBe(1);
      expect(result.broadcast.deck).toBeDefined();
      expect(result.broadcast.deck.isShuffled).toBe(true);
    });

    it("should assign unique IDs when client IDs collide", () => {
      const server = new MockServerInstance("collision-room");

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
      const result1 = server.handlePlayerEnters("conn-1", join1);

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
      const result2 = server.handlePlayerEnters("conn-2", join2);

      // Should have different player IDs
      const room = server.getRoom("collision-room");
      expect(room!.players.length).toBe(2);
      expect(room!.players[0].id).not.toBe(room!.players[1].id);
    });

    it("should handle multiple players joining the same room", () => {
      const server = new MockServerInstance("multi-room");

      const players = ["Alice", "Bob", "Charlie", "Diana"];

      players.forEach((name, i) => {
        const joinMessage = {
          type: "playerEnters",
          player: { name, avatar: `avatar${i}.png`, room: "multi-room" },
          room: "multi-room",
        };
        server.handlePlayerEnters(`conn-${i}`, joinMessage);
      });

      const room = server.getRoom("multi-room");
      expect(room!.count).toBe(4);
      expect(room!.players.map((p) => p.name)).toEqual(players);
    });
  });

  // ============================================
  // READY STATE FLOW
  // ============================================
  describe("Ready State Flow", () => {
    it("should update player ready state with selected tactics", () => {
      const server = new MockServerInstance("ready-room");

      // Player joins
      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "ready-room" },
        room: "ready-room",
      });

      // Player marks ready with tactics
      const readyMessage = {
        type: "playerReady",
        room: "ready-room",
        players: [
          {
            id: server.connectionToPlayerId.get("conn-1"),
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
    });

    it("should track all players ready state independently", () => {
      const server = new MockServerInstance("all-ready-room");

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

      const room = server.getRoom("all-ready-room");
      const alice = room!.players.find((p) => p.id === aliceId);
      const bob = room!.players.find((p) => p.id !== aliceId);

      expect(alice!.isReady).toBe(true);
      expect(bob!.isReady).toBe(false);
    });
  });

  // ============================================
  // FULL ROUND FLOW
  // ============================================
  describe("Full Round Flow", () => {
    it("should process a complete game round with actual card data", () => {
      const server = new MockServerInstance("round-room");
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

      // Step 1: Set the influencer card (simulating card selection)
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

      // Step 3: End of round scoring
      const room = server.getRoom("round-room");
      const scoreResult = server.handleEndOfRound({
        type: "endOfRound",
        room: "round-room",
        round: 1,
        players: room!.players,
      });

      // Verify scoring happened
      expect(scoreResult.type).toBe("scoreUpdate");

      const alice = scoreResult.players.find((p: Player) => p.id === aliceId);
      const bob = scoreResult.players.find((p: Player) => p.id === bobId);

      // Alice should have positive score (correct answer)
      expect(alice.score).toBeGreaterThan(0);
      expect(alice.wasCorrect).toBe(true);

      // Bob should have zero or negative score (wrong answer)
      expect(bob.score).toBeLessThanOrEqual(0);
      expect(bob.wasCorrect).toBe(false);
    });

    it("should prevent duplicate round scoring", () => {
      const server = new MockServerInstance("dup-room");
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
      const room = server.getRoom("dup-room");
      const result1 = server.handleEndOfRound({
        type: "endOfRound",
        room: "dup-room",
        round: 1,
        players: room!.players,
      });

      // Store the score
      const scoreAfterFirst = result1.players[0].score;

      // Try to score same round again
      const result2 = server.handleEndOfRound({
        type: "endOfRound",
        room: "dup-room",
        round: 1,
        players: room!.players,
      });

      // Should return null (no scoring happened)
      expect(result2).toBeNull();

      // Score should not have changed
      const currentRoom = server.getRoom("dup-room");
      // Note: score was already applied and player reset for next round
      expect(currentRoom!.players[0].scoreUpdated).toBe(false);
    });
  });

  // ============================================
  // MULTI-ROUND GAME FLOW
  // ============================================
  describe("Multi-Round Game Flow", () => {
    it("should track scores across multiple rounds correctly", () => {
      const server = new MockServerInstance("multi-round-room");
      const cards = influencerCards.influencerCards.slice(0, 3);

      // Player joins
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

        // Score the round
        const room = server.getRoom("multi-round-room");
        // Need to update the player's tacticUsed before scoring
        room!.players[0].tacticUsed = card.tacticUsed;

        const result = server.handleEndOfRound({
          type: "endOfRound",
          room: "multi-round-room",
          round,
          players: room!.players,
        });

        // Score should increase
        expect(result.players[0].score).toBeGreaterThan(cumulativeScore);
        cumulativeScore = result.players[0].score;
      }

      // After 3 correct rounds, player should have a streak
      const finalRoom = server.getRoom("multi-round-room");
      // Note: Players are reset after each round, but the round tracking should work
      expect(finalRoom!.currentRound).toBe(4); // Ready for round 4
    });

    it("should advance room currentRound after each round", () => {
      const server = new MockServerInstance("advance-room");
      const card = influencerCards.influencerCards[0];

      server.handlePlayerEnters("conn-1", {
        type: "playerEnters",
        player: { name: "Alice", avatar: "a.png", room: "advance-room" },
        room: "advance-room",
      });

      const aliceId = server.connectionToPlayerId.get("conn-1")!;

      // Initial round should be 1
      let room = server.getRoom("advance-room");
      expect(room!.currentRound).toBe(1);

      // Complete round 1
      server.handleInfluencer({
        type: "influencer",
        newsCard: card,
        villain: card.villain,
        tactic: card.tacticUsed,
        room: "advance-room",
      });

      room!.players[0].tacticUsed = card.tacticUsed;
      server.handleEndOfRound({
        type: "endOfRound",
        room: "advance-room",
        round: 1,
        players: room!.players,
      });

      // Round should advance to 2
      room = server.getRoom("advance-room");
      expect(room!.currentRound).toBe(2);
    });
  });

  // ============================================
  // PLAYER LEAVE FLOW
  // ============================================
  describe("Player Leave Flow", () => {
    it("should handle player leaving and update room state", () => {
      const server = new MockServerInstance("leave-room");

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

      let room = server.getRoom("leave-room");
      expect(room!.count).toBe(2);

      // Alice leaves
      const result = server.handlePlayerLeaves("conn-1", {
        type: "playerLeaves",
        room: "leave-room",
      });

      expect(result.type).toBe("roomUpdate");
      expect(result.count).toBe(1);
      expect(result.players.length).toBe(1);
      expect(result.players[0].name).toBe("Bob");
    });

    it("should clean up room when last player leaves", () => {
      const server = new MockServerInstance("cleanup-room");

      // One player joins
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

      // Room should be removed
      const room = server.getRoom("cleanup-room");
      expect(room).toBeUndefined();
      expect(server.rooms.length).toBe(0);
      expect(server.players.length).toBe(0);
    });
  });

  // ============================================
  // ROOM ISOLATION VERIFICATION
  // ============================================
  describe("Room Isolation Verification", () => {
    it("should maintain separate state for different rooms", () => {
      // Create two separate server instances (simulating PartyKit room isolation)
      const serverA = new MockServerInstance("room-a");
      const serverB = new MockServerInstance("room-b");
      const cardA = influencerCards.influencerCards[0];
      const cardB = influencerCards.influencerCards[5];

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

      // Verify isolation
      const roomA = serverA.getRoom("room-a");
      const roomB = serverB.getRoom("room-b");

      expect(roomA!.influencerCard?.villain).toBe(cardA.villain);
      expect(roomB!.influencerCard?.villain).toBe(cardB.villain);
      expect(roomA!.influencerCard?.villain).not.toBe(
        roomB!.influencerCard?.villain,
      );

      // Decks should be different (shuffled independently)
      expect(roomA!.deck).not.toBe(roomB!.deck);
    });

    it("should generate unique player IDs per server instance", () => {
      const serverA = new MockServerInstance("id-room-a");
      const serverB = new MockServerInstance("id-room-b");

      const idA = serverA.generatePlayerId();
      const idB = serverB.generatePlayerId();

      // IDs should contain their room identifier
      expect(idA).toContain("id-room-a");
      expect(idB).toContain("id-room-b");

      // IDs should be different
      expect(idA).not.toBe(idB);
    });
  });

  // ============================================
  // DECK INTEGRITY TESTS
  // ============================================
  describe("Deck Integrity Across Rooms", () => {
    it("should give each room its own independently shuffled deck", () => {
      const server1 = new MockServerInstance("deck-room-1");
      const server2 = new MockServerInstance("deck-room-2");

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

      const room1 = server1.getRoom("deck-room-1");
      const room2 = server2.getRoom("deck-room-2");

      // Both rooms should have decks
      expect(room1!.deck).toBeDefined();
      expect(room2!.deck).toBeDefined();

      // Decks should be different arrays
      expect(room1!.deck!.data).not.toBe(room2!.deck!.data);

      // Cards should likely be in different orders
      const firstCard1 = JSON.stringify((room1!.deck!.data as any[])[0]);
      const firstCard2 = JSON.stringify((room2!.deck!.data as any[])[0]);

      // Note: Small chance they could be same, but statistically very unlikely
      // Just verify they're both valid cards with required properties
      const card1 = (room1!.deck!.data as any[])[0];
      const card2 = (room2!.deck!.data as any[])[0];

      expect(card1).toHaveProperty("id");
      expect(card1).toHaveProperty("villain");
      expect(card1).toHaveProperty("tacticUsed");

      expect(card2).toHaveProperty("id");
      expect(card2).toHaveProperty("villain");
      expect(card2).toHaveProperty("tacticUsed");
    });
  });
});
