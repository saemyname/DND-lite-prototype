# DND-lite · Project Plan

> Last updated: 2026-04-28

---

## Overview

A web-based **D&D Lite** prototype — simplified tabletop D&D focused on **immersive 3D visuals** and **real-time multiplayer** over complex rules.

- DM hosts a session; players join via 4-digit code
- Core philosophy: minimal rules + maximum visual immersion

---

## Completed ✅

### Entry / Character Creation (`index.html`)

- Unified landing page: DM or Player role picker
- Player: name + class (Warrior / Rogue / Mage) + session code form (two-column layout)
- DM: link to lobby — no setup needed on the player side
- Stats auto-assigned per class; saved to localStorage

### Multiplayer (`server.js` + `scripts/game-socket.js`)

- WebSocket server (Node.js, no dependencies beyond `ws`)
- DM creates session → 4-digit code generated
- Players join by code; DM can redirect all players to any scene
- `player_rejoin` pattern — players reconnect automatically on page reload
- Solo mode (no server) also supported

### DM Interface (`scenes/dm/`)

- `lobby.html` — create session, share code, see connected players
- `session.html` — redirect players to scenes in real time

### World Map (`scenes/world-map.html`)

- 3D GLB map with face-tracked off-axis camera
- Clickable stage nodes (screen-space hit detection, 55px radius)
- Locked stages shown as dimmed; only unlocked stages are navigable
- `← Home` nav link

### Stage Scenes (`scenes/stage01.html`, `scenes/stage02.html`)

- Three.js GLB scene per stage
- Face-tracked camera (MediaPipe FaceLandmarker, off-axis projection)
- Draco-compressed GLB assets (`--join false` to preserve node names)

### Voxel Dungeon (`scenes/voxel/room.html`)

- Voxel renderer (8 block types, procedural texture atlas)
- Grid-based movement with BFS pathfinding + role-based move range
- Turn-based d20 combat: roll + stat modifier vs DC
- Event types: start, combat, trap, choice, rest, boss
- Voxel room editor (`scenes/voxel/editor.html`)

### Shared Modules (`scripts/`)

| File | Responsibility |
|------|---------------|
| `face-camera.js` | MediaPipe face tracking + off-axis projection + mouse fallback |
| `game-socket.js` | WebSocket client with reconnect + event emitter |
| `player-session.js` | Auto-rejoin on page load, DM redirect listener |
| `off-axis-box.js` | Off-axis projection helper |
| `voxel-textures.js` | Procedural voxel texture atlas |

---

## Roles & Stats

| Role | STR | AGI | INT | LCK | HP |
|------|-----|-----|-----|-----|----|
| Warrior | 14 | 10 | 8 | 10 | 20 |
| Rogue | 8 | 14 | 10 | 12 | 14 |
| Mage | 6 | 8 | 14 | 12 | 12 |

Combat: `d20 + floor((stat - 10) / 2) ≥ DC` → success

---

## Directory Structure

```
DND-lite/
├── index.html                  ← Unified entry: DM/Player picker + character + session
├── server.js                   ← WebSocket multiplayer server
├── scenes/
│   ├── world-map.html          ← 3D world map with stage navigation
│   ├── stage01.html            ← Stage 01 (Three.js GLB)
│   ├── stage02.html            ← Stage 02 (Three.js GLB)
│   ├── dm/
│   │   ├── lobby.html          ← DM: create session, share code
│   │   └── session.html        ← DM: redirect players live
│   ├── voxel/
│   │   ├── room.html           ← Voxel dungeon + d20 combat
│   │   └── editor.html         ← Voxel room editor
│   ├── map.html                ← Legacy tabletop map (reference)
│   └── index.html              ← Redirect → root index.html
├── scripts/
│   ├── game-socket.js
│   ├── player-session.js
│   ├── face-camera.js
│   ├── off-axis-box.js
│   └── voxel-textures.js
├── Assets/                     ← GLB models (Draco-compressed)
├── rooms/                      ← Voxel room JSON files
└── images/                     ← Parallax layer PNGs
```

---

## Roadmap 🔜

- [ ] More stages / scenes with unique GLB environments
- [ ] Scene transition: DM-triggered redirect with fade animation
- [ ] Player HUD overlay (stats, HP) visible during stages
- [ ] Sound: ambient audio per scene + dice SFX
- [ ] Mobile-friendly layout
- [ ] Victory / ending screen with session summary
