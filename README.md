# D&D Lite

A web-based D&D-lite prototype. Slimes-as-adventurers, voxel stages, server-authoritative turn combat, and a short bookend story: an intro cutscene where the village healer Lyra is kidnapped, five stages to chase the goblins through, and an ending where the party brings her home.

## Features

- **Five stages** — Eldermoor Village (narrative clues) → Luna Ruins → Whispering Forest (skill checks) → Goblin Outpost → Throne of the Goblin King + Lyra rescue.
- **Animated cutscenes** — intro (Lyra's capture) auto-plays on first visit; ending plays after the boss falls. Both skippable.
- **Four classes** — Warrior / Rogue / Mage / Cleric. Each is a colored slime carrying the role's weapon emoji. Rogue + Mage have attack range 2; melee Warrior + Cleric have range 1. Cleric gets a choice panel (Attack / Heal → target picker) when both options exist.
- **Multiplayer + solo** — up to 4 players + 1 optional DM via 4-digit code. Solo mode plays as one human plus up to 3 stand-in bots controlled by the same browser. Locked stages dim on the world map; victory in stage N auto-unlocks stage N+1.
- **Party vote on the world map** — clicking a stage proposes a vote; live "lean" animation as yes-voters tilt toward the destination, any nay snaps the party back. Solo + bots skip the vote.
- **Server-authoritative combat** — d20 grid combat with shared turn order. HP persists across stages. Dead players become spectators (slime fades out over 2 s) but can still watch their party play; defeat only fires when the whole party is down.
- **Background music** — looping BGM per scene with cross-page continuity (the same track keeps playing where it left off as you navigate world-map ↔ stages).
- **Text chat** — drop-in panel on every player + DM scene.
- **Debug** — `+3 Bots` button on the world map fills the remaining slots with same-session bots so one browser can drive a full 4-player run.

## Run locally

```bash
npm install
node server.js
# → http://localhost:3000
```

Open the URL, pick a class, and either click **Play Solo** (with the `+3 Bots` button to fill the party) or share the displayed code with friends.

## Tech

Three.js (renderer + OrbitControls), WebSocket (`ws`) + Express, HTMLAudio for BGM, procedural voxel scenes built from Kenney tile textures, no GLB except for the Luna Ruins stage and the world map model.
