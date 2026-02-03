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

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {
    // Log on first instance creation (per room)
  }

  // Counter for generating unique player IDs (static-like behavior per server instance)
  static playerIdCounter = 0;

  // Generate a unique player ID
  generatePlayerId(): string {
    Server.playerIdCounter++;
    return `player_${Date.now()}_${Server.playerIdCounter}_${Math.random().toString(36).substring(2, 8)}`;
  }

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

  getPlayers() {
    return this.players;
  }

  getPlayedCards() {
    return this.playedCards;
  }

  getInfluencerCards() {
    return this.influencerCard;
  }

  //update this to put everyone in a lobbyRoom
  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (this.room.id === "lobby") {
      // Lobby-specific logic here
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
            room: this.room,
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

            // Find or create the room first
            let room = this.rooms.find((r) => r.name === parsedContent.room);
            if (!room) {
              room = { name: parsedContent.room, count: 0, players: [] };
              this.rooms.push(room);
            }

            // Check if client-provided playerId already exists in this room
            // If so, generate a new unique ID to prevent duplicate player issues
            let clientPlayerId = parsedContent.player.id;
            const existingPlayerWithSameId = room.players.find(
              (p) => p.id === clientPlayerId,
            );

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
            parsedContent.player.score = 0;

            // Store mapping from connection ID to player ID
            this.connectionToPlayerId.set(sender.id, parsedContent.player.id);

            room.players.push(parsedContent.player);
            room.count = room.players.length;

            this.players.push(parsedContent.player);

            if (!room.deck) {
              this.deckReady = shuffleInfluencerDeck(
                startingDeck.influencerCards,
              );
              this.shuffledDeck = {
                type: "shuffledDeck",
                data: this.deckReady,
                isShuffled: true,
              };
              room.deck = this.shuffledDeck;
            }

            // Broadcast updated room data to all players in the room
            // Include current round and card index so all players sync to same card
            const roomUpdateMessage = {
              type: "roomUpdate",
              room: room.name,
              count: room.count,
              players: room.players,
              deck: room.deck,
              currentRound: this.currentRound,
              cardIndex: this.currentRound - 1, // card index corresponds to round
              newsCard: this.currentNewsCard,
              themeStyle: this.currentTheme,
            };

            this.room.broadcast(JSON.stringify(roomUpdateMessage));
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
          // Store the influencer card with the correct tactic array for scoring
          this.influencerCard = {
            villain: parsedContent.villain || "",
            tactic:
              parsedContent.tactic || parsedContent.newsCard?.tacticUsed || [],
          };
          // Store the full newsCard and theme for new players joining
          if (parsedContent.newsCard) {
            this.currentNewsCard = parsedContent.newsCard;
          }
          if (parsedContent.villain) {
            this.currentTheme = parsedContent.villain;
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

          // Find the specific room this player is in
          const readyRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          if (readyRoom) {
            // Update ONLY the player who sent the ready message
            // Do NOT merge client player data - only update isReady and tacticUsed
            readyRoom.players = readyRoom.players.map((player) => {
              if (player.id === readyPlayerId) {
                return {
                  ...player,
                  isReady: true,
                  tacticUsed: tacticUsedFromClient,
                };
              }
              return player;
            });

            // Also update global players list - same approach
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
                roomData: readyRoom.players,
                sender: sender.id,
              }),
            );
          }
          break;
        case "playerNotReady":
          // Get the player ID from connection mapping
          const notReadyPlayerId =
            this.connectionToPlayerId.get(sender.id) || sender.id;

          // Find the specific room this player is in
          const notReadyRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );
          if (notReadyRoom) {
            // Update ONLY the player who clicked not ready
            // Do NOT merge client player data - only update isReady and clear tacticUsed
            notReadyRoom.players = notReadyRoom.players.map((player) => {
              if (player.id === notReadyPlayerId) {
                return {
                  ...player,
                  isReady: false,
                  tacticUsed: [],
                };
              }
              return player;
            });

            // Also update global players list - same approach
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
                roomData: notReadyRoom.players,
                sender: sender.id,
              }),
            );
          }
          break;
        case "playerLeaves":
          // Get the player ID from connection mapping
          const leavingPlayerId =
            this.connectionToPlayerId.get(sender.id) || sender.id;

          // Find the room this player is leaving
          const leavingRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          if (leavingRoom) {
            // Remove player from room
            leavingRoom.players = leavingRoom.players.filter(
              (player) => player.id !== leavingPlayerId,
            );
            leavingRoom.count = leavingRoom.players.length;

            // Broadcast updated room state
            this.room.broadcast(
              JSON.stringify({
                type: "roomUpdate",
                room: leavingRoom.name,
                count: leavingRoom.count,
                players: leavingRoom.players,
                deck: leavingRoom.deck,
                currentRound: this.currentRound,
                cardIndex: this.currentRound - 1,
                newsCard: this.currentNewsCard,
                themeStyle: this.currentTheme,
              }),
            );

            // If room is now empty, reset it
            if (leavingRoom.count === 0) {
              // Remove room from list
              this.rooms = this.rooms.filter(
                (r) => r.name !== leavingRoom.name,
              );

              // Reset room-specific tracking data
              this.scoredRounds.delete(leavingRoom.name);
              this.roomRounds.delete(leavingRoom.name);

              // Reset all game state for fresh start
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
            }
          }

          // Remove from global players list
          this.players = this.players.filter(
            (player) => player.id !== leavingPlayerId,
          );
          // Clean up connection mapping
          this.connectionToPlayerId.delete(sender.id);

          break;
        case "allReady":
          const allReady = this.players.every((player) => player.isReady);
          this.room.broadcast(
            JSON.stringify({ type: "allReady", roomData: allReady }),
          );
          break;
        case "startingDeck":
          if (
            !this.shuffledDeck.isShuffled &&
            this.deckReady.length === 0 &&
            !this.deckReady
          ) {
            this.deckReady = shuffleInfluencerDeck(parsedContent.data);
            this.shuffledDeck = {
              type: "shuffledDeck",
              data: this.deckReady,
              isShuffled: true,
            };
          }

          let currentRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );
          if (currentRoom && !currentRoom.deck) {
            currentRoom.deck = this.shuffledDeck;
            this.rooms = this.rooms.map((room) =>
              room.name === currentRoom.name ? currentRoom : room,
            );
          } else {
            console.error(`Room ${parsedContent.room} not found.`);
          }

          this.room.broadcast(JSON.stringify(this.shuffledDeck));

          break;
        case "endOfRound":
          // Identify the room this round belongs to so we only score that room
          const roundRoom = this.rooms.find(
            (r) => r.name === parsedContent.room,
          );

          const playersToScore = Array.isArray(parsedContent.players)
            ? parsedContent.players
            : roundRoom?.players;

          if (roundRoom && Array.isArray(playersToScore)) {
            // Prevent duplicate scoring for the same round
            const roomKey = roundRoom.name;
            // Derive round number robustly: use provided round, else last+1, else 1
            const lastRound = this.roomRounds.get(roomKey) ?? 0;
            const roundNumber =
              typeof parsedContent.round === "number" && parsedContent.round > 0
                ? parsedContent.round
                : lastRound + 1 || 1;

            if (!this.scoredRounds.has(roomKey)) {
              this.scoredRounds.set(roomKey, new Set());
            }
            const scoredRoundsForRoom = this.scoredRounds.get(roomKey)!;

            if (scoredRoundsForRoom.has(roundNumber)) {
              break;
            }

            // Mark this round as scored
            scoredRoundsForRoom.add(roundNumber);

            const updatedPlayers = calculateScore(
              playersToScore,
              roundRoom.players,
              this.influencerCard,
              roundNumber,
            );

            // Update the room's players with the calculated scores
            roundRoom.players = updatedPlayers;

            if (areAllScoresUpdated(roundRoom.players)) {
              // Persist back into global players list as well
              this.players = this.players.map((p) => {
                const updated = roundRoom.players.find((rp) => rp.id === p.id);
                return updated ? { ...p, ...updated } : p;
              });

              // Don't reset player state here - it will be reset when the next round starts
              // This prevents duplicate endOfRound messages from re-scoring

              this.room.broadcast(
                JSON.stringify({
                  type: "scoreUpdate",
                  room: roundRoom.name,
                  players: roundRoom.players,
                }),
              );

              // Update last scored round for this room and advance to next round
              this.roomRounds.set(roomKey, roundNumber);

              // Advance the server's current round to the next round
              // This ensures new players joining will sync to the correct round
              this.currentRound = roundNumber + 1;

              // Prepare players for the next round without touching score/streak
              // Clear tactics and readiness so next round scoring only considers fresh choices
              roundRoom.players = roundRoom.players.map((p) => ({
                ...p,
                tacticUsed: [],
                isReady: false,
                scoreUpdated: false,
                streakUpdated: false,
                // keep: score, streak, hasStreak, wasCorrect (UI reads from snapshot on client)
              }));
            } else {
              console.error(
                "Not all players have their scores updated for room",
                roundRoom.name,
              );
            }
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

    // Find room using the mapped player ID
    const room = this.rooms.find((r) =>
      r.players.some((player) => player.id === playerId),
    );

    if (room) {
      room.players = room.players.filter((player) => player.id !== playerId);
      room.count = room.players.length;

      this.room.broadcast(
        JSON.stringify({
          type: "roomUpdate",
          room: room.name,
          count: room.count,
          players: room.players,
          deck: room.deck,
          currentRound: this.currentRound,
          cardIndex: this.currentRound - 1,
          newsCard: this.currentNewsCard,
          themeStyle: this.currentTheme,
        }),
      );

      // If the room is empty, reset it to initial state
      if (room.count === 0) {
        // Remove room from list
        this.rooms = this.rooms.filter((r) => r.name !== room.name);

        // Reset room-specific tracking data
        this.scoredRounds.delete(room.name);
        this.roomRounds.delete(room.name);

        // Reset all game state for fresh start
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
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method === "GET") {
      // Return current room state (players in this room)
      const roomData = {
        room: this.room.id,
        players: this.players,
        count: this.players.length,
      };

      return new Response(JSON.stringify(roomData), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
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
export function shuffleInfluencerDeck(array: object[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
  return array;
}
