# DND-lite · Project Plan

> Last updated: 2026-06-23

---

## Overview

A web-based **D&D Lite** prototype — simplified tabletop D&D focused on **immersive 3D visuals** and **real-time multiplayer** over complex rules.

- DM hosts a session; players join via name + 4-digit code, then pick a class + slime color in a live **character-select lobby**
- Core philosophy: minimal rules + maximum visual immersion
- Target session: **1 DM + up to 5 players**, ~30–60 min playthrough
- **Six-stage** end-to-end playthrough — demo-ready

---

## Completed ✅

### Entry / Character Creation (`index.html` + `scenes/character-select.html`)

- Unified landing page: DM or Player role picker
- Player: name + **4-digit session code** (class not chosen at index)
- After joining, players land in the **character-select lobby** (`scenes/character-select.html`): a live view showing all connected players; each player picks a **class + slime color** (duplicate colors allowed). Stats (str/agi/int/lck/hp) are saved to localStorage so the in-stage HUD shows them.
- DM: clicking **DM** on index lands directly on `scenes/dm/session.html`, which auto-creates a session (sends `dm_create`) if no saved code exists, or rejoins the existing one

### Multiplayer Infrastructure (`server.js` + `scripts/game-socket.js`)

- WebSocket server (Node.js, `ws` only); server honors `process.env.PORT` (default 3000, deploy-friendly)
- DM creates session → 4-digit code generated
- Players join by code; DM can redirect all players to any scene
- `player_rejoin` pattern — players reconnect automatically on page reload
- **DM rejoin** — `session.html` checks localStorage for a saved code and auto-rejoins
- **DM disconnect overlay** — players see "DM Disconnected — Please wait..." when DM drops; auto-clears on DM rejoin
- **Server-authoritative stage unlock state** — synced via `joined` / `player_rejoined` (no stale localStorage); sessions always start with only `stage_01` unlocked (`initialUnlocked`)

### DM Interface (`scenes/dm/`)

- `session.html` — primary DM dashboard (auto-creates / rejoins session on load): redirect players to scenes + **stage observation panel**:
  - Live party state (name, class, position, HP, active turn) from `state_update`
  - Live enemy state (HP, position, defeated marker)
  - **Embedded spectator iframe** of the active stage (live 3D scene of what players see)
  - State auto-replays on DM reconnect
- `lobby.html` — standalone create/rejoin page (still accessible; no longer the index entry point)

### World Map (`scenes/world-map.html`)

- 3D GLB map with face-tracked off-axis camera
- Clickable stage nodes (screen-space hit detection, 55px radius)
- Locked stages dimmed; navigable only when unlocked by DM (server-validated)
- Stage unlock state synced from server; survives reload
- Auto-clears fog around unlocked stages

### Stage 01 — Eldermoor Village (`scenes/stage01.html`)

- Voxel village (houses + well + perimeter trees); 10×10 grid
- 3 narrative `auto:true` clue investigations (Lyra's bed → goblin tracks → forest edge) — no d20 roll required; victory unlocks stage_02

### Stage 02 — Goblin's Trail (`scenes/stage02.html`) — server-authoritative multiplayer combat

- **Rebuilt as a voxel combat stage** (12×12 grid, 3 enemies: 2 Goblin Trackers + 1 Goblin Brute)
- Invisible JSON walkability mask (`rooms/stage02-grid.json`)
- **Server holds canonical state** per `(sessionCode, stageId)` — positions, HP, turn order, pending combat, outcome
- All clients (players + DM observer) render from `state_update` broadcasts
- **Turn order**: join order; only active player can submit actions
- **Move action**: client emits `action_request {kind:'move', col, row}` → server validates walkability + range + occupancy → broadcasts new state
- Click own tile = stay in place (still triggers adjacency-to-enemy combat)
- **Attack**: server rolls d20 with `statModifier(stats[stat])`, applies damage, broadcasts `combat_event` → all clients animate the same dice number
- HP, victory/defeat overlays synced across all clients; victory deferred until player dismisses result dialog
- Per-token HP labels above enemies; player name labels in own/other colors
- "Your turn" / "X's turn" indicator; not-my-turn cursor
- Dice **fly to screen center** to roll

### Stage 03 — Whispering Forest (`scenes/stage03.html`) · non-combat skill checks

- Voxel forest scene; 14×14 grid; 3 skill-check encounters (d20 vs DC, role-tagged stat)
- Server tracks `pendingChallenge` + `attempt` action + `skill_check_event` broadcast
- Cleared challenges persist in stage state; victory requires all challenges resolved

### Stage 04 — Goblin Outpost (`scenes/stage04.html`)

- Procedural voxel outpost (Kenney textures); 14×14 grid
- 5 enemies: Goblin Captain (stationary, `moveRange:0`) + 3 Goblin Guards + 1 Goblin Archer (`atkRange:2`)
- **Active enemy AI on** (`enemyAI:true`): on the monster turn, living enemies BFS-move toward the nearest/most-wounded player (default `moveRange:2`) and attack if in range; Captain holds ground but counters in melee
- Enemy turn fires after each full party round via `endTurn`/`runEnemyPhase`; client animates via `enemy_phase`
- DM has Unlock + Redirect; solo mode auto-unlocks

### Stage 05 — Throne of the Goblin King (`scenes/stage05.html`)

- Boss arena: Goblin King (`moveRange:0`) + 3 Royal Guards; 15×14 grid
- **Active enemy AI on** (`enemyAI:true`)
- **Entry cinematic** (once per session, skippable): goblins drag Lyra toward the vault + King taunts "Want the healer back? Cut me down first!"; plays on stage load
- Optional **Water of Life well** (`auto:true`, `optional:true`): non-walkable obstacle, heals 8 HP once; a "run dry" message shows on revisit
- Victory routes to the **world map** to unlock stage_06 (not directly to stage_06)

### Stage 06 — The Vault (`scenes/stage06.html`)

- **Luna Ruins GLB** environment; non-combat; 5×6 grid
- The real **Lyra rescue** via the `free_lyra` INT challenge (DC 12, `retryOnFail:true`): failed attempts re-prompt without dealing damage; success → ending
- Victory triggers the ending scene (`scenes/ending.html`)

### Cleric Class (4th playable role)

- Stats: STR 10 / AGI 8 / INT 12 / LCK 14 / HP 16; move range 4
- Heal action: **d20 quality roll** (never fails) — low rolls still heal; **natural-20 crit heals 8 + INT mod**; tiered amount otherwise + INT mod
- Choice panel (`pendingChoice`): when both an enemy and a wounded ally are in range,
  the server stages a 2-step pick (Attack / Heal → heal target). Single-option cases
  fast-path to `pendingCombat` / `pendingHeal`.
- `turn_continue` handles all 4 pending kinds (combat / heal / challenge / choice)
- Player tokens render HP next to name (`Alice 16/16`)

### World Map party sync

- Party miniatures arranged in horizontal line (`SLOT_SPACING = 1.8`); conga-line move (200ms stagger)
- Travel uses chained parabolic tile-hops (`stepHop` in `world-map.html`,
  `updateSlimeAnimation` jump pipeline from `miniature.js`) — same bounce as
  in-stage tile movement. Idle slimes breathe via the same anim.
- Full party movement + fog reveal broadcast + history replay
- OrbitControls camera with X locked to 0, Z clamped ±13, scroll zoom 12–23

### Cutscenes

- **Intro cutscene** (`scenes/cutscene.html`) — animated voxel scene (~14s, skippable) at world-map first-load showing Lyra's capture; `localStorage intro-seen` gates autoplay, "Replay intro" link on world-map
- **Stage 05 entry cinematic** — plays once per session when stage_05 loads; skippable
- **Ending** (`scenes/ending.html`) — heroes return to Eldermoor at dawn + "The End" title screen with Play Again; triggered by stage_06 victory

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
| `audio.js` | BGM/SFX manager with cross-page continuity via `dnd-audio-state` localStorage |
| `game-socket.js` | WebSocket client singleton (`connect`, `send`, `on`) |
| `player-session.js` | Auto-rejoin on page load, DM redirect listener, DM disconnect overlay |
| `chat-panel.js` | Drop-in text chat UI module |
| `colors.js` | Slime color palette + display helpers |
| `miniature.js` | Slime + emoji token builders, jump/idle/attack anim (`updateSlimeAnimation`) |
| `voxel-village.js` | Procedural village builder (huts, paths, props, Lyra slime placer) |
| `debug-bots.js` | **No-op stubs only** — `initDebugBots` / `debugActAs` / `isControlledBy` / `debugBotsAreActive`; no "+3 Bots" button, no bots; server `debug_spawn_bots` handler removed |
| `voxel-textures.js` | Procedural voxel texture atlas |
| `face-camera.js` | MediaPipe face tracking (deprecated — only stage02 voxel demo) |
| `off-axis-box.js` | Off-axis projection helper (legacy) |

---

## Roles & Stats

| Role | STR | AGI | INT | LCK | HP | Attack stat |
|------|-----|-----|-----|-----|----|-------------|
| Warrior | 14 | 10 | 8 | 10 | 20 | STR (+2) |
| Rogue | 8 | 14 | 10 | 12 | 14 | AGI (+2) |
| Mage | 6 | 8 | 14 | 12 | 12 | INT (+2) |
| Cleric | 10 | 8 | 12 | 14 | 16 | INT (+1) |

Combat: `d20 + floor((stat - 10) / 2) ≥ DC` → success (3 damage to enemy on success; `failHp` to player on miss). Each class attacks with its **signature stat** (`ATTACK_STAT_BY_ROLE` in `server.js`), not the enemy's tagged stat — so the mage rolls INT, not STR. `enemy.dc` still varies per enemy.

Cleric heal: d20 quality roll — never whiffs. Low rolls heal a small amount + INT mod; **nat-20 crit heals 8 + INT mod**. Tiered amounts in between.

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
| C→S | `action_request` (move/attack/heal/attempt) | Request game action (validated server-side) |
| C→S | `turn_continue` | Active player advances turn after combat or heal |
| C→S | `dm_observe` | DM iframe attaches as stage observer |
| S→C | `state_update` | Authoritative stage snapshot (positions, HP, turn, pendingCombat/Heal/Challenge) |
| S→C | `combat_event` / `skill_check_event` | Animation cues for d20 rolls |
| S→C | `heal_event` | Animation cue for Cleric d20 heal (nat-20 crit flagged) |
| S→C | `enemy_phase` | Monster-turn animation cues (per-enemy move + attack actions) |
| S→C | `chat_message` / `chat_history` | Chat broadcast / replay |
| S→C | `dm_disconnected` / `dm_reconnected` | Player overlay control |
| S→C | `stage_unlock` / `fog_reveal` | World-map state changes |

---

## Directory Structure

```
DND-lite/
├── index.html                  ← Unified entry: DM/Player picker + session code join
├── server.js                   ← WebSocket multiplayer + stage state authority (honors PORT env var)
├── scenes/
│   ├── character-select.html   ← Live lobby: all players pick class + slime color before DM starts
│   ├── world-map.html          ← 3D world map with stage navigation + party vote
│   ├── cutscene.html           ← Animated intro (Lyra's capture)
│   ├── ending.html             ← Victory ending (stage_06 rescue)
│   ├── map-editor.html         ← Move objects/enemies/challenges cell-by-cell, save to grid JSON
│   ├── stage01.html            ← Stage 01 Eldermoor Village — voxel + narrative clues (10×10)
│   ├── stage02.html            ← Stage 02 Goblin's Trail — voxel combat (12×12, 3 goblins)
│   ├── stage03.html            ← Stage 03 Whispering Forest — voxel + skill checks (14×14)
│   ├── stage04.html            ← Stage 04 Goblin Outpost — voxel combat, enemy AI on (14×14)
│   ├── stage05.html            ← Stage 05 Throne of Goblin King — boss + cinematic, AI on (15×14)
│   ├── stage06.html            ← Stage 06 The Vault — Luna Ruins GLB, free Lyra INT check
│   ├── dm/
│   │   ├── session.html        ← DM: auto-create/rejoin, redirect + observation panel + spectator iframe
│   │   └── lobby.html          ← DM: standalone create/rejoin page (not the index entry point)
│   └── voxel/
│       ├── room.html           ← Voxel dungeon + d20 combat (legacy single-player)
│       └── editor.html         ← Voxel room editor
├── scripts/
│   ├── game-socket.js
│   ├── player-session.js
│   ├── chat-panel.js
│   ├── colors.js               ← Slime color palette
│   ├── audio.js                ← BGM + SFX with cross-page continuity
│   ├── miniature.js            ← Slime token builders + jump/idle/attack anim
│   ├── voxel-village.js        ← Procedural village builder
│   ├── debug-bots.js           ← No-op stubs (demo mode: no bots, no button)
│   ├── face-camera.js
│   ├── off-axis-box.js
│   └── voxel-textures.js
├── rooms/
│   ├── stage01-grid.json       ← Eldermoor Village grid + houses/wells/paths + 3 auto clues
│   ├── stage02-grid.json       ← Goblin's Trail grid + 3 goblins (voxel combat)
│   ├── stage03-grid.json       ← Whispering Forest grid + 3 skill challenges
│   ├── stage04-grid.json       ← Goblin Outpost grid + captain/guards/archer + enemyAI
│   ├── stage05-grid.json       ← Throne grid + King/Royal Guards + Water of Life well + enemyAI
│   └── stage06-grid.json       ← The Vault grid + free_lyra INT challenge (DC 12, retryOnFail)
├── test/
│   ├── map-expansion.mjs       ← Grid validation (dims, walkable, reachable)
│   ├── part-c.mjs              ← Stage progression / stage06 rescue (server must be running)
│   └── enemy-ai.mjs            ← Enemy movement + attack (server must be running)
├── Assets/                     ← GLB models (Draco-compressed) + audio/
└── images/                     ← Parallax layer PNGs
```

---

## Roadmap 🔜

End goal: **six-stage end-to-end playthrough** (1 DM + up to 5 players), rescuing the kidnapped healer Lyra from the Goblin King's vault. See `docs/superpowers/plans/2026-04-29-prototype-storyline.md` for the full storyline.

### Recent (Part A/B/C + playtest polish + demo prep) ✅

- [x] **5-player lobby** — character-select lobby; player joins with name + code, then picks class + slime color live
- [x] **Stage 02 voxel rebuild** — Goblin's Trail (12×12 voxel combat) replaces the old Luna Ruins GLB stage
- [x] **Stage 06 vault finale** — The Vault (Luna Ruins GLB, non-combat); `free_lyra` INT DC 12 `retryOnFail`
- [x] **Stage 05 entry cinematic** — Lyra dragged to vault + King taunt ("Want the healer back? Cut me down first!"), once per session, skippable
- [x] **Active enemy AI (stage04+)** — `enemyAI:true` in grid; BFS pursuit + attack on monster turn (`runEnemyPhase`); `enemy_phase` broadcast
- [x] **Cleric d20 heal** — quality roll (never whiffs); nat-20 crit 8 + INT mod; client d20 animation
- [x] **Lyra INT check** — `free_lyra` retryable INT challenge in stage06; win = ending
- [x] **Stage 05 Water of Life well** — optional auto-heal obstacle (8 HP, non-walkable, "run dry" on revisit)
- [x] **2× map expansion** — stages 01/02 expanded; all grids validated by `test/map-expansion.mjs`
- [x] **DM flow shortcut** — index → DM → `session.html` directly (auto-create if no code)
- [x] **Deferred victory overlay** — victory/defeat waits for player to dismiss result dialog's Continue
- [x] **Centered dice** — dice fly to screen center to roll (combat + skill check + heal)
- [x] **Demo prep** — debug bots removed (`debug-bots.js` stubs only; server `debug_spawn_bots` deleted); `DEBUG_UNLOCK_ALL` removed; always starts with only stage_01 unlocked; `PORT` env var support

### Completed earlier ✅

- [x] **Cleric class** — 4th class; choice panel; `turn_continue` covers attack/heal/challenge/choice
- [x] **Stage 4 (Goblin Outpost)** — voxel outpost, captain + guards + archer; DM unlock + redirect
- [x] **Stage 3 (Whispering Forest)** — voxel trees + 3 skill-check panels
- [x] **Stage 5 (Throne of the Goblin King)** — boss arena; mixed victory condition
- [x] **Stage 1 (Eldermoor Village)** — voxel village + 3 narrative clue investigations
- [x] **Intro cutscene** — ~14s skippable, `localStorage intro-seen` gate
- [x] **Ending cutscene** — heroes return to Eldermoor; Play Again
- [x] **HP persistence + party defeat** — session-level HP across stages; dead players spectate; defeat only when all down
- [x] **Auto-unlock chain** — stage_N victory unlocks stage_N+1
- [x] **Party vote on world-map** — vote proposal + live "lean" animation; nay snaps back; solo skips
- [x] **Ranged attacks (Rogue/Mage)** — `ATTACK_RANGE_BY_ROLE = {warrior:1, rogue:2, mage:2, cleric:1}`
- [x] **Audio system + cross-page BGM continuity** — `scripts/audio.js`; same-track navigation resumes position; retro 8-bit SFX (`Assets/audio/sfx/*.wav`)
- [x] **OrbitControls cameras** — world-map: drag-pan / right-drag tilt / scroll zoom; voxel stages: rotation-only with pitch clamp
- [x] **Map editor** (`scenes/map-editor.html`) — move objects/enemies/challenges cell-by-cell, save to grid JSON
- [x] **SFX layer** — 13 retro 8-bit one-shots: `dice_roll`, `attack_melee`/`attack_ranged`, `fail`, `enemy_down`, `heal`, `skill_success`, `jump`, `ui_click`, `victory`, `defeat`, `unlock`, `chat_ping`

### Not yet done

- [ ] **Voice chat** — WebRTC mesh, push-to-talk / mic toggle, speaking indicator
- [ ] **Cleric revive mechanic** — currently dead players cannot be brought back; consider altar/revival challenge
- [ ] **End-to-end team playtest** with the full group
