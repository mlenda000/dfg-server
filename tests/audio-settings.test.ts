/**
 * Audio Settings Tests
 *
 * Tests that teacher audio settings (volumeLocked, musicMuted, sfxMuted,
 * musicVolume, sfxVolume) are stored correctly on GameRoom, serialised
 * through toRoomUpdate(), propagated via room creation, and included in
 * observeRoom and reconnectState responses.
 *
 * Uses REAL RoomManager and GameRoom classes — no mocks.
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
      volumeLocked: gameRoom.volumeLocked,
      musicMuted: gameRoom.musicMuted,
      sfxMuted: gameRoom.sfxMuted,
      musicVolume: gameRoom.musicVolume,
      sfxVolume: gameRoom.sfxVolume,
    };
  } else {
    return {
      type: "error",
      message: `Room "${roomName}" not found.`,
    };
  }
}

/**
 * Simulates the server's reconnectState message sent to a reconnecting player.
 * Mirrors the actual code in server.ts inside "playerEnters" case.
 */
function buildReconnectState(
  gameRoom: GameRoom,
  reconnectedPlayer: Player,
): { type: string; [key: string]: any } {
  return {
    type: "reconnectState",
    room: gameRoom.name,
    player: reconnectedPlayer,
    currentRound: gameRoom.currentRound,
    maxRounds: gameRoom.maxRounds,
    cardIndex: gameRoom.cardIndex,
    newsCard: gameRoom.currentNewsCard,
    themeStyle: gameRoom.currentTheme,
    deck: gameRoom.deck,
    players: gameRoom.players,
    influencerCard: gameRoom.influencerCard,
    isGameOver: gameRoom.isGameOver,
    isInProgress: gameRoom.isInProgress,
    count: gameRoom.count,
    volumeLocked: gameRoom.volumeLocked,
    musicMuted: gameRoom.musicMuted,
    sfxMuted: gameRoom.sfxMuted,
    musicVolume: gameRoom.musicVolume,
    sfxVolume: gameRoom.sfxVolume,
  };
}

/**
 * Simulates the server's updateAudioSettings WebSocket handler.
 * Mirrors the actual code in server.ts onMessage "updateAudioSettings" case
 * (the local-room-update branch, i.e. when already on the game room instance).
 */
function handleUpdateAudioSettings(
  gameRoom: GameRoom,
  settings: {
    volumeLocked?: boolean;
    musicMuted?: boolean;
    sfxMuted?: boolean;
    musicVolume?: number;
    sfxVolume?: number;
  },
): void {
  gameRoom.volumeLocked = settings.volumeLocked === true;
  gameRoom.musicMuted = settings.musicMuted === true;
  gameRoom.sfxMuted = settings.sfxMuted === true;
  if (typeof settings.musicVolume === "number")
    gameRoom.musicVolume = settings.musicVolume;
  if (typeof settings.sfxVolume === "number")
    gameRoom.sfxVolume = settings.sfxVolume;
}

/**
 * Simulates the server's POST updateAudioSettings handler
 * (lobby forwarding settings to game room instance).
 * Mirrors the actual code in server.ts onRequest POST "updateAudioSettings".
 */
function handleAudioSettingsPOST(
  gameRoom: GameRoom,
  body: {
    volumeLocked?: boolean;
    musicMuted?: boolean;
    sfxMuted?: boolean;
    musicVolume?: number;
    sfxVolume?: number;
    teacherCreated?: boolean;
    teacherId?: string;
  },
): void {
  gameRoom.volumeLocked = body.volumeLocked === true;
  gameRoom.musicMuted = body.musicMuted === true;
  gameRoom.sfxMuted = body.sfxMuted === true;
  if (typeof body.musicVolume === "number")
    gameRoom.musicVolume = body.musicVolume;
  if (typeof body.sfxVolume === "number") gameRoom.sfxVolume = body.sfxVolume;
  if (body.teacherCreated !== undefined) {
    gameRoom.teacherCreated = body.teacherCreated === true;
  }
  if (body.teacherId !== undefined) {
    gameRoom.teacherId = body.teacherId;
  }
}

/**
 * Simulates room creation with teacher audio settings.
 * Mirrors the POST handler in server.ts that creates a room.
 */
function createTeacherRoom(
  roomManager: RoomManager,
  roomName: string,
  settings: {
    teacherId: string;
    volumeLocked?: boolean;
    musicMuted?: boolean;
    sfxMuted?: boolean;
    musicVolume?: number;
    sfxVolume?: number;
  },
): GameRoom {
  const gameRoom = roomManager.createRoom(roomName);
  gameRoom.teacherCreated = true;
  gameRoom.teacherId = settings.teacherId;
  gameRoom.volumeLocked = settings.volumeLocked === true;
  gameRoom.musicMuted = settings.musicMuted === true;
  gameRoom.sfxMuted = settings.sfxMuted === true;
  if (typeof settings.musicVolume === "number")
    gameRoom.musicVolume = settings.musicVolume;
  if (typeof settings.sfxVolume === "number")
    gameRoom.sfxVolume = settings.sfxVolume;
  return gameRoom;
}

// ===========================================================================
// GAMEROOM AUDIO PROPERTY DEFAULTS
// ===========================================================================
describe("GameRoom Audio Property Defaults", () => {
  it("should default volumeLocked to false", () => {
    const room = new GameRoom("room-1", "room-1");
    expect(room.volumeLocked).toBe(false);
  });

  it("should default musicMuted to false", () => {
    const room = new GameRoom("room-1", "room-1");
    expect(room.musicMuted).toBe(false);
  });

  it("should default sfxMuted to false", () => {
    const room = new GameRoom("room-1", "room-1");
    expect(room.sfxMuted).toBe(false);
  });

  it("should default musicVolume to 20", () => {
    const room = new GameRoom("room-1", "room-1");
    expect(room.musicVolume).toBe(20);
  });

  it("should default sfxVolume to 50", () => {
    const room = new GameRoom("room-1", "room-1");
    expect(room.sfxVolume).toBe(50);
  });
});

// ===========================================================================
// toRoomUpdate() INCLUDES AUDIO FIELDS
// ===========================================================================
describe("toRoomUpdate() Audio Fields", () => {
  it("should include all audio fields with default values", () => {
    const room = new GameRoom("room-1", "room-1");
    const update = room.toRoomUpdate() as any;

    expect(update.volumeLocked).toBe(false);
    expect(update.musicMuted).toBe(false);
    expect(update.sfxMuted).toBe(false);
    expect(update.musicVolume).toBe(20);
    expect(update.sfxVolume).toBe(50);
  });

  it("should reflect volumeLocked = true when set", () => {
    const room = new GameRoom("room-1", "room-1");
    room.volumeLocked = true;
    const update = room.toRoomUpdate() as any;
    expect(update.volumeLocked).toBe(true);
  });

  it("should reflect muted states when set", () => {
    const room = new GameRoom("room-1", "room-1");
    room.musicMuted = true;
    room.sfxMuted = true;
    const update = room.toRoomUpdate() as any;
    expect(update.musicMuted).toBe(true);
    expect(update.sfxMuted).toBe(true);
  });

  it("should reflect custom volume levels", () => {
    const room = new GameRoom("room-1", "room-1");
    room.musicVolume = 75;
    room.sfxVolume = 30;
    const update = room.toRoomUpdate() as any;
    expect(update.musicVolume).toBe(75);
    expect(update.sfxVolume).toBe(30);
  });

  it("should reflect volume levels at zero (fully muted)", () => {
    const room = new GameRoom("room-1", "room-1");
    room.musicVolume = 0;
    room.sfxVolume = 0;
    const update = room.toRoomUpdate() as any;
    expect(update.musicVolume).toBe(0);
    expect(update.sfxVolume).toBe(0);
  });

  it("should reflect volume levels at 100 (maximum)", () => {
    const room = new GameRoom("room-1", "room-1");
    room.musicVolume = 100;
    room.sfxVolume = 100;
    const update = room.toRoomUpdate() as any;
    expect(update.musicVolume).toBe(100);
    expect(update.sfxVolume).toBe(100);
  });
});

// ===========================================================================
// TEACHER ROOM CREATION WITH AUDIO SETTINGS
// ===========================================================================
describe("Teacher Room Creation with Audio Settings", () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: () => {},
      onRoomCreated: () => {},
    });
  });

  afterEach(() => {
    roomManager.cleanup();
  });

  it("should store volumeLocked on teacher room creation", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
    });
    expect(room.volumeLocked).toBe(true);
    expect(room.teacherCreated).toBe(true);
  });

  it("should store musicMuted and sfxMuted on teacher room creation", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      musicMuted: true,
      sfxMuted: true,
    });
    expect(room.musicMuted).toBe(true);
    expect(room.sfxMuted).toBe(true);
  });

  it("should store custom musicVolume and sfxVolume on teacher room creation", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      musicVolume: 10,
      sfxVolume: 80,
    });
    expect(room.musicVolume).toBe(10);
    expect(room.sfxVolume).toBe(80);
  });

  it("should create a fully muted and locked room", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
      musicVolume: 0,
      sfxVolume: 0,
    });
    expect(room.volumeLocked).toBe(true);
    expect(room.musicMuted).toBe(true);
    expect(room.sfxMuted).toBe(true);
    expect(room.musicVolume).toBe(0);
    expect(room.sfxVolume).toBe(0);
  });

  it("should keep default volumes when not specified in creation", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
    });
    // Volumes not overridden → keep defaults
    expect(room.musicVolume).toBe(20);
    expect(room.sfxVolume).toBe(50);
  });

  it("should propagate all audio settings through toRoomUpdate()", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: false,
      musicVolume: 35,
      sfxVolume: 70,
    });
    const update = room.toRoomUpdate() as any;
    expect(update.volumeLocked).toBe(true);
    expect(update.musicMuted).toBe(true);
    expect(update.sfxMuted).toBe(false);
    expect(update.musicVolume).toBe(35);
    expect(update.sfxVolume).toBe(70);
  });
});

// ===========================================================================
// updateAudioSettings HANDLER
// ===========================================================================
describe("updateAudioSettings Handler", () => {
  it("should update all audio fields on the game room", () => {
    const room = new GameRoom("room-1", "room-1");
    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
      musicVolume: 15,
      sfxVolume: 60,
    });
    expect(room.volumeLocked).toBe(true);
    expect(room.musicMuted).toBe(true);
    expect(room.sfxMuted).toBe(true);
    expect(room.musicVolume).toBe(15);
    expect(room.sfxVolume).toBe(60);
  });

  it("should unlock and unmute when toggled off", () => {
    const room = new GameRoom("room-1", "room-1");
    room.volumeLocked = true;
    room.musicMuted = true;
    room.sfxMuted = true;

    handleUpdateAudioSettings(room, {
      volumeLocked: false,
      musicMuted: false,
      sfxMuted: false,
    });
    expect(room.volumeLocked).toBe(false);
    expect(room.musicMuted).toBe(false);
    expect(room.sfxMuted).toBe(false);
  });

  it("should only update volume levels when provided as numbers", () => {
    const room = new GameRoom("room-1", "room-1");
    // Send settings without volume levels
    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: false,
      sfxMuted: false,
    });
    // Volumes should retain defaults
    expect(room.musicVolume).toBe(20);
    expect(room.sfxVolume).toBe(50);
  });

  it("should accept volume level of zero", () => {
    const room = new GameRoom("room-1", "room-1");
    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
      musicVolume: 0,
      sfxVolume: 0,
    });
    expect(room.musicVolume).toBe(0);
    expect(room.sfxVolume).toBe(0);
  });

  it("should treat missing boolean fields as false", () => {
    const room = new GameRoom("room-1", "room-1");
    room.volumeLocked = true;
    room.musicMuted = true;
    room.sfxMuted = true;
    // Send empty settings (all boolean fields missing → treated as false)
    handleUpdateAudioSettings(room, {});
    expect(room.volumeLocked).toBe(false);
    expect(room.musicMuted).toBe(false);
    expect(room.sfxMuted).toBe(false);
  });

  it("should update volume levels independently of mute state", () => {
    const room = new GameRoom("room-1", "room-1");
    handleUpdateAudioSettings(room, {
      volumeLocked: false,
      musicMuted: false,
      sfxMuted: false,
      musicVolume: 85,
      sfxVolume: 10,
    });
    expect(room.musicMuted).toBe(false);
    expect(room.sfxMuted).toBe(false);
    expect(room.musicVolume).toBe(85);
    expect(room.sfxVolume).toBe(10);
  });
});

// ===========================================================================
// AUDIO SETTINGS POST HANDLER (Lobby → Game Room Forwarding)
// ===========================================================================
describe("Audio Settings POST Handler", () => {
  it("should apply all audio settings from POST body", () => {
    const room = new GameRoom("room-1", "room-1");
    handleAudioSettingsPOST(room, {
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
      musicVolume: 42,
      sfxVolume: 88,
    });
    expect(room.volumeLocked).toBe(true);
    expect(room.musicMuted).toBe(true);
    expect(room.sfxMuted).toBe(true);
    expect(room.musicVolume).toBe(42);
    expect(room.sfxVolume).toBe(88);
  });

  it("should also set teacherCreated and teacherId when provided", () => {
    const room = new GameRoom("room-1", "room-1");
    handleAudioSettingsPOST(room, {
      teacherCreated: true,
      teacherId: "teacher_42",
      volumeLocked: true,
      musicMuted: false,
      sfxMuted: false,
    });
    expect(room.teacherCreated).toBe(true);
    expect(room.teacherId).toBe("teacher_42");
    expect(room.volumeLocked).toBe(true);
  });

  it("should not override teacherCreated/teacherId when not provided", () => {
    const room = new GameRoom("room-1", "room-1");
    room.teacherCreated = true;
    room.teacherId = "teacher_42";

    handleAudioSettingsPOST(room, {
      volumeLocked: false,
      musicMuted: false,
      sfxMuted: false,
    });
    // teacherCreated/teacherId unchanged
    expect(room.teacherCreated).toBe(true);
    expect(room.teacherId).toBe("teacher_42");
  });

  it("should keep default volumes when POST body omits them", () => {
    const room = new GameRoom("room-1", "room-1");
    handleAudioSettingsPOST(room, {
      volumeLocked: true,
    });
    expect(room.musicVolume).toBe(20);
    expect(room.sfxVolume).toBe(50);
  });
});

// ===========================================================================
// AUDIO SETTINGS SURVIVE PLAYER JOINS
// ===========================================================================
describe("Audio Settings Survive Player Joins", () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: () => {},
      onRoomCreated: () => {},
    });
  });

  afterEach(() => {
    roomManager.cleanup();
  });

  it("should preserve audio settings after a player joins", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
      musicVolume: 10,
      sfxVolume: 25,
    });

    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));
    expect(room.count).toBe(1);

    // Audio settings unchanged
    expect(room.volumeLocked).toBe(true);
    expect(room.musicMuted).toBe(true);
    expect(room.sfxMuted).toBe(true);
    expect(room.musicVolume).toBe(10);
    expect(room.sfxVolume).toBe(25);
  });

  it("should preserve audio settings after multiple players join", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicVolume: 75,
      sfxVolume: 90,
    });

    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));
    room.addPlayer(createTestPlayer("p2", "Bob", "class-1"));
    room.addPlayer(createTestPlayer("p3", "Charlie", "class-1"));
    expect(room.count).toBe(3);

    expect(room.volumeLocked).toBe(true);
    expect(room.musicVolume).toBe(75);
    expect(room.sfxVolume).toBe(90);
  });

  it("should include audio settings in toRoomUpdate() after player joins", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicMuted: false,
      sfxMuted: true,
      musicVolume: 55,
      sfxVolume: 0,
    });

    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));

    const update = room.toRoomUpdate() as any;
    expect(update.volumeLocked).toBe(true);
    expect(update.musicMuted).toBe(false);
    expect(update.sfxMuted).toBe(true);
    expect(update.musicVolume).toBe(55);
    expect(update.sfxVolume).toBe(0);
    expect(update.count).toBe(1);
  });

  it("should preserve audio settings after a player leaves", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicVolume: 40,
      sfxVolume: 60,
    });

    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));
    room.addPlayer(createTestPlayer("p2", "Bob", "class-1"));
    room.removePlayer("p1");

    expect(room.count).toBe(1);
    expect(room.volumeLocked).toBe(true);
    expect(room.musicVolume).toBe(40);
    expect(room.sfxVolume).toBe(60);
  });
});

// ===========================================================================
// OBSERVE ROOM INCLUDES AUDIO SETTINGS
// ===========================================================================
describe("observeRoom Includes Audio Settings", () => {
  let roomManager: RoomManager;
  let gameRooms: Map<string, GameRoom>;

  beforeEach(() => {
    roomManager = new RoomManager();
    gameRooms = new Map();
  });

  it("should include default audio settings in observe response", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.volumeLocked).toBe(false);
    expect(response.musicMuted).toBe(false);
    expect(response.sfxMuted).toBe(false);
    expect(response.musicVolume).toBe(20);
    expect(response.sfxVolume).toBe(50);
  });

  it("should include locked/muted audio settings in observe response", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    room.volumeLocked = true;
    room.musicMuted = true;
    room.sfxMuted = true;
    room.musicVolume = 0;
    room.sfxVolume = 0;

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.volumeLocked).toBe(true);
    expect(response.musicMuted).toBe(true);
    expect(response.sfxMuted).toBe(true);
    expect(response.musicVolume).toBe(0);
    expect(response.sfxVolume).toBe(0);
  });

  it("should include custom volume levels in observe response", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);
    room.musicVolume = 65;
    room.sfxVolume = 30;

    const response = handleObserveRoom(gameRooms, "room-1");
    expect(response.musicVolume).toBe(65);
    expect(response.sfxVolume).toBe(30);
  });

  it("should reflect audio settings changes after updateAudioSettings", () => {
    const room = roomManager.createRoom("room-1");
    gameRooms.set("room-1", room);

    // Initially defaults
    let response = handleObserveRoom(gameRooms, "room-1");
    expect(response.volumeLocked).toBe(false);

    // Teacher locks and mutes
    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
      musicVolume: 5,
      sfxVolume: 10,
    });

    response = handleObserveRoom(gameRooms, "room-1");
    expect(response.volumeLocked).toBe(true);
    expect(response.musicMuted).toBe(true);
    expect(response.sfxMuted).toBe(true);
    expect(response.musicVolume).toBe(5);
    expect(response.sfxVolume).toBe(10);
  });
});

// ===========================================================================
// RECONNECT STATE INCLUDES AUDIO SETTINGS
// ===========================================================================
describe("reconnectState Includes Audio Settings", () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: () => {},
      onRoomCreated: () => {},
    });
  });

  afterEach(() => {
    roomManager.cleanup();
  });

  it("should include default audio settings in reconnect state", () => {
    const room = roomManager.createRoom("room-1");
    const player = createTestPlayer("p1", "Alice", "room-1");
    room.addPlayer(player);

    const state = buildReconnectState(room, player);
    expect(state.volumeLocked).toBe(false);
    expect(state.musicMuted).toBe(false);
    expect(state.sfxMuted).toBe(false);
    expect(state.musicVolume).toBe(20);
    expect(state.sfxVolume).toBe(50);
  });

  it("should include locked and muted audio in reconnect state", () => {
    const room = roomManager.createRoom("room-1");
    room.volumeLocked = true;
    room.musicMuted = true;
    room.sfxMuted = true;
    room.musicVolume = 0;
    room.sfxVolume = 0;

    const player = createTestPlayer("p1", "Alice", "room-1");
    room.addPlayer(player);

    const state = buildReconnectState(room, player);
    expect(state.volumeLocked).toBe(true);
    expect(state.musicMuted).toBe(true);
    expect(state.sfxMuted).toBe(true);
    expect(state.musicVolume).toBe(0);
    expect(state.sfxVolume).toBe(0);
  });

  it("should include custom volumes after teacher changes settings mid-game", () => {
    const room = createTeacherRoom(roomManager, "room-1", {
      teacherId: "teacher_1",
      musicVolume: 20,
      sfxVolume: 50,
    });

    const player = createTestPlayer("p1", "Alice", "room-1");
    room.addPlayer(player);
    // Advance game to in-progress
    room.markRoundScored(1);
    room.advanceRound();

    // Teacher changes volume mid-game
    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: false,
      sfxMuted: false,
      musicVolume: 45,
      sfxVolume: 75,
    });

    // Player disconnects then reconnects
    room.removePlayer("p1");
    const reconnected = room.reconnectPlayer("Alice", "p1-new");
    expect(reconnected).not.toBeNull();

    const state = buildReconnectState(room, reconnected!);
    expect(state.volumeLocked).toBe(true);
    expect(state.musicVolume).toBe(45);
    expect(state.sfxVolume).toBe(75);
  });
});

// ===========================================================================
// MUTE ALL / UNMUTE ALL FLOW
// ===========================================================================
describe("Mute All / Unmute All Flow", () => {
  it("should mute both music and SFX via updateAudioSettings (Mute All)", () => {
    const room = new GameRoom("room-1", "room-1");

    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
    });

    expect(room.volumeLocked).toBe(true);
    expect(room.musicMuted).toBe(true);
    expect(room.sfxMuted).toBe(true);

    const update = room.toRoomUpdate() as any;
    expect(update.musicMuted).toBe(true);
    expect(update.sfxMuted).toBe(true);
  });

  it("should unmute both music and SFX via updateAudioSettings (Unmute All)", () => {
    const room = new GameRoom("room-1", "room-1");
    room.volumeLocked = true;
    room.musicMuted = true;
    room.sfxMuted = true;

    handleUpdateAudioSettings(room, {
      volumeLocked: false,
      musicMuted: false,
      sfxMuted: false,
    });

    expect(room.volumeLocked).toBe(false);
    expect(room.musicMuted).toBe(false);
    expect(room.sfxMuted).toBe(false);
  });

  it("should allow muting music only (not SFX)", () => {
    const room = new GameRoom("room-1", "room-1");

    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: false,
    });

    expect(room.musicMuted).toBe(true);
    expect(room.sfxMuted).toBe(false);
  });
});

// ===========================================================================
// VOLUME LEVELS WITH EDGE CASES
// ===========================================================================
describe("Volume Levels Edge Cases", () => {
  it("should store volume level of zero correctly", () => {
    const room = new GameRoom("room-1", "room-1");
    room.musicVolume = 0;
    room.sfxVolume = 0;
    expect(room.musicVolume).toBe(0);
    expect(room.sfxVolume).toBe(0);
    const update = room.toRoomUpdate() as any;
    expect(update.musicVolume).toBe(0);
    expect(update.sfxVolume).toBe(0);
  });

  it("should handle updating volumes multiple times", () => {
    const room = new GameRoom("room-1", "room-1");

    handleUpdateAudioSettings(room, {
      volumeLocked: false,
      musicMuted: false,
      sfxMuted: false,
      musicVolume: 10,
      sfxVolume: 20,
    });
    expect(room.musicVolume).toBe(10);
    expect(room.sfxVolume).toBe(20);

    handleUpdateAudioSettings(room, {
      volumeLocked: false,
      musicMuted: false,
      sfxMuted: false,
      musicVolume: 80,
      sfxVolume: 90,
    });
    expect(room.musicVolume).toBe(80);
    expect(room.sfxVolume).toBe(90);
  });

  it("should not reset volumes when only boolean flags change", () => {
    const room = new GameRoom("room-1", "room-1");
    room.musicVolume = 42;
    room.sfxVolume = 77;

    // Update only boolean flags (volumes not in payload)
    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
    });

    // Volumes should remain unchanged
    expect(room.musicVolume).toBe(42);
    expect(room.sfxVolume).toBe(77);
  });

  it("should include audio settings in JSON-serialised toRoomUpdate()", () => {
    const room = new GameRoom("room-1", "room-1");
    room.volumeLocked = true;
    room.musicMuted = true;
    room.sfxMuted = false;
    room.musicVolume = 33;
    room.sfxVolume = 66;

    // Verify round-trip through JSON (as it would be sent over WebSocket)
    const json = JSON.stringify(room.toRoomUpdate());
    const parsed = JSON.parse(json);
    expect(parsed.volumeLocked).toBe(true);
    expect(parsed.musicMuted).toBe(true);
    expect(parsed.sfxMuted).toBe(false);
    expect(parsed.musicVolume).toBe(33);
    expect(parsed.sfxVolume).toBe(66);
  });
});

// ===========================================================================
// END-TO-END: TEACHER CREATES ROOM → PLAYER JOINS → GETS AUDIO SETTINGS
// ===========================================================================
describe("End-to-End: Teacher Audio Settings Reach Players", () => {
  let roomManager: RoomManager;
  let gameRooms: Map<string, GameRoom>;

  beforeEach(() => {
    roomManager = new RoomManager({
      deletionDelayMs: 30000,
      onRoomDeleted: () => {},
      onRoomCreated: () => {},
    });
    gameRooms = roomManager.gameRooms;
  });

  afterEach(() => {
    roomManager.cleanup();
  });

  it("should deliver locked + muted settings to player via roomUpdate", () => {
    // 1. Teacher creates a room with muted + locked audio
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: true,
      musicVolume: 0,
      sfxVolume: 0,
    });

    // 2. Player joins
    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));

    // 3. The roomUpdate broadcast that players receive
    const update = room.toRoomUpdate() as any;
    expect(update.volumeLocked).toBe(true);
    expect(update.musicMuted).toBe(true);
    expect(update.sfxMuted).toBe(true);
    expect(update.musicVolume).toBe(0);
    expect(update.sfxVolume).toBe(0);
    expect(update.count).toBe(1);
  });

  it("should deliver custom volume levels to player via roomUpdate", () => {
    // Teacher sets specific volume levels
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicVolume: 35,
      sfxVolume: 70,
    });

    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));

    const update = room.toRoomUpdate() as any;
    expect(update.musicVolume).toBe(35);
    expect(update.sfxVolume).toBe(70);
    expect(update.volumeLocked).toBe(true);
  });

  it("should deliver audio settings to observer watching the room", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: true,
      musicMuted: true,
      sfxMuted: false,
      musicVolume: 15,
      sfxVolume: 95,
    });
    gameRooms.set("class-1", room);

    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));

    const observeResponse = handleObserveRoom(gameRooms, "class-1");
    expect(observeResponse.volumeLocked).toBe(true);
    expect(observeResponse.musicMuted).toBe(true);
    expect(observeResponse.sfxMuted).toBe(false);
    expect(observeResponse.musicVolume).toBe(15);
    expect(observeResponse.sfxVolume).toBe(95);
  });

  it("should deliver updated audio settings after teacher changes mid-game", () => {
    const room = createTeacherRoom(roomManager, "class-1", {
      teacherId: "teacher_1",
      volumeLocked: false,
      musicVolume: 20,
      sfxVolume: 50,
    });

    room.addPlayer(createTestPlayer("p1", "Alice", "class-1"));

    // Initial state: unlocked, default volumes
    let update = room.toRoomUpdate() as any;
    expect(update.volumeLocked).toBe(false);
    expect(update.musicVolume).toBe(20);

    // Teacher locks and changes volumes mid-game
    handleUpdateAudioSettings(room, {
      volumeLocked: true,
      musicMuted: false,
      sfxMuted: false,
      musicVolume: 5,
      sfxVolume: 100,
    });

    update = room.toRoomUpdate() as any;
    expect(update.volumeLocked).toBe(true);
    expect(update.musicVolume).toBe(5);
    expect(update.sfxVolume).toBe(100);
  });
});
