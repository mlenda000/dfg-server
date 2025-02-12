import type * as Party from "partykit/server";

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // A websocket just connected!
    console.log(
      `Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`
    );

    // let's send a message to the connection
    conn.send(`Welcome, ${conn.id}`);
    // let everyone else know that a new connection joined
    this.room.broadcast(`Heads up! ${conn.id} joined the party!`, [
        conn.id
      ]);

  }

  onMessage(message: string, sender: Party.Connection) {
    // send the message to all connected clients
    this.room.broadcast(message, [sender.id]);

    // let's log the message
    console.log(`connection ${sender.id} sent message: ${message}`);
    // as well as broadcast it to all the other connections in the room...
    this.room.broadcast(
      `${sender.id}: ${message}`,
      // ...except for the connection it came from
      [sender.id]
    );
  }
  
  // when a client disconnects
  onClose(connection: Party.Connection) {
    this.room.broadcast(`So sad! ${connection.id} left the party!`);
  }
}

Server satisfies Party.Worker;
