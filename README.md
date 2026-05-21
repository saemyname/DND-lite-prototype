# D&D Lite

A lightweight multiplayer web-based D&D game. Pick a class, join a DM-hosted session (or solo), and rescue Lyra from the Goblin King across five stages.

## Features

- **Multiplayer** — DM creates a session, up to 4 players join with a 4-digit code. Solo mode also supported.
- **Four classes** — Warrior / Rogue / Mage / Cleric. Each is a colored slime carrying their weapon emoji.
- **World map** — 3D GLB map with stage nodes, party miniatures, fog of war.
- **Five stages** — Eldermoor Village (intro, WIP) → Luna Ruins → Whispering Forest → Goblin Outpost → Throne of the Goblin King.
- **Server-authoritative combat** — d20 grid combat with turn order, heal action (Cleric), skill checks (Stage 3).
- **Text chat** — drop-in panel on every player + DM scene.
- **Debug mode** — `+3 Bots` button on world-map spawns AI-less party fillers so one browser can test the full 4-player flow.

## Run Locally

```bash
npm install
node server.js
# → http://localhost:3000
```

## Tech

Three.js, WebSocket (Node.js `ws`), Express (static files), procedural voxel + slime miniatures.
