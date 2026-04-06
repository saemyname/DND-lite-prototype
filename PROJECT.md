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

A single linear adventure: **5–6 rooms**, each with a distinct environment image,
a simple event (combat or choice), and exits to the next room.

- [ ] Character creation screen — choose a **Role** (Warrior / Rogue / Mage)
- [ ] Stats assigned per role: **Strength, Agility, Intelligence, Luck** (values ~8–14)
- [ ] d20 combat: roll d20 + relevant stat modifier vs target DC → success/fail
- [ ] 5–6 room adventure with per-room background image switching
- [ ] Simple choice system (2–3 options per room event)
- [ ] Win/lose state + restart

### Phase 2 — Polish

- [ ] Generate missing parallax layers (L3, L5)
- [ ] Transition animations between rooms (fade / slide)
- [ ] Sound: ambient dungeon audio per room type
- [ ] Mobile-friendly layout

### Phase 3 — Multiplayer (future)

- [ ] Tech stack decision: WebSocket vs Firebase Realtime DB
- [ ] Room creation / join UI
- [ ] Shared game state sync

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
