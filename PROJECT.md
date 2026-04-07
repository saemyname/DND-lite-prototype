# DND-lite · Project Plan

> Last updated: 2026-04-07

---

## Overview

A web-based **D&D Lite** prototype — a heavily simplified take on tabletop D&D, built around
**immersive visual experiences** rather than complex rules.

- Single-player to start
- Core philosophy: minimal rules + maximum visual immersion
- Live demo: https://saemyname.github.io/DND-lite-prototype/

---

## Completed ✅

### Visual Experiences (merged into `index.html`)

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

### Parallax Layer Images

| Layer | File | Status |
|-------|------|--------|
| L0 Background | `images/layer0-bg.png` | ✅ |
| L1 Arch | `images/layer1-arch.png` | ✅ |
| L2 Walls + Torches | `images/layer2-walls.png` | ✅ |
| L3 Ceiling / Floor | `images/layer3-ceiling-floor.png` | ⬜ missing |
| L4 Pillars | `images/layer4-pillars.png` | ✅ |
| L5 Foreground | `images/layer5-foreground.png` | ⬜ missing |

---

## Roadmap 🔜

### Phase 1 — Short Adventure (current focus)

A single linear adventure: **5–6 rooms**, each with a distinct environment and
a simple event (combat or choice), connected via an interactive tabletop map.

#### 1-A · Character Creation Screen
- [ ] Role selection UI (Warrior / Rogue / Mage) with flavor text
- [ ] Stats auto-assigned per role (Strength, Agility, Intelligence, Luck, HP)
- [ ] Confirm → transition into map scene

#### 1-B · Tabletop Map Scene (Three.js)
- [ ] Wooden table + parchment dungeon map as 3D scene
- [ ] Room nodes on the map (connected graph, 5–6 rooms)
- [ ] Player miniature token placed on current room
- [ ] Reachable rooms highlighted (glow/light effect)
- [ ] Click a room → miniature moves → map fades out → event scene begins
- [ ] Map re-appears after each event is resolved

#### 1-C · Combat / Event Scene
- [ ] Per-room background image + event description text
- [ ] Event types: `combat` / `choice` / `trap` / `rest`
- [ ] d20 combat logic: roll + stat modifier ≥ DC → success/fail
- [ ] 2–3 choice options per room event
- [ ] HP changes on success/fail
- [ ] Win/lose state + restart

### Phase 2 — Polish

- [ ] Generate missing parallax layers (L3, L5)
- [ ] Transition animations between scenes (fade / slide)
- [ ] Sound: ambient dungeon audio per room type
- [ ] Mobile-friendly layout

### Phase 3 — Multiplayer (future)

- [ ] Tech stack decision: WebSocket vs Firebase Realtime DB
- [ ] DM role: pre-configure rooms, events, map layout
- [ ] Player room creation / join UI (link-based, no account required)
- [ ] Shared game state sync (tokens, fog of war, dice rolls)

---

## Game Design

### Roles

| Role | Primary Stat | Flavor |
|------|-------------|--------|
| Warrior | Strength | High HP, melee attacks |
| Rogue | Agility | Evasion, surprise attacks |
| Mage | Intelligence | Spells, puzzle bonuses |

All roles also have **Luck** as a secondary stat for special rolls.

### Combat (d20)

```
Roll d20 + stat_modifier  ≥  DC (Difficulty Class)  →  success
```

- DC ranges: Easy 8 / Medium 13 / Hard 18
- On success: deal damage, escape, or resolve event
- On failure: take damage or face consequence
- HP: Warrior 20 / Rogue 14 / Mage 12

### Room Structure

```js
{
  id: "room_1",
  name: "The Entrance Hall",
  background: "images/room-entrance.png",   // parallax scene or static image
  event: {
    type: "combat" | "choice" | "trap" | "rest",
    description: "...",
    dc: 13,
    stat: "strength" | "agility" | "intelligence" | "luck"
  },
  exits: ["room_2"]
}
```

---

## Tech Stack

| Area | Choice | Notes |
|------|--------|-------|
| Rendering | HTML/CSS/JS | No framework, no build step |
| Parallax | Vanilla CSS + JS | 6-layer PNG composition |
| Gaussian Splatting | `@mkkellogg/gaussian-splats-3d` | Three.js-based |
| Face tracking | `@mediapipe/tasks-vision` | FaceLandmarker, GPU delegate |
| 3D GLB viewer | Three.js (CDN) + GLTFLoader | PCFSoft shadows, ACES tonemapping |
| SharedArrayBuffer (GH Pages) | `coi-serviceworker.min.js` | Service worker header injection |
| Assets | Gemini-generated PNGs + GLB | Parallax layers + 3D scene |
| Hosting | GitHub Pages | `saemyname/DND-lite-prototype` |

---

## Directory Structure

```
DND-lite/
├── PROJECT.md
├── README.md
├── index.html                  ← main file (all 3 experiences)
├── coi-serviceworker.min.js    ← SharedArrayBuffer support on GH Pages
├── images/
│   ├── layer0-bg.png           ✅
│   ├── layer1-arch.png         ✅
│   ├── layer2-walls.png        ✅
│   ├── layer3-ceiling-floor.png ⬜ missing
│   ├── layer4-pillars.png      ✅
│   └── layer5-foreground.png   ⬜ missing
├── Assets/
│   └── the_tavern_under_the_falling_pigeon.glb  ✅
└── node_modules/               (local dev only, not deployed)
    ├── @mkkellogg/gaussian-splats-3d
    ├── @mediapipe/tasks-vision
    └── three
```

---

## Local Dev

Any static server works. The `coi-serviceworker.min.js` handles `SharedArrayBuffer`
support automatically (no special headers needed):

```bash
cd DND-lite
npx serve .
# → http://localhost:3000
```
