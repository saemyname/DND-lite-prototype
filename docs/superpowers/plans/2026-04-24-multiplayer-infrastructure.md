# Multiplayer Infrastructure Implementation Plan

> **STATUS: COMPLETE** (2026-04-28) — All 7 tasks implemented and tested.
> Post-plan fixes: dm_rejoin, player_rejoin, player-session.js, character.html, server logging.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node.js WebSocket server so a DM and up to 4 players on the same local network can connect, with the DM controlling stage unlocks and fog-of-war on the players' world-map in real time.

**Architecture:** Node.js (Express + ws) serves static files and manages WebSocket sessions. A session is identified by a 4-character code the DM shares with players. The DM creates a session from `dm/lobby.html`, players join via `scenes/index.html`. All game state messages flow through the server; the server relays DM commands to all connected players.

**Tech Stack:** Node.js 18+, Express 4, ws 8, vanilla ES-module JS on the client side (no build step).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `package.json` | Node deps |
| Create | `server.js` | HTTP + WebSocket server, session management |
| Create | `scripts/game-socket.js` | Client-side WebSocket utility (ES module) |
| Create | `scenes/index.html` | Player entry — session code input, join |
| Create | `scenes/dm/lobby.html` | DM creates session, waits for players |
| Create | `scenes/dm/session.html` | DM live control panel |
| Modify | `scenes/world-map.html` | Listen for WebSocket events from DM |

---

## Task 1: Node.js Project Setup

**Files:**
- Create: `package.json`
- Install: `express`, `ws`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "dnd-lite",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "ws": "^8.17.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/sae/sae-amazing-projects/DND-lite
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Verify install**

```bash
node -e "require('express'); require('ws'); console.log('OK')"
```

Expected: `OK`

---

## Task 2: WebSocket Server

**Files:**
- Create: `server.js`

- [ ] **Step 1: Write server.js**

```javascript
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { networkInterfaces } = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve entire project root as static
app.use(express.static(path.join(__dirname)));

// sessions: Map<code, { dm: WebSocket|null, players: Map<id, PlayerEntry>, unlockedStages: Set }>
// PlayerEntry: { ws, name, role, location }
const sessions = new Map();

function makeCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function send(ws, msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcastPlayers(session, msg) {
  for (const p of session.players.values()) send(p.ws, msg);
}

wss.on('connection', (ws) => {
  let sess = null;
  let role = null; // 'dm' | 'player'
  let pid  = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'dm_create': {
        const code = makeCode();
        sess = { dm: ws, players: new Map(), unlockedStages: new Set(['stage_01']) };
        sessions.set(code, sess);
        role = 'dm';
        send(ws, { type: 'session_created', code });
        break;
      }

      case 'player_join': {
        sess = sessions.get(msg.code);
        if (!sess)                  { send(ws, { type: 'error', message: 'Invalid code' }); return; }
        if (sess.players.size >= 4) { send(ws, { type: 'error', message: 'Session full' });  return; }
        pid  = `p${Date.now()}`;
        role = 'player';
        sess.players.set(pid, { ws, name: msg.name, role: msg.role, location: 'world-map' });
        send(ws, { type: 'joined', playerId: pid, unlockedStages: [...sess.unlockedStages] });
        send(sess.dm, { type: 'player_joined', playerId: pid, name: msg.name, role: msg.role });
        break;
      }

      case 'stage_unlock': {
        if (role !== 'dm' || !sess) return;
        sess.unlockedStages.add(msg.stageKey);
        broadcastPlayers(sess, { type: 'stage_unlock', stageKey: msg.stageKey });
        send(ws, { type: 'stage_unlock_ack', stageKey: msg.stageKey });
        break;
      }

      case 'player_redirect': {
        if (role !== 'dm' || !sess) return;
        broadcastPlayers(sess, { type: 'player_redirect', url: msg.url });
        break;
      }

      case 'fog_reveal': {
        if (role !== 'dm' || !sess) return;
        broadcastPlayers(sess, { type: 'fog_reveal', x: msg.x, z: msg.z });
        break;
      }

      case 'player_location': {
        if (role !== 'player' || !sess) return;
        const p = sess.players.get(pid);
        if (p) p.location = msg.location;
        send(sess.dm, { type: 'player_location', playerId: pid, location: msg.location });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!sess) return;
    if (role === 'dm') {
      sess.dm = null;
      broadcastPlayers(sess, { type: 'dm_disconnected' });
    } else if (role === 'player' && pid) {
      sess.players.delete(pid);
      send(sess.dm, { type: 'player_left', playerId: pid });
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const ifaces of Object.values(nets)) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) { localIP = i.address; break; }
    }
  }
  console.log(`DND-lite server:`);
  console.log(`  Local:   http://localhost:${PORT}/scenes/world-map.html`);
  console.log(`  Network: http://${localIP}:${PORT}/scenes/world-map.html`);
  console.log(`  DM:      http://${localIP}:${PORT}/scenes/dm/lobby.html`);
});
```

- [ ] **Step 2: Start server and verify it starts**

```bash
node server.js
```

Expected output:
```
DND-lite server:
  Local:   http://localhost:3000/scenes/world-map.html
  Network: http://192.168.x.x:3000/scenes/world-map.html
  DM:      http://192.168.x.x:3000/scenes/dm/lobby.html
```

- [ ] **Step 3: Verify static file serving**

Open `http://localhost:3000/scenes/world-map.html` in browser.
Expected: world-map loads normally (same as before).

Kill server with Ctrl+C after verification.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json server.js
git commit -m "feat: add Node.js WebSocket server for multiplayer sessions"
```

---

## Task 3: Client WebSocket Utility

**Files:**
- Create: `scripts/game-socket.js`

- [ ] **Step 1: Write game-socket.js**

```javascript
// Shared WebSocket client utility for DND-lite
// Usage: import { connect, send, on } from '../scripts/game-socket.js';

let _ws = null;
const _handlers = {};

/**
 * Connect to the WebSocket server.
 * @param {Function} onOpen - called when connection opens
 */
export function connect(onOpen) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  _ws = new WebSocket(`${proto}//${location.host}`);

  _ws.addEventListener('open', () => onOpen?.());

  _ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    _handlers[msg.type]?.(msg);
  });

  _ws.addEventListener('close', () => {
    console.warn('[game-socket] disconnected');
    _handlers['_disconnect']?.();
  });
}

/**
 * Send a message to the server.
 */
export function send(msg) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

/**
 * Register a handler for a message type.
 * Use '_disconnect' to handle connection loss.
 */
export function on(type, handler) {
  _handlers[type] = handler;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/game-socket.js
git commit -m "feat: add game-socket.js client WebSocket utility"
```

---

## Task 4: DM Lobby Page

**Files:**
- Create: `scenes/dm/lobby.html`

- [ ] **Step 1: Create scenes/dm/ directory**

```bash
mkdir -p scenes/dm
```

- [ ] **Step 2: Write scenes/dm/lobby.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>D&D Lite — DM Lobby</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Georgia', serif;
    color: #c8a96e;
  }
  h1 {
    font-size: 13px;
    letter-spacing: 6px;
    text-transform: uppercase;
    color: rgba(200,169,110,.4);
    margin-bottom: 48px;
  }
  .code-box {
    font-size: 72px;
    letter-spacing: 24px;
    color: #ffe9a0;
    border: 1px solid rgba(200,169,110,.3);
    padding: 24px 40px;
    border-radius: 8px;
    margin-bottom: 16px;
    background: rgba(200,169,110,.04);
    display: none;
  }
  .code-hint {
    font-size: 11px;
    letter-spacing: 3px;
    color: rgba(200,169,110,.35);
    margin-bottom: 48px;
    text-transform: uppercase;
    display: none;
  }
  .player-list {
    width: 320px;
    margin-bottom: 40px;
    min-height: 80px;
  }
  .player-list h2 {
    font-size: 10px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: rgba(200,169,110,.4);
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(200,169,110,.15);
    padding-bottom: 8px;
  }
  .player-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    font-size: 12px;
    letter-spacing: 2px;
    color: rgba(200,169,110,.8);
    border-bottom: 1px solid rgba(200,169,110,.08);
  }
  .player-role {
    font-size: 10px;
    color: rgba(200,169,110,.4);
    text-transform: uppercase;
  }
  btn {
    display: block;
    padding: 10px 28px;
    background: rgba(200,169,110,.08);
    border: 1px solid rgba(200,169,110,.3);
    border-radius: 4px;
    color: #c8a96e;
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    cursor: pointer;
    font-family: 'Georgia', serif;
    transition: all .2s;
  }
  btn:hover { background: rgba(200,169,110,.18); color: #ffe9a0; }
  #btn-create { margin-bottom: 12px; }
  #btn-start  { display: none; }
  #status {
    margin-top: 24px;
    font-size: 10px;
    letter-spacing: 2px;
    color: rgba(200,169,110,.3);
    text-transform: uppercase;
  }
</style>
</head>
<body>

<h1>Dungeon Master — Lobby</h1>

<div class="code-box" id="code-display"></div>
<div class="code-hint" id="code-hint">Share this code with players</div>

<div class="player-list">
  <h2>Players (<span id="player-count">0</span>/4)</h2>
  <div id="player-rows"></div>
</div>

<btn id="btn-create">Create Session</btn>
<btn id="btn-start">Start Session →</btn>
<div id="status">Not connected</div>

<script type="module">
import { connect, send, on } from '../../scripts/game-socket.js';

let sessionCode = null;
const players = new Map();

const btnCreate = document.getElementById('btn-create');
const btnStart  = document.getElementById('btn-start');
const codeDisplay = document.getElementById('code-display');
const codeHint    = document.getElementById('code-hint');
const statusEl    = document.getElementById('status');
const playerRows  = document.getElementById('player-rows');
const playerCount = document.getElementById('player-count');

function renderPlayers() {
  playerRows.innerHTML = '';
  playerCount.textContent = players.size;
  for (const [id, p] of players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `<span>${p.name}</span><span class="player-role">${p.role}</span>`;
    playerRows.appendChild(row);
  }
}

on('session_created', (msg) => {
  sessionCode = msg.code;
  localStorage.setItem('dm-session-code', sessionCode);
  codeDisplay.textContent = sessionCode;
  codeDisplay.style.display = 'block';
  codeHint.style.display = 'block';
  btnCreate.style.display = 'none';
  btnStart.style.display = 'block';
  statusEl.textContent = 'Session active — waiting for players';
});

on('player_joined', (msg) => {
  players.set(msg.playerId, { name: msg.name, role: msg.role });
  renderPlayers();
});

on('player_left', (msg) => {
  players.delete(msg.playerId);
  renderPlayers();
});

on('_disconnect', () => {
  statusEl.textContent = 'Disconnected from server';
});

connect(() => {
  statusEl.textContent = 'Connected to server';
});

btnCreate.addEventListener('click', () => {
  send({ type: 'dm_create' });
});

btnStart.addEventListener('click', () => {
  window.location.href = `session.html?code=${sessionCode}`;
});
</script>
</body>
</html>
```

- [ ] **Step 3: Start server and open DM lobby in browser**

```bash
node server.js
```

Open `http://localhost:3000/scenes/dm/lobby.html`.

Expected:
- "Connected to server" status appears
- "Create Session" button visible
- Click it → 4-letter code appears
- "Start Session →" button appears

- [ ] **Step 4: Commit**

```bash
git add scenes/dm/lobby.html
git commit -m "feat: add DM lobby page with session creation"
```

---

## Task 5: Player Entry Page

**Files:**
- Create: `scenes/index.html`

- [ ] **Step 1: Write scenes/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>D&D Lite — Join</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Georgia', serif;
    color: #c8a96e;
    gap: 0;
  }
  h1 {
    font-size: 13px;
    letter-spacing: 6px;
    text-transform: uppercase;
    color: rgba(200,169,110,.4);
    margin-bottom: 48px;
  }
  .char-info {
    font-size: 18px;
    letter-spacing: 4px;
    color: #ffe9a0;
    margin-bottom: 6px;
  }
  .char-role {
    font-size: 11px;
    letter-spacing: 3px;
    color: rgba(200,169,110,.4);
    text-transform: uppercase;
    margin-bottom: 40px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
    width: 260px;
  }
  label {
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: rgba(200,169,110,.4);
  }
  input {
    background: rgba(200,169,110,.06);
    border: 1px solid rgba(200,169,110,.25);
    border-radius: 4px;
    padding: 10px 14px;
    color: #ffe9a0;
    font-size: 24px;
    letter-spacing: 8px;
    text-align: center;
    text-transform: uppercase;
    font-family: monospace;
    width: 100%;
  }
  input:focus { outline: none; border-color: rgba(200,169,110,.6); }
  input::placeholder { color: rgba(200,169,110,.2); letter-spacing: 4px; font-size: 14px; }
  btn {
    display: block;
    width: 260px;
    padding: 12px;
    background: rgba(200,169,110,.08);
    border: 1px solid rgba(200,169,110,.3);
    border-radius: 4px;
    color: #c8a96e;
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    cursor: pointer;
    font-family: 'Georgia', serif;
    transition: all .2s;
    text-align: center;
    margin-top: 8px;
  }
  btn:hover { background: rgba(200,169,110,.18); color: #ffe9a0; }
  btn:disabled { opacity: .35; cursor: default; }
  #status {
    margin-top: 24px;
    font-size: 10px;
    letter-spacing: 2px;
    color: rgba(200,169,110,.35);
    text-transform: uppercase;
    height: 16px;
  }
  #no-char {
    font-size: 11px;
    letter-spacing: 2px;
    color: rgba(200,169,110,.4);
    text-align: center;
    line-height: 1.8;
  }
  #no-char a {
    color: #c8a96e;
  }
</style>
</head>
<body>

<h1>D&D Lite — Join Session</h1>

<div id="char-section"></div>

<div class="field">
  <label>Session Code</label>
  <input id="code-input" maxlength="4" placeholder="ABCD" autocomplete="off" spellcheck="false">
</div>

<btn id="btn-join" disabled>Join Session</btn>
<div id="status"></div>

<script type="module">
import { connect, send, on } from '../scripts/game-socket.js';

const charData = JSON.parse(localStorage.getItem('dndlite-character') || 'null');
const charSection = document.getElementById('char-section');
const codeInput = document.getElementById('code-input');
const btnJoin = document.getElementById('btn-join');
const statusEl = document.getElementById('status');

if (!charData) {
  charSection.innerHTML = `<div id="no-char">No character found.<br><a href="character.html">Create one first →</a></div>`;
  btnJoin.disabled = true;
} else {
  charSection.innerHTML = `
    <div class="char-info">${charData.name || 'Adventurer'}</div>
    <div class="char-role">${charData.role || 'Unknown'}</div>
  `;
}

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  btnJoin.disabled = codeInput.value.length !== 4 || !charData;
});

on('joined', (msg) => {
  localStorage.setItem('player-id', msg.playerId);
  localStorage.setItem('session-code', codeInput.value);
  localStorage.setItem('unlocked-stages', JSON.stringify(msg.unlockedStages));
  statusEl.textContent = 'Joined! Entering world…';
  setTimeout(() => { window.location.href = 'world-map.html'; }, 600);
});

on('error', (msg) => {
  statusEl.textContent = msg.message;
  btnJoin.disabled = false;
});

on('_disconnect', () => {
  statusEl.textContent = 'Server not reachable';
});

let connected = false;
connect(() => { connected = true; statusEl.textContent = 'Connected'; });

btnJoin.addEventListener('click', () => {
  if (!connected || !charData) return;
  btnJoin.disabled = true;
  statusEl.textContent = 'Joining…';
  send({
    type: 'player_join',
    code: codeInput.value,
    name: charData.name || 'Adventurer',
    role: charData.role || 'warrior',
  });
});
</script>
</body>
</html>
```

- [ ] **Step 2: Verify join flow manually**

With server running, open two browser tabs:
- Tab 1: `http://localhost:3000/scenes/dm/lobby.html` → Create Session → note code (e.g. `AB12`)
- Tab 2: `http://localhost:3000/scenes/index.html` → enter `AB12` → click Join

Expected:
- Tab 2 shows "Joined! Entering world…" then navigates to world-map.html
- Tab 1 player list shows the joined player's name and role

- [ ] **Step 3: Commit**

```bash
git add scenes/index.html
git commit -m "feat: add player entry page with session code join"
```

---

## Task 6: World-Map WebSocket Integration

**Files:**
- Modify: `scenes/world-map.html`

The world-map needs to:
1. On load, connect to WebSocket if a session code is in localStorage
2. Announce current location to DM
3. Listen for `stage_unlock` → add to unlocked set
4. Listen for `fog_reveal` → call existing `revealFog(x, z)`
5. Listen for `player_redirect` → `window.location.href = url`

- [ ] **Step 1: Add game-socket import to world-map.html**

In `scenes/world-map.html`, find the existing import block:
```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
```

Add one line after:
```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { connect, send, on } from '../scripts/game-socket.js';
```

- [ ] **Step 2: Add WebSocket init block**

Find the line `// ══ ZOOM + ROTATION ══` section (after the fog-of-war section). Add before it:

```javascript
// ══════════════════════════════════════
//   MULTIPLAYER SYNC
// ══════════════════════════════════════

// Load server-unlocked stages from localStorage (set on join)
const serverUnlocked = new Set(
  JSON.parse(localStorage.getItem('unlocked-stages') || '["stage_01"]')
);

// Connect to server if we have a session code
if (localStorage.getItem('session-code')) {
  connect(() => {
    send({ type: 'player_location', location: 'world-map' });
  });

  on('stage_unlock', (msg) => {
    serverUnlocked.add(msg.stageKey);
    localStorage.setItem('unlocked-stages', JSON.stringify([...serverUnlocked]));
    console.log('[ws] Stage unlocked:', msg.stageKey);
  });

  on('fog_reveal', (msg) => {
    revealFog(msg.x, msg.z);
  });

  on('player_redirect', (msg) => {
    window.location.href = msg.url;
  });
}
```

- [ ] **Step 3: Update the click handler to check serverUnlocked**

Find the click handler block that contains:
```javascript
const num = parseInt(stageId.replace(/\D/g, ''));
const prevKey = Object.keys(stages).find(k => k.includes(String(num - 1).padStart(2, '0')));
if (num === 1 || clearedStages.has(prevKey)) {
```

Replace the condition so the server can also unlock stages:
```javascript
const num = parseInt(stageId.replace(/\D/g, ''));
const prevKey = Object.keys(stages).find(k => k.includes(String(num - 1).padStart(2, '0')));
if (num === 1 || clearedStages.has(prevKey) || serverUnlocked.has(stageId)) {
```

- [ ] **Step 4: Verify**

With server running:
1. DM lobby → create session → note code
2. Player: `index.html` → join with code → lands on world-map
3. DM browser console: `wsServer` logs show player joined
4. Refresh world-map → it reconnects and still has `serverUnlocked` from localStorage

- [ ] **Step 5: Commit**

```bash
git add scenes/world-map.html
git commit -m "feat: world-map listens for DM WebSocket commands"
```

---

## Task 7: DM Session Control Panel

**Files:**
- Create: `scenes/dm/session.html`

- [ ] **Step 1: Write scenes/dm/session.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>D&D Lite — DM Session</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a;
    min-height: 100vh;
    font-family: 'Georgia', serif;
    color: #c8a96e;
    display: grid;
    grid-template-columns: 280px 1fr;
    grid-template-rows: 56px 1fr;
  }
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    padding: 0 24px;
    border-bottom: 1px solid rgba(200,169,110,.12);
    gap: 16px;
  }
  header h1 {
    font-size: 11px;
    letter-spacing: 5px;
    text-transform: uppercase;
    color: rgba(200,169,110,.5);
  }
  .code-badge {
    font-size: 18px;
    letter-spacing: 6px;
    color: #ffe9a0;
    font-family: monospace;
    border: 1px solid rgba(200,169,110,.2);
    padding: 2px 12px;
    border-radius: 4px;
  }
  #status {
    margin-left: auto;
    font-size: 10px;
    letter-spacing: 2px;
    color: rgba(200,169,110,.3);
    text-transform: uppercase;
  }

  aside {
    border-right: 1px solid rgba(200,169,110,.1);
    padding: 20px 16px;
    overflow-y: auto;
  }
  aside h2 {
    font-size: 10px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: rgba(200,169,110,.35);
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(200,169,110,.1);
  }
  .player-row {
    padding: 8px 0;
    border-bottom: 1px solid rgba(200,169,110,.07);
    font-size: 11px;
    letter-spacing: 1px;
  }
  .player-row .name { color: rgba(200,169,110,.9); }
  .player-row .loc  { font-size: 10px; color: rgba(200,169,110,.3); margin-top: 2px; }
  #no-players { font-size: 10px; color: rgba(200,169,110,.25); letter-spacing: 1px; }

  main {
    padding: 24px;
    overflow-y: auto;
  }
  section { margin-bottom: 32px; }
  section h2 {
    font-size: 10px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: rgba(200,169,110,.35);
    margin-bottom: 14px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(200,169,110,.1);
  }
  .btn-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  dm-btn {
    display: inline-block;
    padding: 8px 18px;
    background: rgba(200,169,110,.07);
    border: 1px solid rgba(200,169,110,.25);
    border-radius: 4px;
    color: rgba(200,169,110,.7);
    font-size: 10px;
    letter-spacing: 3px;
    text-transform: uppercase;
    cursor: pointer;
    font-family: 'Georgia', serif;
    transition: all .2s;
  }
  dm-btn:hover { background: rgba(200,169,110,.18); color: #ffe9a0; border-color: rgba(200,169,110,.5); }
  dm-btn.active { background: rgba(200,169,110,.25); color: #ffe9a0; border-color: rgba(200,169,110,.7); }
</style>
</head>
<body>

<header>
  <h1>DM Control</h1>
  <span class="code-badge" id="code-badge">----</span>
  <span id="status">Connecting…</span>
</header>

<aside>
  <h2>Players</h2>
  <div id="player-list"><span id="no-players">None connected</span></div>
</aside>

<main>
  <section>
    <h2>Stage Control</h2>
    <div class="btn-grid" id="stage-btns">
      <dm-btn data-action="unlock" data-stage="stage_01">Unlock Stage 01</dm-btn>
      <dm-btn data-action="unlock" data-stage="stage_02">Unlock Stage 02</dm-btn>
      <dm-btn data-action="unlock" data-stage="stage_03">Unlock Stage 03</dm-btn>
    </div>
  </section>

  <section>
    <h2>Navigate Players To</h2>
    <div class="btn-grid">
      <dm-btn data-action="redirect" data-url="world-map.html">World Map</dm-btn>
      <dm-btn data-action="redirect" data-url="stage01.html">Stage 01</dm-btn>
      <dm-btn data-action="redirect" data-url="stage02.html">Stage 02</dm-btn>
    </div>
  </section>
</main>

<script type="module">
import { connect, send, on } from '../../scripts/game-socket.js';

const params = new URLSearchParams(location.search);
const code = params.get('code') || localStorage.getItem('dm-session-code');

document.getElementById('code-badge').textContent = code || '----';

const players = new Map();
const playerList = document.getElementById('player-list');
const noPlayers  = document.getElementById('no-players');
const statusEl   = document.getElementById('status');

function renderPlayers() {
  playerList.innerHTML = '';
  if (players.size === 0) {
    playerList.appendChild(noPlayers);
    return;
  }
  for (const [id, p] of players) {
    const div = document.createElement('div');
    div.className = 'player-row';
    div.id = `player-${id}`;
    div.innerHTML = `<div class="name">${p.name} <span style="opacity:.4;font-size:9px">${p.role}</span></div>
                     <div class="loc" id="loc-${id}">${p.location}</div>`;
    playerList.appendChild(div);
  }
}

on('session_created', () => {}); // already created in lobby

on('player_joined', (msg) => {
  players.set(msg.playerId, { name: msg.name, role: msg.role, location: 'world-map' });
  renderPlayers();
});

on('player_left', (msg) => {
  players.delete(msg.playerId);
  renderPlayers();
});

on('player_location', (msg) => {
  const p = players.get(msg.playerId);
  if (p) {
    p.location = msg.location;
    const locEl = document.getElementById(`loc-${msg.playerId}`);
    if (locEl) locEl.textContent = msg.location;
  }
});

on('stage_unlock_ack', (msg) => {
  const btn = document.querySelector(`[data-stage="${msg.stageKey}"]`);
  if (btn) btn.classList.add('active');
});

on('_disconnect', () => { statusEl.textContent = 'Disconnected'; });

connect(() => {
  statusEl.textContent = `Connected · session ${code}`;
  // Re-register as DM using the existing session (server keeps ws alive from lobby)
  // Note: if page was refreshed, we need to re-create session.
  // For now, DM session page assumes the WebSocket session is alive from lobby.
});

// Button clicks
document.querySelectorAll('dm-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'unlock') {
      send({ type: 'stage_unlock', stageKey: btn.dataset.stage });
    } else if (action === 'redirect') {
      send({ type: 'player_redirect', url: btn.dataset.url });
    }
  });
});
</script>
</body>
</html>
```

- [ ] **Step 2: End-to-end test**

With server running:
1. DM: `dm/lobby.html` → Create Session → note code → Start Session → `dm/session.html`
2. Player: `index.html` → enter code → joins → world-map loads
3. DM session: Click "Unlock Stage 02" → player's world-map console shows `[ws] Stage unlocked: stage_02`
4. DM session: Click "World Map" under Navigate → player browser navigates to world-map.html

- [ ] **Step 3: Commit**

```bash
git add scenes/dm/session.html
git commit -m "feat: add DM session control panel"
```

---

## Known Limitation: DM Page Refresh

If the DM refreshes `session.html`, the WebSocket reconnects but `dm_create` is not re-sent, so the server doesn't know the new WebSocket is the DM. A future plan can add session re-auth (storing the code + a secret token in localStorage and sending a `dm_rejoin` message). For now, DM should not refresh — navigate back to lobby to recreate if needed.

---

## Verification Checklist

- [ ] `node server.js` starts without errors, shows local + network URLs
- [ ] Static files serve correctly (`/scenes/world-map.html` loads)
- [ ] DM lobby creates session, shows 4-letter code
- [ ] Player enters code on `index.html`, joins session, navigates to world-map
- [ ] DM lobby player list updates when player joins
- [ ] DM session "Unlock Stage 02" → player world-map receives `stage_unlock` WebSocket message
- [ ] DM session "Navigate → Stage 01" → player browser navigates to `stage01.html`
