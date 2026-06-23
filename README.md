# D&D Lite — "Lyra Rescue Team"

A browser multiplayer mini-RPG: a party of slimes rescues the healer Lyra from the Goblin King across six voxel stages. Three.js front-end, Node WebSocket server, join by a 4-digit code.

## Features

- Six stages of turn-based d20 grid combat, a boss fight, and a finale rescue
- Up to 5 players + an optional DM, in real time over one session code
- Four classes — Warrior / Rogue / Mage / Cleric — with their own stats, range, and a Cleric heal
- Enemies that hunt the party in the later stages
- Intro/ending cutscenes, a world map, music + SFX, and text chat

## Play with friends (one-click, macOS)

Clone or download this repo, then double-click **`host-online.command`** (or run `npm run host`). It launches the server, opens a free public tunnel, and copies an **invite link** to your clipboard — share it and friends just open it in a browser. You're the host; players install nothing.

- Requirements: macOS, [Node.js](https://nodejs.org), an internet connection. The first run sets everything up automatically.
- If macOS blocks the file on first launch ("unidentified developer"), right-click it → **Open** once.

Local network only? `npm install && npm start`, then open the printed URL.

## Tech

Three.js, `ws` + Express, procedural voxel scenes (Kenney tile textures), GLB for the vault and world map.
