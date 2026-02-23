# ⚔ Gwent PvP — Railway Deployment

A fully-featured browser-based Gwent card game with real-time PvP multiplayer via WebSockets.

## Stack
- **Server**: Node.js + Express + Socket.io (minimal footprint for Railway free tier)
- **Client**: Single-file HTML/CSS/JS with WebGL card rendering and Web Audio API

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repo — Railway auto-detects Node.js
4. Click **Deploy** — that's it!

Railway sets `PORT` automatically. The server reads `process.env.PORT`.

## How It Works

### Lobby
- Player A clicks **CREATE ROOM** → gets a 4-character code (e.g. `XK7Q`)
- Player B clicks **JOIN ROOM** → enters the code → game starts instantly

### Game
- Each player sees **their own hand** at the bottom, **opponent's face-down cards** at the top
- Opponent's board rows display above the divider; your rows below
- Drag cards from hand to the correct row to play them
- Click **PASS ROUND** when you want to concede the round
- **REDRAW** lets you swap up to 3 cards, twice per game

### Architecture (Railway-Friendly)
The server is deliberately lightweight:
- State is held in-memory (no DB needed)
- Only 2 socket events per turn (state broadcast to each player)
- Rooms auto-cleaned after 30s of disconnect, or in 60s sweeps
- No polling — pure WebSocket transport
- Payload ~2–4KB per state update

## Local Development

```bash
npm install
node server.js
# open http://localhost:3000 in two tabs
```

## Card Factions
- **Northern Realms**: Geralt, Triss, Ciri, Dandelion + army
- **Nilfgaard**: Emhyr, Yennefer, Vilgefortz + imperials
- **Neutral specials**: Weather cards, Scorch, Commander's Horn, Decoy, Clear Weather

Factions are randomly assigned each game.
