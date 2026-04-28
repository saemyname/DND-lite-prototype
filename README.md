# D&D Lite

A lightweight multiplayer web-based D&D game. Pick a class, join a DM-hosted session, and explore immersive 3D scenes together.

## Features

- **Multiplayer** — DM creates a session, players join with a 4-digit code
- **Character creation** — Warrior / Rogue / Mage with stats (STR, AGI, INT, LCK, HP)
- **World map** — 3D GLB map with clickable stage nodes
- **Stage scenes** — Face-tracked 3D scenes with off-axis projection (Three.js GLB)
- **Voxel dungeon** — Grid-based movement + turn-based d20 combat
- **Solo mode** — Play without a server

## Run Locally

```bash
npm install
node server.js
# → http://localhost:3000
```

## Tech

Three.js, MediaPipe FaceLandmarker, WebSocket (Node.js), vanilla JS — no framework, no build step.
