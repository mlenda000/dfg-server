import type * as Party from "partykit/server";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  players = [{id: '', name: ''}];
  playedCards = [{id:"", content: ""}];
  influencerCard = [''];

  getPlayers() {
    return this.players;
  }

  getPlayedCards() {
    return this.playedCards;
  }

  getInfluencerCards() {
    return this.influencerCard;
  }

calculateScore(playerCards: {id: string, content: string}[]): number {
    let newScore = 0;
    const maxCards = this.influencerCard.length;

    for (let i = 0; i < maxCards; i++) {
        if (playerCards[i]) {
            if (playerCards[i].content === this.influencerCard[i]) {
                newScore += 1;
            } else {
                newScore = Math.max(0, newScore - 1);
            }
        }
    }

    if (playerCards.length === maxCards && playerCards.every((card, index) => card.content === this.influencerCard[index])) {
        newScore += 1; // Bonus point for getting all correct
    }

    return newScore;
}

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
    console.log(
      `Connected:
  id: ${conn.id}
  room: "dfg-misinformation"
  url: ${new URL(ctx.request.url).pathname}`
    );

    conn.send(`Welcome, ${conn.id}`);
    this.room.broadcast(`Heads up! ${conn.id} joined the party!`);
  }

  onMessage(message: string, sender: Party.Connection) {
    const type = message.substring(
      message.indexOf('=') + 1,
      message.indexOf('-')
    ).trim();
    console.log(type);

    const content = message.substring(message.indexOf('-') + 1).trim().replace(/"/g, '');
    const parsedContent = this.parseContent(content);
    console.log(content);

    switch (type) {
        case 'player':
          this.room.broadcast(`Player joined: ${parsedContent}`, [sender.id]);
          this.room.broadcast(`Welcome, ${parsedContent}`);
          sender.send(`id+${sender.id}`);
          this.players.push({id: sender.id, name: parsedContent});
          break;
        case 'influencer':
          console.log(parsedContent);
          this.room.broadcast(`Influencer update: ${parsedContent}`);
          break;
        case 'tactic':
          this.room.broadcast(`Tactic update: ${parsedContent}`);
          this.playedCards.push({id: sender.id, content: parsedContent});
          this.room.broadcast(`card+back.png`, [sender.id]);
          break;
        case 'round-start':
          this.influencerCard = Array.isArray(parsedContent) ? parsedContent : [parsedContent];
          break;
        case 'finish round':
          
          const score = this.calculateScore(this.playedCards);
          this.room.broadcast(`score+${sender.id}+${score} `);
          break;
        case 'undo':
            this.playedCards.filter((card) => card.id !== sender.id);
            this.room.broadcast(`undo+${content}`, [sender.id]);
        case 'reset':
          this.players = [{id: '', name: ''}];
          this.playedCards = [{id:"", content: ""}];
          this.influencerCard = [''];
          break;
        case 'end':
          this.room.broadcast(`Game over: ${parsedContent}`);
          break;
        default:
          console.log(`Unknown message type: ${type}`);
      }
    }
  

  onClose(connection: Party.Connection) {
    this.room.broadcast(`So sad! ${connection.id} left the party!`);
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
