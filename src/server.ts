import type * as Party from "partykit/server";


type Player = { id: string; name: string; room: string; avatar: string; score: number, streak?: number }
type Room = { name: string; count: number; players: Player[] };
type PlayerCard = { id: string; content: string };
type InfluencerCard = string[];
type tacticUsed = { tactic: string, player: Player};


export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  players:Player[]= []
  rooms: Room[] = [];
  playedCards: PlayerCard[] = [];
  influencerCard: InfluencerCard = [];
  tacticsUsed: tacticUsed[] = [];
  currentRound = 1;
  streakBonus = 50;
  correctAnswer = 100;
  wrongAnswer = -50;

  getPlayers() {
    return this.players;
  }

  getPlayedCards() {
    return this.playedCards;
  }

  getInfluencerCards() {
    return this.influencerCard;
  }

// calculateScore(playerCards: {id: string, content: Number}[]): number {
//    let score = content?.score || 0;
//     let correct = false;
//     playerCards.forEach(card => {
//         if (card === tacticUsed){
//             correct = true;
//         }else{
//             correct = false;
//         }

//         if (correct) {
//             score += 100;
//         }else if (score >= 50){
//             score -= 50;
//         }else {
//             score = 0;
//         }
//     }
//     return score;
//   } 

  parseContent(content: string): any {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (typeof parsed === 'object') {
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
        conn.send(JSON.stringify({type: "announcement", text: `Room is full. Only 5 players are allowed.`}));
        conn.close();
    } else {
        conn.send(JSON.stringify({type: "announcement", text: `Welcome, ${conn.id}`}));
        this.room.broadcast(JSON.stringify({type: "", room:this.room, roomCount:this.players.length}), [conn.id]);
    }
}
    this.room.broadcast(JSON.stringify({type: "announcement", text:`Heads up! ${conn.id} joined the party!`}));
}
  

  onMessage(message: string, sender: Party.Connection) {
    console.log(message, "message received ---------------------");
    const parsedContent = this.parseContent(message);
console.log("Received message:", parsedContent);
    switch (parsedContent?.type) {
        case 'enteredLobby':
            console.log(parsedContent, "entered lobby ---------------------");
            const roomCounts: Record<string, Room> = {};

            this.players.forEach(player => {
                if (!roomCounts[player.room]) {
                    roomCounts[player.room] = { name: player.room, count: 0, players: [] };
                }
                roomCounts[player.room].players.push(player);
                roomCounts[player.room].count++;
            });

            const roomData = roomCounts[parsedContent.room] || { name: parsedContent.room, count: 0, players: [] };
            console.log("Room data:", roomData);

            this.room.broadcast(JSON.stringify({ 
                type: 'lobbyUpdate',
                room: parsedContent.room,
                count: roomData.count,  
                roomData 
            }));
          break;
        case 'playerEnters':
          this.room.broadcast(JSON.stringify({ newPlayer: `Player joined: ${parsedContent.playerName}` }), [sender.id]);
          sender.send(JSON.stringify({ id: `id+${sender.id}` }));
          parsedContent.player.id = sender.id;
          parsedContent.player.score = 0;

          // Add player to the room they joined
          let room = this.rooms.find(r => r.name === parsedContent.room);
          if (!room) {
              room = { name: parsedContent.room, count: 0, players: [] };
              this.rooms.push(room);
          }
          room.players.push(parsedContent.player);
          room.count++;

          this.players.push(parsedContent.player);

          // Broadcast updated room data to all players in the room
          this.room.broadcast(JSON.stringify({ 
              type: 'roomUpdate', 
              room: room.name, 
              roomData: room 
          }));
          break;
        case 'playerLeft':
          this.players = this.players.filter(player => player.id !== sender.id);
          this.room.broadcast(JSON.stringify({ type: 'playerLeft', playerId: sender.id }));
          // Update room data after player leaves
          const updatedRoom = this.rooms.find(r => r.name === parsedContent.room);
          if (updatedRoom) {
              updatedRoom.players = updatedRoom.players.filter(player => player.id !== sender.id);
              updatedRoom.count = updatedRoom.players.length;
              this.room.broadcast(JSON.stringify({
                  type: 'roomUpdate',
                  room: updatedRoom.name,
                  roomData: updatedRoom
              }));
              // If the room is empty, remove it from the list
              if (updatedRoom.count === 0) {
                  this.rooms = this.rooms.filter(r => r.name !== updatedRoom.name);
              }
          }
          break;

    //     case 'influencer':
    //       console.log(parsedContent);
    //       this.room.broadcast(`Influencer update: ${parsedContent.villain}`);
    //       break;
    //     case 'ready':
    //       this.room.broadcast(`Tactic update: ${parsedContent.card}`);
    //       this.playedCards.push({id: sender.id, content: parsedContent.card});
    //         this.room.broadcast(JSON.stringify({ready: "ready"}), [sender.id]);
    //       break;
    //     // case 'round-start':
    //     //   this.influencerCard = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
    //     //   break;
    //     case 'finish round':
    //       let playerRound = {sender: sender.id, round: parsedContent.round};
    //       if (parsedContent.round === this.currentRound && sender.id === playerRound.sender) {
    //         const score = this.calculateScore(this.playedCards.filter(card => card.id === sender.id));
            
    //         sender.send(`score+${score}`);
    //         this.room.broadcast(`finish`, [sender.id]);

    //         this.scores = this.scores || {};
    //         this.scores[sender.id] = score;

    //         if (Object.keys(this.scores).length === this.players.length) {
    //           this.currentRound++;
    //           this.scores = {};
    //           this.room.broadcast(`round-complete`);
    //         }
    //       }
    //       break;
    //     case 'undo':
    //         this.playedCards.filter((card) => card.id !== sender.id);
    //         this.room.broadcast(`undo+${parsedContent.count}`, [sender.id]);
    //     case 'reset':
    //       this.players = [{id: '', playerName: '', room: '', avatarImg: "", score: 0 }];
    //       this.playedCards = [{id:"", content: ""}];
    //       this.influencerCard = [''];
    //       break;
    //     case 'leaveRoom':
    //         this.players = this.players.filter(player => player.id !== sender.id);
    //         this.room.broadcast(JSON.stringify({room:parsedContent.room, roomCount: Number(this.players.length)}));
    //     case 'end':
    //       this.room.broadcast(`Game over: ${parsedContent}`);
    //       break;
        default:
          console.log(`Unknown message type: ${parsedContent?.type}`);
    //   }
    }
}
  

  onClose(connection: Party.Connection) {
    this.room.broadcast(JSON.stringify({type: "announcement", text:`So sad! ${connection.id} left the party!`}));
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
