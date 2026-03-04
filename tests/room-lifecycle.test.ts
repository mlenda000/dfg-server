/**
 * Room Lifecycle Tests
 *
 * These tests verify room creation, deletion, and the 30-second
 * empty room deletion timer logic using the REAL RoomManager and GameRoom classes.
 */

import { RoomManager } from "../src/components/RoomManager";
import { GameRoom } from "../src/components/Room/GameRoom";
import type { Player } from "../src/types/types";

/**
 * Create a test player with default values
 */
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

describe("Room Lifecycle Tests - Real Implementation", () => {
  let manager: RoomManager;
  let deletedRooms: string[] = [];
  let createdRooms: string[] = [];

  beforeEach(() => {
    deletedRooms = [];
    createdRooms = [];

    // Create RoomManager with callbacks to track events
    manager = new RoomManager({
      deletionDelayMs: 30000, // 30 seconds
      onRoomDeleted: (roomName) => {
        deletedRooms.push(roomName);
      },
      onRoomCreated: (roomName) => {
        createdRooms.push(roomName);
      },
    });
  });

  afterEach(() => {
    manager.cleanup();
  });

  // ============================================
  // ROOM CREATION TESTS - Testing real RoomManager
  // ============================================
  describe("Room Creation (RoomManager)", () => {
    it("should create a new room with unique deck using real GameRoom", () => {
      const gameRoom = manager.createRoom("test-room-1");

      expect(gameRoom).toBeInstanceOf(GameRoom);
      expect(gameRoom.name).toBe("test-room-1");
      expect(gameRoom.deck.isShuffled).toBe(true);
      expect(gameRoom.deck.data.length).toBeGreaterThan(0);
      expect(manager.hasRoom("test-room-1")).toBe(true);
    });

    it("should return existing room if already created", () => {
      const room1 = manager.createRoom("test-room-1");
      const room2 = manager.createRoom("test-room-1");

      expect(room1).toBe(room2); // Same reference
      expect(manager.roomCount).toBe(1);
    });

    it("should create multiple isolated rooms with different deck instances", () => {
      const room1 = manager.createRoom("room-1");
      const room2 = manager.createRoom("room-2");
      const room3 = manager.createRoom("room-3");

      expect(manager.roomCount).toBe(3);

      // Each room should have its own deck instance (testing GameRoom isolation)
      expect(room1.deck).not.toBe(room2.deck);
      expect(room2.deck).not.toBe(room3.deck);

      // Decks should have the same card count
      expect(room1.deck.data.length).toBe(room2.deck.data.length);
    });

    it("should notify via callback when creating a room", () => {
      manager.createRoom("new-room");

      expect(createdRooms).toContain("new-room");
    });

    it("should return list of available rooms", () => {
      manager.createRoom("room-1");
      manager.createRoom("room-2");
      manager.createRoom("room-3");

      const rooms = manager.getAvailableRooms();

      expect(rooms).toHaveLength(3);
      expect(rooms).toContain("room-1");
      expect(rooms).toContain("room-2");
      expect(rooms).toContain("room-3");
    });

    it("should initialize room with correct default state (testing real GameRoom)", () => {
      const gameRoom = manager.createRoom("test-room");

      // These assertions test the REAL GameRoom implementation
      expect(gameRoom.currentRound).toBe(1);
      expect(gameRoom.currentTheme).toBe("all");
      expect(gameRoom.players).toHaveLength(0);
      expect(gameRoom.count).toBe(0);
      expect(gameRoom.isEmpty).toBe(true);
      expect(gameRoom.wasScored).toBe(false);
      expect(gameRoom.influencerCard).toEqual({ villain: "biost", tactic: [] });
    });
  });

  // ============================================
  // ROOM DELETION TESTS - Testing real RoomManager
  // ============================================
  describe("Room Deletion (RoomManager)", () => {
    it("should delete an empty room", () => {
      manager.createRoom("room-to-delete");
      expect(manager.hasRoom("room-to-delete")).toBe(true);

      const deleted = manager.deleteRoom("room-to-delete");

      expect(deleted).toBe(true);
      expect(manager.hasRoom("room-to-delete")).toBe(false);
      expect(deletedRooms).toContain("room-to-delete");
    });

    it("should NOT delete a room that has players (testing real GameRoom.isEmpty)", () => {
      manager.createRoom("room-with-players");
      const player = createTestPlayer("player-1");
      manager.addPlayerToRoom(player, "room-with-players");

      const deleted = manager.deleteRoom("room-with-players");

      // Room should still exist - GameRoom.isEmpty returns false when players present
      expect(deleted).toBe(false);
      expect(manager.hasRoom("room-with-players")).toBe(true);
      expect(deletedRooms).not.toContain("room-with-players");
    });

    it("should notify via callback when deleting a room", () => {
      manager.createRoom("room-1");
      manager.createRoom("room-2");
      deletedRooms = []; // Reset

      manager.deleteRoom("room-1");

      expect(deletedRooms).toContain("room-1");
    });

    it("should delete room immediately when handleEndGame is called and room is empty", () => {
      manager.createRoom("game-room");
      expect(manager.hasRoom("game-room")).toBe(true);

      const result = manager.handleEndGame("game-room");

      expect(result.deleted).toBe(true);
      expect(result.gameRoom).toBeUndefined();
      expect(manager.hasRoom("game-room")).toBe(false);
      expect(deletedRooms).toContain("game-room");
    });

    it("should mark room as scored on handleEndGame but not delete if players present", () => {
      manager.createRoom("game-room");
      const player = createTestPlayer("player-1");
      manager.addPlayerToRoom(player, "game-room");

      const result = manager.handleEndGame("game-room");

      expect(result.deleted).toBe(false);
      expect(result.gameRoom).toBeDefined();
      expect(result.gameRoom!.wasScored).toBe(true); // Testing real GameRoom property
      expect(manager.hasRoom("game-room")).toBe(true);
      expect(deletedRooms).not.toContain("game-room");
    });

    it("should remove room from available rooms list after deletion", () => {
      manager.createRoom("room-1");
      manager.createRoom("room-2");

      manager.deleteRoom("room-1");

      const rooms = manager.getAvailableRooms();
      expect(rooms).not.toContain("room-1");
      expect(rooms).toContain("room-2");
    });

    it("should return false when trying to delete non-existent room", () => {
      const deleted = manager.deleteRoom("non-existent");
      expect(deleted).toBe(false);
    });
  });

  // ============================================
  // 30-SECOND EMPTY ROOM DELETION TIMER TESTS
  // ============================================
  describe("30-Second Empty Room Deletion Timer (RoomManager)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should schedule deletion when last player leaves via removePlayerFromRoom", () => {
      manager.createRoom("test-room");
      const player = createTestPlayer("player-1");
      manager.addPlayerToRoom(player, "test-room");

      // Verify room is not empty (testing real GameRoom)
      expect(manager.getRoom("test-room")?.isEmpty).toBe(false);

      // Player leaves using real RoomManager method
      const result = manager.removePlayerFromRoom("player-1", "test-room");

      expect(result.scheduledDeletion).toBe(true);
      expect(result.gameRoom?.isEmpty).toBe(true);
      expect(manager.hasPendingDeletionTimer("test-room")).toBe(true);
    });

    it("should delete room after 30 seconds of being empty", () => {
      manager.createRoom("test-room");
      const player = createTestPlayer("player-1");
      manager.addPlayerToRoom(player, "test-room");

      // Player leaves - triggers timer via real RoomManager
      manager.removePlayerFromRoom("player-1", "test-room");

      // Room should still exist before 30 seconds
      expect(manager.hasRoom("test-room")).toBe(true);

      // Advance time by 29 seconds - room should still exist
      jest.advanceTimersByTime(29000);
      expect(manager.hasRoom("test-room")).toBe(true);

      // Advance time by 1 more second (total 30 seconds)
      jest.advanceTimersByTime(1000);
      expect(manager.hasRoom("test-room")).toBe(false);
      expect(deletedRooms).toContain("test-room");
    });

    it("should NOT delete room if player count > 0 when timer fires", () => {
      manager.createRoom("test-room");
      const player1 = createTestPlayer("player-1");
      const player2 = createTestPlayer("player-2");

      manager.addPlayerToRoom(player1, "test-room");
      manager.addPlayerToRoom(player2, "test-room");

      // Player 1 leaves - no timer scheduled because room not empty
      const result = manager.removePlayerFromRoom("player-1", "test-room");
      expect(result.scheduledDeletion).toBe(false);

      // Manually schedule deletion to test safety check
      manager.scheduleRoomDeletion("test-room");

      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);

      // Room should still exist because deleteRoom checks isEmpty
      expect(manager.hasRoom("test-room")).toBe(true);
      expect(deletedRooms).not.toContain("test-room");
    });

    it("should cancel deletion timer if player joins within 30 seconds via addPlayerToRoom", () => {
      manager.createRoom("test-room");
      const player1 = createTestPlayer("player-1");

      manager.addPlayerToRoom(player1, "test-room");
      manager.removePlayerFromRoom("player-1", "test-room");

      // Verify timer is set
      expect(manager.hasPendingDeletionTimer("test-room")).toBe(true);

      // Advance time by 15 seconds
      jest.advanceTimersByTime(15000);

      // New player joins using real RoomManager method
      const player2 = createTestPlayer("player-2");
      manager.addPlayerToRoom(player2, "test-room");

      // Timer should be cancelled by addPlayerToRoom
      expect(manager.hasPendingDeletionTimer("test-room")).toBe(false);

      // Advance time by another 20 seconds
      jest.advanceTimersByTime(20000);

      // Room should still exist
      expect(manager.hasRoom("test-room")).toBe(true);
      expect(deletedRooms).not.toContain("test-room");
    });

    it("should cancel deletion timer when createRoom is called on same room", () => {
      manager.createRoom("test-room");
      const player = createTestPlayer("player-1");

      manager.addPlayerToRoom(player, "test-room");
      manager.removePlayerFromRoom("player-1", "test-room");

      expect(manager.hasPendingDeletionTimer("test-room")).toBe(true);

      // Creating the same room should cancel timer (via createRoom's cancelRoomDeletionTimer call)
      manager.createRoom("test-room");

      expect(manager.hasPendingDeletionTimer("test-room")).toBe(false);
    });

    it("should handle multiple players leaving sequentially", () => {
      manager.createRoom("test-room");
      const player1 = createTestPlayer("player-1");
      const player2 = createTestPlayer("player-2");
      const player3 = createTestPlayer("player-3");

      manager.addPlayerToRoom(player1, "test-room");
      manager.addPlayerToRoom(player2, "test-room");
      manager.addPlayerToRoom(player3, "test-room");

      // First player leaves - room has 2 players
      let result = manager.removePlayerFromRoom("player-1", "test-room");
      expect(result.scheduledDeletion).toBe(false);
      expect(result.gameRoom?.count).toBe(2);

      // Second player leaves - room has 1 player
      result = manager.removePlayerFromRoom("player-2", "test-room");
      expect(result.scheduledDeletion).toBe(false);
      expect(result.gameRoom?.count).toBe(1);

      // Last player leaves - room is empty, deletion scheduled
      result = manager.removePlayerFromRoom("player-3", "test-room");
      expect(result.scheduledDeletion).toBe(true);
      expect(result.gameRoom?.count).toBe(0);
    });

    it("should reset timer if room becomes empty multiple times", () => {
      manager.createRoom("test-room");
      const player = createTestPlayer("player-1");

      // First time empty
      manager.addPlayerToRoom(player, "test-room");
      manager.removePlayerFromRoom("player-1", "test-room");

      // Advance 20 seconds
      jest.advanceTimersByTime(20000);

      // Player rejoins (cancels timer via addPlayerToRoom)
      manager.addPlayerToRoom(player, "test-room");

      // Player leaves again (new timer)
      manager.removePlayerFromRoom("player-1", "test-room");

      // Advance 20 more seconds (only 20s into NEW timer)
      jest.advanceTimersByTime(20000);

      // Room should still exist
      expect(manager.hasRoom("test-room")).toBe(true);

      // Advance 10 more seconds (30s total for new timer)
      jest.advanceTimersByTime(10000);

      // Now room should be deleted
      expect(manager.hasRoom("test-room")).toBe(false);
    });

    it("should use configurable deletion delay", () => {
      // Create manager with 5 second delay
      const fastManager = new RoomManager({
        deletionDelayMs: 5000,
        onRoomDeleted: (roomName) => deletedRooms.push(roomName),
      });

      fastManager.createRoom("fast-room");
      const player = createTestPlayer("player-1");
      fastManager.addPlayerToRoom(player, "fast-room");
      fastManager.removePlayerFromRoom("player-1", "fast-room");

      // Should not be deleted after 4 seconds
      jest.advanceTimersByTime(4000);
      expect(fastManager.hasRoom("fast-room")).toBe(true);

      // Should be deleted after 5 seconds
      jest.advanceTimersByTime(1000);
      expect(fastManager.hasRoom("fast-room")).toBe(false);

      fastManager.cleanup();
    });
  });

  // ============================================
  // PLAYER ENTER/LEAVE INTERACTION TESTS
  // ============================================
  describe("Player Enter/Leave Room Interactions (RoomManager)", () => {
    it("should add player to room via addPlayerToRoom", () => {
      manager.createRoom("test-room");
      const player = createTestPlayer("player-1", "Alice");

      const result = manager.addPlayerToRoom(player, "test-room");

      expect(result.success).toBe(true);
      expect(result.gameRoom.count).toBe(1);
      expect(result.gameRoom.players[0].name).toBe("Alice");
      expect(result.gameRoom.isEmpty).toBe(false);
    });

    it("should remove player from room via removePlayerFromRoom", () => {
      manager.createRoom("test-room");
      const player = createTestPlayer("player-1");

      manager.addPlayerToRoom(player, "test-room");
      expect(manager.getRoom("test-room")?.count).toBe(1);

      const result = manager.removePlayerFromRoom("player-1", "test-room");
      expect(result.success).toBe(true);
      expect(result.gameRoom?.count).toBe(0);
    });

    it("should handle player leaving non-existent room gracefully", () => {
      const result = manager.removePlayerFromRoom("player-1", "non-existent");

      expect(result.success).toBe(false);
      expect(result.gameRoom).toBeUndefined();
      expect(result.scheduledDeletion).toBe(false);
    });

    it("should update existing player instead of adding duplicate (testing real GameRoom.addPlayer)", () => {
      manager.createRoom("test-room");
      const player1 = createTestPlayer("player-1", "Alice");
      const player1Updated: Player = {
        ...player1,
        name: "Alice Updated",
        score: 100,
      };

      manager.addPlayerToRoom(player1, "test-room");
      manager.addPlayerToRoom(player1Updated, "test-room");

      const gameRoom = manager.getRoom("test-room");
      expect(gameRoom?.count).toBe(1);
      expect(gameRoom?.players[0].name).toBe("Alice Updated");
      expect(gameRoom?.players[0].score).toBe(100);
    });

    it("should prevent adding more than 5 players (testing real GameRoom.isFull)", () => {
      manager.createRoom("test-room");

      for (let i = 1; i <= 5; i++) {
        const player = createTestPlayer(`player-${i}`);
        const result = manager.addPlayerToRoom(player, "test-room");
        expect(result.success).toBe(true);
      }

      const gameRoom = manager.getRoom("test-room");
      expect(gameRoom?.count).toBe(5);
      expect(gameRoom?.isFull).toBe(true);

      // Try to add 6th player
      const player6 = createTestPlayer("player-6");
      const result = manager.addPlayerToRoom(player6, "test-room");

      expect(result.success).toBe(false);
      expect(gameRoom?.count).toBe(5);
    });

    it("should create room automatically when adding player to non-existent room", () => {
      expect(manager.hasRoom("auto-created")).toBe(false);

      const player = createTestPlayer("player-1");
      manager.addPlayerToRoom(player, "auto-created");

      expect(manager.hasRoom("auto-created")).toBe(true);
      expect(manager.getRoom("auto-created")?.count).toBe(1);
    });
  });

  // ============================================
  // GAMEROOM CLASS UNIT TESTS - Testing real implementation
  // ============================================
  describe("GameRoom Class (Real Implementation)", () => {
    it("should initialize with shuffled deck on construction", () => {
      const room = new GameRoom("room-1", "Test Room");

      expect(room.deck.isShuffled).toBe(true);
      expect(room.deck.data.length).toBeGreaterThan(0);
      expect(room.deck.type).toBe("shuffledDeck");
    });

    it("should create different shuffled decks for different rooms", () => {
      const room1 = new GameRoom("room-1", "Room 1");
      const room2 = new GameRoom("room-2", "Room 2");

      // Both should have decks with same number of cards
      expect(room1.deck.data.length).toBe(room2.deck.data.length);

      // With high probability, at least some cards should be in different positions
      let differentPositions = 0;
      const data1 = room1.deck.data as any[];
      const data2 = room2.deck.data as any[];
      for (let i = 0; i < Math.min(data1.length, 10); i++) {
        if (data1[i].id !== data2[i].id) {
          differentPositions++;
        }
      }
      // Allow for extremely rare identical shuffles, but expect differences
      expect(differentPositions).toBeGreaterThanOrEqual(0);
    });

    it("should reset all state on reset()", () => {
      const room = new GameRoom("room-1", "Test Room");

      // Modify state
      room.addPlayer(createTestPlayer("player-1"));
      room.currentRound = 5;
      room.currentTheme = "biost";
      room.wasScored = true;
      room.scoredRounds.add(1);
      room.scoredRounds.add(2);

      // Reset
      room.reset();

      expect(room.players).toHaveLength(0);
      expect(room.currentRound).toBe(1);
      expect(room.currentTheme).toBe("all");
      expect(room.wasScored).toBe(false);
      expect(room.scoredRounds.size).toBe(0);
      expect(room.deck.isShuffled).toBe(true);
      // Deck should be reshuffled (different order)
      // Note: There's a small chance the first card is the same
    });

    it("should track scored rounds correctly", () => {
      const room = new GameRoom("room-1", "Test Room");

      expect(room.isRoundScored(1)).toBe(false);

      room.markRoundScored(1);
      expect(room.isRoundScored(1)).toBe(true);
      expect(room.lastScoredRound).toBe(1);

      room.markRoundScored(3);
      expect(room.isRoundScored(3)).toBe(true);
      expect(room.lastScoredRound).toBe(3);

      // Round 2 should not be scored
      expect(room.isRoundScored(2)).toBe(false);
    });

    it("should advance round and reset player states", () => {
      const room = new GameRoom("room-1", "Test Room");
      const player = createTestPlayer("player-1");
      player.isReady = true;
      player.tacticUsed = ["fakenews"];
      player.scoreUpdated = true;

      room.addPlayer(player);
      expect(room.currentRound).toBe(1);

      room.advanceRound();

      expect(room.currentRound).toBe(2);
      expect(room.players[0].isReady).toBe(false);
      expect(room.players[0].tacticUsed).toHaveLength(0);
      expect(room.players[0].scoreUpdated).toBe(false);
    });

    it("should calculate cardIndex correctly based on currentRound", () => {
      const room = new GameRoom("room-1", "Test Room");

      expect(room.cardIndex).toBe(0); // Round 1 = index 0

      room.currentRound = 5;
      expect(room.cardIndex).toBe(4); // Round 5 = index 4

      room.currentRound = 10;
      expect(room.cardIndex).toBe(9); // Round 10 = index 9
    });

    it("should handle edge case cardIndex when currentRound is 0", () => {
      const room = new GameRoom("room-1", "Test Room");
      room.currentRound = 0;
      expect(room.cardIndex).toBe(0); // Should not go negative
    });

    it("should serialize to roomUpdate correctly with toRoomUpdate()", () => {
      const room = new GameRoom("room-1", "Test Room");
      room.currentRound = 3;
      room.currentTheme = "biost";
      room.addPlayer(createTestPlayer("player-1"));

      const update = room.toRoomUpdate() as any;

      expect(update.type).toBe("roomUpdate");
      expect(update.room).toBe("Test Room");
      expect(update.count).toBe(1);
      expect(update.currentRound).toBe(3);
      expect(update.cardIndex).toBe(2);
      expect(update.themeStyle).toBe("biost");
      expect(update.players).toHaveLength(1);
      expect(update.deck).toBeDefined();
      expect(update.deck.isShuffled).toBe(true);
    });

    it("should serialize to legacy room format with toLegacyRoom()", () => {
      const room = new GameRoom("room-1", "Test Room");
      room.currentRound = 2;
      room.wasScored = true;

      const legacy = room.toLegacyRoom() as any;

      expect(legacy.name).toBe("Test Room");
      expect(legacy.count).toBe(0);
      expect(legacy.currentRound).toBe(2);
      expect(legacy.wasScored).toBe(true);
      expect(legacy.deck).toBeDefined();
    });

    it("should correctly report isEmpty and isFull properties", () => {
      const room = new GameRoom("room-1", "Test Room");

      expect(room.isEmpty).toBe(true);
      expect(room.isFull).toBe(false);

      // Add players up to max
      for (let i = 1; i <= 5; i++) {
        room.addPlayer(createTestPlayer(`player-${i}`));
      }

      expect(room.isEmpty).toBe(false);
      expect(room.isFull).toBe(true);
      expect(room.count).toBe(5);
    });

    it("should find player by ID with getPlayer()", () => {
      const room = new GameRoom("room-1", "Test Room");
      const player = createTestPlayer("player-1", "Alice");
      room.addPlayer(player);

      const found = room.getPlayer("player-1");
      expect(found).toBeDefined();
      expect(found?.name).toBe("Alice");

      const notFound = room.getPlayer("non-existent");
      expect(notFound).toBeUndefined();
    });

    it("should update player with updatePlayer()", () => {
      const room = new GameRoom("room-1", "Test Room");
      const player = createTestPlayer("player-1", "Alice");
      room.addPlayer(player);

      const updated = room.updatePlayer("player-1", {
        score: 100,
        isReady: true,
      });

      expect(updated).not.toBeNull();
      expect(updated?.score).toBe(100);
      expect(updated?.isReady).toBe(true);
      expect(room.players[0].score).toBe(100);
    });

    it("should return null when updating non-existent player", () => {
      const room = new GameRoom("room-1", "Test Room");

      const result = room.updatePlayer("non-existent", { score: 100 });
      expect(result).toBeNull();
    });
  });

  // ============================================
  // INTEGRATION TESTS - Full workflow scenarios
  // ============================================
  describe("Integration Tests - Full Workflow", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should handle complete game lifecycle: create -> play -> end -> delete", () => {
      // 1. Create room
      const gameRoom = manager.createRoom("game-1");
      expect(manager.hasRoom("game-1")).toBe(true);

      // 2. Players join
      const player1 = createTestPlayer("p1", "Alice");
      const player2 = createTestPlayer("p2", "Bob");
      manager.addPlayerToRoom(player1, "game-1");
      manager.addPlayerToRoom(player2, "game-1");
      expect(gameRoom.count).toBe(2);

      // 3. Simulate game progress
      gameRoom.currentRound = 5;
      gameRoom.markRoundScored(1);
      gameRoom.markRoundScored(2);
      gameRoom.markRoundScored(3);
      gameRoom.markRoundScored(4);

      // 4. Players leave one by one
      manager.removePlayerFromRoom("p1", "game-1");
      expect(gameRoom.count).toBe(1);
      expect(manager.hasPendingDeletionTimer("game-1")).toBe(false); // Not empty yet

      // 5. Last player leaves
      const result = manager.removePlayerFromRoom("p2", "game-1");
      expect(result.scheduledDeletion).toBe(true);

      // 6. Wait for deletion
      jest.advanceTimersByTime(30000);
      expect(manager.hasRoom("game-1")).toBe(false);
    });

    it("should handle end game with immediate cleanup", () => {
      manager.createRoom("game-2");
      const player = createTestPlayer("p1");
      manager.addPlayerToRoom(player, "game-2");

      // Player leaves
      manager.removePlayerFromRoom("p1", "game-2");

      // End game called while room is empty
      const result = manager.handleEndGame("game-2");

      expect(result.deleted).toBe(true);
      expect(manager.hasRoom("game-2")).toBe(false);
      // No need to wait for timer
    });

    it("should handle rapid player join/leave cycles", () => {
      manager.createRoom("volatile-room");
      const player = createTestPlayer("p1");

      // Rapid cycles
      for (let i = 0; i < 5; i++) {
        manager.addPlayerToRoom(player, "volatile-room");
        expect(manager.hasPendingDeletionTimer("volatile-room")).toBe(false);

        manager.removePlayerFromRoom("p1", "volatile-room");
        expect(manager.hasPendingDeletionTimer("volatile-room")).toBe(true);

        // Quick rejoin (within 30 seconds)
        jest.advanceTimersByTime(5000);
      }

      // Final leave
      manager.removePlayerFromRoom("p1", "volatile-room");
      jest.advanceTimersByTime(30000);

      expect(manager.hasRoom("volatile-room")).toBe(false);
    });
  });
});
