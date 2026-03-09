/**
 * Teacher Room Management Tests
 *
 * Tests for the teacher room deletion and observer features:
 * - DELETE endpoint authorization logic (teacherCreated / teacherId checks)
 * - Room removal from RoomManager
 * - observeRoom message handler returning room state without joining
 *
 * Uses the REAL RoomManager and GameRoom classes with actual data.
 */

import { RoomManager } from "../src/components/RoomManager";
import { GameRoom } from "../src/components/Room/GameRoom";
import type { Player } from "../src/types/types";

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
// TEACHER ROOM DELETION AUTHORIZATION
// ============================================
describe("Teacher Room Deletion Authorization", () => {
  /**
   * Simulates the server's DELETE endpoint authorization logic.
   * This mirrors the actual code in server.ts onRequest DELETE handler.
   */
  function authorizeDeleteRoom(
    gameRooms: Map<string, GameRoom>,
    roomName: string | null,
    teacherId: string | null,
  ): { status: number; error?: string } {
    if (!roomName) {
      return { status: 400, error: "Missing roomName parameter" };
    }

    const gameRoom = gameRooms.get(roomName);
    if (!gameRoom) {
      return { status: 404, error: "Room not found" };
    }

    if (!gameRoom.teacherCreated || gameRoom.teacherId !== teacherId) {
      return { status: 403, error: "Not authorized to delete this room" };
    }

    return { status: 200 };
  }

  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: () => {},
      onRoomCreated: () => {},
    });
  });

  afterEach(() => {
    manager.cleanup();
  });

  it("should return 400 when roomName is null", () => {
    const result = authorizeDeleteRoom(manager.gameRooms, null, "teacher_1");
    expect(result.status).toBe(400);
    expect(result.error).toBe("Missing roomName parameter");
  });

  it("should return 404 when room does not exist", () => {
    const result = authorizeDeleteRoom(
      manager.gameRooms,
      "nonexistent",
      "teacher_1",
    );
    expect(result.status).toBe(404);
    expect(result.error).toBe("Room not found");
  });

  it("should return 403 when room is not teacher-created", () => {
    manager.createRoom("player-room");
    // Room defaults: teacherCreated = false, teacherId = ""
    const result = authorizeDeleteRoom(
      manager.gameRooms,
      "player-room",
      "teacher_1",
    );
    expect(result.status).toBe(403);
    expect(result.error).toBe("Not authorized to delete this room");
  });

  it("should return 403 when teacherId does not match", () => {
    const room = manager.createRoom("teacher-room");
    room.teacherCreated = true;
    room.teacherId = "teacher_1";

    const result = authorizeDeleteRoom(
      manager.gameRooms,
      "teacher-room",
      "teacher_2", // wrong teacher
    );
    expect(result.status).toBe(403);
    expect(result.error).toBe("Not authorized to delete this room");
  });

  it("should return 403 when teacherId is empty string", () => {
    const room = manager.createRoom("teacher-room");
    room.teacherCreated = true;
    room.teacherId = "teacher_1";

    const result = authorizeDeleteRoom(manager.gameRooms, "teacher-room", "");
    expect(result.status).toBe(403);
  });

  it("should return 403 when teacherId is null", () => {
    const room = manager.createRoom("teacher-room");
    room.teacherCreated = true;
    room.teacherId = "teacher_1";

    const result = authorizeDeleteRoom(manager.gameRooms, "teacher-room", null);
    expect(result.status).toBe(403);
  });

  it("should return 200 when teacherCreated is true and teacherId matches", () => {
    const room = manager.createRoom("teacher-room");
    room.teacherCreated = true;
    room.teacherId = "teacher_1";

    const result = authorizeDeleteRoom(
      manager.gameRooms,
      "teacher-room",
      "teacher_1",
    );
    expect(result.status).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it("should authorize each teacher only for their own rooms", () => {
    const room1 = manager.createRoom("room-A");
    room1.teacherCreated = true;
    room1.teacherId = "teacher_A";

    const room2 = manager.createRoom("room-B");
    room2.teacherCreated = true;
    room2.teacherId = "teacher_B";

    // Teacher A can delete room-A
    expect(
      authorizeDeleteRoom(manager.gameRooms, "room-A", "teacher_A").status,
    ).toBe(200);
    // Teacher A cannot delete room-B
    expect(
      authorizeDeleteRoom(manager.gameRooms, "room-B", "teacher_A").status,
    ).toBe(403);
    // Teacher B can delete room-B
    expect(
      authorizeDeleteRoom(manager.gameRooms, "room-B", "teacher_B").status,
    ).toBe(200);
    // Teacher B cannot delete room-A
    expect(
      authorizeDeleteRoom(manager.gameRooms, "room-A", "teacher_B").status,
    ).toBe(403);
  });
});

// ============================================
// TEACHER ROOM DELETION EXECUTION
// ============================================
describe("Teacher Room Deletion Execution", () => {
  let manager: RoomManager;
  let deletedRooms: string[] = [];

  beforeEach(() => {
    deletedRooms = [];
    manager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: (roomName) => {
        deletedRooms.push(roomName);
      },
      onRoomCreated: () => {},
    });
  });

  afterEach(() => {
    manager.cleanup();
  });

  /**
   * Simulates the server's DELETE handler execution logic:
   * direct gameRooms.delete() (force-delete regardless of player count,
   * because the server DELETE endpoint does not check hasNoActivePlayers).
   */
  function executeDeleteRoom(
    gameRooms: Map<string, GameRoom>,
    rooms: { name: string }[],
    roomName: string,
  ): { availableRooms: string[]; rooms: { name: string }[] } {
    gameRooms.delete(roomName);
    const filteredRooms = rooms.filter((r) => r.name !== roomName);
    const availableRooms = Array.from(gameRooms.keys());
    return { availableRooms, rooms: filteredRooms };
  }

  it("should remove room from gameRooms map after deletion", () => {
    const room = manager.createRoom("class-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_1";

    expect(manager.hasRoom("class-1")).toBe(true);

    manager.gameRooms.delete("class-1");

    expect(manager.hasRoom("class-1")).toBe(false);
  });

  it("should remove room from legacy rooms array", () => {
    const rooms = [
      { name: "class-1" },
      { name: "class-2" },
      { name: "class-3" },
    ];

    const result = executeDeleteRoom(
      new Map([
        ["class-1", new GameRoom("class-1", "class-1")],
        ["class-2", new GameRoom("class-2", "class-2")],
        ["class-3", new GameRoom("class-3", "class-3")],
      ]),
      rooms,
      "class-2",
    );

    expect(result.rooms).toHaveLength(2);
    expect(result.rooms.map((r) => r.name)).toEqual(["class-1", "class-3"]);
  });

  it("should return updated availableRooms after deletion", () => {
    manager.createRoom("room-1");
    const room2 = manager.createRoom("room-2");
    room2.teacherCreated = true;
    room2.teacherId = "teacher_1";
    manager.createRoom("room-3");

    manager.gameRooms.delete("room-2");
    const availableRooms = Array.from(manager.gameRooms.keys());

    expect(availableRooms).toHaveLength(2);
    expect(availableRooms).toContain("room-1");
    expect(availableRooms).toContain("room-3");
    expect(availableRooms).not.toContain("room-2");
  });

  it("should allow deletion of a room even with players (force delete)", () => {
    const room = manager.createRoom("class-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_1";
    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));
    room.addPlayer(createTestPlayer("p2", "Bob", "class-1"));

    expect(room.count).toBe(2);

    // Server DELETE handler uses gameRooms.delete() directly (force)
    manager.gameRooms.delete("class-1");
    expect(manager.hasRoom("class-1")).toBe(false);
  });

  it("should not affect other rooms when deleting one room", () => {
    const room1 = manager.createRoom("room-1");
    room1.teacherCreated = true;
    room1.teacherId = "teacher_1";
    room1.addPlayer(createTestPlayer("p1", "Alice", "room-1"));

    const room2 = manager.createRoom("room-2");
    room2.teacherCreated = true;
    room2.teacherId = "teacher_1";
    room2.addPlayer(createTestPlayer("p2", "Bob", "room-2"));

    manager.gameRooms.delete("room-1");

    expect(manager.hasRoom("room-1")).toBe(false);
    expect(manager.hasRoom("room-2")).toBe(true);
    const remainingRoom = manager.gameRooms.get("room-2");
    expect(remainingRoom!.count).toBe(1);
    expect(remainingRoom!.players[0].name).toBe("Bob");
  });
});

// ============================================
// OBSERVE ROOM - STATE RETRIEVAL WITHOUT JOINING
// ============================================
describe("Observe Room State Retrieval", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: () => {},
      onRoomCreated: () => {},
    });
  });

  afterEach(() => {
    manager.cleanup();
  });

  /**
   * Simulates the server's observeRoom message handler.
   * Returns the room state for observation without adding the teacher as a player.
   */
  function observeRoom(
    gameRooms: Map<string, GameRoom>,
    roomName: string,
  ):
    | {
        type: "roomUpdate";
        room: string;
        count: number;
        players: Player[];
        deck: any;
        newsCard: any;
        currentRound: number;
        maxRounds: number;
        isGameOver: boolean;
        themeStyle: string;
      }
    | { type: "error"; message: string } {
    const gameRoom = gameRooms.get(roomName);
    if (gameRoom) {
      return {
        type: "roomUpdate",
        room: roomName,
        count: gameRoom.count,
        players: gameRoom.players,
        deck: gameRoom.deck,
        newsCard: gameRoom.currentNewsCard,
        currentRound: gameRoom.currentRound,
        maxRounds: gameRoom.maxRounds,
        isGameOver: gameRoom.isGameOver,
        themeStyle: gameRoom.currentTheme,
      };
    }
    return {
      type: "error",
      message: `Room "${roomName}" not found.`,
    };
  }

  it("should return error for nonexistent room", () => {
    const result = observeRoom(manager.gameRooms, "nonexistent");
    expect(result.type).toBe("error");
    expect((result as any).message).toBe('Room "nonexistent" not found.');
  });

  it("should return roomUpdate for existing empty room", () => {
    manager.createRoom("class-1");
    const result = observeRoom(manager.gameRooms, "class-1");

    expect(result.type).toBe("roomUpdate");
    if (result.type === "roomUpdate") {
      expect(result.room).toBe("class-1");
      expect(result.count).toBe(0);
      expect(result.players).toEqual([]);
      expect(result.currentRound).toBe(1);
      expect(result.maxRounds).toBe(5);
      expect(result.isGameOver).toBe(false);
      expect(result.themeStyle).toBe("all");
    }
  });

  it("should return current player data without adding observer as player", () => {
    const room = manager.createRoom("class-1");
    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));
    room.addPlayer(createTestPlayer("p2", "Bob", "class-1"));

    const playerCountBefore = room.count;
    const result = observeRoom(manager.gameRooms, "class-1");
    const playerCountAfter = room.count;

    // Player count should NOT change after observing
    expect(playerCountBefore).toBe(2);
    expect(playerCountAfter).toBe(2);

    if (result.type === "roomUpdate") {
      expect(result.count).toBe(2);
      expect(result.players).toHaveLength(2);
      expect(result.players[0].name).toBe("Alice");
      expect(result.players[1].name).toBe("Bob");
    }
  });

  it("should return deck state for the observed room", () => {
    const room = manager.createRoom("class-1");

    const result = observeRoom(manager.gameRooms, "class-1");
    if (result.type === "roomUpdate") {
      expect(result.deck).toBeDefined();
      expect(result.deck.isShuffled).toBe(true);
      expect(result.deck.data.length).toBeGreaterThan(0);
      // Verify deck is the same reference as the room's deck
      expect(result.deck).toBe(room.deck);
    }
  });

  it("should return current round and game state", () => {
    const room = manager.createRoom("class-1");
    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));

    // Simulate mid-game state
    room.currentRound = 3;
    room.currentTheme = "health";
    room.currentNewsCard = { id: "card-5", caption: "Test news" };

    const result = observeRoom(manager.gameRooms, "class-1");
    if (result.type === "roomUpdate") {
      expect(result.currentRound).toBe(3);
      expect(result.themeStyle).toBe("health");
      expect(result.newsCard).toEqual({ id: "card-5", caption: "Test news" });
    }
  });

  it("should return game over state when game has ended", () => {
    const room = manager.createRoom("class-1");
    room.isGameOver = true;
    room.currentRound = 5;

    const result = observeRoom(manager.gameRooms, "class-1");
    if (result.type === "roomUpdate") {
      expect(result.isGameOver).toBe(true);
      expect(result.currentRound).toBe(5);
    }
  });

  it("should return null newsCard for room that has not started", () => {
    manager.createRoom("class-1");

    const result = observeRoom(manager.gameRooms, "class-1");
    if (result.type === "roomUpdate") {
      expect(result.newsCard).toBeNull();
    }
  });

  it("should return player scores for observation", () => {
    const room = manager.createRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    p1.score = 350;
    p2.score = 200;
    room.addPlayer(p1);
    room.addPlayer(p2);

    const result = observeRoom(manager.gameRooms, "class-1");
    if (result.type === "roomUpdate") {
      expect(result.players[0].score).toBe(350);
      expect(result.players[1].score).toBe(200);
    }
  });

  it("should allow observing multiple rooms independently", () => {
    const room1 = manager.createRoom("class-1");
    room1.addPlayer(createTestPlayer("p1", "Alice", "class-1"));
    room1.currentRound = 2;

    const room2 = manager.createRoom("class-2");
    room2.addPlayer(createTestPlayer("p2", "Bob", "class-2"));
    room2.addPlayer(createTestPlayer("p3", "Charlie", "class-2"));
    room2.currentRound = 4;

    const result1 = observeRoom(manager.gameRooms, "class-1");
    const result2 = observeRoom(manager.gameRooms, "class-2");

    if (result1.type === "roomUpdate" && result2.type === "roomUpdate") {
      expect(result1.count).toBe(1);
      expect(result1.currentRound).toBe(2);
      expect(result2.count).toBe(2);
      expect(result2.currentRound).toBe(4);
    }
  });

  it("should reflect real-time changes when observed again", () => {
    const room = manager.createRoom("class-1");
    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));

    const result1 = observeRoom(manager.gameRooms, "class-1");
    expect((result1 as any).count).toBe(1);

    // Another player joins
    room.addPlayer(createTestPlayer("p2", "Bob", "class-1"));

    const result2 = observeRoom(manager.gameRooms, "class-1");
    expect((result2 as any).count).toBe(2);
  });
});

// ============================================
// END-TO-END: TEACHER CREATES → OBSERVES → DELETES ROOM
// ============================================
describe("End-to-End Teacher Room Management", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: () => {},
      onRoomCreated: () => {},
    });
  });

  afterEach(() => {
    manager.cleanup();
  });

  it("should support the full lifecycle: create → observe → delete", () => {
    // Step 1: Teacher creates a room
    const room = manager.createRoom("class-room-A");
    room.teacherCreated = true;
    room.teacherId = "teacher_session_123";

    expect(manager.hasRoom("class-room-A")).toBe(true);
    expect(room.teacherCreated).toBe(true);

    // Step 2: Players join the room
    room.addPlayer(createTestPlayer("p1", "Alice", "class-room-A"));
    room.addPlayer(createTestPlayer("p2", "Bob", "class-room-A"));
    room.currentRound = 2;
    room.currentNewsCard = { id: "card-3", caption: "Observe this" };

    // Step 3: Teacher observes (reads state without joining)
    const gameRoom = manager.gameRooms.get("class-room-A");
    expect(gameRoom).toBeDefined();
    expect(gameRoom!.count).toBe(2);
    expect(gameRoom!.currentRound).toBe(2);
    expect(gameRoom!.currentNewsCard).toEqual({
      id: "card-3",
      caption: "Observe this",
    });
    // Teacher is NOT in players list
    expect(gameRoom!.players.every((p) => p.name !== "teacher")).toBe(true);

    // Step 4: Teacher deletes the room
    expect(gameRoom!.teacherCreated).toBe(true);
    expect(gameRoom!.teacherId).toBe("teacher_session_123");

    manager.gameRooms.delete("class-room-A");
    expect(manager.hasRoom("class-room-A")).toBe(false);
    expect(manager.getAvailableRooms()).not.toContain("class-room-A");
  });

  it("should allow creating multiple rooms, observing each, and deleting selectively", () => {
    // Create 3 rooms as teacher
    const rooms = ["room-1", "room-2", "room-3"];
    for (const name of rooms) {
      const room = manager.createRoom(name);
      room.teacherCreated = true;
      room.teacherId = "teacher_abc";
    }

    expect(manager.roomCount).toBe(3);

    // Add players to room-2
    const room2 = manager.gameRooms.get("room-2")!;
    room2.addPlayer(createTestPlayer("p1", "Alice", "room-2"));

    // Observe all rooms
    for (const name of rooms) {
      const room = manager.gameRooms.get(name);
      expect(room).toBeDefined();
    }

    // Delete only room-1
    manager.gameRooms.delete("room-1");

    expect(manager.roomCount).toBe(2);
    expect(manager.hasRoom("room-1")).toBe(false);
    expect(manager.hasRoom("room-2")).toBe(true);
    expect(manager.hasRoom("room-3")).toBe(true);

    // room-2 still has its player
    expect(room2.count).toBe(1);
    expect(room2.players[0].name).toBe("Alice");
  });
});
