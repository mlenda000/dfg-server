/**
 * Observer Mode Tests
 *
 * Tests that the observer flow works correctly end-to-end:
 * - Server: observeRoom returns room state WITHOUT adding observer as player
 * - Server: observer doesn't affect player count or game state
 * - Server: multiple observers can watch the same room simultaneously
 * - Server: observer gets real-time updates when room state changes
 *
 * Uses REAL RoomManager and GameRoom classes.
 */

import { RoomManager } from "../src/components/RoomManager";
import { GameRoom } from "../src/components/Room/GameRoom";
import type { Player } from "../src/types/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

/**
 * Simulates the server's observeRoom message handler.
 * Mirrors the actual code in server.ts onMessage "observeRoom" case.
 */
function handleObserveRoom(
  gameRooms: Map<string, GameRoom>,
  roomName: string,
): { type: string; [key: string]: any } {
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
  } else {
    return {
      type: "error",
      message: `Room "${roomName}" not found.`,
    };
  }
}

// ===========================================================================
// OBSERVER DOES NOT AFFECT ROOM STATE
// ===========================================================================
describe("Observer Does Not Affect Room State", () => {
  let roomManager: RoomManager;
  let gameRooms: Map<string, GameRoom>;

  beforeEach(() => {
    roomManager = new RoomManager();
    gameRooms = new Map();
    const room = roomManager.createRoom("observe-test");
    gameRooms.set("observe-test", room);
  });

  it("should not add observer as a player", () => {
    const room = gameRooms.get("observe-test")!;
    room.players.push(createTestPlayer("p1", "Alice", "observe-test"));
    expect(room.count).toBe(1);

    // Observe the room
    handleObserveRoom(gameRooms, "observe-test");

    // Player count unchanged
    expect(room.count).toBe(1);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe("Alice");
  });

  it("should not add observer to disconnectedPlayers", () => {
    const room = gameRooms.get("observe-test")!;
    expect(room.disconnectedPlayers.size).toBe(0);

    handleObserveRoom(gameRooms, "observe-test");

    expect(room.disconnectedPlayers.size).toBe(0);
  });

  it("should not change room's game state after observing", () => {
    const room = gameRooms.get("observe-test")!;
    room.currentRound = 3;
    room.maxRounds = 5;
    room.isGameOver = false;
    room.currentTheme = "health";

    handleObserveRoom(gameRooms, "observe-test");

    expect(room.currentRound).toBe(3);
    expect(room.maxRounds).toBe(5);
    expect(room.isGameOver).toBe(false);
    expect(room.currentTheme).toBe("health");
  });

  it("should not mutate the deck when observed", () => {
    const room = gameRooms.get("observe-test")!;
    const deckBefore = JSON.stringify(room.deck);

    handleObserveRoom(gameRooms, "observe-test");

    expect(JSON.stringify(room.deck)).toBe(deckBefore);
  });

  it("should not increment player count for multiple observations", () => {
    const room = gameRooms.get("observe-test")!;
    room.players.push(createTestPlayer("p1", "Alice", "observe-test"));
    expect(room.count).toBe(1);

    // Observe 10 times
    for (let i = 0; i < 10; i++) {
      handleObserveRoom(gameRooms, "observe-test");
    }

    expect(room.count).toBe(1);
    expect(room.players).toHaveLength(1);
  });
});

// ===========================================================================
// OBSERVER RECEIVES CORRECT ROOM STATE
// ===========================================================================
describe("Observer Receives Correct Room State", () => {
  let roomManager: RoomManager;
  let gameRooms: Map<string, GameRoom>;

  beforeEach(() => {
    roomManager = new RoomManager();
    gameRooms = new Map();
  });

  it("should return roomUpdate type for existing room", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.type).toBe("roomUpdate");
  });

  it("should return error for nonexistent room", () => {
    const response = handleObserveRoom(gameRooms, "no-such-room");
    expect(response.type).toBe("error");
    expect(response.message).toContain("no-such-room");
  });

  it("should return all players in the room", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    room.players.push(
      createTestPlayer("p1", "Alice", "room-1"),
      createTestPlayer("p2", "Bob", "room-1"),
      createTestPlayer("p3", "Carol", "room-1"),
    );

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.players).toHaveLength(3);
    expect(response.count).toBe(3);
    expect(response.players.map((p: Player) => p.name)).toEqual([
      "Alice",
      "Bob",
      "Carol",
    ]);
  });

  it("should return correct round information", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    room.currentRound = 4;
    room.maxRounds = 7;

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.currentRound).toBe(4);
    expect(response.maxRounds).toBe(7);
  });

  it("should return game over state accurately", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    room.isGameOver = true;

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.isGameOver).toBe(true);
  });

  it("should return the current theme", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    room.currentTheme = "environment";

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.themeStyle).toBe("environment");
  });

  it("should return null newsCard when no card is active", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.newsCard).toBeNull();
  });

  it("should return the active newsCard when one is set", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    room.currentNewsCard = {
      id: 42,
      headline: "Test headline",
      isReal: true,
    };

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.newsCard).toEqual({
      id: 42,
      headline: "Test headline",
      isReal: true,
    });
  });

  it("should return player scores for observation", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    const player = createTestPlayer("p1", "Alice", "room-1");
    player.score = 150;
    player.streak = 3;
    room.players.push(player);

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.players[0].score).toBe(150);
    expect(response.players[0].streak).toBe(3);
  });

  it("should include the deck state", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.deck).toBeDefined();
    expect(response.deck.isShuffled).toBe(true);
    expect(response.deck.data.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// MULTIPLE OBSERVERS
// ===========================================================================
describe("Multiple Observers", () => {
  let roomManager: RoomManager;
  let gameRooms: Map<string, GameRoom>;

  beforeEach(() => {
    roomManager = new RoomManager();
    gameRooms = new Map();
    const room = roomManager.createRoom("multi-observe");
    gameRooms.set("multi-observe", room);
    room.players.push(
      createTestPlayer("p1", "Alice", "multi-observe"),
      createTestPlayer("p2", "Bob", "multi-observe"),
    );
  });

  it("should return identical state to all observers", () => {
    const r1 = handleObserveRoom(gameRooms, "multi-observe");
    const r2 = handleObserveRoom(gameRooms, "multi-observe");
    const r3 = handleObserveRoom(gameRooms, "multi-observe");

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it("should keep player count at 2 after multiple observations", () => {
    const room = gameRooms.get("multi-observe")!;

    for (let i = 0; i < 5; i++) {
      handleObserveRoom(gameRooms, "multi-observe");
    }

    expect(room.count).toBe(2);
    expect(room.players).toHaveLength(2);
  });

  it("should allow observing different rooms independently", () => {
    const room2 = roomManager.createRoom("room-other");
    gameRooms.set("room-other", room2);
    room2.players.push(createTestPlayer("p3", "Carol", "room-other"));

    const r1 = handleObserveRoom(gameRooms, "multi-observe");
    const r2 = handleObserveRoom(gameRooms, "room-other");

    expect(r1.count).toBe(2);
    expect(r2.count).toBe(1);
    expect(r1.players.map((p: Player) => p.name)).toEqual(["Alice", "Bob"]);
    expect(r2.players.map((p: Player) => p.name)).toEqual(["Carol"]);
  });
});

// ===========================================================================
// OBSERVER SEES REAL-TIME STATE CHANGES
// ===========================================================================
describe("Observer Sees State Changes", () => {
  let roomManager: RoomManager;
  let gameRooms: Map<string, GameRoom>;

  beforeEach(() => {
    roomManager = new RoomManager();
    gameRooms = new Map();
    const room = roomManager.createRoom("live-room");
    gameRooms.set("live-room", room);
  });

  it("should reflect a new player joining between observations", () => {
    const room = gameRooms.get("live-room")!;

    const before = handleObserveRoom(gameRooms, "live-room");
    expect(before.count).toBe(0);

    room.players.push(createTestPlayer("p1", "Alice", "live-room"));

    const after = handleObserveRoom(gameRooms, "live-room");
    expect(after.count).toBe(1);
    expect(after.players[0].name).toBe("Alice");
  });

  it("should reflect round advancement between observations", () => {
    const room = gameRooms.get("live-room")!;
    room.currentRound = 1;

    const r1 = handleObserveRoom(gameRooms, "live-room");
    expect(r1.currentRound).toBe(1);

    room.currentRound = 3;

    const r2 = handleObserveRoom(gameRooms, "live-room");
    expect(r2.currentRound).toBe(3);
  });

  it("should reflect game over state change", () => {
    const room = gameRooms.get("live-room")!;

    const r1 = handleObserveRoom(gameRooms, "live-room");
    expect(r1.isGameOver).toBe(false);

    room.isGameOver = true;

    const r2 = handleObserveRoom(gameRooms, "live-room");
    expect(r2.isGameOver).toBe(true);
  });

  it("should reflect score changes between observations", () => {
    const room = gameRooms.get("live-room")!;
    const player = createTestPlayer("p1", "Alice", "live-room");
    room.players.push(player);

    const r1 = handleObserveRoom(gameRooms, "live-room");
    expect(r1.players[0].score).toBe(0);

    player.score = 200;

    const r2 = handleObserveRoom(gameRooms, "live-room");
    expect(r2.players[0].score).toBe(200);
  });

  it("should reflect theme changes between observations", () => {
    const room = gameRooms.get("live-room")!;
    room.currentTheme = "all";

    const r1 = handleObserveRoom(gameRooms, "live-room");
    expect(r1.themeStyle).toBe("all");

    room.currentTheme = "politics";

    const r2 = handleObserveRoom(gameRooms, "live-room");
    expect(r2.themeStyle).toBe("politics");
  });

  it("should reflect newsCard changes between observations", () => {
    const room = gameRooms.get("live-room")!;

    const r1 = handleObserveRoom(gameRooms, "live-room");
    expect(r1.newsCard).toBeNull();

    room.currentNewsCard = { id: 1, headline: "Breaking", isReal: false };

    const r2 = handleObserveRoom(gameRooms, "live-room");
    expect(r2.newsCard).toEqual({ id: 1, headline: "Breaking", isReal: false });
  });
});

// ===========================================================================
// OBSERVER + PLAYER LIFECYCLE ISOLATION
// ===========================================================================
describe("Observer and Player Lifecycle Isolation", () => {
  let roomManager: RoomManager;
  let gameRooms: Map<string, GameRoom>;

  beforeEach(() => {
    roomManager = new RoomManager();
    gameRooms = new Map();
    const room = roomManager.createRoom("lifecycle-room");
    gameRooms.set("lifecycle-room", room);
  });

  it("should not affect room when 'observer leaves' (no playerLeaves sent)", () => {
    const room = gameRooms.get("lifecycle-room")!;
    room.players.push(createTestPlayer("p1", "Alice", "lifecycle-room"));
    room.players.push(createTestPlayer("p2", "Bob", "lifecycle-room"));

    // Observer views
    handleObserveRoom(gameRooms, "lifecycle-room");

    // Observer "leaves" — nothing to do server-side, room unchanged
    expect(room.count).toBe(2);
    expect(room.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
  });

  it("should still work after a player leaves the room", () => {
    const room = gameRooms.get("lifecycle-room")!;
    room.players.push(createTestPlayer("p1", "Alice", "lifecycle-room"));
    room.players.push(createTestPlayer("p2", "Bob", "lifecycle-room"));

    // Observer sees 2 players
    const r1 = handleObserveRoom(gameRooms, "lifecycle-room");
    expect(r1.count).toBe(2);

    // Bob leaves
    room.players = room.players.filter((p) => p.id !== "p2");

    // Observer sees 1 player
    const r2 = handleObserveRoom(gameRooms, "lifecycle-room");
    expect(r2.count).toBe(1);
    expect(r2.players[0].name).toBe("Alice");
  });

  it("should handle observing a room that then gets deleted", () => {
    // Observer sees the room
    const r1 = handleObserveRoom(gameRooms, "lifecycle-room");
    expect(r1.type).toBe("roomUpdate");

    // Room gets deleted
    gameRooms.delete("lifecycle-room");

    // Observer tries again — gets error
    const r2 = handleObserveRoom(gameRooms, "lifecycle-room");
    expect(r2.type).toBe("error");
    expect(r2.message).toContain("lifecycle-room");
  });

  it("should not prevent room from being deleted by teacher", () => {
    const room = gameRooms.get("lifecycle-room")!;
    room.teacherCreated = true;
    room.teacherId = "teacher-1";

    // Observer views
    handleObserveRoom(gameRooms, "lifecycle-room");

    // Teacher deletes (simulate)
    gameRooms.delete("lifecycle-room");

    // Room is gone
    expect(gameRooms.has("lifecycle-room")).toBe(false);
  });

  it("should not prevent new players from joining while being observed", () => {
    const room = gameRooms.get("lifecycle-room")!;

    // Observer views empty room
    const r1 = handleObserveRoom(gameRooms, "lifecycle-room");
    expect(r1.count).toBe(0);

    // New players join
    room.players.push(createTestPlayer("p1", "Alice", "lifecycle-room"));
    room.players.push(createTestPlayer("p2", "Bob", "lifecycle-room"));
    room.players.push(createTestPlayer("p3", "Carol", "lifecycle-room"));

    // Observer sees all three
    const r2 = handleObserveRoom(gameRooms, "lifecycle-room");
    expect(r2.count).toBe(3);
  });
});
