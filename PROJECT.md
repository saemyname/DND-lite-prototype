# DND-lite · Project Plan

> Last updated: 2026-04-09

---

## Overview

A web-based **D&D Lite** prototype — a heavily simplified take on tabletop D&D, built around
**immersive visual experiences** rather than complex rules.

- Single-player to start
- Core philosophy: minimal rules + maximum visual immersion
- Live demo: https://saemyname.github.io/DND-lite-prototype/

---

## Completed ✅

### Visual Experiences (scenes/viewer.html)

| Feature | Status |
|---------|--------|
| 6-layer parallax dungeon scene (mouse-driven depth) | ✅ |
| Torch flicker animations + vignette overlay | ✅ |
| Gaussian Splatting renderer (`@mkkellogg/gaussian-splats-3d`) | ✅ |
| MediaPipe face tracking → head-coupled perspective | ✅ |
| Two scene presets: Garden, Treehill | ✅ |
| Three.js 3D scene — GLB model viewer | ✅ |
| 3D scene: fixed camera position, ↻↺ arrow buttons rotate 90° | ✅ |
| 3D scene: shadow mapping, ACES tonemapping, subtle fog | ✅ |
| 3D scene: mouse sway (camera follows cursor) | ✅ |
| 3D scene: 5 flickering torch PointLights | ✅ |
| HUD overlay: character name, role, 4 stats panel | ✅ |
| HUD overlay: clickable d20 roller (nat20/nat1 color feedback) | ✅ |
| Mode switcher (Parallax / Gaussian Splatting / 3D Scene) | ✅ |
| GitHub Pages deployment with `coi-serviceworker` | ✅ |

### Phase 1-A · Character Creation (index.html) ✅

| Feature | Status |
|---------|--------|
| Role selection UI (Warrior / Rogue / Mage) with flavor text + stat bars | ✅ |
| Stats auto-assigned per role (STR, AGI, INT, LCK, HP) | ✅ |
| Name input + "Begin Adventure" → transition to map | ✅ |

### Phase 1-B · Tabletop Map (scenes/map.html) ✅

| Feature | Status |
|---------|--------|
| 3D tabletop with GLB castle model (`tabletop_castle_02.glb`) | ✅ |
| 6 room nodes as hemisphere gemstone markers | ✅ |
| Dashed path connections between rooms | ✅ |
| Player miniature token at current room | ✅ |
| Reachable rooms highlighted with pulsing glow ring | ✅ |
| Click room → token moves → navigate to room scene | ✅ |
| Re-enter current room supported | ✅ |
| Face-tracked camera + ↻↺ rotation buttons | ✅ |
| HUD: character stats panel (bottom-left) | ✅ |
| Tooltip on room hover (name + type) | ✅ |

### Phase 1-C · Voxel Rooms + Combat (scenes/room.html) ✅

| Feature | Status |
|---------|--------|
| Voxel renderer with procedural texture atlas (8 block types) | ✅ |
| Room JSON loading (fills, blocks, lights, palette, spawn) | ✅ |
| Dynamic point lights with flicker animation | ✅ |
| Player miniature at spawn position | ✅ |
| Grid-based movement with BFS pathfinding | ✅ |
| Role-based move range (Warrior 3 / Rogue 5 / Mage 4) | ✅ |
| Red highlight tiles for walkable range | ✅ |
| ArrowHelper direction indicator on hover | ✅ |
| Same-height movement only (no jumping) | ✅ |
| Impassable terrain (water, lava) + headroom check | ✅ |
| Event trigger positions with proximity detection | ✅ |
| Trigger marker (orange ring + rotating octahedron) | ✅ |
| Event types: start, combat, trap, choice, rest, boss | ✅ |
| Two-step combat: action button → click d20 to roll | ✅ |
| D20 SVG dice with roll animation (bounce + spin) | ✅ |
| d20 roll + stat modifier ≥ DC → success/fail | ✅ |
| HP changes on success/fail | ✅ |
| Per-event completion tracking (localStorage) | ✅ |
| Free movement in cleared rooms | ✅ |
| Try again on failure (retry from movement phase) | ✅ |
| Game over screen (HP ≤ 0) + restart | ✅ |
| ← Map button (top-left) | ✅ |
| Room title with background banner | ✅ |
| Vignette overlay (subtle) | ✅ |

### Shared Module — face-camera.js ✅

| Feature | Status |
|---------|--------|
| MediaPipe FaceLandmarker (GPU delegate) | ✅ |
| Off-axis projection for head-coupled perspective | ✅ |
| Mouse fallback when webcam unavailable | ✅ |
| Webcam preview (shared styles, top-right) | ✅ |
| ↻↺ rotation buttons (optional per scene) | ✅ |

### Voxel Room Editor (scenes/editor.html) ✅

| Feature | Status |
|---------|--------|
| Block palette (8 types, number key shortcuts) | ✅ |
| Place / Erase / Spawn tools | ✅ |
| Ghost preview on hover | ✅ |
| OrbitControls for free camera | ✅ |
| Undo/redo (Ctrl+Z / Ctrl+Shift+Z, 500 stack) | ✅ |
| Grid resize with block preservation | ✅ |
| Import / Export JSON | ✅ |

### Parallax Layer Images

| Layer | File | Status |
|-------|------|--------|
| L0 Background | `images/layer0-bg.png` | ✅ |
| L1 Arch | `images/layer1-arch.png` | ✅ |
| L2 Walls + Torches | `images/layer2-walls.png` | ✅ |
| L3 Ceiling / Floor | `images/layer3-ceiling-floor.png` | ⬜ missing |
| L4 Pillars | `images/layer4-pillars.png` | ✅ |
| L5 Foreground | `images/layer5-foreground.png` | ⬜ missing |

### Rooms (rooms/*.json) — all 14×6×14

| Room | Type | Event |
|------|------|-------|
| entrance | start | Forest intro, no roll |
| corridor | trap | Dart trap, AGI DC 8 |
| shrine | choice | Read runes (INT DC 13) / Drink pool (LCK DC 10) |
| goblin | combat | Goblin fight, STR DC 13 |
| treasury | rest | Heal +5 HP |
| lair | boss | Dragon King, STR DC 18 |

---

## Roadmap 🔜

### Phase 2 — Polish

- [ ] Scene transition animations (fade out/in between map ↔ room)
- [ ] Sound: ambient audio per room type + dice roll SFX
- [ ] Room entry cinematic (camera zoom-in / darkness reveal)
- [ ] Role-specific miniature appearance (color/shape per class)
- [ ] HP danger feedback (screen edge red glow when low HP)
- [ ] Victory/ending screen with stats summary
- [ ] Generate missing parallax layers (L3, L5)
- [ ] Mobile-friendly layout

### Phase 2.5 — Gameplay Depth

- [ ] Inventory / item system (potions, keys, weapons)
- [ ] Multiple events per room (different trigger positions)
- [ ] Enemy/NPC miniatures at event trigger locations
- [ ] Boss alternative stat checks (e.g. INT option for Mage)
- [ ] Progressive room unlocking (clear room → unlock next)
- [ ] More rooms (10–15) with branching paths
- [ ] NPC dialogue / story branching

### Phase 3 — Multiplayer (future)

- [ ] Tech stack decision: WebSocket vs Firebase Realtime DB
- [ ] DM role: pre-configure rooms, events, map layout
- [ ] Player room creation / join UI (link-based, no account required)
- [ ] Shared game state sync (tokens, fog of war, dice rolls)

---

## Game Design

### Roles

| Role | STR | AGI | INT | LCK | HP |
|------|-----|-----|-----|-----|----|
| Warrior | 14 | 10 | 8 | 10 | 20 |
| Rogue | 8 | 14 | 10 | 12 | 14 |
| Mage | 6 | 8 | 14 | 12 | 12 |

### Combat (d20)

```
Roll d20 + stat_modifier  ≥  DC (Difficulty Class)  →  success
Modifier = floor((stat - 10) / 2)
```

- DC ranges: Easy 8 / Medium 13 / Hard 18
- On success: deal damage, escape, or resolve event
- On failure: take damage or face consequence

### Room JSON Schema

```js
{
  "id": "room_id",
  "name": "Display Name",
  "size": [sx, sy, sz],
  "palette": ["block_type", ...],
  "fills": [{ "from": [x,y,z], "to": [x,y,z], "type": 0 }],
  "blocks": [[x, y, z, type], ...],
  "lights": [{ "pos": [x,y,z], "color": "0xHHHHHH", "intensity": 6 }],
  "spawn": [x, y, z],
  "event": {
    "type": "combat|choice|trap|rest|boss|start",
    "triggerPos": [x, z],
    "description": "...",
    "dc": 13,
    "stat": "str|agi|int|lck",
    "successText": "...", "failText": "...",
    "successHp": 0, "failHp": -4,
    "choices": [{ "label": "...", "stat": "...", "dc": ..., ... }]
  }
}
```

Block types: `stone_floor`, `stone_wall`, `wood`, `grass`, `water`, `lava`, `gold`, `dark`

---

## Tech Stack

| Area | Choice | Notes |
|------|--------|-------|
| Rendering | HTML/CSS/JS | No framework, no build step |
| 3D Engine | Three.js (CDN) | Voxel rooms, map scene, GLB viewer |
| Face tracking | `@mediapipe/tasks-vision` | FaceLandmarker, GPU delegate |
| Gaussian Splatting | `@mkkellogg/gaussian-splats-3d` | Three.js-based |
| SharedArrayBuffer | `coi-serviceworker.min.js` | GitHub Pages header injection |
| Hosting | GitHub Pages | `saemyname/DND-lite-prototype` |

---

## Directory Structure

```
DND-lite/
├── index.html                    ← Character creation (entry point)
├── scenes/
│   ├── map.html                  ← Tabletop dungeon map (3D)
│   ├── room.html                 ← Voxel room + turn-based combat
│   ├── viewer.html               ← Visual experiments (parallax/splat/3D)
│   └── editor.html               ← Voxel room editor (dev tool)
├── scripts/
│   └── face-camera.js            ← Shared face tracking + off-axis projection
├── rooms/
│   ├── entrance.json             ← The Forest Entrance (start)
│   ├── corridor.json             ← The Dark Corridor (trap)
│   ├── shrine.json               ← The Forgotten Shrine (choice)
│   ├── goblin.json               ← The Goblin Camp (combat)
│   ├── treasury.json             ← The Ancient Ruins (rest)
│   └── lair.json                 ← The Castle Throne Room (boss)
├── Assets/
│   └── tabletop_castle_02.glb    ← 3D castle model for map
├── images/                       ← Parallax layer PNGs
├── coi-serviceworker.min.js
├── package.json
├── PROJECT.md
└── README.md
```

---

## Local Dev

```bash
cd DND-lite
npx serve .
# → http://localhost:3000
```
