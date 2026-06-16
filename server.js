const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { networkInterfaces } = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve entire project root as static
app.use(express.static(path.join(__dirname)));

const STAGE_CONFIGS = {};
function loadStageConfig(stageId) {
  if (STAGE_CONFIGS[stageId]) return STAGE_CONFIGS[stageId];
  const filePath = path.join(__dirname, 'rooms', `${stageId}-grid.json`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const cfg = JSON.parse(raw);
  STAGE_CONFIGS[stageId] = cfg;
  return cfg;
}

// sessions: Map<code, { dm: WebSocket|null, players: Map<id, PlayerEntry>, unlockedStages: Set }>
// PlayerEntry: { ws: WebSocket|null, name, role, location }
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

function buildWorldMapState(sess) {
  return {
    type: 'world_map_state',
    players: [...sess.players.entries()].map(([pid, p]) => ({
      pid, name: p.name, role: p.role, stageId: p.worldMapStage || null,
    })),
  };
}

function broadcastWorldMapState(sess) {
  const msg = buildWorldMapState(sess);
  broadcastPlayers(sess, msg);
  if (sess.dm) send(sess.dm, msg);
}

// Set every player's worldMapStage and notify clients. Trigger for vote pass
// or single-human direct move.
function executeWorldMapMove(sess, stageId) {
  for (const p of sess.players.values()) {
    p.worldMapStage = stageId;
  }
  broadcastWorldMapState(sess);
}

function voteStateMsg(v) {
  const yesPids = [...v.votes.entries()].filter(([_, c]) => c === 'yes').map(([pid]) => pid);
  return {
    type: 'vote_state',
    stageId: v.stageId,
    initiatorName: v.initiatorName,
    initiatorPid: v.initiatorPid,
    yesPids,
    yesCount: yesPids.length,
    requiredYes: v.requiredYes,
  };
}

function broadcastVoteState(sess) {
  if (!sess.activeVote) return;
  broadcastPlayers(sess, voteStateMsg(sess.activeVote));
}

function makeStageState(stageId) {
  const cfg = loadStageConfig(stageId);
  return {
    stageId,
    cfg,
    players: new Map(),
    deadSpectatorPids: new Set(), // pids of players who died this stage; receive broadcasts but don't render/act
    enemies: (cfg.enemies || []).map(e => ({...e})),
    challenges: (cfg.challenges || []).map(c => ({...c, cleared: false})),
    turnOrder: [],
    activeTurnIdx: 0,
    pendingCombat: null,
    pendingHeal: null,
    pendingChoice: null, // cleric: pick attack vs heal, then pick heal target if multiple
    pendingChallenge: null,
    outcome: null,
    observers: new Set(),  // extra ws connections (e.g. DM iframe spectators)
  };
}

function broadcastStage(stageState, sess, msg) {
  for (const pid of stageState.players.keys()) {
    const p = sess.players.get(pid);
    if (p?.ws) send(p.ws, msg);
  }
  // Dead players still spectate — they can watch teammates play the stage out
  for (const pid of stageState.deadSpectatorPids) {
    const p = sess.players.get(pid);
    if (p?.ws) send(p.ws, msg);
  }
  if (sess.dm) send(sess.dm, msg);
  for (const obsWs of stageState.observers) send(obsWs, msg);
}

// Move any HP<=0 player out of the active stage state into spectator status.
// Keeps activeTurnIdx pointing at a still-alive player (or 0 if everyone dies).
function pruneDeadFromStage(stageState) {
  const toRemove = [];
  for (const [pid, p] of stageState.players) {
    if (p.hp <= 0) toRemove.push(pid);
  }
  for (const pid of toRemove) {
    stageState.players.delete(pid);
    stageState.deadSpectatorPids.add(pid);
    const idx = stageState.turnOrder.indexOf(pid);
    if (idx >= 0) {
      stageState.turnOrder.splice(idx, 1);
      if (stageState.turnOrder.length === 0) {
        stageState.activeTurnIdx = 0;
      } else if (stageState.activeTurnIdx > idx) {
        stageState.activeTurnIdx -= 1;
      } else if (stageState.activeTurnIdx === idx) {
        // The current actor just died — index now points to the next player
        stageState.activeTurnIdx %= stageState.turnOrder.length;
      }
    }
    // Clear any pending state that referenced this pid so the stage isn't
    // stuck waiting on someone who can't act anymore.
    if (stageState.pendingCombat && stageState.pendingCombat.attackerPid === pid) {
      stageState.pendingCombat = null;
    }
    if (stageState.pendingHeal &&
        (stageState.pendingHeal.healerPid === pid || stageState.pendingHeal.targetPid === pid)) {
      stageState.pendingHeal = null;
    }
    if (stageState.pendingChallenge && stageState.pendingChallenge.actorPid === pid) {
      stageState.pendingChallenge = null;
    }
    if (stageState.pendingChoice && stageState.pendingChoice.actorPid === pid) {
      stageState.pendingChoice = null;
    }
  }
  return toRemove.length;
}

function activeTurnPid(stageState) {
  return stageState.turnOrder[stageState.activeTurnIdx] || null;
}

function snapshotState(stageState) {
  return {
    stageId: stageState.stageId,
    players: [...stageState.players.entries()].map(([pid, p]) => ({ pid, ...p })),
    enemies: stageState.enemies,
    challenges: stageState.challenges,
    turnOrder: stageState.turnOrder,
    activeTurnPid: activeTurnPid(stageState),
    pendingCombat: stageState.pendingCombat,
    pendingHeal: stageState.pendingHeal,
    pendingChallenge: stageState.pendingChallenge,
    pendingChoice: stageState.pendingChoice,
    outcome: stageState.outcome,
  };
}

function isCellWalkable(stageState, col, row, selfPid) {
  const { cols, rows } = stageState.cfg.grid;
  if (col < 0 || col >= cols || row < 0 || row >= rows) return false;
  if (stageState.cfg.walkable[row][col] !== 1) return false;
  if (stageState.enemies.some(e => e.hp > 0 && e.col === col && e.row === row)) return false;
  for (const [otherPid, p] of stageState.players) {
    if (otherPid === selfPid) continue;
    if (p.col === col && p.row === row) return false;
  }
  return true;
}

const MOVE_RANGE_BY_ROLE   = { warrior: 3, rogue: 5, mage: 4, cleric: 4 };
const ATTACK_RANGE_BY_ROLE = { warrior: 1, rogue: 2, mage: 2, cleric: 1 };
// Each class attacks with its signature stat (not the enemy's). Falls back to
// the enemy's tagged stat, then 'str', for safety.
const ATTACK_STAT_BY_ROLE  = { warrior: 'str', rogue: 'agi', mage: 'int', cleric: 'int' };

function chebyshev(c1, r1, c2, r2) {
  return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
}

// Attack-range shape: melee (range=1) hits all 8 neighbors (Chebyshev),
// ranged (range≥2) uses a diamond — orthogonal up to `range`, diagonal
// only 1 tile (Manhattan ≤ range).
function inAttackRange(c1, r1, c2, r2, range) {
  const dc = Math.abs(c1 - c2), dr = Math.abs(r1 - r2);
  if (range <= 1) return Math.max(dc, dr) <= 1;
  return dc + dr <= range;
}

const ROLE_STATS = {
  warrior: { str: 14, agi: 10, int:  8, lck: 10, hp: 20 },
  rogue:   { str:  8, agi: 14, int: 10, lck: 12, hp: 14 },
  mage:    { str:  6, agi:  8, int: 14, lck: 12, hp: 12 },
  cleric:  { str: 10, agi:  8, int: 12, lck: 14, hp: 16 },
};

// Place a bot player at a free walkable cell. Prefers distance ≥ 2 from spawn
// so bots don't surround the human and leave them unable to move on turn 1.
function placeBotInStage(st, botPid, botPlayer) {
  if (st.players.has(botPid)) return;
  const [spawnCol, spawnRow] = st.cfg.playerSpawn;
  const taken = new Set([...st.players.values()].map(p => `${p.col},${p.row}`));

  let placeCol = spawnCol, placeRow = spawnRow;
  if (taken.has(`${spawnCol},${spawnRow}`)) {
    // BFS outward within grid bounds — collect (cell, depth) of free walkable tiles.
    const { cols, rows } = st.cfg.grid;
    const visited = new Set([`${spawnCol},${spawnRow}`]);
    const queue = [[spawnCol, spawnRow, 0]];
    const candidates = [];
    while (queue.length) {
      const [c, r, d] = queue.shift();
      if (d > 12) break; // hard cap on search radius
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (isCellWalkable(st, nc, nr, botPid) && !taken.has(key)) {
          candidates.push({ c: nc, r: nr, d: d + 1 });
        }
        queue.push([nc, nr, d + 1]);
      }
      if (candidates.length > 20) break; // enough to choose from
    }
    // Prefer depth ≥ 2; fall back to nearest if the map is too tight.
    const pick = candidates.find(x => x.d >= 2) || candidates[0];
    if (pick) { placeCol = pick.c; placeRow = pick.r; }
  }
  const stats = ROLE_STATS[botPlayer.role] || ROLE_STATS.warrior;
  // Persist HP across stages — use session-tracked hp if available
  const persistHp    = typeof botPlayer.hp    === 'number' ? botPlayer.hp    : stats.hp;
  const persistMaxHp = typeof botPlayer.maxHp === 'number' ? botPlayer.maxHp : stats.hp;
  st.players.set(botPid, {
    col: placeCol,
    row: placeRow,
    hp: persistHp,
    maxHp: persistMaxHp,
    name: botPlayer.name,
    role: botPlayer.role,
    stats: { str: stats.str, agi: stats.agi, int: stats.int, lck: stats.lck },
  });
  st.turnOrder.push(botPid);
}

function reachable(stageState, fromCol, fromRow, range, selfPid) {
  const visited = new Set();
  const result = new Set();
  const queue = [{ col: fromCol, row: fromRow, dist: 0 }];
  visited.add(`${fromCol},${fromRow}`);
  while (queue.length) {
    const { col, row, dist } = queue.shift();
    result.add(`${col},${row}`);
    if (dist < range) {
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = col + dc, nr = row + dr;
        const key = `${nc},${nr}`;
        if (!visited.has(key) && isCellWalkable(stageState, nc, nr, selfPid)) {
          visited.add(key);
          queue.push({ col: nc, row: nr, dist: dist + 1 });
        }
      }
    }
  }
  return result;
}

function adjacentEnemyAt(stageState, col, row, range = 1) {
  return stageState.enemies.find(e =>
    e.hp > 0 && inAttackRange(col, row, e.col, e.row, range)
  );
}

// All alive enemies within attack range — used to offer a target picker when
// more than one is reachable.
function adjacentEnemiesAt(stageState, col, row, range = 1) {
  return stageState.enemies.filter(e =>
    e.hp > 0 && inAttackRange(col, row, e.col, e.row, range)
  );
}

function rollD6() { return Math.floor(Math.random() * 6) + 1; }

// Returns ALL healable allies (wounded + alive + within 1 tile incl. self).
function healableAlliesAt(stageState, col, row) {
  const out = [];
  for (const [pid, p] of stageState.players) {
    if (p.hp <= 0 || p.hp >= p.maxHp) continue;
    if (Math.abs(p.col - col) > 1 || Math.abs(p.row - row) > 1) continue;
    out.push({ pid, name: p.name, hp: p.hp, maxHp: p.maxHp });
  }
  return out;
}

function adjacentChallengeAt(stageState, col, row) {
  if (!stageState.challenges) return null;
  return stageState.challenges.find(c =>
    !c.cleared &&
    Math.abs(c.col - col) <= 1 &&
    Math.abs(c.row - row) <= 1
  );
}

function advanceTurn(stageState) {
  if (stageState.turnOrder.length === 0) return;
  // Skip past dead players. Bounded by turnOrder length to avoid infinite loops
  // when no one is alive (caller is expected to have set st.outcome by then).
  for (let i = 0; i < stageState.turnOrder.length; i++) {
    stageState.activeTurnIdx = (stageState.activeTurnIdx + 1) % stageState.turnOrder.length;
    const pid = stageState.turnOrder[stageState.activeTurnIdx];
    const p = stageState.players.get(pid);
    if (p && p.hp > 0) return;
  }
}

// Mirror a player's HP from stage state back to session so it persists across
// stage transitions. Call this after any action that changes hp.
function syncPlayerHpToSession(sess, st, pid) {
  const sp = sess.players.get(pid);
  const stp = st.players.get(pid);
  if (sp && stp) {
    sp.hp = stp.hp;
    sp.maxHp = stp.maxHp;
  }
}

// Chain stage_01 → stage_02 → ... so victory unlocks the next stage.
const NEXT_STAGE = {
  stage01: 'stage_02',
  stage02: 'stage_03',
  stage03: 'stage_04',
  stage04: 'stage_05',
};

function unlockNextStage(sess, stageId) {
  const next = NEXT_STAGE[stageId];
  if (!next) return;
  if (sess.unlockedStages.has(next)) return;
  sess.unlockedStages.add(next);
  broadcastPlayers(sess, { type: 'stage_unlock', stageKey: next });
  if (sess.dm) send(sess.dm, { type: 'stage_unlock_ack', stageKey: next });
  console.log(`[auto-unlock] stage=${stageId} cleared → unlocked ${next}`);
}

// True once no living players remain in the stage (everyone has been moved to
// the dead-spectator set).
function allPlayersDead(stageState) {
  return stageState.players.size === 0 && stageState.deadSpectatorPids.size > 0;
}

function startTurnAutoCombat(stageState) {
  if (stageState.outcome || stageState.pendingCombat || stageState.pendingChoice) return;
  const activePid = activeTurnPid(stageState);
  if (!activePid) return;
  const me = stageState.players.get(activePid);
  if (!me) return;
  const range = ATTACK_RANGE_BY_ROLE[me.role] || 1;
  const enemies = adjacentEnemiesAt(stageState, me.col, me.row, range);
  if (enemies.length === 1) {
    stageState.pendingCombat = { attackerPid: activePid, enemyId: enemies[0].id };
  } else if (enemies.length > 1) {
    // Multiple in range → let the player choose which to attack.
    stageState.pendingChoice = {
      actorPid: activePid,
      attackEnemies: enemies.map(e => ({ id: e.id, name: e.name })),
      healTargets: [],
      step: 'pick_enemy',
    };
  }
}

function rollD20() { return Math.floor(Math.random() * 20) + 1; }
function statModifier(val) { return Math.floor((val - 10) / 2); }

wss.on('connection', (ws) => {
  let sess = null;
  let role = null; // 'dm' | 'player'
  let pid  = null;
  let code = null;

  // Heartbeat: mark alive on every pong (see the sweep interval below).
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'dm_create': {
        code = makeCode();
        sess = { dm: ws, players: new Map(), unlockedStages: new Set(['stage_01']), chatHistory: [], stages: new Map(), revealedFog: [] };
        sessions.set(code, sess);
        role = 'dm';
        console.log(`[dm_create] session=${code}`);
        send(ws, { type: 'session_created', code });
        break;
      }

      case 'dm_rejoin': {
        const rejoinSess = sessions.get(msg.code);
        if (!rejoinSess) {
          console.log(`[dm_rejoin] FAIL — session not found: ${msg.code}`);
          send(ws, { type: 'error', message: 'Session not found' }); return;
        }
        rejoinSess.dm = ws;
        sess = rejoinSess;
        code = msg.code;
        role = 'dm';
        const playerList = [...rejoinSess.players.entries()].map(([id, p]) => ({
          playerId: id, name: p.name, role: p.role, location: p.location,
        }));
        console.log(`[dm_rejoin] session=${code}, players=${playerList.length}`);
        send(ws, { type: 'dm_rejoined', players: playerList, unlockedStages: [...rejoinSess.unlockedStages] });
        send(ws, { type: 'chat_history', messages: rejoinSess.chatHistory });
        send(ws, { type: 'fog_history', points: rejoinSess.revealedFog || [] });
        send(ws, buildWorldMapState(rejoinSess));
        for (const st of rejoinSess.stages.values()) {
          send(ws, { type: 'state_update', state: snapshotState(st) });
        }
        broadcastPlayers(sess, { type: 'dm_reconnected' });
        console.log(`[dm_rejoin] notified ${sess.players.size} players of dm_reconnected`);
        break;
      }

      case 'start_solo': {
        // Single-player session: this connection is the only player; no DM
        code = makeCode();
        pid  = `p${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3,'0')}`;
        role = 'player';
        sess = {
          dm: null,
          players: new Map(),
          unlockedStages: new Set(['stage_01']),
          chatHistory: [],
          stages: new Map(),
          revealedFog: [],
        };
        {
          const soloRole = String(msg.role || 'warrior').toLowerCase();
          const soloStats = ROLE_STATS[soloRole] || ROLE_STATS.warrior;
          sess.players.set(pid, {
            ws,
            name: String(msg.name || 'Adventurer').slice(0, 24),
            role: soloRole,
            hp: soloStats.hp,
            maxHp: soloStats.hp,
            location: 'world-map',
            worldMapStage: null,
          });
        }
        sessions.set(code, sess);
        console.log(`[start_solo] session=${code}, pid=${pid}, name=${msg.name}, role=${msg.role}`);
        send(ws, { type: 'solo_started', code, playerId: pid, unlockedStages: [...sess.unlockedStages] });
        break;
      }

      case 'player_join': {
        sess = sessions.get(msg.code);
        if (!sess)                  { send(ws, { type: 'error', message: 'Invalid code' }); return; }
        if (ws === sess.dm) { send(ws, { type: 'error', message: 'DM cannot join as player' }); return; }
        if (sess.players.size >= 4) { send(ws, { type: 'error', message: 'Session full' });  return; }
        pid  = `p${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3,'0')}`;
        role = 'player';
        {
          const joinRole = String(msg.role || 'warrior').toLowerCase();
          const joinStats = ROLE_STATS[joinRole] || ROLE_STATS.warrior;
          sess.players.set(pid, {
            ws,
            name: msg.name,
            role: joinRole,
            hp: joinStats.hp,
            maxHp: joinStats.hp,
            location: 'world-map',
            worldMapStage: null,
          });
        }
        console.log(`[player_join] session=${msg.code}, pid=${pid}, name=${msg.name}`);
        send(ws, { type: 'joined', playerId: pid, unlockedStages: [...sess.unlockedStages] });
        send(ws, { type: 'chat_history', messages: sess.chatHistory });
        send(ws, { type: 'fog_history', points: sess.revealedFog || [] });
        send(sess.dm, { type: 'player_joined', playerId: pid, name: msg.name, role: msg.role });
        broadcastWorldMapState(sess);
        break;
      }

      case 'debug_spawn_bots': {
        if (role !== 'player' || !sess) return;
        const allRoles = ['warrior', 'rogue', 'mage', 'cleric'];
        const used = new Set([...sess.players.values()].map(p => p.role));
        const remaining = allRoles.filter(r => !used.has(r));
        const created = [];
        let i = 0;
        while (sess.players.size < 4 && i < remaining.length) {
          const botRole = remaining[i++];
          const botPid = `bot_${Date.now()}_${i}`;
          const botName = `Bot-${botRole[0].toUpperCase()}${botRole[1]}`;
          {
            const botStats = ROLE_STATS[botRole] || ROLE_STATS.warrior;
            sess.players.set(botPid, {
              ws: null,
              name: botName,
              role: botRole,
              hp: botStats.hp,
              maxHp: botStats.hp,
              isBot: true,
              location: 'world-map',
              worldMapStage: null,
            });
          }
          created.push({ pid: botPid, name: botName, role: botRole });
        }
        // Also drop bots into any stage the requester is already in
        for (const st of sess.stages.values()) {
          if (!st.players.has(pid)) continue;
          for (const bot of created) {
            const botPlayer = sess.players.get(bot.pid);
            placeBotInStage(st, bot.pid, botPlayer);
          }
          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
        }
        send(ws, { type: 'bots_spawned', bots: created });
        if (sess.dm) send(sess.dm, { type: 'bots_spawned', bots: created });
        broadcastWorldMapState(sess); // surface bots to world-map party renderer
        console.log(`[debug_spawn_bots] session=${code} added ${created.length} bots`);
        break;
      }

      case 'stage_unlock': {
        if (role !== 'dm' || !sess) {
          console.log(`[stage_unlock] REJECTED — role=${role}, sess=${!!sess}`);
          return;
        }
        sess.unlockedStages.add(msg.stageKey);
        const activeWs = [...sess.players.values()].filter(p => p.ws?.readyState === 1).length;
        console.log(`[stage_unlock] key=${msg.stageKey}, players_with_open_ws=${activeWs}/${sess.players.size}`);
        broadcastPlayers(sess, { type: 'stage_unlock', stageKey: msg.stageKey });
        send(ws, { type: 'stage_unlock_ack', stageKey: msg.stageKey });
        break;
      }

      case 'chat_send': {
        if (!sess) return;
        const text = String(msg.text ?? '').slice(0, 200).trim();
        if (!text) return;
        let from;
        if (role === 'dm') {
          from = 'DM';
        } else if (role === 'player' && pid) {
          const p = sess.players.get(pid);
          from = p?.name || 'Adventurer';
        } else {
          return;
        }
        const entry = { from, role, text, ts: Date.now() };
        sess.chatHistory.push(entry);
        if (sess.chatHistory.length > 50) sess.chatHistory.shift();
        const out = { type: 'chat_message', ...entry };
        send(sess.dm, out);
        broadcastPlayers(sess, out);
        break;
      }

      case 'enter_stage': {
        if (role !== 'player' || !sess || !pid) return;
        const stageId = msg.stageId;
        if (!stageId || typeof stageId !== 'string') return;
        let st = sess.stages.get(stageId);
        if (!st) {
          try { st = makeStageState(stageId); }
          catch (e) { console.error('[enter_stage] config load fail:', stageId, e.message); return; }
          sess.stages.set(stageId, st);
        }
        if (!st.players.has(pid) && !st.deadSpectatorPids.has(pid)) {
          const player = sess.players.get(pid);
          // If the player carried 0 HP from a prior stage, they arrive as a
          // spectator (no slime, no turn) — revival mechanics will bring them back later.
          if (typeof player?.hp === 'number' && player.hp <= 0) {
            st.deadSpectatorPids.add(pid);
          } else {
          const [spawnCol, spawnRow] = st.cfg.playerSpawn;
          // Find an unoccupied walkable cell starting from spawn (BFS outward)
          let placeCol = spawnCol, placeRow = spawnRow;
          const taken = new Set([...st.players.values()].map(p => `${p.col},${p.row}`));
          if (taken.has(`${spawnCol},${spawnRow}`)) {
            const visited = new Set([`${spawnCol},${spawnRow}`]);
            const queue = [[spawnCol, spawnRow]];
            outer: while (queue.length) {
              const [c, r] = queue.shift();
              for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const nc = c + dc, nr = r + dr;
                const key = `${nc},${nr}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (isCellWalkable(st, nc, nr, pid) && !taken.has(key)) {
                  placeCol = nc; placeRow = nr;
                  break outer;
                }
                queue.push([nc, nr]);
              }
            }
          }
          const stats = msg.stats && typeof msg.stats === 'object' ? msg.stats : {};
          // Persist HP across stages — session-tracked hp wins over msg payload
          const persistHp    = typeof player?.hp    === 'number' ? player.hp    : null;
          const persistMaxHp = typeof player?.maxHp === 'number' ? player.maxHp : null;
          st.players.set(pid, {
            col: placeCol,
            row: placeRow,
            hp:    persistHp    ?? Math.max(1, Number(msg.hp)    || 10),
            maxHp: persistMaxHp ?? Math.max(1, Number(msg.maxHp) || 10),
            name: player?.name || 'Adventurer',
            role: player?.role || 'Warrior',
            stats: {
              str: Number(stats.str) || 10,
              agi: Number(stats.agi) || 10,
              int: Number(stats.int) || 10,
              lck: Number(stats.lck) || 10,
            },
          });
          st.turnOrder.push(pid);
          // Mirror back to session in case msg.hp was used (first-ever entry)
          syncPlayerHpToSession(sess, st, pid);
          }
        }
        // Auto-place any bots in the same session into this stage too
        for (const [botPid, botPlayer] of sess.players) {
          if (!botPlayer.isBot) continue;
          if (st.players.has(botPid) || st.deadSpectatorPids.has(botPid)) continue;
          // Dead bots also arrive as spectators
          if (typeof botPlayer.hp === 'number' && botPlayer.hp <= 0) {
            st.deadSpectatorPids.add(botPid);
            continue;
          }
          placeBotInStage(st, botPid, botPlayer);
          syncPlayerHpToSession(sess, st, botPid);
        }
        // If the active turn pid is dead (carried over from prior stage), skip past
        const turnPid = activeTurnPid(st);
        const turnP   = turnPid ? st.players.get(turnPid) : null;
        if (turnP && turnP.hp <= 0) advanceTurn(st);
        const snap = snapshotState(st);
        broadcastStage(st, sess, { type: 'state_update', state: snap });
        console.log(`[enter_stage] session=${code} stage=${stageId} pid=${pid} players=${st.players.size}`);
        break;
      }

      case 'dm_observe': {
        const observeSess = sessions.get(msg.code);
        if (!observeSess) return;
        if (!msg.stageId || typeof msg.stageId !== 'string') return;
        let st = observeSess.stages.get(msg.stageId);
        if (!st) {
          try { st = makeStageState(msg.stageId); }
          catch (e) { console.error('[dm_observe] config load fail:', msg.stageId, e.message); return; }
          observeSess.stages.set(msg.stageId, st);
        }
        st.observers.add(ws);
        ws._observing = { sess: observeSess, st };
        send(ws, { type: 'state_update', state: snapshotState(st) });
        console.log(`[dm_observe] session=${msg.code} stage=${msg.stageId} observers=${st.observers.size}`);
        break;
      }

      case 'action_request': {
        if (role !== 'player' || !sess || !pid) return;
        // Debug bot control: a real player may submit actions on behalf of a bot
        // in the same session by including `actAsPid`. Bots have no WS, so this
        // is the only way they ever act.
        const actorPid = (msg.actAsPid && sess.players.get(msg.actAsPid)?.isBot)
          ? msg.actAsPid
          : pid;
        const stageId = msg.stageId;
        const st = sess.stages.get(stageId);
        if (!st) return;
        if (st.outcome) return;
        if (activeTurnPid(st) !== actorPid) return;

        if (msg.kind === 'heal') {
          if (!st.pendingHeal || st.pendingHeal.healerPid !== actorPid) return;
          const target = st.players.get(st.pendingHeal.targetPid);
          if (!target || target.hp <= 0) return;
          const healer = st.players.get(actorPid);
          const intVal = healer?.stats?.int ?? 10;
          const roll = rollD6();
          const mod = statModifier(intVal);
          const heal = Math.max(0, roll + mod);
          const before = target.hp;
          target.hp = Math.min(target.maxHp, target.hp + heal);
          const restored = target.hp - before;
          syncPlayerHpToSession(sess, st, st.pendingHeal.targetPid);

          broadcastStage(st, sess, {
            type: 'heal_event',
            healerPid: actorPid,
            targetPid: st.pendingHeal.targetPid,
            roll, mod, restored,
            outcomeText: `${healer.name} restores ${restored} HP to ${target.name}.`,
          });

          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'attempt') {
          if (!st.pendingChallenge || st.pendingChallenge.actorPid !== actorPid) return;
          const ch = st.challenges.find(c => c.id === st.pendingChallenge.challengeId);
          if (!ch || ch.cleared) return;
          const me = st.players.get(actorPid);

          // Narrative auto-success (stage_01 clue investigations): skip the
          // d20 roll, force success, broadcast cosmetic values so the client's
          // skill-check panel still has something to render.
          let roll, mod, total, success, outcomeText;
          let dmgToPlayer = 0;
          if (ch.auto) {
            roll = 20; mod = 0; total = 20; success = true;
            outcomeText = ch.successText;
          } else {
            const statVal = me?.stats?.[ch.stat] ?? 10;
            roll = rollD20();
            mod  = statModifier(statVal);
            total = roll + mod;
            success = total >= ch.dc;
            if (success) {
              outcomeText = ch.successText + (ch.successHp ? ` (${ch.successHp >= 0 ? '+' : ''}${ch.successHp} HP)` : '');
              if (ch.successHp) {
                me.hp = Math.max(0, Math.min(me.maxHp, me.hp + ch.successHp));
              }
            } else {
              dmgToPlayer = -ch.failHp;
              me.hp = Math.max(0, me.hp - dmgToPlayer);
              outcomeText = ch.failText + ` (-${dmgToPlayer} HP)`;
            }
          }

          // Mark cleared on success always. Some challenges (e.g. Lyra's cage)
          // can be retried on failure — leave them open in that case.
          if (success || !ch.retryOnFail) {
            ch.cleared = true;
          }
          syncPlayerHpToSession(sess, st, actorPid);
          pruneDeadFromStage(st);

          broadcastStage(st, sess, {
            type: 'skill_check_event',
            actorPid,
            challengeId: ch.id,
            stat: ch.stat || null,
            dc: ch.dc || 0,
            roll, mod, total, success,
            auto: !!ch.auto,
            outcomeText,
          });

          // Stage end — defeat only when EVERY player is down; victory when
          // enemies dead AND challenges cleared (and at least one player alive)
          if (allPlayersDead(st)) {
            st.outcome = 'defeat';
          } else if (st.enemies.every(e => e.hp <= 0) && st.challenges.every(c => c.cleared)) {
            st.outcome = 'victory';
            unlockNextStage(sess, st.stageId);
          }

          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'attack') {
          if (!st.pendingCombat || st.pendingCombat.attackerPid !== actorPid) return;
          const enemy = st.enemies.find(e => e.id === st.pendingCombat.enemyId);
          if (!enemy || enemy.hp <= 0) return;

          const attacker = st.players.get(actorPid);
          const atkStat = ATTACK_STAT_BY_ROLE[attacker?.role] || enemy.stat || 'str';
          const statVal = attacker?.stats?.[atkStat] ?? 10;
          const roll = rollD20();
          const mod = statModifier(statVal);
          const total = roll + mod;
          const success = total >= enemy.dc;

          let outcomeText, dmgToEnemy = 0, dmgToPlayer = 0;
          if (success) {
            dmgToEnemy = 3;
            enemy.hp = Math.max(0, enemy.hp - dmgToEnemy);
            outcomeText = enemy.successText + (enemy.hp > 0
              ? ` [Enemy HP: ${enemy.hp}/${enemy.maxHp}]`
              : ' — ENEMY DEFEATED!');
          } else {
            dmgToPlayer = -enemy.failHp;
            const me = st.players.get(actorPid);
            me.hp = Math.max(0, me.hp - dmgToPlayer);
            outcomeText = enemy.failText + ` (-${dmgToPlayer} HP)`;
            syncPlayerHpToSession(sess, st, actorPid);
            pruneDeadFromStage(st);
          }

          broadcastStage(st, sess, {
            type: 'combat_event',
            attackerPid: actorPid,
            enemyId: enemy.id,
            stat: atkStat,
            dc: enemy.dc,
            roll, mod, total, success,
            outcomeText,
          });

          // Defeat only when EVERY player is down; victory needs ≥1 survivor
          if (allPlayersDead(st)) {
            st.outcome = 'defeat';
          } else if (st.enemies.every(e => e.hp <= 0) && st.challenges.every(c => c.cleared)) {
            st.outcome = 'victory';
            unlockNextStage(sess, st.stageId);
          }

          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'ranged_attack') {
          // Stand-still attack from the actor's current tile against an enemy
          // within their role's attack range (Chebyshev distance).
          if (st.pendingCombat || st.pendingHeal || st.pendingChallenge || st.pendingChoice) return;
          const me = st.players.get(actorPid);
          if (!me) return;
          const enemy = st.enemies.find(e => e.id === msg.enemyId);
          if (!enemy || enemy.hp <= 0) return;
          const range = ATTACK_RANGE_BY_ROLE[me.role] || 1;
          if (!inAttackRange(me.col, me.row, enemy.col, enemy.row, range)) return;
          st.pendingCombat = { attackerPid: actorPid, enemyId: enemy.id };
          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'choice_pick') {
          // Cleric: pick attack/heal, or pick a heal target after choosing heal.
          if (!st.pendingChoice || st.pendingChoice.actorPid !== actorPid) return;
          const pc = st.pendingChoice;
          const choiceEnemies = pc.attackEnemies || [];
          if (pc.step === 'pick_action') {
            if (msg.choice === 'attack' && choiceEnemies.length > 0) {
              if (choiceEnemies.length === 1) {
                st.pendingCombat = { attackerPid: actorPid, enemyId: choiceEnemies[0].id };
                st.pendingChoice = null;
              } else {
                pc.step = 'pick_enemy'; // multiple → ask which enemy next
              }
            } else if (msg.choice === 'heal' && pc.healTargets.length > 0) {
              if (pc.healTargets.length === 1) {
                st.pendingHeal = { healerPid: actorPid, targetPid: pc.healTargets[0].pid };
                st.pendingChoice = null;
              } else {
                pc.step = 'pick_target';
              }
            } else {
              return;
            }
          } else if (pc.step === 'pick_enemy') {
            const chosen = choiceEnemies.find(e => e.id === msg.enemyId);
            const enemy = chosen && st.enemies.find(e => e.id === chosen.id);
            if (!enemy || enemy.hp <= 0) return;
            st.pendingCombat = { attackerPid: actorPid, enemyId: enemy.id };
            st.pendingChoice = null;
          } else if (pc.step === 'pick_target') {
            const tgt = pc.healTargets.find(t => t.pid === msg.targetPid);
            if (!tgt) return;
            st.pendingHeal = { healerPid: actorPid, targetPid: tgt.pid };
            st.pendingChoice = null;
          } else {
            return;
          }
          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'ranged_heal') {
          // Cleric-only: heal a wounded ally within 1 tile (incl. self) without
          // moving. Lets the cleric pick "heal" when an enemy is also adjacent.
          if (st.pendingCombat || st.pendingHeal || st.pendingChallenge || st.pendingChoice) return;
          const me = st.players.get(actorPid);
          if (!me || me.role !== 'cleric') return;
          const target = st.players.get(msg.targetPid);
          if (!target || target.hp <= 0 || target.hp >= target.maxHp) return;
          if (chebyshev(me.col, me.row, target.col, target.row) > 1) return;
          st.pendingHeal = { healerPid: actorPid, targetPid: msg.targetPid };
          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'move') {
          const me = st.players.get(actorPid);
          if (!me) return;
          if (st.pendingCombat) return;
          const dstCol = Number(msg.col), dstRow = Number(msg.row);
          if (!Number.isInteger(dstCol) || !Number.isInteger(dstRow)) return;
          if (!isCellWalkable(st, dstCol, dstRow, actorPid)) return;
          const range = MOVE_RANGE_BY_ROLE[me.role] || 4;
          const reach = reachable(st, me.col, me.row, range, actorPid);
          if (!reach.has(`${dstCol},${dstRow}`)) return;
          me.col = dstCol;
          me.row = dstRow;

          const atkRange = ATTACK_RANGE_BY_ROLE[me.role] || 1;
          const enemies = adjacentEnemiesAt(st, dstCol, dstRow, atkRange);
          const enemyList = enemies.map(e => ({ id: e.id, name: e.name }));
          const startChallengeOrEnd = () => {
            const challenge = adjacentChallengeAt(st, dstCol, dstRow);
            if (challenge) st.pendingChallenge = { actorPid, challengeId: challenge.id };
            else advanceTurn(st);
          };
          if (me.role === 'cleric') {
            // Cleric: if both attack AND heal options exist, show a choice
            // panel (attack vs heal). Multi-enemy attack and >1 ally both get
            // their own target pickers.
            const healables = healableAlliesAt(st, dstCol, dstRow);
            if (enemies.length > 0 && healables.length > 0) {
              st.pendingChoice = { actorPid, attackEnemies: enemyList, healTargets: healables, step: 'pick_action' };
            } else if (enemies.length === 1) {
              st.pendingCombat = { attackerPid: actorPid, enemyId: enemies[0].id };
            } else if (enemies.length > 1) {
              st.pendingChoice = { actorPid, attackEnemies: enemyList, healTargets: [], step: 'pick_enemy' };
            } else if (healables.length === 1) {
              st.pendingHeal = { healerPid: actorPid, targetPid: healables[0].pid };
            } else if (healables.length > 1) {
              st.pendingChoice = { actorPid, attackEnemies: [], healTargets: healables, step: 'pick_target' };
            } else {
              startChallengeOrEnd();
            }
          } else if (enemies.length === 1) {
            st.pendingCombat = { attackerPid: actorPid, enemyId: enemies[0].id };
          } else if (enemies.length > 1) {
            // Multiple enemies in range → ask which one to attack.
            st.pendingChoice = { actorPid, attackEnemies: enemyList, healTargets: [], step: 'pick_enemy' };
          } else {
            startChallengeOrEnd();
          }
          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
        }
        break;
      }

      case 'turn_continue': {
        if (role !== 'player' || !sess || !pid) return;
        const actorPid = (msg.actAsPid && sess.players.get(msg.actAsPid)?.isBot)
          ? msg.actAsPid
          : pid;
        const stageId = msg.stageId;
        const st = sess.stages.get(stageId);
        if (!st) return;
        const isMyCombat    = st.pendingCombat?.attackerPid === actorPid;
        const isMyHeal      = st.pendingHeal?.healerPid === actorPid;
        const isMyChallenge = st.pendingChallenge?.actorPid === actorPid;
        const isMyChoice    = st.pendingChoice?.actorPid === actorPid;
        if (!isMyCombat && !isMyHeal && !isMyChallenge && !isMyChoice) return;
        st.pendingCombat = null;
        st.pendingHeal = null;
        st.pendingChallenge = null;
        st.pendingChoice = null;
        if (!st.outcome) advanceTurn(st);
        broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
        break;
      }

      case 'player_redirect': {
        if (role !== 'dm' || !sess) {
          console.log(`[player_redirect] REJECTED — role=${role}, sess=${!!sess}`);
          return;
        }
        const url = String(msg.url ?? '');
        if (!url || url.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
          console.log(`[player_redirect] URL rejected: ${url}`);
          return;
        }
        const activeWs2 = [...sess.players.values()].filter(p => p.ws?.readyState === 1).length;
        console.log(`[player_redirect] url=${url}, players_with_open_ws=${activeWs2}/${sess.players.size}`);
        broadcastPlayers(sess, { type: 'player_redirect', url });
        break;
      }

      case 'fog_reveal': {
        if (!sess) return;
        if (typeof msg.x !== 'number' || typeof msg.z !== 'number') return;
        if (!sess.revealedFog) sess.revealedFog = [];
        sess.revealedFog.push({ x: msg.x, z: msg.z });
        if (sess.revealedFog.length > 200) sess.revealedFog.shift();
        broadcastPlayers(sess, { type: 'fog_reveal', x: msg.x, z: msg.z });
        if (sess.dm) send(sess.dm, { type: 'fog_reveal', x: msg.x, z: msg.z });
        break;
      }

      case 'player_rejoin': {
        const rs = sessions.get(msg.code);
        if (!rs) {
          console.log(`[player_rejoin] FAIL — session not found: ${msg.code}`);
          // Tell the client the session is gone (e.g. server restarted) so it
          // can stop reconnecting and show an overlay instead of freezing.
          send(ws, { type: 'rejoin_failed', reason: 'session_not_found' });
          return;
        }
        const ep = rs.players.get(msg.playerId);
        if (!ep) {
          console.log(`[player_rejoin] FAIL — player not found: ${msg.playerId} in session ${msg.code}`);
          send(ws, { type: 'rejoin_failed', reason: 'player_not_found' });
          return;
        }
        ep.ws = ws;
        sess = rs;
        code = msg.code;
        pid  = msg.playerId;
        role = 'player';
        if (msg.location) ep.location = msg.location;
        console.log(`[player_rejoin] session=${code}, pid=${pid}, dm_present=${!!sess.dm}`);
        send(ws, { type: 'player_rejoined', unlockedStages: [...sess.unlockedStages] });
        send(ws, { type: 'chat_history', messages: sess.chatHistory });
        send(ws, { type: 'fog_history', points: sess.revealedFog || [] });
        send(ws, buildWorldMapState(sess));
        // Replay any in-progress stage the player belongs to, so reconnecting
        // while inside a stage restores the live 3D/combat state — not just the
        // world-map. Mirrors dm_rejoin's full-stage replay.
        for (const st of sess.stages.values()) {
          if (st.players.has(pid) || st.deadSpectatorPids.has(pid)) {
            send(ws, { type: 'state_update', state: snapshotState(st) });
          }
        }
        // Replay an in-progress party vote so a late-arriving teammate (who was
        // still in a stage when the vote was proposed) sees the panel on landing.
        if (sess.activeVote) send(ws, voteStateMsg(sess.activeVote));
        if (sess.dm) send(sess.dm, { type: 'player_location', playerId: pid, location: ep.location });
        break;
      }

      case 'world_map_move': {
        // Party movement: any player triggering a move moves the WHOLE party to that stage
        if (role !== 'player' || !sess || !pid) return;
        const stageId = msg.stageId;
        if (typeof stageId !== 'string') return;
        if (!sess.unlockedStages.has(stageId)) return;
        executeWorldMapMove(sess, stageId);
        break;
      }

      case 'vote_start': {
        // Propose a party move; other humans must agree (any nay cancels).
        if (role !== 'player' || !sess || !pid) return;
        const stageId = msg.stageId;
        if (typeof stageId !== 'string') return;
        if (!sess.unlockedStages.has(stageId)) return;
        if (sess.activeVote) return; // already voting on something

        const humans = [...sess.players.entries()]
          .filter(([_, p]) => !p.isBot && p.ws);
        const requiredYes = humans.length;

        if (requiredYes <= 1) {
          // Solo or only one human present — skip the vote entirely
          executeWorldMapMove(sess, stageId);
          break;
        }

        const initiator = sess.players.get(pid);
        sess.activeVote = {
          stageId,
          initiatorPid: pid,
          initiatorName: initiator?.name || 'Adventurer',
          votes: new Map([[pid, 'yes']]), // initiator implicitly votes yes
          requiredYes,
        };
        console.log(`[vote_start] ${initiator?.name} → ${stageId} (need ${requiredYes} yes)`);
        broadcastVoteState(sess);
        break;
      }

      case 'vote_cast': {
        if (role !== 'player' || !sess || !pid) return;
        if (!sess.activeVote) return;
        const choice = msg.vote === 'yes' ? 'yes' : 'no';
        sess.activeVote.votes.set(pid, choice);

        if (choice === 'no') {
          const voter = sess.players.get(pid);
          console.log(`[vote_cast] cancelled by ${voter?.name}`);
          broadcastPlayers(sess, {
            type: 'vote_resolved',
            passed: false,
            cancelledByName: voter?.name || 'Adventurer',
          });
          sess.activeVote = null;
          break;
        }

        const yesCount = [...sess.activeVote.votes.values()].filter(v => v === 'yes').length;
        if (yesCount >= sess.activeVote.requiredYes) {
          const stageId = sess.activeVote.stageId;
          console.log(`[vote_cast] passed → ${stageId}`);
          broadcastPlayers(sess, { type: 'vote_resolved', passed: true });
          sess.activeVote = null;
          executeWorldMapMove(sess, stageId);
        } else {
          broadcastVoteState(sess);
        }
        break;
      }

      case 'player_location': {
        if (role !== 'player' || !sess || !sess.dm) return;
        const p = sess.players.get(pid);
        if (p) p.location = msg.location;
        send(sess.dm, { type: 'player_location', playerId: pid, location: msg.location });
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws._observing) {
      ws._observing.st.observers?.delete(ws);
      ws._observing = null;
    }
    if (!sess) return;
    if (role === 'dm') {
      if (sess.dm === ws) { // don't wipe if session.html already took over (dm_rejoin sets sess.dm first)
        broadcastPlayers(sess, { type: 'dm_disconnected' });
        sess.dm = null;
      }
    } else if (role === 'player' && pid) {
      const p = sess.players.get(pid);
      if (p) p.ws = null;
    }
  });
});

// Heartbeat sweep: a socket that misses a ping/pong round-trip (mobile sleep,
// wifi drop, app backgrounded) is silently dead but still reads as OPEN. Ping
// every interval; terminate any that didn't pong since the last sweep. The
// resulting 'close' event runs the normal cleanup (player ws → null, etc.).
const HEARTBEAT_MS = 30000;
const heartbeatSweep = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(heartbeatSweep));

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
  console.log(`  Local:   http://localhost:${PORT}/`);
  console.log(`  Network: http://${localIP}:${PORT}/`);
  console.log(`  DM:      http://${localIP}:${PORT}/`);
});
