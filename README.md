# D&D Lite — "Lyra Rescue Team"

A web-based, slimes-as-adventurers take on tabletop D&D: voxel stages, server-authoritative turn combat, and real-time multiplayer over a 4-digit session code. A short story bookends the run — the village healer **Lyra** is dragged off by goblins in the intro, the party chases them through six stages, frees her from the vault, and brings her home.

Built with Three.js + a Node WebSocket server. Players just open a URL in the browser — no install on their end.

## Features

- **Six stages** — Eldermoor Village (narrative clues) → Goblin's Trail (voxel combat) → Whispering Forest (skill checks) → Goblin Outpost → Throne of the Goblin King (boss + entry cinematic) → **The Vault** (free Lyra → ending). Win a stage to unlock the next.
- **Up to 5 players + 1 DM** — join with a name + 4-digit code, then pick a class and slime color in a live character-select lobby. The DM starts the adventure.
- **Four classes** — Warrior / Rogue / Mage / Cleric, each a colored slime. Rogue + Mage attack at range 2; Warrior + Cleric at range 1. Cleric heals (d20 quality roll, never whiffs, nat-20 crit) and gets an Attack/Heal choice panel.
- **Active enemies (stage 4+)** — on the monster turn, goblins pursue the nearest party member and strike; the Goblin King and Captain hold their ground and counter. Earlier stages stay calm as a ramp.
- **Server-authoritative combat** — d20 grid combat with shared turn order; the dice fly to center to roll. HP persists across stages; downed players spectate; defeat only when the whole party falls.
- **Cutscenes** — intro (Lyra's capture) auto-plays once; stage 5 entry cinematic (Lyra dragged to the vault + the King's taunt); ending when she's freed. All skippable.
- **World map + party vote** — clicking a stage proposes a vote; live "lean" animation as the party tilts toward the destination.
- **DM dashboard** — one click from the landing page lands on the live session (auto-creates a code), with per-player/enemy state, an embedded spectator view of the active stage, manual stage unlock/redirect, and a skip-turn override.
- **Audio** — looping BGM with cross-page continuity + retro 8-bit SFX. **Text chat** on every scene.
- **Map editor** (`scenes/map-editor.html`) — move objects/enemies/challenges cell-by-cell and save back to the grid JSON.

## Run it (the host)

Only the person hosting needs Node. Players never install anything.

```bash
npm install
node server.js
# → http://localhost:3000
```

The console prints a **Network** URL (e.g. `http://192.168.x.x:3000/`). Anyone on the **same Wi-Fi** opens that:

- **Players:** open the URL → enter a name + the session code → pick a class/color.
- **DM:** open the URL → click **DM** → you land straight on the session dashboard with the code to share.

First load plays the intro cutscene, then the world map (only stage 1 unlocked); progress unlocks the rest. The DM can also unlock/redirect manually.

## Playing online (beyond your Wi-Fi)

**GitHub Pages will _not_ work for multiplayer.** Pages only serves static files, but this game needs a live process running `node server.js` — the browser opens a WebSocket back to the same host (`new WebSocket(location.host)`) for all the real-time state. On Pages the page would load but never connect, so there'd be no lobby and no play.

### Easiest: one-click host (macOS)

Clone or download this repo, then double-click **`host-online.command`** in Finder (or run `npm run host`). It starts the game server, opens a free Cloudflare tunnel, copies a public **invite link** to your clipboard, and opens it for you — no two-terminal dance. Share that link and your friends just open it; you're the host.

- **Requirements:** macOS, Node.js ([nodejs.org](https://nodejs.org)), an internet connection.
- First run installs deps (`npm install`) and `cloudflared` automatically (Homebrew if present, otherwise a direct download — no Homebrew required).
- The link goes live ~20s after it appears; share it with anyone, anywhere.
- It stays up while that window is open; **Ctrl-C** stops the game and kills the link.
- No accounts, no deploy, free. (The link is temporary — a new one each run.)
- **Gatekeeper:** if macOS blocks the file on first launch ("unidentified developer"), right-click it → **Open** once; it runs normally after that.

### Or do it manually / keep a permanent URL

To run the Node server somewhere that supports **WebSockets** and share that URL:

1. **Deploy the server** to a Node host — Render, Railway, Fly.io, a small VPS, etc.
   - Build/start command: `npm install` then `npm start` (`node server.js`).
   - The server already honors `process.env.PORT`, so most platforms work out of the box.
   - Sessions live in memory, so a restart/sleep clears active games — fine for casual sessions; add persistence if you need it to survive restarts.
2. **Quick public tunnel** for a one-off session — run locally and expose it:
   ```bash
   node server.js
   # in another terminal:
   ngrok http 3000          # or: cloudflared tunnel --url http://localhost:3000
   ```
   Share the temporary public URL. No deploy, but it's only up while your machine + tunnel run.

In every case **players just open the URL** — only the host runs anything.

> Passing a runnable copy to a non-git friend? Send the **whole folder**, not just `host-online.command` (it runs `node server.js` from the project root). A clean zip: `git archive --format=zip --prefix=dnd-lite-host/ -o ~/Desktop/dnd-lite-host.zip HEAD` (excludes `node_modules`/`.git`).

## Tech

Three.js (renderer + OrbitControls + GLTFLoader), `ws` WebSocket server + Express static hosting (one origin serves both), procedural voxel scenes from Kenney tile textures, HTMLAudio BGM + synthesized 8-bit SFX. The only GLB stages are The Vault (Luna Ruins) and the world map; everything else is voxel built from grid JSON.

## Tests

```bash
node test/map-expansion.mjs   # grid validation (dims, walkable, reachable)
node test/part-c.mjs          # stage progression / stage06 rescue (server must be running)
node test/enemy-ai.mjs        # enemy movement + attack (server must be running)
```
