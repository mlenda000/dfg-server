# dfg-server

Real-time WebSocket server for [Super Debunkers](https://github.com/mlenda000/super-debunkers), a multiplayer card game about identifying misinformation tactics. Built with [PartyKit](https://partykit.io) and TypeScript.

> **Deployed:** `dfg-server.mlenda000.partykit.dev`

## Related Repository

This is the **server** application. It powers the companion **client**:

| Repo                                                                | Description                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| [**super-debunkers**](https://github.com/mlenda000/super-debunkers) | React front-end — UI, game interactions, drag-and-drop |
| **dfg-server** (this repo)                                          | PartyKit WebSocket server — rooms, scoring, game state |

Both must be running for local development.

## What the Server Does

- Manages game room lifecycle (create, join, leave, auto-delete empty rooms after 30s)
- Handles player connections, disconnections, and reconnections with full state restoration
- Shuffles and distributes the influencer card deck
- Calculates scores when all players submit answers (correct/wrong/streak bonuses)
- Broadcasts real-time state updates to all connected clients
- Enforces room capacity (max 5 players per room)
- Manages a lobby system with available room discovery

## Architecture

```
src/
├── server.ts            # Main PartyKit server — WebSocket & HTTP handlers
├── components/
│   ├── Deck/            # Deck shuffling and card management
│   ├── Player/          # Player creation and state management
│   ├── Room/            # GameRoom class — per-room state
│   ├── RoomManager.ts   # Room lifecycle (create, delete, timers)
│   └── Scoring/         # Score calculation, streaks, bonuses
├── data/                # Static card data (influencer cards)
├── types/               # TypeScript type definitions
└── utils/               # Parsing and utility functions
```

## Message Types

The server handles these WebSocket message types:

| Message          | Direction       | Description                                |
| ---------------- | --------------- | ------------------------------------------ |
| `getPlayerId`    | Client → Server | Request a unique player ID                 |
| `enteredLobby`   | Client → Server | Player entered the lobby                   |
| `createRoom`     | Client → Server | Create a new game room                     |
| `playerEnters`   | Client → Server | Player joins a game room                   |
| `playerLeaves`   | Client → Server | Player leaves a game room                  |
| `influencer`     | Client → Server | Broadcast current news card + villain      |
| `playerReady`    | Client → Server | Player submitted their tactic choices      |
| `playerNotReady` | Client → Server | Player retracted their choices             |
| `endOfRound`     | Client → Server | All players ready — trigger scoring        |
| `roomUpdate`     | Server → Client | Full room state sync                       |
| `scoreUpdate`    | Server → Client | Scoring results for the round              |
| `reconnectState` | Server → Client | Full state restore for reconnecting player |
| `lobbyUpdate`    | Server → Client | Available rooms and player counts          |

## Getting Started

### Prerequisites

- Node.js 25+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/mlenda000/dfg-server.git
cd dfg-server

# Install dependencies
npm install

# Start the dev server on port 1999
npm run dev
```

The server runs on `http://127.0.0.1:1999` in development mode. The Super Debunkers client connects here automatically when running locally.

### Deploying

```bash
npm run deploy
```

Deploys to the PartyKit cloud at `dfg-server.mlenda000.partykit.dev`.

## Testing

The project includes comprehensive tests covering scoring logic, room lifecycle, WebSocket flows, and server integration:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Suite

| Test File                    | Coverage                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| `scoring.test.ts`            | Multi-player scoring, streak logic, bonus calculations, edge cases |
| `room-lifecycle.test.ts`     | Room creation, deletion, auto-cleanup timers                       |
| `websocket-flow.test.ts`     | Message handling, player state transitions                         |
| `server-integration.test.ts` | End-to-end server behavior                                         |

## Scripts

| Command                 | Description                            |
| ----------------------- | -------------------------------------- |
| `npm run dev`           | Start PartyKit dev server on port 1999 |
| `npm run deploy`        | Deploy to PartyKit cloud               |
| `npm test`              | Run test suite                         |
| `npm run test:watch`    | Run tests in watch mode                |
| `npm run test:coverage` | Generate test coverage report          |

- ✅ Score validation and state management

See [TESTING.md](./TESTING.md) for detailed testing documentation.

Refer to our docs for more information: https://github.com/partykit/partykit/blob/main/README.md. For more help, reach out to us on [Discord](https://discord.gg/g5uqHQJc3z), [GitHub](https://github.com/partykit/partykit), or [Twitter](https://twitter.com/partykit_io).
