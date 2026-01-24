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

console.log("🚀 PartyKit Server deployed and ready! Updated Version 2.0");

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

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
    console.log("Client connected to room:", this.room.id);

    if (this.room.id === "lobby") {
      // Lobby-specific logic here
    } else {
      if (this.players.length >= 5) {
        conn.send(
          JSON.stringify({
            type: "announcement",
            text: `Room is full. Only 5 players are allowed.`,
          })
        );
        conn.close();
        return; // Exit early to prevent further processing
      } else {
        conn.send(
          JSON.stringify({ type: "announcement", text: `Welcome, ${conn.id}` })
        );
        conn.send(JSON.stringify({ type: "id", id: `id+${conn.id}` }));
        this.room.broadcast(
          JSON.stringify({
            type: "",
            room: this.room,
            roomCount: this.players.length,
          }),
          [conn.id]
        );
      }
    }
    this.room.broadcast(
      JSON.stringify({
        type: "announcement",
        text: `Heads up! ${conn.id} joined the party!`,
      })
    );
  }

  onMessage(message: string, sender: Party.Connection) {
    const parsedContent = parseContent(message);
    try {
      switch (parsedContent?.type) {
        case "getPlayerId":
          sender.send(JSON.stringify({ type: "playerId", id: sender.id }));
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
            })
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
              [sender.id]
            );
            sender.send(JSON.stringify({ type: "playerId", id: sender.id }));

            // Ensure player object exists and has required fields
            if (!parsedContent.player) {
              console.error("Invalid playerEnters: missing player object");
              sender.send(
                JSON.stringify({
                  type: "error",
                  message: "Missing player object in playerEnters message",
                })
              );
              break;
            }

            parsedContent.player.id = sender.id;
            parsedContent.player.score = 0;

            // Add player to the room they joined
            let room = this.rooms.find((r) => r.name === parsedContent.room);
            if (!room) {
              room = { name: parsedContent.room, count: 0, players: [] };
              this.rooms.push(room);
            }
            room.players.push(parsedContent.player);
            room.count = room.players.length;

            this.players.push(parsedContent.player);

            if (!room.deck) {
              this.deckReady = shuffleInfluencerDeck(
                startingDeck.influencerCards
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
            this.room.broadcast(
              JSON.stringify({
                type: "roomUpdate",
                room: room.name,
                count: room.count,
                players: room.players,
                deck: room.deck,
                currentRound: this.currentRound,
                cardIndex: this.currentRound - 1, // card index corresponds to round
                newsCard: this.currentNewsCard,
                themeStyle: this.currentTheme,
              })
            );

            console.log(
              `Player ${parsedContent.player.name} (${sender.id}) entered room ${parsedContent.room}`
            );
          } catch (error) {
            console.error("Error handling playerEnters:", error);
            sender.send(
              JSON.stringify({
                type: "error",
                message: "Server error processing playerEnters",
              })
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
            JSON.stringify({ type: "villain", villain: parsedContent.villain })
          );
          break;
        case "playerReady":
          // Find the specific room this player is in
          const readyRoom = this.rooms.find(
            (r) => r.name === parsedContent.room
          );
          if (readyRoom) {
            // Update players in that specific room
            readyRoom.players = readyRoom.players.map((player) => {
              if (player.id === sender.id) {
                player.isReady = true;
              }
              const updatedPlayer = parsedContent.players.find(
                (p: Player) => p.id === player.id
              );
              if (updatedPlayer) {
                return {
                  ...player,
                  ...updatedPlayer,
                  // Preserve server-scored fields during ready updates
                  score: player.score,
                  streak: player.streak,
                  hasStreak: player.hasStreak,
                };
              }
              return player;
            });

            // Also update global players list
            this.players = this.players.map((player) => {
              if (player.id === sender.id) {
                player.isReady = true;
              }
              const updatedPlayer = parsedContent.players.find(
                (p: Player) => p.id === player.id
              );
              if (updatedPlayer) {
                return {
                  ...player,
                  ...updatedPlayer,
                  // Preserve server-scored fields during ready updates
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
                roomData: readyRoom.players,
                sender: sender.id,
              })
            );
          }
          break;
        case "playerNotReady":
          // Find the specific room this player is in
          const notReadyRoom = this.rooms.find(
            (r) => r.name === parsedContent.room
          );
          if (notReadyRoom) {
            // Update players in that specific room
            notReadyRoom.players = notReadyRoom.players.map((player) => {
              if (player.id === sender.id) {
                player.isReady = false;
              }
              const updatedPlayer = parsedContent.players.find(
                (p: Player) => p.id === player.id
              );
              if (updatedPlayer) {
                return {
                  ...player,
                  ...updatedPlayer,
                  // Preserve server-scored fields when toggling ready
                  score: player.score,
                  streak: player.streak,
                  hasStreak: player.hasStreak,
                };
              }
              return player;
            });

            // Also update global players list
            this.players = this.players.map((player) => {
              if (player.id === sender.id) {
                player.isReady = false;
              }
              const updatedPlayer = parsedContent.players.find(
                (p: Player) => p.id === player.id
              );
              if (updatedPlayer) {
                return {
                  ...player,
                  ...updatedPlayer,
                  // Preserve server-scored fields when toggling ready
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
              })
            );
          }
          break;
        case "allReady":
          const allReady = this.players.every((player) => player.isReady);
          this.room.broadcast(
            JSON.stringify({ type: "allReady", roomData: allReady })
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
            (r) => r.name === parsedContent.room
          );
          if (currentRoom && !currentRoom.deck) {
            currentRoom.deck = this.shuffledDeck;
            this.rooms = this.rooms.map((room) =>
              room.name === currentRoom.name ? currentRoom : room
            );
          } else {
            console.error(`Room ${parsedContent.room} not found.`);
          }

          this.room.broadcast(JSON.stringify(this.shuffledDeck));

          break;
        case "playerLeaves": {
          // Remove player from the specified room
          const leaveRoom = this.rooms.find(
            (r) => r.name === parsedContent.room
          );
          if (leaveRoom) {
            leaveRoom.players = leaveRoom.players.filter(
              (p) => p.id !== sender.id
            );
            leaveRoom.count = leaveRoom.players.length;

            // Update global players list
            this.players = this.players.filter((p) => p.id !== sender.id);

            this.room.broadcast(
              JSON.stringify({
                type: "roomUpdate",
                room: leaveRoom.name,
                count: leaveRoom.count,
                players: leaveRoom.players,
                deck: leaveRoom.deck,
                currentRound: this.currentRound,
                cardIndex: this.currentRound - 1,
                newsCard: this.currentNewsCard,
                themeStyle: this.currentTheme,
              })
            );

            // Remove empty room
            if (leaveRoom.count === 0) {
              this.rooms = this.rooms.filter((r) => r.name !== leaveRoom.name);
            }
          }
          break;
        }
        case "endOfRound":
          // Identify the room this round belongs to so we only score that room
          const roundRoom = this.rooms.find(
            (r) => r.name === parsedContent.room
          );
          const playersToScore = Array.isArray(parsedContent.players)
            ? parsedContent.players
            : roundRoom?.players;

          if (roundRoom && Array.isArray(playersToScore)) {
            const updatedPlayers = calculateScore(
              playersToScore,
              roundRoom.players,
              this.influencerCard,
              this.currentRound
            );

            // Update the room's players with the calculated scores
            roundRoom.players = updatedPlayers;

            if (areAllScoresUpdated(roundRoom.players)) {
              // Persist back into global players list as well
              this.players = this.players.map((p) => {
                const updated = roundRoom.players.find((rp) => rp.id === p.id);
                return updated ? { ...p, ...updated } : p;
              });

              roundRoom.players.forEach((player) => {
                resetPlayerForNextRound(player);
                this.wasScored = false; // Reset wasScored for the next round
              });

              this.room.broadcast(
                JSON.stringify({
                  type: "scoreUpdate",
                  room: roundRoom.name,
                  players: roundRoom.players,
                })
              );
            } else {
              console.error(
                "Not all players have their scores updated for room",
                roundRoom.name
              );
            }
          } else {
            console.error(
              "Invalid players data in parsedContent or room not found"
            );
          }
          break;
        default:
          console.log(
            parsedContent,
            "this is what my parsedContent is getting "
          );
          console.log(`Unknown message type: ${parsedContent?.type}`);
          break;
      }
    } catch (error) {
      console.error("Unexpected error in onMessage handler:", error);
      sender.send(
        JSON.stringify({
          type: "error",
          message: "Server error processing message",
        })
      );
    }
  }

  onClose(connection: Party.Connection) {
    this.room.broadcast(
      JSON.stringify({
        type: "announcement",
        text: `So sad! ${connection.id} left the party!`,
      })
    );

    const room = this.rooms.find((r) =>
      r.players.some((player) => player.id === connection.id)
    );

    if (room) {
      room.players = room.players.filter(
        (player) => player.id !== connection.id
      );
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
        })
      );

      // If the room is empty, remove it from the list
      if (room.count === 0) {
        this.rooms = this.rooms.filter((r) => r.name !== room.name);
      }
    }

    // Remove the player from the global players list
    this.players = this.players.filter((player) => player.id !== connection.id);
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
