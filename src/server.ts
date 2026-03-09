import type * as Party from "partykit/server";
import startingDeck from "./data/influencerCards.json";
import type {
  Player,
  Room,
  PlayerCard,
  InfluencerCard,
  TacticUsed,
  ShuffledDeck,
  WasScored,
} from "./types/types";
import {
  areAllScoresUpdated,
  calculateScore,
  resetPlayerForNextRound,
} from "./components/Scoring/scoring";
import { parseContent } from "./utils/utils";
import { GameRoom } from "./components/Room/GameRoom";
import { RoomManager } from "./components/RoomManager";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {
    // Log on first instance creation (per room)
  }

  // Counter for generating unique player IDs (instance property to avoid sharing across rooms)
  private playerIdCounter = 0;

  // Generate a unique player ID
  generatePlayerId(): string {
    this.playerIdCounter++;
    return `player_${Date.now()}_${this.room.id}_${this.playerIdCounter}_${Math.random().toString(36).substring(2, 8)}`;
  }

  // Use RoomManager for room lifecycle management (same code as tests)
  // Helper to notify the lobby server about room lifecycle changes
  private notifyLobby(action: string, roomName: string): void {
    if (this.room.id === "lobby") return;
    try {
      const lobbyStub = this.room.context.parties.main.get("lobby");
      lobbyStub
        .fetch(`/?${action}=${encodeURIComponent(roomName)}`, {
          method: "POST",
        })
        .catch((err) =>
          console.error(`[notifyLobby] Failed ${action} for ${roomName}:`, err),
        );
    } catch (err) {
      console.error(`[notifyLobby] Error ${action} for ${roomName}:`, err);
    }
  }

  private roomManager = new RoomManager({
    deletionDelayMs: 30000,
    onRoomDeleted: (roomName, availableRooms) => {
      // Remove legacy room from list
      this.rooms = this.rooms.filter((r) => r.name !== roomName);

      // Reset room-specific tracking data
      this.scoredRounds.delete(roomName);
      this.roomRounds.delete(roomName);

      // Clear any active ready countdown timers for this room (keyed as "room:playerId")
      for (const [key, timer] of this.readyCountdownTimers) {
        if (key.startsWith(`${roomName}:`)) {
          clearTimeout(timer);
          this.readyCountdownTimers.delete(key);
        }
      }

      // Broadcast room deletion to all clients in this room (if any still connected)
      this.room.broadcast(
        JSON.stringify({
          type: "roomDeleted",
          roomName: roomName,
          availableRooms: availableRooms,
        }),
      );

      // Notify the lobby server so it removes the room from its registry
      this.notifyLobby("notifyRoomDeleted", roomName);

      // Reset instance-level game state for fresh start
      this.currentRound = 1;
      this.currentNewsCard = null;
      this.currentTheme = "all";
      this.influencerCard = { villain: "biost", tactic: [] };
      this.shuffledDeck = {
        type: "shuffledDeck",
        data: [],
        isShuffled: false,
      };
      this.deckReady = [];
      this.playedCards = [];
      this.tacticsUsed = [];
      this.wasScored = false;
    },
    onRoomCreated: (roomName, availableRooms) => {
      // Broadcast to all connected clients that a new room is available
      this.room.broadcast(
        JSON.stringify({
          type: "roomCreated",
          roomName: roomName,
          availableRooms: availableRooms,
        }),
      );
    },
  });

  // Expose gameRooms map for backward compatibility
  get gameRooms(): Map<string, GameRoom> {
    return this.roomManager.gameRooms;
  }

  // Expose roomDeletionTimers for backward compatibility
  get roomDeletionTimers(): Map<string, ReturnType<typeof setTimeout>> {
    return this.roomManager.roomDeletionTimers;
  }

  // Delegate to RoomManager (same code that tests use)
  getOrCreateGameRoom(roomName: string): GameRoom {
    return this.roomManager.getOrCreateGameRoom(roomName);
  }

  // Delegate to RoomManager (same code that tests use)
  scheduleRoomDeletion(roomName: string): void {
    this.roomManager.scheduleRoomDeletion(roomName);
  }

  // Delegate to RoomManager (same code that tests use)
  cancelRoomDeletionTimer(roomName: string): void {
    this.roomManager.cancelRoomDeletionTimer(roomName);
  }

  // Delegate to RoomManager (same code that tests use)
  deleteRoom(roomName: string): boolean {
    return this.roomManager.deleteRoom(roomName);
  }

  // Legacy properties maintained for backward compatibility
  players: Player[] = [];
  lobbyPlayers: Player[] = [];
  lobby: Room = { name: "lobby", players: [], count: 0 };
  rooms: Room[] = [];
  playedCards: PlayerCard[] = [];
  influencerCard: InfluencerCard = { villain: "biost", tactic: [] };
  currentNewsCard: any = null; // Track current newscard for syncing
  currentTheme: string = "all"; // Track current theme for syncing
  tacticsUsed: TacticUsed[] = [];
  currentRound = 1;
  streakBonus = this.currentRound < 5 ? 1 : this.currentRound < 10 ? 2 : 3;
  correctAnswer = 2;
  wrongAnswer = -1;
  shuffledDeck: ShuffledDeck = {
    type: "shuffledDeck",
    data: [],
    isShuffled: false,
  };
  deckReady: object[] = [];
  wasScored: WasScored = false;
  scoredRounds: Map<string, Set<number>> = new Map(); // Track which rounds have been scored per room
  roomRounds: Map<string, number> = new Map(); // Track last scored round per room
  // Map connection IDs to player IDs for consistent identification
  connectionToPlayerId: Map<string, string> = new Map();
  // Timers for ready countdown (per room)
  readyCountdownTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  // Store completed game results for teacher-created rooms
  gameResults: Array<{
    roomName: string;
    teacherId: string;
    players: { name: string; score: number; avatar: string }[];
    completedAt: number;
  }> = [];

  getPlayers() {
    return this.players;
  }

  getPlayedCards() {
    return this.playedCards;
  }

  getInfluencerCards() {
    return this.influencerCard;
  }

  // Check if all players in a room are ready, and if so, trigger end-of-round scoring.
  // Called after forceReady / readyCountdown to avoid relying on client-side detection.
  private checkAndTriggerEndOfRound(roomName: string): void {
    const gameRoom = this.gameRooms.get(roomName);
    if (!gameRoom) return;

    const allReady =
      gameRoom.players.length > 0 && gameRoom.players.every((p) => p.isReady);
    if (!allReady) return;

    // Trigger the scoring + round-advance logic by routing an endOfRound
    // message through the existing handler with a stub connection
    const endOfRoundMsg = JSON.stringify({
      type: "endOfRound",
      room: roomName,
      players: gameRoom.players,
      round: gameRoom.currentRound,
    });

    this.onMessage(endOfRoundMsg, {
      id: "server-force-ready",
      send: () => {},
      close: () => {},
    } as unknown as Party.Connection);
  }

  //update this to put everyone in a lobbyRoom
  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (this.room.id === "lobby") {
      // Send current list of available rooms to the connecting client
      const availableRooms = Array.from(this.gameRooms.keys());
      conn.send(
        JSON.stringify({
          type: "availableRooms",
          rooms: availableRooms,
        }),
      );
    } else {
      if (this.players.length >= 5) {
        conn.send(
          JSON.stringify({
            type: "announcement",
            text: `Room is full. Only 5 players are allowed.`,
          }),
        );
        conn.close();
        return; // Exit early to prevent further processing
      } else {
        conn.send(
          JSON.stringify({ type: "announcement", text: `Welcome, ${conn.id}` }),
        );
        conn.send(JSON.stringify({ type: "id", id: `id+${conn.id}` }));
        this.room.broadcast(
          JSON.stringify({
            type: "",
            room: this.room.id,
            roomCount: this.players.length,
          }),
          [conn.id],
        );
      }
    }
    this.room.broadcast(
      JSON.stringify({
        type: "announcement",
        text: `Heads up! ${conn.id} joined the party!`,
      }),
    );
  }

  onMessage(message: string, sender: Party.Connection) {
    const parsedContent = parseContent(message);
    try {
      switch (parsedContent?.type) {
        case "getPlayerId":
          // Generate a unique player ID for this client
          const newPlayerId = this.generatePlayerId();
          // Store mapping
          this.connectionToPlayerId.set(sender.id, newPlayerId);
          sender.send(JSON.stringify({ type: "playerId", id: newPlayerId }));
          break;
        case "createRoom":
          // Create a new game room using RoomManager (same code as tests)
          const newRoomName = parsedContent.roomName;
          if (newRoomName && !this.roomManager.hasRoom(newRoomName)) {
            // Create the GameRoom instance via RoomManager
            this.roomManager.createRoom(newRoomName);

            // Also add to legacy rooms array for backward compatibility
            if (!this.rooms.find((r) => r.name === newRoomName)) {
              this.rooms.push({ name: newRoomName, count: 0, players: [] });
            }
          }
          break;
        case "getAvailableRooms":
          // Return list of all available rooms using RoomManager
          const allRooms = this.roomManager.getAvailableRooms();
          sender.send(
            JSON.stringify({
              type: "availableRooms",
              rooms: allRooms,
            }),
          );
          break;
        case "observeRoom": {
          // Teacher observing a room — send current room state without joining as player
          const observeRoomName = parsedContent.roomName;
          const observeGameRoom = this.gameRooms.get(observeRoomName);
          if (observeGameRoom) {
            sender.send(
              JSON.stringify({
                type: "roomUpdate",
                room: observeRoomName,
                count: observeGameRoom.count,
                players: observeGameRoom.players,
                deck: observeGameRoom.deck,
                newsCard: observeGameRoom.currentNewsCard,
                currentRound: observeGameRoom.currentRound,
                maxRounds: observeGameRoom.maxRounds,
                isGameOver: observeGameRoom.isGameOver,
                themeStyle: observeGameRoom.currentTheme,
                volumeLocked: observeGameRoom.volumeLocked,
                musicMuted: observeGameRoom.musicMuted,
                sfxMuted: observeGameRoom.sfxMuted,
                musicVolume: observeGameRoom.musicVolume,
                sfxVolume: observeGameRoom.sfxVolume,
              }),
            );
          } else {
            sender.send(
              JSON.stringify({
                type: "error",
                message: `Room "${observeRoomName}" not found.`,
              }),
            );
          }
          break;
        }
        case "enteredLobby":
          const roomCounts: Record<string, Room> = {};

          this.players.forEach((player) => {
            if (!roomCounts[player.room]) {
              roomCounts[player.room] = {
                name: player.room,
                count: 0,
                players: [],
              };
            }
            roomCounts[player.room].players.push(player);
            roomCounts[player.room].count++;
          });

          const roomData = roomCounts[parsedContent.room] || {
            name: parsedContent.room,
            count: 0,
            players: [],
          };

          this.room.broadcast(
            JSON.stringify({
              type: "lobbyUpdate",
              room: parsedContent.room,
              count: roomData.count,
              roomData,
            }),
          );
          break;
        case "playerEnters":
          try {
            // Ensure player object exists and has required fields
            if (!parsedContent.player) {
              console.error("Invalid playerEnters: missing player object");
              sender.send(
                JSON.stringify({
                  type: "error",
                  message: "Missing player object in playerEnters message",
                }),
              );
              break;
            }

            // Get or create the GameRoom instance for proper isolation
            // On game room instances (non-lobby), use this.room.id for consistency
            // with the updateAudioSettings POST handler that stores settings under this.room.id
            const gameRoomKey = this.room.id === "lobby" ? parsedContent.room : this.room.id;
            const gameRoom = this.getOrCreateGameRoom(gameRoomKey);

            // --- Server-side join guards ---

            // Reject if room is full
            if (gameRoom.isFull) {
              sender.send(
                JSON.stringify({
                  type: "joinRejected",
                  reason: "full",
                  message: "This room is full (max 5 players).",
                  room: parsedContent.room,
                }),
              );
              break;
            }

            // Reject if game is already in progress (unless reconnecting)
            if (gameRoom.isInProgress) {
              const playerName = parsedContent.player?.name;
              if (!playerName || !gameRoom.wasPlayerInRoom(playerName)) {
                sender.send(
                  JSON.stringify({
                    type: "joinRejected",
                    reason: "inProgress",
                    message: "A game is already in progress in this room.",
                    room: parsedContent.room,
                  }),
                );
                break;
              }
              // Player was previously in this room — allow reconnection
            }

            // Reject if game is over
            if (gameRoom.isGameOver) {
              sender.send(
                JSON.stringify({
                  type: "joinRejected",
                  reason: "gameOver",
                  message: "The game in this room has ended.",
                  room: parsedContent.room,
                }),
              );
              break;
            }

            // Prevent duplicate join from the same connection
            const existingMappedPlayerId = this.connectionToPlayerId.get(
              sender.id,
            );
            if (
              existingMappedPlayerId &&
              gameRoom.getPlayer(existingMappedPlayerId)
            ) {
              sender.send(
                JSON.stringify({
                  type: "joinRejected",
                  reason: "alreadyJoined",
                  message: "You are already in this room.",
                  room: parsedContent.room,
                }),
              );
              break;
            }

            this.room.broadcast(
              JSON.stringify({
                type: "announcement",
                text: `Player joined: ${
                  parsedContent.player?.name || "Unknown"
                }`,
              }),
              [sender.id],
            );
            sender.send(JSON.stringify({ type: "playerId", id: sender.id }));

            // Also maintain legacy room for backward compatibility
            let room = this.rooms.find((r) => r.name === parsedContent.room);
            if (!room) {
              room = { name: parsedContent.room, count: 0, players: [] };
              this.rooms.push(room);
            }

            // Check if client-provided playerId already exists in this room
            // If so, generate a new unique ID to prevent duplicate player issues
            let clientPlayerId = parsedContent.player.id;
            const existingPlayerWithSameId = gameRoom.getPlayer(clientPlayerId);

            if (existingPlayerWithSameId && clientPlayerId) {
              // Generate a new unique ID for this player
              clientPlayerId = this.generatePlayerId();
              // Tell client to use this new ID
              sender.send(
                JSON.stringify({
                  type: "playerId",
                  id: clientPlayerId,
                  message: "Your playerId was duplicated, assigned new ID",
                }),
              );
            }

            parsedContent.player.id = clientPlayerId || sender.id;

            // Store mapping from connection ID to player ID
            this.connectionToPlayerId.set(sender.id, parsedContent.player.id);

            // Try to reconnect a previously disconnected player (preserves score/streak)
            const playerName = parsedContent.player.name;
            const reconnected = gameRoom.reconnectPlayer(
              playerName,
              parsedContent.player.id,
            );

            let isReconnection = false;
            if (reconnected) {
              // Use the reconnected player object (has preserved score etc.)
              parsedContent.player = reconnected;
              isReconnection = true;
            } else {
              // Brand-new player joining before game started
              parsedContent.player.score = 0;
              gameRoom.addPlayer(parsedContent.player);
            }

            // Cancel any pending deletion timer since someone joined
            this.cancelRoomDeletionTimer(parsedContent.room);

            // Notify lobby to cancel any pending deletion timer it may have
            this.notifyLobby("cancelRoomDeletion", parsedContent.room);

            // Sync legacy structures
            room.players = gameRoom.players;
            room.count = gameRoom.count;
            room.deck = gameRoom.deck;
            room.currentRound = gameRoom.currentRound;
            room.currentTheme = gameRoom.currentTheme;
            room.currentNewsCard = gameRoom.currentNewsCard;
            room.influencerCard = gameRoom.influencerCard;

            this.players.push(parsedContent.player);

            // Broadcast updated room data from the isolated GameRoom
            const roomUpdateMessage = gameRoom.toRoomUpdate();

            this.room.broadcast(JSON.stringify(roomUpdateMessage));

            // If this was a reconnection, send a targeted message to the
            // reconnecting player with their full restored state so the
            // client can pick up exactly where they left off.
            if (isReconnection) {
              sender.send(
                JSON.stringify({
                  type: "reconnectState",
                  room: parsedContent.room,
                  player: reconnected,
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
                }),
              );
            }
          } catch (error) {
            console.error("Error handling playerEnters:", error);
            sender.send(
              JSON.stringify({
                type: "error",
                message: "Server error processing playerEnters",
              }),
            );
          }

          break;

        case "influencer":
          // Get the GameRoom for proper isolation
          const influencerGameRoom = this.gameRooms.get(parsedContent.room);

          // Find the legacy room to store room-specific state
          const influencerRoom =
            this.rooms.find((r) => r.name === parsedContent.room) ||
            this.rooms[0]; // Fall back to first room if room name not provided

          // Store the influencer card with the correct tactic array for scoring
          const newInfluencerCard = {
            villain: parsedContent.villain || "",
            tactic:
              parsedContent.tactic || parsedContent.newsCard?.tacticUsed || [],
          };

          // Store in GameRoom (isolated), legacy room, and instance-level for backward compatibility
          if (influencerGameRoom) {
            influencerGameRoom.influencerCard = newInfluencerCard;
            if (parsedContent.newsCard) {
              influencerGameRoom.currentNewsCard = parsedContent.newsCard;
            }
            if (parsedContent.villain) {
              influencerGameRoom.currentTheme = parsedContent.villain;
            }
          }

          this.influencerCard = newInfluencerCard;
          if (influencerRoom) {
            influencerRoom.influencerCard = newInfluencerCard;
          }

          // Store the full newsCard and theme for new players joining
          if (parsedContent.newsCard) {
            this.currentNewsCard = parsedContent.newsCard;
            if (influencerRoom) {
              influencerRoom.currentNewsCard = parsedContent.newsCard;
            }
          }
          if (parsedContent.villain) {
            this.currentTheme = parsedContent.villain;
            if (influencerRoom) {
              influencerRoom.currentTheme = parsedContent.villain;
            }
          }
          this.room.broadcast(
            JSON.stringify({ type: "villain", villain: parsedContent.villain }),
          );
          break;
        case "playerReady":
          // Get the player ID from connection mapping
          const readyPlayerId =
            this.connectionToPlayerId.get(sender.id) || sender.id;

          // Get tactic cards from client's player data
          const clientReadyPlayer = parsedContent.players?.find(
            (p: Player) => p.id === readyPlayerId,
          );
          const tacticUsedFromClient = clientReadyPlayer?.tacticUsed || [];

          // Get the GameRoom for proper isolation
          const readyGameRoom = this.gameRooms.get(parsedContent.room);

          // Find the specific legacy room this player is in
          const readyRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          if (readyGameRoom) {
            // Update player in GameRoom
            readyGameRoom.updatePlayer(readyPlayerId, {
              isReady: true,
              tacticUsed: tacticUsedFromClient,
            });

            // Sync legacy room
            if (readyRoom) {
              readyRoom.players = readyGameRoom.players;
            }

            // Also update global players list
            this.players = this.players.map((player) => {
              if (player.id === readyPlayerId) {
                return {
                  ...player,
                  isReady: true,
                  tacticUsed: tacticUsedFromClient,
                };
              }
              return player;
            });

            // Broadcast only to players in this room
            this.room.broadcast(
              JSON.stringify({
                type: "playerReady",
                room: parsedContent.room,
                roomData: readyGameRoom.players,
                sender: sender.id,
              }),
            );
          }
          break;
        case "playerNotReady":
          // Get the player ID from connection mapping
          const notReadyPlayerId =
            this.connectionToPlayerId.get(sender.id) || sender.id;

          // Get the GameRoom for proper isolation
          const notReadyGameRoom = this.gameRooms.get(parsedContent.room);

          // Find the specific legacy room this player is in
          const notReadyRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          if (notReadyGameRoom) {
            // Update player in GameRoom
            notReadyGameRoom.updatePlayer(notReadyPlayerId, {
              isReady: false,
              tacticUsed: [],
            });

            // Sync legacy room
            if (notReadyRoom) {
              notReadyRoom.players = notReadyGameRoom.players;
            }

            // Also update global players list
            this.players = this.players.map((player) => {
              if (player.id === notReadyPlayerId) {
                return {
                  ...player,
                  isReady: false,
                  tacticUsed: [],
                  score: player.score,
                  streak: player.streak,
                  hasStreak: player.hasStreak,
                };
              }
              return player;
            });

            // Broadcast only to players in this room
            this.room.broadcast(
              JSON.stringify({
                type: "playerReady",
                room: parsedContent.room,
                roomData: notReadyGameRoom.players,
                sender: sender.id,
              }),
            );
          }
          break;
        case "syncTactics": {
          // Player syncs their placed cards so force-ready can use them
          const syncPlayerId =
            this.connectionToPlayerId.get(sender.id) || sender.id;
          const syncRoomName = parsedContent.room;
          const syncGameRoom = this.gameRooms.get(syncRoomName);

          if (syncGameRoom && syncPlayerId) {
            const syncPlayer = syncGameRoom.getPlayer(syncPlayerId);
            if (syncPlayer && !syncPlayer.isReady) {
              syncGameRoom.updatePlayer(syncPlayerId, {
                tacticUsed: parsedContent.tacticUsed || [],
              });

              // Sync legacy room
              const syncLegacyRoom = this.rooms.find(
                (r) => r.name === syncRoomName,
              );
              if (syncLegacyRoom) {
                syncLegacyRoom.players = syncGameRoom.players;
              }

              // Sync global players list
              this.players = this.players.map((p) =>
                p.id === syncPlayerId
                  ? { ...p, tacticUsed: parsedContent.tacticUsed || [] }
                  : p,
              );
            }
          }
          break;
        }
        case "updateAudioSettings": {
          const asRoomName = parsedContent.room;
          const asVolumeLocked = parsedContent.volumeLocked === true;
          const asMusicMuted = parsedContent.musicMuted === true;
          const asSfxMuted = parsedContent.sfxMuted === true;
          const asMusicVolume = typeof parsedContent.musicVolume === "number" ? parsedContent.musicVolume : undefined;
          const asSfxVolume = typeof parsedContent.sfxVolume === "number" ? parsedContent.sfxVolume : undefined;

          // Update lobby's registry copy
          const asGameRoom = this.gameRooms.get(asRoomName);
          if (asGameRoom) {
            asGameRoom.volumeLocked = asVolumeLocked;
            asGameRoom.musicMuted = asMusicMuted;
            asGameRoom.sfxMuted = asSfxMuted;
            if (asMusicVolume !== undefined) asGameRoom.musicVolume = asMusicVolume;
            if (asSfxVolume !== undefined) asGameRoom.sfxVolume = asSfxVolume;
          }

          // Forward to the actual game room instance so players get the update
          if (this.room.id === "lobby") {
            try {
              const roomStub =
                this.room.context.parties.main.get(asRoomName);
              roomStub
                .fetch("/?updateAudioSettings=true", {
                  method: "POST",
                  body: JSON.stringify({
                    volumeLocked: asVolumeLocked,
                    musicMuted: asMusicMuted,
                    sfxMuted: asSfxMuted,
                    musicVolume: asMusicVolume,
                    sfxVolume: asSfxVolume,
                  }),
                })
                .catch(() => {});
            } catch {
              // Game room instance may not exist yet
            }
          } else {
            // If we're already on the game room instance,
            // update local GameRoom and broadcast directly
            const localRoom = this.gameRooms.get(asRoomName);
            if (localRoom) {
              localRoom.volumeLocked = asVolumeLocked;
              localRoom.musicMuted = asMusicMuted;
              localRoom.sfxMuted = asSfxMuted;
              if (asMusicVolume !== undefined) localRoom.musicVolume = asMusicVolume;
              if (asSfxVolume !== undefined) localRoom.sfxVolume = asSfxVolume;
              this.room.broadcast(
                JSON.stringify(localRoom.toRoomUpdate()),
              );
            }
          }
          break;
        }
        case "forceReady": {
          // Teacher/observer forces a specific player to ready status
          const forceRoomName = parsedContent.room;
          const forcePlayerId = parsedContent.playerId;
          const forceGameRoom = this.gameRooms.get(forceRoomName);
          const forceLegacyRoom = this.rooms.find(
            (r) => r.name === forceRoomName,
          );

          if (forceGameRoom && forcePlayerId) {
            const player = forceGameRoom.getPlayer(forcePlayerId);
            if (player && !player.isReady) {
              // Mark player ready with whatever tactics they've placed (may be empty)
              forceGameRoom.updatePlayer(forcePlayerId, {
                isReady: true,
                tacticUsed: player.tacticUsed || [],
              });

              // Sync legacy room
              if (forceLegacyRoom) {
                forceLegacyRoom.players = forceGameRoom.players;
              }

              // Sync global players list
              this.players = this.players.map((p) =>
                p.id === forcePlayerId
                  ? { ...p, isReady: true, tacticUsed: player.tacticUsed || [] }
                  : p,
              );

              // Broadcast updated player state
              this.room.broadcast(
                JSON.stringify({
                  type: "playerReady",
                  room: forceRoomName,
                  roomData: forceGameRoom.players,
                  sender: sender.id,
                }),
              );

              // If all players are now ready, trigger end-of-round scoring
              this.checkAndTriggerEndOfRound(forceRoomName);
            }
          }
          break;
        }
        case "readyCountdown": {
          // Teacher starts a countdown for a specific unready player
          const countdownRoomName = parsedContent.room;
          const countdownSeconds = parsedContent.seconds ?? 30;
          const countdownPlayerId = parsedContent.playerId;
          const countdownGameRoom = this.gameRooms.get(countdownRoomName);

          if (countdownGameRoom && countdownPlayerId) {
            // Broadcast countdown start to all clients (includes target playerId)
            this.room.broadcast(
              JSON.stringify({
                type: "readyCountdown",
                room: countdownRoomName,
                seconds: countdownSeconds,
                playerId: countdownPlayerId,
              }),
            );

            // After the countdown, force-ready only the targeted player
            const timerKey = `${countdownRoomName}:${countdownPlayerId}`;
            const countdownTimer = setTimeout(() => {
              // Re-fetch room (it may have been deleted)
              const room = this.gameRooms.get(countdownRoomName);
              if (!room) return;

              const player = room.getPlayer(countdownPlayerId);
              if (!player || player.isReady) return;

              room.updatePlayer(countdownPlayerId, {
                isReady: true,
                tacticUsed: player.tacticUsed || [],
              });

              // Sync global
              this.players = this.players.map((p) =>
                p.id === countdownPlayerId
                  ? {
                      ...p,
                      isReady: true,
                      tacticUsed: player.tacticUsed || [],
                    }
                  : p,
              );

              // Sync legacy room
              const legacyRoom = this.rooms.find(
                (r) => r.name === countdownRoomName,
              );
              if (legacyRoom) {
                legacyRoom.players = room.players;
              }

              // Broadcast final ready state
              this.room.broadcast(
                JSON.stringify({
                  type: "playerReady",
                  room: countdownRoomName,
                  roomData: room.players,
                  sender: "server",
                }),
              );

              // If all players are now ready, trigger end-of-round scoring
              this.checkAndTriggerEndOfRound(countdownRoomName);

              // Clean up the timer reference
              this.readyCountdownTimers.delete(timerKey);
            }, countdownSeconds * 1000);

            // Store timer so it can be cleaned up if room is deleted
            this.readyCountdownTimers.set(timerKey, countdownTimer);
          }
          break;
        }
        case "playerLeaves":
          // Get the player ID from connection mapping
          const leavingPlayerId =
            this.connectionToPlayerId.get(sender.id) || sender.id;

          // Get the GameRoom for proper isolation
          const leavingGameRoom = this.gameRooms.get(parsedContent.room);

          // Find the legacy room this player is leaving
          const leavingRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          if (leavingGameRoom) {
            // Remove player from GameRoom
            leavingGameRoom.removePlayer(leavingPlayerId);

            // Sync legacy room
            if (leavingRoom) {
              leavingRoom.players = leavingGameRoom.players;
              leavingRoom.count = leavingGameRoom.count;
            }

            // Broadcast updated room state using GameRoom values
            this.room.broadcast(JSON.stringify(leavingGameRoom.toRoomUpdate()));

            // If room is now truly empty (no active + no disconnected), handle deletion
            if (leavingGameRoom.isEmpty) {
              if (leavingGameRoom.wasScored) {
                this.deleteRoom(parsedContent.room);
              } else {
                this.scheduleRoomDeletion(parsedContent.room);
                // Also tell lobby to schedule its own timer (survives DO hibernation)
                this.notifyLobby("scheduleRoomDeletion", parsedContent.room);
              }
            } else if (
              leavingGameRoom.hasNoActivePlayers &&
              leavingGameRoom.hasDisconnectedPlayers
            ) {
              // All active connections gone but disconnected players exist (mid-game refresh)
              // Schedule a grace period for reconnection before cleaning up
              this.cancelRoomDeletionTimer(parsedContent.room);
              const reconnectTimer = setTimeout(() => {
                if (leavingGameRoom.hasNoActivePlayers) {
                  leavingGameRoom.disconnectedPlayers.clear();
                  this.deleteRoom(parsedContent.room);
                  this.notifyLobby("notifyRoomDeleted", parsedContent.room);
                }
              }, 120000); // 2 minute grace period for reconnection
              this.roomDeletionTimers.set(parsedContent.room, reconnectTimer);
            }
          }

          // Remove from global players list
          this.players = this.players.filter(
            (player) => player.id !== leavingPlayerId,
          );
          // Clean up connection mapping
          this.connectionToPlayerId.delete(sender.id);

          break;
        case "endGame":
          // Handle end game - immediately delete the room when game ends
          const endGameRoomName = parsedContent.room;
          const endGameRoom = this.gameRooms.get(endGameRoomName);

          if (endGameRoom) {
            // Mark the game as ended
            endGameRoom.wasScored = true;
            endGameRoom.isGameOver = true;

            // If teacher-created, send final results to the lobby
            if (endGameRoom.teacherCreated) {
              const resultPlayers = endGameRoom.players.map((p) => ({
                name: p.name || "Unknown",
                score: p.score || 0,
                avatar: p.avatar || "",
              }));
              try {
                const lobbyStub = this.room.context.parties.main.get("lobby");
                lobbyStub
                  .fetch(
                    `/?notifyGameResults=${encodeURIComponent(endGameRoomName)}`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        players: resultPlayers,
                        teacherId: endGameRoom.teacherId,
                      }),
                    },
                  )
                  .catch((err) =>
                    console.error(
                      "[endGame] Failed to send results to lobby:",
                      err,
                    ),
                  );
              } catch (err) {
                console.error("[endGame] Error sending results to lobby:", err);
              }
            }

            // Clear disconnected players — game is over, no reconnection needed
            endGameRoom.disconnectedPlayers.clear();

            // Broadcast game ended to all players in the room
            this.room.broadcast(
              JSON.stringify({
                type: "gameEnded",
                room: endGameRoomName,
              }),
            );

            // If room is empty after end game, delete immediately
            if (endGameRoom.isEmpty) {
              this.deleteRoom(endGameRoomName);
            } else {
              // Otherwise, schedule deletion when last player leaves
              // The next playerLeaves will trigger immediate deletion
              endGameRoom.wasScored = true;
            }
          }
          break;
        case "allReady":
          const allReady = this.players.every((player) => player.isReady);
          this.room.broadcast(
            JSON.stringify({ type: "allReady", roomData: allReady }),
          );
          break;
        case "startingDeck":
          // Get or create the GameRoom
          const deckGameRoom = this.getOrCreateGameRoom(parsedContent.room);

          // Find or create the legacy room
          let currentRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          // GameRoom always has a deck (shuffled on creation)
          // Broadcast the GameRoom's deck
          this.room.broadcast(JSON.stringify(deckGameRoom.deck));

          // Sync to legacy room
          if (currentRoom) {
            currentRoom.deck = deckGameRoom.deck;
          }

          break;
        case "endOfRound":
          // Get the GameRoom for proper isolation
          const roundGameRoom = this.gameRooms.get(parsedContent.room);

          // Also get legacy room for backward compatibility
          const roundRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          const playersToScore = Array.isArray(parsedContent.players)
            ? parsedContent.players
            : roundGameRoom?.players || roundRoom?.players;

          if ((roundGameRoom || roundRoom) && Array.isArray(playersToScore)) {
            // Use GameRoom if available, fall back to legacy room
            const roomKey =
              roundGameRoom?.name || roundRoom?.name || parsedContent.room;

            // Derive round number robustly: use provided round, else GameRoom round, else last+1, else 1
            const lastRound =
              roundGameRoom?.lastScoredRound ||
              this.roomRounds.get(roomKey) ||
              0;
            const roundNumber =
              typeof parsedContent.round === "number" && parsedContent.round > 0
                ? parsedContent.round
                : lastRound + 1 || 1;

            // Check if round already scored using GameRoom or legacy tracking
            const alreadyScored = roundGameRoom
              ? roundGameRoom.isRoundScored(roundNumber)
              : this.scoredRounds.get(roomKey)?.has(roundNumber);

            if (alreadyScored) {
              break;
            }

            // Mark this round as scored in both GameRoom and legacy tracking
            if (roundGameRoom) {
              roundGameRoom.markRoundScored(roundNumber);
            }
            if (!this.scoredRounds.has(roomKey)) {
              this.scoredRounds.set(roomKey, new Set());
            }
            this.scoredRounds.get(roomKey)!.add(roundNumber);

            // Use GameRoom's influencer card if available, fall back to legacy room, then instance-level
            const influencerCardForScoring =
              roundGameRoom?.influencerCard ||
              roundRoom?.influencerCard ||
              this.influencerCard;

            // Get the current room players from GameRoom or legacy
            const roomPlayers =
              roundGameRoom?.players || roundRoom?.players || [];

            const updatedPlayers = calculateScore(
              playersToScore,
              roomPlayers,
              influencerCardForScoring,
              roundNumber,
            );

            // Update the GameRoom's players with the calculated scores
            if (roundGameRoom) {
              roundGameRoom.players = updatedPlayers;
            }
            // Also update legacy room
            if (roundRoom) {
              roundRoom.players = updatedPlayers;
            }

            if (areAllScoresUpdated(updatedPlayers)) {
              // Persist back into global players list as well
              this.players = this.players.map((p) => {
                const updated = updatedPlayers.find((rp) => rp.id === p.id);
                return updated ? { ...p, ...updated } : p;
              });

              // Don't reset player state here - it will be reset when the next round starts
              // This prevents duplicate endOfRound messages from re-scoring

              this.room.broadcast(
                JSON.stringify({
                  type: "scoreUpdate",
                  room: roomKey,
                  players: updatedPlayers,
                  isGameOver: roundGameRoom?.isGameOver || false,
                  maxRounds: roundGameRoom?.maxRounds || 5,
                }),
              );
            } else {
              // Safety net: force-mark all unscored players and broadcast anyway
              // to prevent the game from permanently locking up
              console.warn(
                "Not all players scored for room",
                roomKey,
                "- forcing scoreUpdate to prevent game lock",
              );
              const forcedPlayers = updatedPlayers.map((p) =>
                p.scoreUpdated
                  ? p
                  : {
                      ...p,
                      scoreUpdated: true,
                      streakUpdated: true,
                      wasCorrect: false,
                      streak: 0,
                      hasStreak: false,
                    },
              );

              // Update rooms with forced scores
              if (roundGameRoom) {
                roundGameRoom.players = forcedPlayers;
              }
              if (roundRoom) {
                roundRoom.players = forcedPlayers;
              }

              this.players = this.players.map((p) => {
                const updated = forcedPlayers.find((rp) => rp.id === p.id);
                return updated ? { ...p, ...updated } : p;
              });

              this.room.broadcast(
                JSON.stringify({
                  type: "scoreUpdate",
                  room: roomKey,
                  players: forcedPlayers,
                  isGameOver: roundGameRoom?.isGameOver || false,
                  maxRounds: roundGameRoom?.maxRounds || 5,
                }),
              );
            }

            // Use the final scored players (whether normal or forced)
            const scoredPlayers =
              roundGameRoom?.players || roundRoom?.players || updatedPlayers;

            // Update last scored round for this room and advance to next round
            this.roomRounds.set(roomKey, roundNumber);

            // Advance the room's current round to the next round using GameRoom
            if (roundGameRoom) {
              roundGameRoom.currentRound = roundNumber + 1;
              // Check if the game is over
              if (roundGameRoom.currentRound > roundGameRoom.maxRounds) {
                roundGameRoom.isGameOver = true;
                roundGameRoom.wasScored = true;
              }
              // Prepare players for the next round
              roundGameRoom.players = roundGameRoom.players.map((p) => ({
                ...p,
                tacticUsed: [],
                isReady: false,
                scoreUpdated: false,
                streakUpdated: false,
              }));
            }

            // Also update legacy room
            if (roundRoom) {
              roundRoom.currentRound = roundNumber + 1;
              roundRoom.players = roundRoom.players.map((p) => ({
                ...p,
                tacticUsed: [],
                isReady: false,
                scoreUpdated: false,
                streakUpdated: false,
              }));
            }

            // Update instance-level for backward compatibility
            this.currentRound = roundNumber + 1;

            // Advance the current news card to the next card in the deck
            // so ALL clients receive the same authoritative next card
            const nextCardIndex = roundNumber; // currentRound is now roundNumber+1, cardIndex = currentRound-1 = roundNumber
            if (roundGameRoom && roundGameRoom.deck?.data?.[nextCardIndex]) {
              roundGameRoom.currentNewsCard =
                roundGameRoom.deck.data[nextCardIndex];
            }

            // Broadcast the reset player state so clients update their UI (e.g., hide ready icons)
            const resetPlayers =
              roundGameRoom?.players || roundRoom?.players || [];
            this.room.broadcast(
              JSON.stringify({
                type: "roomUpdate",
                room: roomKey,
                players: resetPlayers,
                currentRound: roundNumber + 1,
                maxRounds: roundGameRoom?.maxRounds || 5,
                isGameOver: roundGameRoom?.isGameOver || false,
                count: resetPlayers.length,
                cardIndex: nextCardIndex,
                newsCard: roundGameRoom?.currentNewsCard || null,
              }),
            );
          } else {
            console.error(
              "❌ [endOfRound] Invalid players data or room not found:",
            );
          }
          break;
        default:
          break;
      }
    } catch (error) {
      console.error("Unexpected error in onMessage handler:", error);
      sender.send(
        JSON.stringify({
          type: "error",
          message: "Server error processing message",
        }),
      );
    }
  }

  onClose(connection: Party.Connection) {
    // Get the player ID from connection mapping
    const playerId =
      this.connectionToPlayerId.get(connection.id) || connection.id;

    this.room.broadcast(
      JSON.stringify({
        type: "announcement",
        text: `So sad! ${connection.id} left the party!`,
      }),
    );

    // Find GameRoom using the mapped player ID
    let foundGameRoom: GameRoom | undefined;
    for (const [, gameRoom] of this.gameRooms) {
      if (gameRoom.getPlayer(playerId)) {
        foundGameRoom = gameRoom;
        break;
      }
    }

    // Also find legacy room for backward compatibility
    const room = this.rooms.find((r) =>
      r.players.some((player) => player.id === playerId),
    );

    if (foundGameRoom) {
      // Remove player from GameRoom
      foundGameRoom.removePlayer(playerId);

      // Sync to legacy room
      if (room) {
        room.players = foundGameRoom.players;
        room.count = foundGameRoom.count;
      }

      // Broadcast updated room state from GameRoom
      this.room.broadcast(JSON.stringify(foundGameRoom.toRoomUpdate()));

      // Only schedule deletion if there are truly no players remaining
      // (no active players AND no disconnected players expecting to reconnect)
      if (foundGameRoom.isEmpty) {
        if (foundGameRoom.wasScored) {
          this.deleteRoom(foundGameRoom.name);
        } else {
          this.scheduleRoomDeletion(foundGameRoom.name);
          // Also tell lobby to schedule its own timer (survives DO hibernation)
          this.notifyLobby("scheduleRoomDeletion", foundGameRoom.name);
        }
      } else if (
        foundGameRoom.hasNoActivePlayers &&
        foundGameRoom.hasDisconnectedPlayers
      ) {
        // All active connections gone but disconnected players exist (mid-game)
        // Schedule a longer grace period to allow reconnection
        this.cancelRoomDeletionTimer(foundGameRoom.name);
        const reconnectTimer = setTimeout(() => {
          // If still no active players after grace period, clear disconnected and delete
          if (foundGameRoom.hasNoActivePlayers) {
            foundGameRoom.disconnectedPlayers.clear();
            this.deleteRoom(foundGameRoom.name);
            this.notifyLobby("notifyRoomDeleted", foundGameRoom.name);
          }
        }, 120000); // 2 minute grace period for reconnection
        this.roomDeletionTimers.set(foundGameRoom.name, reconnectTimer);
      }
    } else if (room) {
      // Fallback to legacy room handling
      room.players = room.players.filter((player) => player.id !== playerId);
      room.count = room.players.length;

      this.room.broadcast(
        JSON.stringify({
          type: "roomUpdate",
          room: room.name,
          count: room.count,
          players: room.players,
          deck: room.deck,
          currentRound: room.currentRound || 1,
          cardIndex: (room.currentRound || 1) - 1,
          newsCard: room.currentNewsCard,
          themeStyle: room.currentTheme || "all",
        }),
      );

      // If the room is empty, schedule deletion after 30 seconds
      if (room.count === 0) {
        this.scheduleRoomDeletion(room.name);
        this.notifyLobby("scheduleRoomDeletion", room.name);
      }
    }

    // Remove the player from the global players list and clean up connection mapping
    this.players = this.players.filter((player) => player.id !== playerId);
    this.connectionToPlayerId.delete(connection.id);
  }

  // HTTP handler to allow querying room state (e.g., from lobby)
  async onRequest(request: Party.Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Handle POST for creating rooms (and internal notifications from game rooms)
    if (request.method === "POST") {
      const url = new URL(request.url);

      // --- Internal cross-room notifications (from game room servers) ---

      // A game room was deleted (game over + empty, or 30s timer fired)
      if (url.searchParams.has("notifyRoomDeleted")) {
        const roomName = url.searchParams.get("notifyRoomDeleted")!;
        // Cancel any pending lobby timer for this room
        this.cancelRoomDeletionTimer(roomName);
        // Remove from lobby's registry
        this.gameRooms.delete(roomName);
        this.rooms = this.rooms.filter((r) => r.name !== roomName);
        // Broadcast to lobby clients so they remove the room tab
        this.room.broadcast(
          JSON.stringify({
            type: "roomDeleted",
            roomName: roomName,
            availableRooms: Array.from(this.gameRooms.keys()),
          }),
        );
        return new Response("ok", {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // A game room became empty but game didn't end — schedule 30s deletion on lobby
      // Instead of blindly deleting after 30s (the lobby's GameRoom copies are always "empty"),
      // verify with the actual room server before removing.
      if (url.searchParams.has("scheduleRoomDeletion")) {
        const roomName = url.searchParams.get("scheduleRoomDeletion")!;
        const existingRoom = this.gameRooms.get(roomName);
        // Skip auto-deletion for teacher-created rooms
        if (existingRoom?.teacherCreated) {
          return new Response("ok", {
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
        if (this.gameRooms.has(roomName)) {
          // Cancel any existing timer first
          this.cancelRoomDeletionTimer(roomName);

          const timer = setTimeout(async () => {
            this.roomDeletionTimers.delete(roomName);
            try {
              // Ask the actual room server if it's really empty
              const roomStub = this.room.context.parties.main.get(roomName);
              const res = await roomStub.fetch("/");
              if (res.ok) {
                const data = (await res.json()) as {
                  count?: number;
                  disconnectedCount?: number;
                };
                if (
                  data.count === 0 &&
                  (!data.disconnectedCount || data.disconnectedCount === 0)
                ) {
                  // Room is truly empty — remove from lobby registry
                  this.gameRooms.delete(roomName);
                  this.rooms = this.rooms.filter((r) => r.name !== roomName);
                  this.room.broadcast(
                    JSON.stringify({
                      type: "roomDeleted",
                      roomName,
                      availableRooms: Array.from(this.gameRooms.keys()),
                    }),
                  );
                }
                // Otherwise someone rejoined — do nothing
              }
            } catch (err) {
              console.error(
                `[Lobby] Failed to verify room ${roomName} before deletion:`,
                err,
              );
            }
          }, 30000);

          this.roomDeletionTimers.set(roomName, timer);
        }
        return new Response("ok", {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // A game room completed — store results for teacher-created games
      if (url.searchParams.has("notifyGameResults")) {
        const roomName = url.searchParams.get("notifyGameResults")!;
        try {
          const body = (await request.json()) as {
            players?: { name: string; score: number; avatar: string }[];
            teacherId?: string;
          };
          if (body.players && body.players.length > 0) {
            const result = {
              roomName,
              teacherId: body.teacherId || "",
              players: body.players,
              completedAt: Date.now(),
            };
            this.gameResults.push(result);
            // Broadcast to any connected admin clients (include teacherId for filtering)
            this.room.broadcast(
              JSON.stringify({
                type: "gameResultsUpdated",
                teacherId: result.teacherId,
                gameResult: result,
              }),
            );
          }
        } catch (err) {
          console.error("[Lobby] Failed to parse game results:", err);
        }
        return new Response("ok", {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // A player joined a previously empty room — cancel any pending deletion
      if (url.searchParams.has("cancelRoomDeletion")) {
        const roomName = url.searchParams.get("cancelRoomDeletion")!;
        this.cancelRoomDeletionTimer(roomName);
        return new Response("ok", {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // Audio settings forwarded from lobby to game room instance
      if (url.searchParams.has("updateAudioSettings")) {
        try {
          const body = (await request.json()) as {
            volumeLocked?: boolean;
            musicMuted?: boolean;
            sfxMuted?: boolean;
            musicVolume?: number;
            sfxVolume?: number;
            teacherCreated?: boolean;
            teacherId?: string;
          };
          // Apply to the game room on THIS instance (the actual game room server)
          const roomName = this.room.id;
          const gameRoom = this.getOrCreateGameRoom(roomName);
          gameRoom.volumeLocked = body.volumeLocked === true;
          gameRoom.musicMuted = body.musicMuted === true;
          gameRoom.sfxMuted = body.sfxMuted === true;
          if (typeof body.musicVolume === "number") gameRoom.musicVolume = body.musicVolume;
          if (typeof body.sfxVolume === "number") gameRoom.sfxVolume = body.sfxVolume;
          if (body.teacherCreated !== undefined) {
            gameRoom.teacherCreated = body.teacherCreated === true;
          }
          if (body.teacherId !== undefined) {
            gameRoom.teacherId = body.teacherId;
          }
          // Broadcast updated state to all connected players
          this.room.broadcast(JSON.stringify(gameRoom.toRoomUpdate()));
        } catch {
          // Ignore parse errors
        }
        return new Response("ok", {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      // --- Client-facing POST: create a new room ---
      try {
        const body = (await request.json()) as {
          roomName?: string;
          teacherCreated?: boolean;
          teacherId?: string;
          volumeLocked?: boolean;
          musicMuted?: boolean;
          sfxMuted?: boolean;
          musicVolume?: number;
          sfxVolume?: number;
        };
        const roomName = body.roomName;

        if (roomName && !this.gameRooms.has(roomName)) {
          // Create the GameRoom instance
          const gameRoom = this.getOrCreateGameRoom(roomName);

          // Mark as teacher-created if flagged and associate teacher ID
          if (body.teacherCreated) {
            gameRoom.teacherCreated = true;
            gameRoom.teacherId = body.teacherId || "";
            gameRoom.volumeLocked = body.volumeLocked === true;
            gameRoom.musicMuted = body.musicMuted === true;
            gameRoom.sfxMuted = body.sfxMuted === true;
            if (typeof body.musicVolume === "number") gameRoom.musicVolume = body.musicVolume;
            if (typeof body.sfxVolume === "number") gameRoom.sfxVolume = body.sfxVolume;
          }

          // Forward teacher settings to the game room instance so players receive them
          if (body.teacherCreated) {
            try {
              const roomStub = this.room.context.parties.main.get(roomName);
              roomStub
                .fetch("/?updateAudioSettings=true", {
                  method: "POST",
                  body: JSON.stringify({
                    teacherCreated: true,
                    teacherId: body.teacherId || "",
                    volumeLocked: body.volumeLocked === true,
                    musicMuted: body.musicMuted === true,
                    sfxMuted: body.sfxMuted === true,
                    musicVolume: body.musicVolume,
                    sfxVolume: body.sfxVolume,
                  }),
                })
                .catch(() => {});
            } catch {
              // Game room instance may not exist yet
            }
          }

          // Also add to legacy rooms array
          if (!this.rooms.find((r) => r.name === roomName)) {
            this.rooms.push({ name: roomName, count: 0, players: [] });
          }

          // Broadcast to all connected clients
          const availableRooms = Array.from(this.gameRooms.keys());
          this.room.broadcast(
            JSON.stringify({
              type: "roomCreated",
              roomName: roomName,
              availableRooms: availableRooms,
            }),
          );

          return new Response(
            JSON.stringify({ success: true, roomName, availableRooms }),
            {
              status: 201,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            },
          );
        }

        return new Response(
          JSON.stringify({ error: "Room already exists or invalid name" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      } catch (error) {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    if (request.method === "GET") {
      const url = new URL(request.url);

      // Return stored game results for teacher-created rooms
      if (url.searchParams.get("gameResults") === "true") {
        const teacherId = url.searchParams.get("teacherId") || "";
        // Only return results belonging to the requesting teacher
        const filtered = teacherId
          ? this.gameResults.filter((r) => r.teacherId === teacherId)
          : [];
        return new Response(JSON.stringify({ gameResults: filtered }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Check if this is a request for available rooms (lobby endpoint)
      if (
        url.searchParams.get("availableRooms") === "true" ||
        this.room.id === "lobby"
      ) {
        // Return list of all available rooms with their player counts
        const availableRooms = Array.from(this.gameRooms.entries()).map(
          ([name, gameRoom]) => ({
            name,
            count: gameRoom.count,
            players: gameRoom.players,
            isFull: gameRoom.isFull,
            isInProgress: gameRoom.isInProgress,
            isGameOver: gameRoom.isGameOver,
            teacherCreated: gameRoom.teacherCreated,
            disconnectedPlayerNames: Array.from(
              gameRoom.disconnectedPlayers.keys(),
            ),
            disconnectedCount: gameRoom.disconnectedPlayers.size,
          }),
        );

        return new Response(JSON.stringify({ rooms: availableRooms }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Return current room state (players in this room)
      // Include status flags from the GameRoom (the actual source of truth)
      const currentGameRoom = this.gameRooms.values().next().value;
      const roomData = {
        room: this.room.id,
        players: currentGameRoom ? currentGameRoom.players : this.players,
        count: currentGameRoom ? currentGameRoom.count : this.players.length,
        isFull: currentGameRoom ? currentGameRoom.isFull : false,
        isInProgress: currentGameRoom ? currentGameRoom.isInProgress : false,
        isGameOver: currentGameRoom ? currentGameRoom.isGameOver : false,
        teacherCreated: currentGameRoom
          ? currentGameRoom.teacherCreated
          : false,
        disconnectedPlayerNames: currentGameRoom
          ? Array.from(currentGameRoom.disconnectedPlayers.keys())
          : [],
        disconnectedCount: currentGameRoom
          ? currentGameRoom.disconnectedPlayers.size
          : 0,
      };

      return new Response(JSON.stringify(roomData), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Handle DELETE for removing teacher-created rooms
    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const roomName = url.searchParams.get("roomName");
      const teacherId = url.searchParams.get("teacherId");

      if (!roomName) {
        return new Response(
          JSON.stringify({ error: "Missing roomName parameter" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      const gameRoom = this.gameRooms.get(roomName);
      if (!gameRoom) {
        return new Response(JSON.stringify({ error: "Room not found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Only allow deletion of teacher-created rooms by the same teacher
      if (!gameRoom.teacherCreated || gameRoom.teacherId !== teacherId) {
        return new Response(
          JSON.stringify({ error: "Not authorized to delete this room" }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      // Delete the room
      this.cancelRoomDeletionTimer(roomName);
      this.gameRooms.delete(roomName);
      this.rooms = this.rooms.filter((r) => r.name !== roomName);

      // Broadcast room deletion to all connected clients
      const availableRooms = Array.from(this.gameRooms.keys());
      this.room.broadcast(
        JSON.stringify({
          type: "roomDeleted",
          roomName: roomName,
          availableRooms: availableRooms,
        }),
      );

      return new Response(
        JSON.stringify({ success: true, roomName, availableRooms }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    return new Response("Method not allowed", { status: 405 });
  }
}

export const getPlayers = (room: Party.Room) => {
  return new Server(room).getPlayers();
};

export const getPlayedCards = (room: Party.Room) => {
  return new Server(room).getPlayedCards();
};

export const getInfluencerCards = (room: Party.Room) => {
  return new Server(room).getInfluencerCards();
};

// Utility function to shuffle the influencer deck
// Creates a deep copy to avoid mutating the cached import
export function shuffleInfluencerDeck(array: object[]) {
  // Create a deep copy to avoid mutating the original imported array
  const shuffled = JSON.parse(JSON.stringify(array));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap elements
  }
  return shuffled;
}
