/**
 * Force Ready & Ready Countdown Tests (Server)
 *
 * Tests the forceReady and readyCountdown handlers using REAL
 * RoomManager and GameRoom classes — no mocks.
 *
 * forceReady: marks a specific player as ready without them clicking
 * readyCountdown: after N seconds, auto-forces a SPECIFIC player ready
 */

import { RoomManager } from "../src/components/RoomManager";
import { GameRoom } from "../src/components/Room/GameRoom";
import type { Player } from "../src/types/types";

// ---------------------------------------------------------------------------
// Helpers — mirror real server code
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
 * Simulates the server's forceReady message handler.
 * Mirrors the actual code in server.ts onMessage "forceReady" case.
 */
function handleForceReady(
  gameRooms: Map<string, GameRoom>,
  globalPlayers: Player[],
  room: string,
  playerId: string,
): { broadcast: any | null; updatedGlobalPlayers: Player[] } {
  const gameRoom = gameRooms.get(room);

  if (gameRoom && playerId) {
    const player = gameRoom.getPlayer(playerId);
    if (player && !player.isReady) {
      gameRoom.updatePlayer(playerId, {
        isReady: true,
        tacticUsed: player.tacticUsed || [],
      });

      const updatedGlobalPlayers = globalPlayers.map((p) =>
        p.id === playerId
          ? { ...p, isReady: true, tacticUsed: player.tacticUsed || [] }
          : p,
      );

      return {
        broadcast: {
          type: "playerReady",
          room,
          roomData: gameRoom.players,
          sender: "observer",
        },
        updatedGlobalPlayers,
      };
    }
  }
  return { broadcast: null, updatedGlobalPlayers: globalPlayers };
}

/**
 * Simulates the server's readyCountdown auto-force logic (player-specific).
 * This is the callback that runs AFTER the countdown timer expires
 * for a SPECIFIC targeted player.
 */
function handleCountdownExpiry(
  gameRooms: Map<string, GameRoom>,
  globalPlayers: Player[],
  room: string,
  targetPlayerId: string,
): { broadcast: any | null; updatedGlobalPlayers: Player[]; forced: boolean } {
  const gameRoom = gameRooms.get(room);
  if (!gameRoom) {
    return {
      broadcast: null,
      updatedGlobalPlayers: globalPlayers,
      forced: false,
    };
  }

  const player = gameRoom.getPlayer(targetPlayerId);
  if (!player || player.isReady) {
    return {
      broadcast: null,
      updatedGlobalPlayers: globalPlayers,
      forced: false,
    };
  }

  gameRoom.updatePlayer(targetPlayerId, {
    isReady: true,
    tacticUsed: player.tacticUsed || [],
  });

  const updatedGlobalPlayers = globalPlayers.map((p) =>
    p.id === targetPlayerId
      ? { ...p, isReady: true, tacticUsed: player.tacticUsed || [] }
      : p,
  );

  return {
    broadcast: {
      type: "playerReady",
      room,
      roomData: gameRoom.players,
      sender: "server",
    },
    updatedGlobalPlayers,
    forced: true,
  };
}

// ===========================================================================
// FORCE READY
// ===========================================================================
describe("forceReady handler", () => {
  let manager: RoomManager;
  let globalPlayers: Player[];

  beforeEach(() => {
    manager = new RoomManager();
    globalPlayers = [];
  });

  it("marks an unready player as ready", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    room.addPlayer(p1);
    globalPlayers.push(p1);

    expect(room.getPlayer("p1")!.isReady).toBe(false);

    const result = handleForceReady(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "p1",
    );

    expect(room.getPlayer("p1")!.isReady).toBe(true);
    expect(result.broadcast).not.toBeNull();
    expect(result.broadcast!.type).toBe("playerReady");
    expect(result.broadcast!.room).toBe("class-1");
    expect(result.broadcast!.roomData).toEqual(room.players);
  });

  it("preserves existing tacticUsed when forcing ready", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    p1.tacticUsed = ["Emotional Language"];
    room.addPlayer(p1);
    globalPlayers.push(p1);

    handleForceReady(manager.gameRooms, globalPlayers, "class-1", "p1");

    const player = room.getPlayer("p1")!;
    expect(player.isReady).toBe(true);
    expect(player.tacticUsed).toEqual(["Emotional Language"]);
  });

  it("does nothing if player is already ready", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    p1.isReady = true;
    room.addPlayer(p1);
    globalPlayers.push(p1);

    const result = handleForceReady(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "p1",
    );

    expect(result.broadcast).toBeNull();
  });

  it("does nothing for nonexistent room", () => {
    const result = handleForceReady(
      manager.gameRooms,
      globalPlayers,
      "no-room",
      "p1",
    );
    expect(result.broadcast).toBeNull();
  });

  it("does nothing for nonexistent player", () => {
    manager.getOrCreateGameRoom("class-1");
    const result = handleForceReady(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "no-player",
    );
    expect(result.broadcast).toBeNull();
  });

  it("updates global players list", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);
    globalPlayers = [p1, p2];

    const result = handleForceReady(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "p1",
    );

    const globalP1 = result.updatedGlobalPlayers.find((p) => p.id === "p1")!;
    const globalP2 = result.updatedGlobalPlayers.find((p) => p.id === "p2")!;
    expect(globalP1.isReady).toBe(true);
    expect(globalP2.isReady).toBe(false); // unchanged
  });

  it("does not affect other players in the room", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);

    handleForceReady(manager.gameRooms, [], "class-1", "p1");

    expect(room.getPlayer("p1")!.isReady).toBe(true);
    expect(room.getPlayer("p2")!.isReady).toBe(false);
  });

  it("sets empty tacticUsed when player has none", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    p1.tacticUsed = undefined as any;
    room.addPlayer(p1);

    handleForceReady(manager.gameRooms, [], "class-1", "p1");

    expect(room.getPlayer("p1")!.tacticUsed).toEqual([]);
  });

  it("works across multiple rooms independently", () => {
    const room1 = manager.getOrCreateGameRoom("class-1");
    const room2 = manager.getOrCreateGameRoom("class-2");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-2");
    room1.addPlayer(p1);
    room2.addPlayer(p2);

    handleForceReady(manager.gameRooms, [], "class-1", "p1");

    expect(room1.getPlayer("p1")!.isReady).toBe(true);
    expect(room2.getPlayer("p2")!.isReady).toBe(false);
  });
});

// ===========================================================================
// READY COUNTDOWN EXPIRY (player-specific)
// ===========================================================================
describe("readyCountdown expiry handler (player-specific)", () => {
  let manager: RoomManager;
  let globalPlayers: Player[];

  beforeEach(() => {
    manager = new RoomManager();
    globalPlayers = [];
  });

  it("forces a specific unready player to ready", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);
    globalPlayers = [p1, p2];

    const result = handleCountdownExpiry(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "p1",
    );

    expect(room.getPlayer("p1")!.isReady).toBe(true);
    expect(room.getPlayer("p2")!.isReady).toBe(false); // untouched
    expect(result.forced).toBe(true);
    expect(result.broadcast).not.toBeNull();
    expect(result.broadcast!.sender).toBe("server");
  });

  it("does not affect other players in the room", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    const p3 = createTestPlayer("p3", "Charlie", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);
    room.addPlayer(p3);

    handleCountdownExpiry(manager.gameRooms, [], "class-1", "p2");

    expect(room.getPlayer("p1")!.isReady).toBe(false);
    expect(room.getPlayer("p2")!.isReady).toBe(true);
    expect(room.getPlayer("p3")!.isReady).toBe(false);
  });

  it("does nothing if target player is already ready", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    p1.isReady = true;
    room.addPlayer(p1);
    globalPlayers = [p1];

    const result = handleCountdownExpiry(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "p1",
    );

    expect(result.broadcast).toBeNull();
    expect(result.forced).toBe(false);
  });

  it("does nothing for nonexistent room", () => {
    const result = handleCountdownExpiry(
      manager.gameRooms,
      globalPlayers,
      "no-room",
      "p1",
    );
    expect(result.broadcast).toBeNull();
    expect(result.forced).toBe(false);
  });

  it("does nothing for nonexistent player", () => {
    manager.getOrCreateGameRoom("class-1");
    const result = handleCountdownExpiry(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "no-player",
    );
    expect(result.broadcast).toBeNull();
    expect(result.forced).toBe(false);
  });

  it("preserves existing tacticUsed for forced player", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    p1.tacticUsed = ["Cherry Picking"];
    room.addPlayer(p1);

    handleCountdownExpiry(manager.gameRooms, [], "class-1", "p1");

    expect(room.getPlayer("p1")!.tacticUsed).toEqual(["Cherry Picking"]);
  });

  it("updates global players list for the forced player only", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);
    globalPlayers = [p1, p2];

    const result = handleCountdownExpiry(
      manager.gameRooms,
      globalPlayers,
      "class-1",
      "p1",
    );

    const gp1 = result.updatedGlobalPlayers.find((p) => p.id === "p1")!;
    const gp2 = result.updatedGlobalPlayers.find((p) => p.id === "p2")!;
    expect(gp1.isReady).toBe(true);
    expect(gp2.isReady).toBe(false);
  });

  it("broadcasts roomData with all players after forcing", () => {
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);

    const result = handleCountdownExpiry(
      manager.gameRooms,
      [],
      "class-1",
      "p1",
    );

    expect(result.broadcast!.roomData).toHaveLength(2);
    // Only p1 was forced; p2 stays unready
    const p1InBroadcast = result.broadcast!.roomData.find(
      (p: Player) => p.id === "p1",
    );
    const p2InBroadcast = result.broadcast!.roomData.find(
      (p: Player) => p.id === "p2",
    );
    expect(p1InBroadcast.isReady).toBe(true);
    expect(p2InBroadcast.isReady).toBe(false);
  });

  it("handles empty room gracefully", () => {
    manager.getOrCreateGameRoom("empty-room");
    const result = handleCountdownExpiry(
      manager.gameRooms,
      [],
      "empty-room",
      "p1",
    );
    expect(result.broadcast).toBeNull();
    expect(result.forced).toBe(false);
  });
});

// ===========================================================================
// Integration: forceReady + countdown together
// ===========================================================================
describe("Force ready + countdown integration", () => {
  it("forceReady one player, then countdown forces another specific player", () => {
    const manager = new RoomManager();
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    const p3 = createTestPlayer("p3", "Charlie", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);
    room.addPlayer(p3);

    // Teacher force-readies Alice immediately
    handleForceReady(manager.gameRooms, [], "class-1", "p1");
    expect(room.getPlayer("p1")!.isReady).toBe(true);
    expect(room.getPlayer("p2")!.isReady).toBe(false);
    expect(room.getPlayer("p3")!.isReady).toBe(false);

    // Countdown expires for Bob specifically
    const result = handleCountdownExpiry(
      manager.gameRooms,
      [],
      "class-1",
      "p2",
    );
    expect(result.forced).toBe(true);
    expect(room.getPlayer("p2")!.isReady).toBe(true);
    expect(room.getPlayer("p3")!.isReady).toBe(false); // Charlie still unready
  });

  it("forceReady a player before their countdown expires results in no-op", () => {
    const manager = new RoomManager();
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    room.addPlayer(p1);

    // Teacher force-readies Alice immediately
    handleForceReady(manager.gameRooms, [], "class-1", "p1");
    expect(room.getPlayer("p1")!.isReady).toBe(true);

    // Then the countdown was started for Alice but she's already ready
    const result = handleCountdownExpiry(
      manager.gameRooms,
      [],
      "class-1",
      "p1",
    );
    expect(result.broadcast).toBeNull();
    expect(result.forced).toBe(false);
  });

  it("player who readied themselves is not re-forced by countdown", () => {
    const manager = new RoomManager();
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    p1.isReady = true;
    p1.tacticUsed = ["Emotional Language"];
    room.addPlayer(p1);

    const result = handleCountdownExpiry(
      manager.gameRooms,
      [],
      "class-1",
      "p1",
    );
    expect(result.broadcast).toBeNull();
    expect(result.forced).toBe(false);
  });

  it("multiple independent countdowns can target different players", () => {
    const manager = new RoomManager();
    const room = manager.getOrCreateGameRoom("class-1");
    const p1 = createTestPlayer("p1", "Alice", "class-1");
    const p2 = createTestPlayer("p2", "Bob", "class-1");
    room.addPlayer(p1);
    room.addPlayer(p2);

    // Both countdown expiries run for their respective players
    const r1 = handleCountdownExpiry(manager.gameRooms, [], "class-1", "p1");
    const r2 = handleCountdownExpiry(manager.gameRooms, [], "class-1", "p2");

    expect(r1.forced).toBe(true);
    expect(r2.forced).toBe(true);
    expect(room.players.every((p) => p.isReady)).toBe(true);
  });
});
