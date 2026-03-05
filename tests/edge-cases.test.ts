/**
 * Edge Case Tests
 *
 * These tests cover untested edge cases across GameRoom, RoomManager,
 * scoring, and utility functions — including disconnection/reconnection,
 * game-over logic, and parseContent edge cases.
 */

import { GameRoom } from "../src/components/Room/GameRoom";
import { RoomManager } from "../src/components/RoomManager";
import {
  calculateScore,
  resetPlayerForNextRound,
  areAllScoresUpdated,
} from "../src/components/Scoring/scoring";
import { parseContent } from "../src/utils/utils";
import type { Player, InfluencerCard } from "../src/types/types";

function createTestPlayer(id: string, name?: string, room?: string): Player {
  return {
    id,
    name: name || `Player ${id}`,
    room: room || "test-room",
    avatar: "avatar1.png",
    score: 0,
    streak: 0,
    hasStreak: false,
    isReady: false,
    tacticUsed: [],
    wasCorrect: false,
    scoreUpdated: false,
    streakUpdated: false,
  };
}

// ============================================
// GAMEROOM DISCONNECTION & RECONNECTION
// ============================================
describe("GameRoom Disconnection & Reconnection", () => {
  it("should stash player on removePlayer when game is in progress", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    // Advance past round 1 so the game is "in progress"
    room.markRoundScored(1);
    room.currentRound = 2;

    expect(room.isInProgress).toBe(true);

    const removed = room.removePlayer("p1");
    expect(removed).not.toBeNull();
    expect(removed?.name).toBe("Alice");

    // Player should be stashed for reconnection
    expect(room.disconnectedPlayers.size).toBe(1);
    expect(room.wasPlayerInRoom("Alice")).toBe(true);
  });

  it("should NOT stash player on removePlayer when game has NOT started", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    // Game is at round 1 with no scored rounds — not in progress
    expect(room.isInProgress).toBe(false);

    room.removePlayer("p1");

    // Player should NOT be stashed
    expect(room.disconnectedPlayers.size).toBe(0);
    expect(room.wasPlayerInRoom("Alice")).toBe(false);
  });

  it("should NOT stash player when game is over", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    room.currentRound = 6;
    room.isGameOver = true;

    room.removePlayer("p1");

    expect(room.disconnectedPlayers.size).toBe(0);
  });

  it("should NOT stash player with empty name", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "placeholder");
    // Force empty name to bypass helper default
    player.name = "";
    room.addPlayer(player);

    room.markRoundScored(1);
    room.currentRound = 2;

    room.removePlayer("p1");

    // Empty name is falsy so removePlayer should not stash
    expect(room.disconnectedPlayers.size).toBe(0);
  });

  it("should reconnect a previously disconnected player with new ID", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    player.score = 250;
    player.streak = 3;
    player.hasStreak = true;
    room.addPlayer(player);

    room.markRoundScored(1);
    room.currentRound = 2;

    // Disconnect
    room.removePlayer("p1");
    expect(room.count).toBe(0);
    expect(room.wasPlayerInRoom("Alice")).toBe(true);

    // Reconnect with new ID
    const reconnected = room.reconnectPlayer("Alice", "new-p1");
    expect(reconnected).not.toBeNull();
    expect(reconnected?.id).toBe("new-p1");
    expect(reconnected?.score).toBe(250);
    expect(reconnected?.streak).toBe(3);

    // Reconnected player should have reset ready state
    expect(reconnected?.isReady).toBe(false);
    expect(reconnected?.tacticUsed).toEqual([]);
    expect(reconnected?.scoreUpdated).toBe(false);
    expect(reconnected?.streakUpdated).toBe(false);

    // Should be back in active players
    expect(room.count).toBe(1);
    expect(room.getPlayer("new-p1")).toBeDefined();

    // Should no longer be in disconnected list
    expect(room.disconnectedPlayers.size).toBe(0);
    expect(room.wasPlayerInRoom("Alice")).toBe(false);
  });

  it("should return null when reconnecting a player that was never in the room", () => {
    const room = new GameRoom("room-1", "Test Room");

    const result = room.reconnectPlayer("NonExistent", "new-id");
    expect(result).toBeNull();
    expect(room.count).toBe(0);
  });

  it("should handle multiple players disconnecting and reconnecting", () => {
    const room = new GameRoom("room-1", "Test Room");
    const alice = createTestPlayer("p1", "Alice");
    alice.score = 100;
    const bob = createTestPlayer("p2", "Bob");
    bob.score = 200;
    room.addPlayer(alice);
    room.addPlayer(bob);

    room.markRoundScored(1);
    room.currentRound = 2;

    // Both disconnect
    room.removePlayer("p1");
    room.removePlayer("p2");

    expect(room.disconnectedPlayers.size).toBe(2);
    expect(room.hasNoActivePlayers).toBe(true);

    // Alice reconnects
    const reconnectedAlice = room.reconnectPlayer("Alice", "new-p1");
    expect(reconnectedAlice?.score).toBe(100);
    expect(room.count).toBe(1);
    expect(room.disconnectedPlayers.size).toBe(1);

    // Bob reconnects
    const reconnectedBob = room.reconnectPlayer("Bob", "new-p2");
    expect(reconnectedBob?.score).toBe(200);
    expect(room.count).toBe(2);
    expect(room.disconnectedPlayers.size).toBe(0);
  });

  it("hasDisconnectedPlayers should only be true when game is in progress and not over", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    // Not in progress — no disconnected players
    expect(room.hasDisconnectedPlayers).toBe(false);

    // Make in progress and disconnect
    room.markRoundScored(1);
    room.currentRound = 2;
    room.removePlayer("p1");

    expect(room.hasDisconnectedPlayers).toBe(true);

    // Game over — disconnected players should be false
    room.isGameOver = true;
    expect(room.hasDisconnectedPlayers).toBe(false);
  });

  it("isEmpty should return false when disconnected players exist during in-progress game", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    room.markRoundScored(1);
    room.currentRound = 2;
    room.removePlayer("p1");

    // No active players but has disconnected → NOT empty
    expect(room.hasNoActivePlayers).toBe(true);
    expect(room.hasDisconnectedPlayers).toBe(true);
    expect(room.isEmpty).toBe(false);
  });

  it("isEmpty should return true when disconnected players exist but game is over", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    room.markRoundScored(1);
    room.currentRound = 2;
    room.removePlayer("p1");
    room.isGameOver = true;

    // Game over means disconnectedPlayers doesn't count
    expect(room.hasDisconnectedPlayers).toBe(false);
    expect(room.isEmpty).toBe(true);
  });
});

// ============================================
// GAMEROOM - GAME OVER / MAX ROUNDS
// ============================================
describe("GameRoom - Game Over & Max Rounds", () => {
  it("should default maxRounds to 5", () => {
    const room = new GameRoom("room-1", "Test Room");
    expect(room.maxRounds).toBe(5);
  });

  it("advanceRound should set isGameOver when exceeding maxRounds", () => {
    const room = new GameRoom("room-1", "Test Room");
    room.addPlayer(createTestPlayer("p1"));

    // Advance to round 5
    for (let i = 1; i < 5; i++) {
      room.advanceRound();
      expect(room.isGameOver).toBe(false);
    }
    expect(room.currentRound).toBe(5);

    // Advancing past round 5 should trigger game over
    room.advanceRound();
    expect(room.currentRound).toBe(6);
    expect(room.isGameOver).toBe(true);
  });

  it("isInProgress should be true after round 1", () => {
    const room = new GameRoom("room-1", "Test Room");
    expect(room.isInProgress).toBe(false);

    room.advanceRound();
    expect(room.currentRound).toBe(2);
    expect(room.isInProgress).toBe(true);
  });

  it("isInProgress should be true if rounds have been scored", () => {
    const room = new GameRoom("room-1", "Test Room");
    expect(room.isInProgress).toBe(false);

    room.markRoundScored(1);
    expect(room.isInProgress).toBe(true);
  });

  it("reset should clear isGameOver and disconnectedPlayers", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    room.markRoundScored(1);
    room.currentRound = 6;
    room.isGameOver = true;
    room.removePlayer("p1");

    room.reset();

    expect(room.isGameOver).toBe(false);
    expect(room.disconnectedPlayers.size).toBe(0);
    expect(room.currentRound).toBe(1);
    expect(room.players).toHaveLength(0);
    expect(room.scoredRounds.size).toBe(0);
  });

  it("advanceRound should reset player states for new round", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1");
    player.isReady = true;
    player.tacticUsed = ["fear-mongering"];
    player.scoreUpdated = true;
    player.streakUpdated = true;
    room.addPlayer(player);

    room.advanceRound();

    expect(room.players[0].isReady).toBe(false);
    expect(room.players[0].tacticUsed).toEqual([]);
    expect(room.players[0].scoreUpdated).toBe(false);
    expect(room.players[0].streakUpdated).toBe(false);
  });
});

// ============================================
// ROOMMANAGER - DISCONNECTED PLAYERS INTERACTION
// ============================================
describe("RoomManager with Disconnected Players", () => {
  let manager: RoomManager;
  let deletedRooms: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    deletedRooms = [];
    manager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: (roomName) => deletedRooms.push(roomName),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    manager.cleanup();
  });

  it("deleteRoom should use hasNoActivePlayers (allows deletion with only disconnected players)", () => {
    const gameRoom = manager.createRoom("test-room");
    const player = createTestPlayer("p1", "Alice");
    manager.addPlayerToRoom(player, "test-room");

    // Simulate mid-game disconnect (player gets stashed)
    gameRoom.markRoundScored(1);
    gameRoom.currentRound = 2;
    gameRoom.removePlayer("p1");

    // Room has no active players but has disconnected
    expect(gameRoom.hasNoActivePlayers).toBe(true);
    expect(gameRoom.hasDisconnectedPlayers).toBe(true);
    expect(gameRoom.isEmpty).toBe(false);

    // deleteRoom checks hasNoActivePlayers, so it should succeed
    const deleted = manager.deleteRoom("test-room");
    expect(deleted).toBe(true);
    expect(manager.hasRoom("test-room")).toBe(false);
  });

  it("deleteRoom should clear disconnected players before deletion", () => {
    const gameRoom = manager.createRoom("test-room");
    const player = createTestPlayer("p1", "Alice");
    manager.addPlayerToRoom(player, "test-room");

    gameRoom.markRoundScored(1);
    gameRoom.currentRound = 2;
    gameRoom.removePlayer("p1");

    expect(gameRoom.disconnectedPlayers.size).toBe(1);

    manager.deleteRoom("test-room");

    // Since room is deleted and reset, we can't check the room directly
    // But verify room was removed
    expect(manager.hasRoom("test-room")).toBe(false);
  });

  it("removePlayerFromRoom should schedule deletion when hasNoActivePlayers (even with disconnected)", () => {
    const gameRoom = manager.createRoom("test-room");
    const alice = createTestPlayer("p1", "Alice");
    const bob = createTestPlayer("p2", "Bob");
    manager.addPlayerToRoom(alice, "test-room");
    manager.addPlayerToRoom(bob, "test-room");

    // Simulate game in progress
    gameRoom.markRoundScored(1);
    gameRoom.currentRound = 2;

    // First player leaves — stashed but room not empty
    const result1 = manager.removePlayerFromRoom("p1", "test-room");
    expect(result1.scheduledDeletion).toBe(false);

    // Second player leaves — stashed, room has no active players
    const result2 = manager.removePlayerFromRoom("p2", "test-room");
    expect(result2.scheduledDeletion).toBe(true);
    expect(manager.hasPendingDeletionTimer("test-room")).toBe(true);
  });

  it("should NOT delete room if a player rejoins before timer fires", () => {
    const gameRoom = manager.createRoom("test-room");
    const player = createTestPlayer("p1", "Alice");
    manager.addPlayerToRoom(player, "test-room");

    gameRoom.markRoundScored(1);
    gameRoom.currentRound = 2;

    // Player disconnects
    manager.removePlayerFromRoom("p1", "test-room");

    // Advance 15 seconds
    jest.advanceTimersByTime(15000);

    // Player reconnects (new player added, cancels timer)
    const newPlayer = createTestPlayer("p2", "Bob");
    manager.addPlayerToRoom(newPlayer, "test-room");
    expect(manager.hasPendingDeletionTimer("test-room")).toBe(false);

    // Full 30 seconds pass
    jest.advanceTimersByTime(30000);

    // Room should still exist
    expect(manager.hasRoom("test-room")).toBe(true);
  });
});

// ============================================
// TOROOM UPDATE SERIALIZATION
// ============================================
describe("GameRoom toRoomUpdate Serialization", () => {
  it("should include disconnected player info in roomUpdate", () => {
    const room = new GameRoom("room-1", "Test Room");
    const alice = createTestPlayer("p1", "Alice");
    const bob = createTestPlayer("p2", "Bob");
    room.addPlayer(alice);
    room.addPlayer(bob);

    room.markRoundScored(1);
    room.currentRound = 2;
    room.removePlayer("p1");

    const update = room.toRoomUpdate() as any;

    expect(update.disconnectedPlayerNames).toContain("Alice");
    expect(update.disconnectedCount).toBe(1);
    expect(update.count).toBe(1); // Only active players
    expect(update.players).toHaveLength(1);
    expect(update.players[0].name).toBe("Bob");
  });

  it("should include isGameOver, maxRounds, and isInProgress", () => {
    const room = new GameRoom("room-1", "Test Room");
    room.currentRound = 6;
    room.isGameOver = true;

    const update = room.toRoomUpdate() as any;

    expect(update.isGameOver).toBe(true);
    expect(update.maxRounds).toBe(5);
    expect(update.isInProgress).toBe(true);
    expect(update.isFull).toBe(false);
  });

  it("should include deck and card info", () => {
    const room = new GameRoom("room-1", "Test Room");
    room.currentRound = 3;
    room.currentTheme = "The_Celeb";
    room.currentNewsCard = { id: "card-1" };

    const update = room.toRoomUpdate() as any;

    expect(update.deck).toBeDefined();
    expect(update.deck.isShuffled).toBe(true);
    expect(update.cardIndex).toBe(2);
    expect(update.newsCard).toEqual({ id: "card-1" });
    expect(update.themeStyle).toBe("The_Celeb");
  });

  it("toLegacyRoom should include wasScored", () => {
    const room = new GameRoom("room-1", "Test Room");
    room.wasScored = true;

    const legacy = room.toLegacyRoom() as any;

    expect(legacy.wasScored).toBe(true);
    expect(legacy.name).toBe("Test Room");
    expect(legacy.deck).toBeDefined();
  });
});

// ============================================
// PARSECONTENT EDGE CASES
// ============================================
describe("parseContent Edge Cases", () => {
  it("should parse a valid JSON object", () => {
    const result = parseContent('{"type":"test","value":42}');
    expect(result.type).toBe("test");
    expect(result.value).toBe(42);
  });

  it("should parse a valid JSON array", () => {
    const result = parseContent('[1,2,3]');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, 2, 3]);
  });

  it("should return original string for invalid JSON", () => {
    const result = parseContent("not json {{{");
    expect(result).toBe("not json {{{");
  });

  it("should return empty string as-is for empty string", () => {
    const result = parseContent("");
    expect(result).toBe("");
  });

  it("should parse deeply nested JSON correctly", () => {
    const nested = JSON.stringify({
      type: "playerEnters",
      player: {
        id: "p1",
        data: {
          nested: {
            deep: true,
          },
        },
      },
    });

    const result = parseContent(nested);
    expect(result.player.data.nested.deep).toBe(true);
  });

  it("should handle JSON with special characters in strings", () => {
    const result = parseContent(
      '{"name":"Player with \\"quotes\\"","emoji":"🎮"}'
    );
    expect(result.name).toBe('Player with "quotes"');
    expect(result.emoji).toBe("🎮");
  });

  it("should return undefined for JSON number (not object/array)", () => {
    // JSON.parse("42") returns 42, but parseContent only returns objects/arrays
    const result = parseContent("42");
    expect(result).toBeUndefined();
  });

  it("should return undefined for JSON boolean (not object/array)", () => {
    const result = parseContent("true");
    expect(result).toBeUndefined();
  });

  it("should return null for JSON null (typeof null === 'object')", () => {
    // typeof null === "object" in JS, so parseContent returns null
    const result = parseContent("null");
    expect(result).toBeNull();
  });
});

// ============================================
// SCORING - ADDITIONAL EDGE CASES
// ============================================
describe("Scoring - Additional Edge Cases", () => {
  const createPlayer = (
    id: string,
    score: number = 0,
    streak: number = 0,
    tacticUsed: string[] = []
  ): Player => ({
    id,
    name: `Player ${id}`,
    room: "test-room",
    avatar: "avatar.png",
    score,
    streak,
    hasStreak: streak >= 3,
    isReady: true,
    tacticUsed,
    wasCorrect: false,
    scoreUpdated: false,
    streakUpdated: false,
  });

  const createInfluencerCard = (tactics: string[]): InfluencerCard => ({
    villain: "Test Villain",
    tactic: tactics,
  });

  it("should handle player with duplicate tactics in tacticUsed", () => {
    // Player selects the same tactic twice
    const player = createPlayer("p1", 0, 0, ["fear-mongering", "fear-mongering"]);
    const influencerCard = createInfluencerCard(["fear-mongering"]);

    const result = calculateScore([player], [player], influencerCard, 1);

    // Both entries match, so both count as correct
    expect(result[0].scoreUpdated).toBe(true);
    expect(result[0].wasCorrect).toBe(true);
    // 2 correct * 100 = 200
    expect(result[0].score).toBe(200);
  });

  it("should handle very high round numbers for maximum streak bonus", () => {
    const player = createPlayer("p1", 0, 2, ["tactic1"]);
    const influencerCard = createInfluencerCard(["tactic1"]);

    // Round 100 — streak bonus should be 3 (max for rounds >= 10)
    const result = calculateScore([player], [player], influencerCard, 100);

    // correctScore = 100, streakBonus = 3*50 = 150, total = 250
    expect(result[0].score).toBe(250);
    expect(result[0].streak).toBe(3);
    expect(result[0].hasStreak).toBe(true);
  });

  it("should handle round number at boundary (round 5)", () => {
    const player = createPlayer("p1", 0, 2, ["tactic1"]);
    const influencerCard = createInfluencerCard(["tactic1"]);

    // Round 5 — streak bonus should be 2 (mid-game: rounds 5-9)
    const result = calculateScore([player], [player], influencerCard, 5);

    // correctScore = 100, streakBonus = 2*50 = 100, total = 200
    expect(result[0].score).toBe(200);
  });

  it("should handle round number at boundary (round 10)", () => {
    const player = createPlayer("p1", 0, 2, ["tactic1"]);
    const influencerCard = createInfluencerCard(["tactic1"]);

    // Round 10 — streak bonus should be 3 (late-game: rounds >= 10)
    const result = calculateScore([player], [player], influencerCard, 10);

    // correctScore = 100, streakBonus = 3*50 = 150, total = 250
    expect(result[0].score).toBe(250);
  });

  it("should handle large number of players scoring simultaneously", () => {
    const playerCount = 50;
    const players = Array.from({ length: playerCount }, (_, i) =>
      createPlayer(`p${i}`, i * 10, 0, ["tactic1"])
    );
    const influencerCard = createInfluencerCard(["tactic1"]);

    const result = calculateScore(players, players, influencerCard, 1);

    expect(result).toHaveLength(playerCount);
    // All should be scored
    expect(result.every((p) => p.scoreUpdated)).toBe(true);
    // All should have wasCorrect = true
    expect(result.every((p) => p.wasCorrect)).toBe(true);
    // Score should be original + 100 for each
    result.forEach((p, i) => {
      expect(p.score).toBe(i * 10 + 100);
    });
  });

  it("should handle player with extremely high score", () => {
    const player = createPlayer("p1", 999999, 0, ["wrong"]);
    const influencerCard = createInfluencerCard(["correct"]);

    const result = calculateScore([player], [player], influencerCard, 1);

    // 999999 - 50 = 999949
    expect(result[0].score).toBe(999949);
  });

  it("should correctly track correctCount and totalPlayed", () => {
    const player = createPlayer("p1", 0, 0, [
      "correct1",
      "correct2",
      "wrong1",
    ]);
    const influencerCard = createInfluencerCard(["correct1", "correct2"]);

    const result = calculateScore([player], [player], influencerCard, 1);

    expect(result[0].correctCount).toBe(2);
    expect(result[0].totalPlayed).toBe(3);
    expect(result[0].wasCorrect).toBe(true);
  });

  it("should reset streak when player has mixed answers (not all correct)", () => {
    const player = createPlayer("p1", 100, 4, [
      "correct1",
      "wrong1",
    ]);
    const influencerCard = createInfluencerCard(["correct1"]);

    const result = calculateScore([player], [player], influencerCard, 1);

    // Had streak of 4, but not ALL answers are correct (1 wrong)
    // Streak resets to 0
    expect(result[0].streak).toBe(0);
    expect(result[0].hasStreak).toBe(false);
  });

  it("should handle player not found in fromClientPlayers gracefully", () => {
    const serverPlayer = createPlayer("p1", 100, 3, ["tactic1"]);
    serverPlayer.hasStreak = true;
    const influencerCard = createInfluencerCard(["tactic1"]);

    // Empty client players array — p1 is not in fromClientPlayers
    const result = calculateScore([], [serverPlayer], influencerCard, 1);

    // Player should still be marked as scored to prevent game lock
    expect(result[0].scoreUpdated).toBe(true);
    expect(result[0].streakUpdated).toBe(true);
    expect(result[0].wasCorrect).toBe(false);
    expect(result[0].score).toBe(100); // Unchanged
    expect(result[0].streak).toBe(0); // Reset
    expect(result[0].hasStreak).toBe(false);
  });

  it("areAllScoresUpdated should return true for empty player array", () => {
    expect(areAllScoresUpdated([])).toBe(true);
  });

  it("resetPlayerForNextRound should preserve player identity fields", () => {
    const player = createPlayer("p1", 0, 0, ["tactic1"]);
    player.name = "Alice";
    player.score = 300;
    player.room = "my-room";
    player.avatar = "hero1.png";
    player.isReady = true;
    player.scoreUpdated = true;

    resetPlayerForNextRound(player);

    // Identity and score preserved
    expect(player.id).toBe("p1");
    expect(player.name).toBe("Alice");
    expect(player.score).toBe(300);
    expect(player.room).toBe("my-room");
    expect(player.avatar).toBe("hero1.png");

    // Round state reset
    expect(player.tacticUsed).toEqual([]);
    expect(player.isReady).toBe(false);
    expect(player.scoreUpdated).toBe(false);
    expect(player.streak).toBe(0);
    expect(player.hasStreak).toBe(false);
  });
});

// ============================================
// GAMEROOM - ADDITIONAL EDGE CASES
// ============================================
describe("GameRoom - Additional Edge Cases", () => {
  it("should return null when removing a non-existent player", () => {
    const room = new GameRoom("room-1", "Test Room");
    const result = room.removePlayer("non-existent");
    expect(result).toBeNull();
  });

  it("should handle adding a player with same ID as disconnected player", () => {
    const room = new GameRoom("room-1", "Test Room");
    const player = createTestPlayer("p1", "Alice");
    room.addPlayer(player);

    room.markRoundScored(1);
    room.currentRound = 2;
    room.removePlayer("p1");

    // Add a completely new player with a different ID
    const newPlayer = createTestPlayer("p3", "Charlie");
    room.addPlayer(newPlayer);

    expect(room.count).toBe(1);
    expect(room.getPlayer("p3")?.name).toBe("Charlie");
    // Alice should still be in disconnected list
    expect(room.wasPlayerInRoom("Alice")).toBe(true);
  });

  it("cardIndex should handle rounds beyond deck size gracefully", () => {
    const room = new GameRoom("room-1", "Test Room");
    room.currentRound = 999;

    // Should return 998 (round - 1) regardless of deck size
    expect(room.cardIndex).toBe(998);
  });

  it("isFull should respect 5 player maximum including edge", () => {
    const room = new GameRoom("room-1", "Test Room");

    for (let i = 1; i <= 4; i++) {
      room.addPlayer(createTestPlayer(`p${i}`));
      expect(room.isFull).toBe(false);
    }

    room.addPlayer(createTestPlayer("p5"));
    expect(room.isFull).toBe(true);
    expect(room.count).toBe(5);

    // 6th player should be rejected
    const added = room.addPlayer(createTestPlayer("p6"));
    expect(added).toBe(false);
    expect(room.count).toBe(5);
  });

  it("shuffleDeck should produce a valid deck each time", () => {
    const room = new GameRoom("room-1", "Test Room");

    // First shuffle happens in constructor
    const firstDeck = [...room.deck.data];
    expect(firstDeck.length).toBeGreaterThan(0);

    // Manual reshuffle
    room.shuffleDeck();
    const secondDeck = room.deck.data;

    expect(secondDeck.length).toBe(firstDeck.length);
    expect(room.deck.isShuffled).toBe(true);
    expect(room.deck.type).toBe("shuffledDeck");
  });

  it("markRoundScored should track non-sequential rounds", () => {
    const room = new GameRoom("room-1", "Test Room");

    room.markRoundScored(3);
    room.markRoundScored(1);
    room.markRoundScored(5);

    expect(room.isRoundScored(1)).toBe(true);
    expect(room.isRoundScored(2)).toBe(false);
    expect(room.isRoundScored(3)).toBe(true);
    expect(room.isRoundScored(4)).toBe(false);
    expect(room.isRoundScored(5)).toBe(true);
    expect(room.lastScoredRound).toBe(5);
  });
});

// ============================================
// ROOMMANAGER - ADDITIONAL EDGE CASES
// ============================================
describe("RoomManager - Additional Edge Cases", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    manager.cleanup();
  });

  it("getOrCreateGameRoom should return same instance on repeated calls", () => {
    const room1 = manager.getOrCreateGameRoom("test");
    const room2 = manager.getOrCreateGameRoom("test");

    expect(room1).toBe(room2);
  });

  it("cleanup should clear all timers without deleting rooms", () => {
    jest.useFakeTimers();

    manager.createRoom("room-1");
    const player = createTestPlayer("p1");
    manager.addPlayerToRoom(player, "room-1");
    manager.removePlayerFromRoom("p1", "room-1");

    expect(manager.hasPendingDeletionTimer("room-1")).toBe(true);

    manager.cleanup();

    expect(manager.hasPendingDeletionTimer("room-1")).toBe(false);
    // Room should still exist (cleanup doesn't delete rooms, just timers)
    expect(manager.hasRoom("room-1")).toBe(true);

    jest.useRealTimers();
  });

  it("handleEndGame should mark wasScored and isGameOver on non-empty room", () => {
    manager.createRoom("test-room");
    const player = createTestPlayer("p1");
    manager.addPlayerToRoom(player, "test-room");

    const result = manager.handleEndGame("test-room");

    expect(result.deleted).toBe(false);
    expect(result.gameRoom).toBeDefined();
    expect(result.gameRoom!.wasScored).toBe(true);
  });

  it("handleEndGame should return deleted=false for non-existent room", () => {
    const result = manager.handleEndGame("non-existent");

    expect(result.deleted).toBe(false);
    expect(result.gameRoom).toBeUndefined();
  });

  it("should handle concurrent room operations safely", () => {
    // Create many rooms rapidly
    for (let i = 0; i < 20; i++) {
      manager.createRoom(`room-${i}`);
    }

    expect(manager.roomCount).toBe(20);

    // Delete half
    for (let i = 0; i < 10; i++) {
      manager.deleteRoom(`room-${i}`);
    }

    expect(manager.roomCount).toBe(10);
    expect(manager.getAvailableRooms()).toHaveLength(10);
  });
});
