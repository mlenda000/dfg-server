import type * as Party from "partykit/server";

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
};
type Room = { name: string; count: number; players: Player[] };
type PlayerCard = { id: string; content: string };
type InfluencerCard = { villain: string; tactic: string[] };
type tacticUsed = { tactic: string; player: Player };
type shuffledDeck = { type: string; data: string[]; isShuffled: boolean };

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
  deckReady: string[] = [];

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
  }

  calculateScore(players: Player[]) {
    // Ensure all players have a scoreUpdated property
    this.players = this.players.map((existingPlayer) => {
      const player = players.find((p) => p.id === existingPlayer.id);

      // If the player is not found, return the existing player
      if (!player) return existingPlayer;

      // score will be points for this round currentScore is the players score prior to this round if they have one
      let score = 0;
      let currentScore = existingPlayer.score || 0;

      if (this.influencerCard && this.influencerCard.tactic.length > 0) {
        // set for the streak as long as one card is correct the streak will continue
        let anyCorrect = false;

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
        if (correctTactics.length > 0) {
          correctTactics.forEach(() => {
            score += this.correctAnswer * 50;
            anyCorrect = true;
          });
        }

        // Process wrong tactics second
        if (wrongTactics.length > 0) {
          wrongTactics.forEach(() => {
            score += this.wrongAnswer * 50;
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
        updatedScore > currentScore &&
        !existingPlayer.scoreUpdated &&
        player.wasCorrect
          ? (existingPlayer.streak || 0) + 1
          : 0;

      const updatedPlayer: Player = {
        ...existingPlayer,
        score: updatedScore,
        streak,
        hasStreak: streak >= 3, // Set hasStreak if streak is greater than 3
        scoreUpdated: true, // Mark score as updated
        wasCorrect: player.wasCorrect || false, // Ensure wasCorrect is set
      };

      if (updatedPlayer?.hasStreak) {
        updatedPlayer.score += this.streakBonus * 50; // Add streak bonus
      }

      this.resetPlayerForNextRound(updatedPlayer);
      console.log(
        `Player ${updatedPlayer.name} score updated: ${updatedPlayer.score}`
      );

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
    console.log(message, "message received ---------------------");
    const parsedContent = this.parseContent(message);
    console.log("Received message:", parsedContent);
    switch (parsedContent?.type) {
      case "enteredLobby":
        console.log(parsedContent, "entered lobby ---------------------");
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
        console.log("Room data:", roomData);

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
        room.count++;

        this.players.push(parsedContent.player);

        // Broadcast updated room data to all players in the room
        this.room.broadcast(
          JSON.stringify({
            type: "roomUpdate",
            room: room.name,
            count: room.count,
            players: room.players,
          })
        );
        sender.send(JSON.stringify(this.shuffledDeck));
        break;
      case "playerLeft":
        //TODO: Handle player leaving the room
        this.players = this.players.filter((player) => player.id !== sender.id);
        this.room.broadcast(
          JSON.stringify({ type: "playerLeft", playerId: sender.id })
        );
        // Update room data after player leaves
        const updatedRoom = this.rooms.find(
          (r) => r.name === parsedContent.room
        );
        if (updatedRoom) {
          updatedRoom.players = updatedRoom.players.filter(
            (player) => player.id !== sender.id
          );
          updatedRoom.count = updatedRoom.players.length;
          this.room.broadcast(
            JSON.stringify({
              type: "roomUpdate",
              room: updatedRoom.name,
              count: updatedRoom.count,
              roomData: updatedRoom.players,
            })
          );
          // If the room is empty, remove it from the list
          if (updatedRoom.count === 0) {
            this.rooms = this.rooms.filter((r) => r.name !== updatedRoom.name);
          }
        }
        break;

      case "influencer":
        console.log(parsedContent);
        this.influencerCard = parsedContent;
        console.log("Influencer card set:", this.influencerCard);
        this.room.broadcast(
          JSON.stringify({ type: "villain", villain: parsedContent.villain })
        );
        break;
      case "roundStart":
        //TODO: Handle round start logic
        console.log("Round started", parsedContent);

        break;
      case "playerReady":
        this.players = this.players.map((player) => {
          console.log(sender.id, "sender id");
          console.log(player.id, "player id");
          console.log(player.id === sender.id);
          if (player.id === sender.id) {
            player.status = true; // Set the sender's player status to true
          }

          const updatedPlayer = parsedContent.players.find(
            (p: Player) => p.id === player.id
          );
          updatedPlayer.status = player.status; // Ensure the status is preserved
          return updatedPlayer ? { ...player, ...updatedPlayer } : player;
        });
        console.log(this.players, "players after ready status update");
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
        if (!this.shuffledDeck.isShuffled && !this.deckReady.length) {
          this.deckReady = shuffleInfluencerDeck(parsedContent.data);
          this.shuffledDeck = {
            type: "shuffledDeck",
            data: this.deckReady,
            isShuffled: true,
          };
        }
        this.room.broadcast(JSON.stringify(this.shuffledDeck));

        break;
      case "endOfRound":
        console.log("End of round reached", parsedContent);
        if (Array.isArray(parsedContent.players)) {
          this.calculateScore(parsedContent.players);
          console.log(this.players, "players after score calculation");

          if (this.areAllScoresUpdated(this.players)) {
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
    this.players = this.players.filter((player) => player.id !== connection.id);
    this.room.broadcast(
      JSON.stringify({
        type: "playerLeft",
        playerId: connection.id,
      })
    );
    // Update room data after player leaves
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
export function shuffleInfluencerDeck(array: string[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]; // Swap elements
  }
  return array;
}
