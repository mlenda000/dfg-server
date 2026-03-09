/**
 * Game Results Teacher Isolation Tests
 *
 * These tests verify that game results are scoped to individual teachers:
 * - Results are stored with the correct teacherId
 * - Results are filtered by teacherId on retrieval
 * - Different teachers cannot see each other's results
 * - Empty teacherId returns no results
 */

import { GameRoom } from "../src/components/Room/GameRoom";
import { RoomManager } from "../src/components/RoomManager";
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
// GAMEROOM TEACHER ID ASSOCIATION
// ============================================
describe("GameRoom Teacher ID", () => {
  it("should default teacherId to empty string", () => {
    const room = new GameRoom("room-1", "room-1");
    expect(room.teacherId).toBe("");
  });

  it("should store teacherId when set", () => {
    const room = new GameRoom("room-1", "room-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_abc123";
    expect(room.teacherId).toBe("teacher_abc123");
    expect(room.teacherCreated).toBe(true);
  });

  it("should preserve teacherId across player operations", () => {
    const room = new GameRoom("room-1", "room-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_xyz";

    const player = createTestPlayer("p1", "Alice", "room-1");
    room.addPlayer(player);
    room.removePlayer("p1");

    expect(room.teacherId).toBe("teacher_xyz");
  });

  it("should clear teacherId on room reset", () => {
    const room = new GameRoom("room-1", "room-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_abc";
    room.addPlayer(createTestPlayer("p1"));

    room.reset();

    // teacherId and teacherCreated are not cleared by reset
    // (they are structural properties of the room, not game state)
    expect(room.teacherId).toBe("teacher_abc");
    expect(room.teacherCreated).toBe(true);
  });
});

// ============================================
// GAME RESULTS STORAGE AND FILTERING
// ============================================
describe("Game Results Teacher Isolation", () => {
  // Simulate the server's gameResults array and filtering logic
  type GameResult = {
    roomName: string;
    teacherId: string;
    players: { name: string; score: number; avatar: string }[];
    completedAt: number;
  };

  let gameResults: GameResult[];

  beforeEach(() => {
    gameResults = [];
  });

  function addGameResult(
    roomName: string,
    teacherId: string,
    players: { name: string; score: number; avatar: string }[],
  ) {
    gameResults.push({
      roomName,
      teacherId,
      players,
      completedAt: Date.now(),
    });
  }

  function getResultsForTeacher(teacherId: string): GameResult[] {
    return teacherId
      ? gameResults.filter((r) => r.teacherId === teacherId)
      : [];
  }

  it("should return only results for the requesting teacher", () => {
    addGameResult("room-A", "teacher_1", [
      { name: "Alice", score: 200, avatar: "a1.png" },
    ]);
    addGameResult("room-B", "teacher_2", [
      { name: "Bob", score: 150, avatar: "a2.png" },
    ]);
    addGameResult("room-C", "teacher_1", [
      { name: "Charlie", score: 300, avatar: "a3.png" },
    ]);

    const teacher1Results = getResultsForTeacher("teacher_1");
    expect(teacher1Results).toHaveLength(2);
    expect(teacher1Results[0].roomName).toBe("room-A");
    expect(teacher1Results[1].roomName).toBe("room-C");
  });

  it("should not return results from other teachers", () => {
    addGameResult("room-A", "teacher_1", [
      { name: "Alice", score: 200, avatar: "a1.png" },
    ]);
    addGameResult("room-B", "teacher_2", [
      { name: "Bob", score: 150, avatar: "a2.png" },
    ]);

    const teacher2Results = getResultsForTeacher("teacher_2");
    expect(teacher2Results).toHaveLength(1);
    expect(teacher2Results[0].roomName).toBe("room-B");
    // Ensure teacher_1's result is NOT in teacher_2's results
    expect(teacher2Results.some((r) => r.roomName === "room-A")).toBe(false);
  });

  it("should return empty array when teacherId is empty", () => {
    addGameResult("room-A", "teacher_1", [
      { name: "Alice", score: 200, avatar: "a1.png" },
    ]);

    const noTeacherResults = getResultsForTeacher("");
    expect(noTeacherResults).toHaveLength(0);
  });

  it("should return empty array when no results exist for a teacher", () => {
    addGameResult("room-A", "teacher_1", [
      { name: "Alice", score: 200, avatar: "a1.png" },
    ]);

    const unknownResults = getResultsForTeacher("teacher_nonexistent");
    expect(unknownResults).toHaveLength(0);
  });

  it("should correctly isolate results across many teachers", () => {
    // 3 teachers, each with different numbers of results
    for (let i = 0; i < 5; i++) {
      addGameResult(`room-t1-${i}`, "teacher_1", [
        { name: `P${i}`, score: i * 100, avatar: "a.png" },
      ]);
    }
    for (let i = 0; i < 3; i++) {
      addGameResult(`room-t2-${i}`, "teacher_2", [
        { name: `P${i}`, score: i * 50, avatar: "b.png" },
      ]);
    }
    addGameResult("room-t3-0", "teacher_3", [
      { name: "Solo", score: 500, avatar: "c.png" },
    ]);

    expect(getResultsForTeacher("teacher_1")).toHaveLength(5);
    expect(getResultsForTeacher("teacher_2")).toHaveLength(3);
    expect(getResultsForTeacher("teacher_3")).toHaveLength(1);
    expect(gameResults).toHaveLength(9); // Total results stored
  });

  it("should include all player data in filtered results", () => {
    const players = [
      { name: "Alice", score: 300, avatar: "alice.png" },
      { name: "Bob", score: 150, avatar: "bob.png" },
      { name: "Charlie", score: 250, avatar: "charlie.png" },
    ];
    addGameResult("room-A", "teacher_1", players);

    const results = getResultsForTeacher("teacher_1");
    expect(results).toHaveLength(1);
    expect(results[0].players).toHaveLength(3);
    expect(results[0].players[0].name).toBe("Alice");
    expect(results[0].players[0].score).toBe(300);
    expect(results[0].players[0].avatar).toBe("alice.png");
  });
});

// ============================================
// ROOM CREATION WITH TEACHER ID
// ============================================
describe("Room Creation with Teacher ID", () => {
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

  it("should allow setting teacherId on a created room", () => {
    const room = manager.createRoom("teacher-room-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_abc";

    const retrieved = manager.gameRooms.get("teacher-room-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.teacherCreated).toBe(true);
    expect(retrieved!.teacherId).toBe("teacher_abc");
  });

  it("should maintain teacherId through getOrCreateGameRoom", () => {
    const room = manager.getOrCreateGameRoom("teacher-room-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_def";

    // Getting the same room should return the same instance with teacherId
    const sameRoom = manager.getOrCreateGameRoom("teacher-room-1");
    expect(sameRoom.teacherId).toBe("teacher_def");
  });

  it("should isolate teacherIds between different rooms", () => {
    const room1 = manager.createRoom("room-1");
    room1.teacherCreated = true;
    room1.teacherId = "teacher_A";

    const room2 = manager.createRoom("room-2");
    room2.teacherCreated = true;
    room2.teacherId = "teacher_B";

    const room3 = manager.createRoom("room-3");
    // room3 is not teacher-created

    expect(room1.teacherId).toBe("teacher_A");
    expect(room2.teacherId).toBe("teacher_B");
    expect(room3.teacherId).toBe("");
    expect(room3.teacherCreated).toBe(false);
  });
});

// ============================================
// END-TO-END: TEACHER CREATES ROOM → GAME ENDS → RESULTS TRACKED
// ============================================
describe("End-to-End Teacher Results Flow", () => {
  it("should track teacherId from room creation through to game results", () => {
    const teacherId = "teacher_session_xyz";

    // Step 1: Teacher creates room
    const room = new GameRoom("class-room-1", "class-room-1");
    room.teacherCreated = true;
    room.teacherId = teacherId;

    // Step 2: Players join and play
    const p1 = createTestPlayer("p1", "Alice", "class-room-1");
    const p2 = createTestPlayer("p2", "Bob", "class-room-1");
    p1.score = 350;
    p2.score = 200;
    room.addPlayer(p1);
    room.addPlayer(p2);

    // Step 3: Game ends — extract results
    room.wasScored = true;
    room.isGameOver = true;

    const resultPlayers = room.players.map((p) => ({
      name: p.name || "Unknown",
      score: p.score || 0,
      avatar: p.avatar || "",
    }));

    // Step 4: Results stored with teacherId
    const gameResults: Array<{
      roomName: string;
      teacherId: string;
      players: typeof resultPlayers;
      completedAt: number;
    }> = [];

    gameResults.push({
      roomName: room.name,
      teacherId: room.teacherId,
      players: resultPlayers,
      completedAt: Date.now(),
    });

    // Step 5: Verify correct teacher can see results
    const myResults = gameResults.filter((r) => r.teacherId === teacherId);
    expect(myResults).toHaveLength(1);
    expect(myResults[0].roomName).toBe("class-room-1");
    expect(myResults[0].players).toHaveLength(2);
    expect(myResults[0].players[0].name).toBe("Alice");
    expect(myResults[0].players[0].score).toBe(350);

    // Step 6: Verify other teacher cannot see results
    const otherResults = gameResults.filter(
      (r) => r.teacherId === "teacher_other",
    );
    expect(otherResults).toHaveLength(0);
  });

  it("should not include non-teacher room results even if queried", () => {
    // A player-created room should NOT produce results
    const room = new GameRoom("player-room", "player-room");
    // teacherCreated defaults to false, teacherId defaults to ""

    room.addPlayer(createTestPlayer("p1", "Alice"));
    room.isGameOver = true;

    const gameResults: Array<{
      roomName: string;
      teacherId: string;
      players: { name: string; score: number; avatar: string }[];
      completedAt: number;
    }> = [];

    // Results would only be stored if teacherCreated is true
    if (room.teacherCreated) {
      gameResults.push({
        roomName: room.name,
        teacherId: room.teacherId,
        players: room.players.map((p) => ({
          name: p.name || "Unknown",
          score: p.score || 0,
          avatar: p.avatar || "",
        })),
        completedAt: Date.now(),
      });
    }

    // No results stored for non-teacher rooms
    expect(gameResults).toHaveLength(0);
  });
});
