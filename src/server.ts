import type * as Party from "partykit/server";
import startingDeck from "./data/influencerCards.json";

type Player = {
  id: string;
  name: string;
  room: string;
  avatar: string;
  score: number;
  streak?: number;
  hasStreak?: boolean;
  status?: boolean;
  tacticUsed?: string[];
  wasCorrect?: boolean;
  scoreUpdated?: boolean;
  streakUpdated?: boolean;
};
type Room = {
  name: string;
  count: number;
  players: Player[];
  deck?: shuffledDeck;
  round?: number;
  type?: string; // Added type to Room for deck retrieval
};
type PlayerCard = { id: string; content: string };
type InfluencerCard = { villain: string; tactic: string[] };
type tacticUsed = { tactic: string; player: Player };
type shuffledDeck = { type: string; data: object[]; isShuffled: boolean };
type wasScored = boolean;

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  players: Player[] = [];
  rooms: Room[] = [];
  playedCards: PlayerCard[] = [];
  influencerCard: InfluencerCard = { villain: "biost", tactic: [] };
  tacticsUsed: tacticUsed[] = [];
  currentRound = 1;
  streakBonus = this.currentRound < 5 ? 1 : this.currentRound < 10 ? 2 : 3;
  correctAnswer = 2;
  wrongAnswer = -1;
  shuffledDeck: shuffledDeck = {
    type: "shuffledDeck",
    data: [],
    isShuffled: false,
  };
  deckReady: object[] = [];
  wasScored: wasScored = false;

  getPlayers() {
    return this.players;
  }

  getPlayedCards() {
    return this.playedCards;
  }

  getInfluencerCards() {
    return this.influencerCard;
  }
  resetPlayerForNextRound(player: Player) {
    player.tacticUsed = [];
    player.status = false;
    player.scoreUpdated = false;
  }

  calculateScore(players: Player[]) {
    // Ensure all players have a scoreUpdated property
    this.players = this.players.map((existingPlayer) => {
      const player = players.find((p) => p.id === existingPlayer.id);
      //TODO: only send the player that is being updated from their client

      //   console.log(
      //     players,
      //     "players in calculateScore",
      //     this.influencerCard.tactic
      //   );

      // If the player is not found, return the existing player
      if (!player) return existingPlayer;

      // score will be points for this round currentScore is the players score prior to this round if they have one
      let score = 0;
      let currentScore = existingPlayer.score || 0;
      let anyCorrect = false;
      player.streakUpdated = false;
      player.scoreUpdated = false;

      if (this.influencerCard && this.influencerCard.tactic.length > 0) {
        // set for the streak as long as one card is correct the streak will continue

        // Filter out correct and wrong tactics
        const correctTactics =
          player.tacticUsed?.filter((tactic) =>
            this.influencerCard.tactic.includes(tactic)
          ) || [];
        const wrongTactics =
          player.tacticUsed?.filter(
            (tactic) => !this.influencerCard.tactic.includes(tactic)
          ) || [];

        // Process correct tactics first
        if (correctTactics.length > 0 && !player.scoreUpdated) {
          //   console.log(
          //     player,
          //     player.tacticUsed,
          //     "player.tacticUsed in correctTactics"
          //   );
          correctTactics.forEach(() => {
            score += this.correctAnswer * 50;
            anyCorrect = true;
            // console.log(wrongTactics, "wrongTactics in correctTactics");
            if (wrongTactics.length === 0) {
              //   console.log(
              //     player,
              //     "player after getting something right with no wrongTactics"
              //   );
              player.scoreUpdated = true; // Mark score as updated if no wrong tactics
            }
          });
        }

        // Process wrong tactics second
        if (wrongTactics.length > 0 && !player.scoreUpdated) {
          //   console.log(
          //     player,
          //     player.tacticUsed,
          //     "player.scoreUpdated in wrongTactics"
          //   );
          wrongTactics.forEach(() => {
            score += this.wrongAnswer * 50;
            player.scoreUpdated = true; // Mark score as updated if there are wrong tactics
          });
        }

        // sets the player was correct if any of the tactics were correct
        player.wasCorrect = anyCorrect;
      }
      // add the players current score to the new points for this round
      let updatedScore = currentScore + score;
      updatedScore = Math.max(updatedScore, 0); // Ensure score doesn't go below 0;

      //Once per round update if a streak has continued
      const streak =
        updatedScore > currentScore && !player.streakUpdated && anyCorrect
          ? (player.streak || 0) + 1
          : 0;

      const updatedPlayer: Player = {
        ...existingPlayer,
        score: updatedScore,
        streak,
        hasStreak: streak >= 3, // Set hasStreak if streak is greater than 3
        scoreUpdated: true, // Mark score as updated
        streakUpdated: true, // Mark streak as updated
        wasCorrect: player.wasCorrect, // Ensure wasCorrect is set
      };

      if (updatedPlayer?.hasStreak) {
        updatedPlayer.score += this.streakBonus * 50; // Add streak bonus
      }
      this.wasScored = true; // Mark that scoring has occurred
      return updatedPlayer;
    });
  }
  areAllScoresUpdated(players: Player[]): boolean {
    return players.every((player) => player.scoreUpdated);
  }

  parseContent(content: string): any {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (typeof parsed === "object") {
        return parsed;
      }
    } catch (e) {
      // If JSON.parse fails, return the content as a string
      return content;
    }
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    if (ctx.request.url.split("/")[5].split("?")[0] === "lobby") {
    } else {
      if (this.players.length >= 5) {
        conn.send(
          JSON.stringify({
            type: "announcement",
            text: `Room is full. Only 5 players are allowed.`,
          })
        );
        conn.close();
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
    const parsedContent = this.parseContent(message);

    switch (parsedContent?.type) {
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
        this.room.broadcast(
          JSON.stringify({
            type: "announcement",
            text: `Player joined: ${parsedContent.playerName}`,
          }),
          [sender.id]
        );
        sender.send(JSON.stringify({ type: "playerId", id: sender.id }));
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
          //   console.log(
          //     "No deck found, creating a new shuffled deck ---- in conditional"
          //   );
          this.deckReady = shuffleInfluencerDeck(startingDeck.influencerCards);
          this.shuffledDeck = {
            type: "shuffledDeck",
            data: this.deckReady,
            isShuffled: true,
          };
          room.deck = this.shuffledDeck;
        }
        // Broadcast updated room data to all players in the room
        this.room.broadcast(
          JSON.stringify({
            type: "roomUpdate",
            room: room.name,
            count: room.count,
            players: room.players,
            deck: room.deck,
          })
        );

        break;
      //   case "playerLeft":
      //TODO: Handle player leaving the room
      // this.players = this.players.filter((player) => player.id !== sender.id);
      // this.room.broadcast(
      //   JSON.stringify({ type: "playerLeft", playerId: sender.id })
      // );
      // Update room data after player leaves
      // console.log("am I here-----------------------------------------------");
      // // console.log(this.players);
      // const updatedRoom = this.rooms.find(
      //   (r) => r.name === parsedContent.room
      // );
      // if (updatedRoom) {
      //   updatedRoom.players = updatedRoom.players.filter(
      //     (player) => player.id !== sender.id
      //   );
      //   console.log(updatedRoom, "updatedRoom after player leaves");
      //   updatedRoom.count = updatedRoom.players.length;
      //   this.room.broadcast(
      //     JSON.stringify({
      //       type: "roomUpdate-PlayerLeft",
      //       room: updatedRoom.name,
      //       count: updatedRoom.count,
      //       roomData: updatedRoom.players,
      //     })
      //   );
      //   // If the room is empty, remove it from the list
      //   if (updatedRoom.count === 0) {
      //     this.rooms = this.rooms.filter((r) => r.name !== updatedRoom.name);
      //   }
      // }
      // break;

      case "influencer":
        this.influencerCard = parsedContent;
        this.room.broadcast(
          JSON.stringify({ type: "villain", villain: parsedContent.villain })
        );
        break;
      case "playerReady":
        this.players = this.players.map((player) => {
          if (player.id === sender.id) {
            player.status = true; // Set the sender's player status to true
          }

          const updatedPlayer = parsedContent.players.find(
            (p: Player) => p.id === player.id
          );
          updatedPlayer.status = player.status; // Ensure the status is preserved
          return updatedPlayer ? { ...player, ...updatedPlayer } : player;
        });
        this.room.broadcast(
          JSON.stringify({
            type: "playerReady",
            roomData: this.players,
            sender: sender.id,
          })
        );
        break;
      case "allReady":
        const allReady = this.players.every((player) => player.status);
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

        let currentRoom = this.rooms.find((r) => r.name === parsedContent.room);
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
      case "endOfRound":
        if (Array.isArray(parsedContent.players)) {
          this.calculateScore(parsedContent.players);

          if (this.areAllScoresUpdated(this.players)) {
            this.players.forEach((player) => {
              this.resetPlayerForNextRound(player);
              this.wasScored = false; // Reset wasScored for the next round
            });

            this.room.broadcast(
              JSON.stringify({
                type: "scoreUpdate",
                players: this.players,
              })
            );
          } else {
            console.error("Not all players have their scores updated");
          }
        } else {
          console.error("Invalid players data in parsedContent");
        }
        break;
      default:
        console.log(`Unknown message type: ${parsedContent?.type}`);
        break;
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
          type: "roomUpdate-PlayerLeft",
          room: room.name,
          count: room.count,
          roomData: room.players,
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
