# DND-lite · Project Plan

> Last updated: 2026-04-29

---

## Overview

A web-based **D&D Lite** prototype — simplified tabletop D&D focused on **immersive 3D visuals** and **real-time multiplayer** over complex rules.

- DM hosts a session; players join via 4-digit code
- Core philosophy: minimal rules + maximum visual immersion
- Target session: 1 DM + up to 4 players, ~30–60 min playthrough

---

## Completed ✅

### Entry / Character Creation (`index.html`)

- Unified landing page: DM or Player role picker
- Player: name + class (Warrior / Rogue / Mage) + session code form
- DM: link to lobby — no setup needed on the player side
- Stats auto-assigned per class; saved to localStorage

### Multiplayer Infrastructure (`server.js` + `scripts/game-socket.js`)

- WebSocket server (Node.js, `ws` only)
- DM creates session → 4-digit code generated
- Players join by code; DM can redirect all players to any scene
- `player_rejoin` pattern — players reconnect automatically on page reload
- **DM rejoin** — lobby shows "Rejoin Session (XXXX)" if a saved code exists in localStorage
- **DM disconnect overlay** — players see "DM Disconnected — Please wait..." when DM drops; auto-clears on DM rejoin
- **Server-authoritative stage unlock state** — synced via `joined` / `player_rejoined` (no stale localStorage)

### DM Interface (`scenes/dm/`)

- `lobby.html` — create session, share code, see connected players, rejoin button
- `session.html` — redirect players to scenes + **stage observation panel**:
  - Live party state (name, class, position, HP, active turn) from `state_update`
  - Live enemy state (HP, position, defeated marker)
  - **Embedded spectator iframe** of the active stage (live 3D scene of what players see)
  - State auto-replays on DM reconnect

### World Map (`scenes/world-map.html`)

- 3D GLB map with face-tracked off-axis camera
- Clickable stage nodes (screen-space hit detection, 55px radius)
- Locked stages dimmed; navigable only when unlocked by DM (server-validated)
- Stage unlock state synced from server; survives reload

### Combat (`scenes/stage02.html`) — server-authoritative multiplayer

- **Grid-based movement + d20 combat** on a 3D GLB environment (Luna Ruins)
- Invisible JSON walkability mask (`rooms/stage02-grid.json`); rectangular cells supported
- **Server holds canonical state** per `(sessionCode, stageId)` — positions, HP, turn order, pending combat, outcome
- All clients (players + DM observer) render from `state_update` broadcasts
- **Turn order**: join order; only active player can submit actions
- **Move action**: client emits `action_request {kind:'move', col, row}` → server validates walkability + range + occupancy → broadcasts new state
- Click own tile = stay in place (still triggers adjacency-to-enemy combat)
- **Attack**: server rolls d20 with `statModifier(stats[stat])`, applies damage, broadcasts `combat_event` → all clients animate the same dice number
- HP, victory/defeat overlays synced across all clients
- Per-token HP labels above enemies; player name labels in own/other colors
- "Your turn" / "X's turn" indicator; not-my-turn cursor

### Voxel Dungeon (`scenes/voxel/room.html`) — older single-player system

- Voxel renderer (8 block types, procedural texture atlas)
- Grid-based movement with BFS pathfinding + role-based move range
- Turn-based d20 combat: roll + stat modifier vs DC
- Event types: start, combat, trap, choice, rest, boss
- Voxel room editor (`scenes/voxel/editor.html`)

### Communication

- **Text chat** (`scripts/chat-panel.js`) — drop-in module on every player + DM scene
  - Server keeps per-session history (cap 50), replays on join/rejoin via `chat_history` message
  - DM messages styled gold; players blue; collapsible panel with localStorage state
  - Messages tagged with sender from connection state (no spoofing)

### Shared Modules (`scripts/`)

| File | Responsibility |
|------|---------------|
| `face-camera.js` | MediaPipe face tracking + off-axis projection + mouse fallback (used by world-map; disabled in stage02) |
| `game-socket.js` | WebSocket client singleton (`connect`, `send`, `on`) |
| `player-session.js` | Auto-rejoin on page load, DM redirect listener, DM disconnect overlay |
| `chat-panel.js` | Drop-in text chat UI module |
| `off-axis-box.js` | Off-axis projection helper |
| `voxel-textures.js` | Procedural voxel texture atlas |

---

## Roles & Stats

| Role | STR | AGI | INT | LCK | HP |
|------|-----|-----|-----|-----|----|
| Warrior | 14 | 10 | 8 | 10 | 20 |
| Rogue | 8 | 14 | 10 | 12 | 14 |
| Mage | 6 | 8 | 14 | 12 | 12 |

Combat: `d20 + floor((stat - 10) / 2) ≥ DC` → success (3 damage to enemy on success; `failHp` to player on miss)

---

## Server Message Types

| Direction | Type | Purpose |
|-----------|------|---------|
| C→S | `dm_create` / `dm_rejoin` | DM session lifecycle |
| C→S | `player_join` / `player_rejoin` | Player session lifecycle |
| C→S | `stage_unlock` (DM) | Unlock a stage on world-map |
| C→S | `player_redirect` (DM) | Move all players to a URL |
| C→S | `chat_send` | Send chat message |
| C→S | `enter_stage` | Player enters a stage instance |
| C→S | `action_request` (move/attack) | Request game action (validated server-side) |
| C→S | `combat_continue` | Active player advances turn after combat |
| C→S | `dm_observe` | DM iframe attaches as stage observer |
| S→C | `state_update` | Authoritative stage snapshot (positions, HP, turn) |
| S→C | `combat_event` | Animation cue for d20 roll + damage |
| S→C | `chat_message` / `chat_history` | Chat broadcast / replay |
| S→C | `dm_disconnected` / `dm_reconnected` | Player overlay control |
| S→C | `stage_unlock` / `fog_reveal` | World-map state changes |

---

## Directory Structure

```
DND-lite/
├── index.html                  ← Unified entry: DM/Player picker + character + session
├── server.js                   ← WebSocket multiplayer + stage state authority
├── scenes/
│   ├── world-map.html          ← 3D world map with stage navigation
│   ├── stage01.html            ← Stage 01 (Three.js GLB)
│   ├── stage02.html            ← Stage 02 grid + combat (multiplayer; spectator mode for DM)
│   ├── dm/
│   │   ├── lobby.html          ← DM: create / rejoin session
│   │   └── session.html        ← DM: redirect + observation panel + spectator iframe
│   ├── voxel/
│   │   ├── room.html           ← Voxel dungeon + d20 combat (legacy single-player)
│   │   └── editor.html         ← Voxel room editor
│   └── map.html                ← Legacy tabletop map (reference)
├── scripts/
│   ├── game-socket.js
│   ├── player-session.js
│   ├── chat-panel.js
│   ├── face-camera.js
│   ├── off-axis-box.js
│   └── voxel-textures.js
├── rooms/
│   ├── stage02-grid.json       ← Walkability mask + spawn + enemies for stage02
│   └── (voxel room JSONs)
├── Assets/                     ← GLB models (Draco-compressed)
└── images/                     ← Parallax layer PNGs
```

---

## Roadmap 🔜

Mid-term goal: a **5-stage end-to-end playthrough** with the team (4 players + 1 DM rescuing the kidnapped healer Lyra from the Goblin King). See `docs/superpowers/plans/2026-04-29-prototype-storyline.md` for the full storyline.

- [ ] **Cleric class** — 4th class, role-specific GLB miniature, heal action
- [ ] **Stage 4 (Goblin Outpost)** — combat stage, reuses stage02 architecture
- [ ] **Stage 3 (Whispering Forest)** — non-combat skill check (d20 vs DC, branching)
- [ ] **Stage 5 (Throne of the Goblin King)** — boss + rescue mechanic
- [ ] **Stage 1 (Eldermoor Village)** — narrative intro (DM-driven)
- [ ] **Voice chat** — WebRTC mesh, push-to-talk / mic toggle, speaking indicator
- [ ] **End-to-end playtest** with the team
