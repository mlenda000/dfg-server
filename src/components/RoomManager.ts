/**
 * RoomManager - Handles room lifecycle management
 *
 * This class is extracted from the server to enable proper unit testing
 * of room creation, deletion, and timer logic without PartyKit dependencies.
 */

import { GameRoom } from "./Room/GameRoom";
import type { Player } from "../types/types";

export interface RoomManagerOptions {
  deletionDelayMs?: number;
  onRoomDeleted?: (roomName: string, availableRooms: string[]) => void;
  onRoomCreated?: (roomName: string, availableRooms: string[]) => void;
}

export class RoomManager {
  readonly gameRooms: Map<string, GameRoom> = new Map();
  readonly roomDeletionTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  private readonly deletionDelayMs: number;
  private readonly onRoomDeleted?: (
    roomName: string,
    availableRooms: string[],
  ) => void;
  private readonly onRoomCreated?: (
    roomName: string,
    availableRooms: string[],
  ) => void;

  constructor(options: RoomManagerOptions = {}) {
    this.deletionDelayMs = options.deletionDelayMs ?? 30000;
    this.onRoomDeleted = options.onRoomDeleted;
    this.onRoomCreated = options.onRoomCreated;
  }

  /**
   * Get or create a GameRoom instance
   */
  getOrCreateGameRoom(roomName: string): GameRoom {
    let gameRoom = this.gameRooms.get(roomName);
    if (!gameRoom) {
      gameRoom = new GameRoom(roomName, roomName);
      this.gameRooms.set(roomName, gameRoom);
    }
    return gameRoom;
  }

  /**
   * Create a new room and notify listeners
   */
  createRoom(roomName: string): GameRoom {
    const gameRoom = this.getOrCreateGameRoom(roomName);

    // Cancel any pending deletion timer for this room
    this.cancelRoomDeletionTimer(roomName);

    if (this.onRoomCreated) {
      this.onRoomCreated(roomName, this.getAvailableRooms());
    }

    return gameRoom;
  }

  /**
   * Get list of available room names
   */
  getAvailableRooms(): string[] {
    return Array.from(this.gameRooms.keys());
  }

  /**
   * Get a room by name (returns undefined if not found)
   */
  getRoom(roomName: string): GameRoom | undefined {
    return this.gameRooms.get(roomName);
  }

  /**
   * Check if a room exists
   */
  hasRoom(roomName: string): boolean {
    return this.gameRooms.has(roomName);
  }

  /**
   * Schedule room deletion after the configured delay
   */
  scheduleRoomDeletion(roomName: string): void {
    // Cancel any existing timer
    this.cancelRoomDeletionTimer(roomName);

    // Set a timer to delete the room
    const timer = setTimeout(() => {
      this.deleteRoom(roomName);
    }, this.deletionDelayMs);

    this.roomDeletionTimers.set(roomName, timer);
  }

  /**
   * Cancel a scheduled room deletion
   */
  cancelRoomDeletionTimer(roomName: string): void {
    const existingTimer = this.roomDeletionTimers.get(roomName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.roomDeletionTimers.delete(roomName);
    }
  }

  /**
   * Check if a room has a pending deletion timer
   */
  hasPendingDeletionTimer(roomName: string): boolean {
    return this.roomDeletionTimers.has(roomName);
  }

  /**
   * Delete a room if it's empty
   * @returns true if room was deleted, false otherwise
   */
  deleteRoom(roomName: string): boolean {
    const gameRoom = this.gameRooms.get(roomName);

    // Only delete if room exists and is empty
    if (!gameRoom || !gameRoom.isEmpty) {
      return false;
    }

    // Reset and remove GameRoom
    gameRoom.reset();
    this.gameRooms.delete(roomName);

    // Clean up timer reference
    this.roomDeletionTimers.delete(roomName);

    // Notify listeners
    if (this.onRoomDeleted) {
      this.onRoomDeleted(roomName, this.getAvailableRooms());
    }

    return true;
  }

  /**
   * Add a player to a room
   * Cancels any pending deletion timer for the room
   */
  addPlayerToRoom(
    player: Player,
    roomName: string,
  ): { success: boolean; gameRoom: GameRoom } {
    const gameRoom = this.getOrCreateGameRoom(roomName);

    // Cancel any pending deletion timer when a player joins
    this.cancelRoomDeletionTimer(roomName);

    const success = gameRoom.addPlayer(player);

    return { success, gameRoom };
  }

  /**
   * Remove a player from a room
   * Schedules room deletion if room becomes empty
   * @returns Object with room update info and whether deletion was scheduled
   */
  removePlayerFromRoom(
    playerId: string,
    roomName: string,
  ): {
    success: boolean;
    gameRoom: GameRoom | undefined;
    scheduledDeletion: boolean;
  } {
    const gameRoom = this.gameRooms.get(roomName);

    if (!gameRoom) {
      return { success: false, gameRoom: undefined, scheduledDeletion: false };
    }

    const removed = gameRoom.removePlayer(playerId);

    // If room is now empty, schedule deletion
    let scheduledDeletion = false;
    if (gameRoom.isEmpty) {
      this.scheduleRoomDeletion(roomName);
      scheduledDeletion = true;
    }

    return { success: removed !== null, gameRoom, scheduledDeletion };
  }

  /**
   * Handle end game for a room
   * Deletes immediately if empty, otherwise marks as ended
   */
  handleEndGame(roomName: string): {
    deleted: boolean;
    gameRoom: GameRoom | undefined;
  } {
    const gameRoom = this.gameRooms.get(roomName);

    if (!gameRoom) {
      return { deleted: false, gameRoom: undefined };
    }

    // Mark the game as ended
    gameRoom.wasScored = true;

    // If room is empty after end game, delete immediately
    if (gameRoom.isEmpty) {
      this.deleteRoom(roomName);
      return { deleted: true, gameRoom: undefined };
    }

    return { deleted: false, gameRoom };
  }

  /**
   * Clean up all timers (for shutdown/testing)
   */
  cleanup(): void {
    for (const timer of this.roomDeletionTimers.values()) {
      clearTimeout(timer);
    }
    this.roomDeletionTimers.clear();
  }

  /**
   * Get total room count
   */
  get roomCount(): number {
    return this.gameRooms.size;
  }
}

export default RoomManager;
