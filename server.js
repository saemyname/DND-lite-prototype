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

function makeStageState(stageId) {
  const cfg = loadStageConfig(stageId);
  return {
    stageId,
    cfg,
    players: new Map(),
    enemies: cfg.enemies.map(e => ({...e})),
    turnOrder: [],
    activeTurnIdx: 0,
    pendingCombat: null,
    pendingHeal: null,
    outcome: null,
    observers: new Set(),  // extra ws connections (e.g. DM iframe spectators)
  };
}

function broadcastStage(stageState, sess, msg) {
  for (const pid of stageState.players.keys()) {
    const p = sess.players.get(pid);
    if (p?.ws) send(p.ws, msg);
  }
  if (sess.dm) send(sess.dm, msg);
  for (const obsWs of stageState.observers) send(obsWs, msg);
}

function activeTurnPid(stageState) {
  return stageState.turnOrder[stageState.activeTurnIdx] || null;
}

function snapshotState(stageState) {
  return {
    stageId: stageState.stageId,
    players: [...stageState.players.entries()].map(([pid, p]) => ({ pid, ...p })),
    enemies: stageState.enemies,
    turnOrder: stageState.turnOrder,
    activeTurnPid: activeTurnPid(stageState),
    pendingCombat: stageState.pendingCombat,
    pendingHeal: stageState.pendingHeal,
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

const MOVE_RANGE_BY_ROLE = { warrior: 3, rogue: 5, mage: 4, cleric: 4 };

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

function adjacentEnemyAt(stageState, col, row) {
  return stageState.enemies.find(e =>
    e.hp > 0 &&
    Math.abs(e.col - col) <= 1 &&
    Math.abs(e.row - row) <= 1
  );
}

function rollD6() { return Math.floor(Math.random() * 6) + 1; }

function adjacentHealableAllyAt(stageState, col, row) {
  for (const [pid, p] of stageState.players) {
    if (p.hp <= 0) continue;
    if (p.hp >= p.maxHp) continue;
    if (Math.abs(p.col - col) <= 1 && Math.abs(p.row - row) <= 1) {
      return { pid, ...p };
    }
  }
  return null;
}

function advanceTurn(stageState) {
  if (stageState.turnOrder.length === 0) return;
  stageState.activeTurnIdx = (stageState.activeTurnIdx + 1) % stageState.turnOrder.length;
}

function startTurnAutoCombat(stageState) {
  if (stageState.outcome || stageState.pendingCombat) return;
  const activePid = activeTurnPid(stageState);
  if (!activePid) return;
  const me = stageState.players.get(activePid);
  if (!me) return;
  const adj = adjacentEnemyAt(stageState, me.col, me.row);
  if (adj) {
    stageState.pendingCombat = { attackerPid: activePid, enemyId: adj.id };
  }
}

function rollD20() { return Math.floor(Math.random() * 20) + 1; }
function statModifier(val) { return Math.floor((val - 10) / 2); }

wss.on('connection', (ws) => {
  let sess = null;
  let role = null; // 'dm' | 'player'
  let pid  = null;
  let code = null;

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
          unlockedStages: new Set(['stage_01', 'stage_02', 'stage_03']),
          chatHistory: [],
          stages: new Map(),
          revealedFog: [],
        };
        sess.players.set(pid, {
          ws,
          name: String(msg.name || 'Adventurer').slice(0, 24),
          role: String(msg.role || 'warrior').toLowerCase(),
          location: 'world-map',
          worldMapStage: null,
        });
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
        sess.players.set(pid, { ws, name: msg.name, role: msg.role, location: 'world-map', worldMapStage: null });
        console.log(`[player_join] session=${msg.code}, pid=${pid}, name=${msg.name}`);
        send(ws, { type: 'joined', playerId: pid, unlockedStages: [...sess.unlockedStages] });
        send(ws, { type: 'chat_history', messages: sess.chatHistory });
        send(ws, { type: 'fog_history', points: sess.revealedFog || [] });
        send(sess.dm, { type: 'player_joined', playerId: pid, name: msg.name, role: msg.role });
        broadcastWorldMapState(sess);
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
        if (!st.players.has(pid)) {
          const player = sess.players.get(pid);
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
          st.players.set(pid, {
            col: placeCol,
            row: placeRow,
            hp: Math.max(1, Number(msg.hp) || 10),
            maxHp: Math.max(1, Number(msg.maxHp) || 10),
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
        }
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
        const stageId = msg.stageId;
        const st = sess.stages.get(stageId);
        if (!st) return;
        if (st.outcome) return;
        if (activeTurnPid(st) !== pid) return;

        if (msg.kind === 'heal') {
          if (!st.pendingHeal || st.pendingHeal.healerPid !== pid) return;
          const target = st.players.get(st.pendingHeal.targetPid);
          if (!target || target.hp <= 0) return;
          const healer = st.players.get(pid);
          const intVal = healer?.stats?.int ?? 10;
          const roll = rollD6();
          const mod = statModifier(intVal);
          const heal = Math.max(0, roll + mod);
          const before = target.hp;
          target.hp = Math.min(target.maxHp, target.hp + heal);
          const restored = target.hp - before;

          broadcastStage(st, sess, {
            type: 'heal_event',
            healerPid: pid,
            targetPid: st.pendingHeal.targetPid,
            roll, mod, restored,
            outcomeText: `${healer.name} restores ${restored} HP to ${target.name}.`,
          });

          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'attack') {
          if (!st.pendingCombat || st.pendingCombat.attackerPid !== pid) return;
          const enemy = st.enemies.find(e => e.id === st.pendingCombat.enemyId);
          if (!enemy || enemy.hp <= 0) return;

          const attacker = st.players.get(pid);
          const statVal = attacker?.stats?.[enemy.stat] ?? 10;
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
            const me = st.players.get(pid);
            me.hp = Math.max(0, me.hp - dmgToPlayer);
            outcomeText = enemy.failText + ` (-${dmgToPlayer} HP)`;
          }

          broadcastStage(st, sess, {
            type: 'combat_event',
            attackerPid: pid,
            enemyId: enemy.id,
            stat: enemy.stat,
            dc: enemy.dc,
            roll, mod, total, success,
            outcomeText,
          });

          if (st.players.get(pid).hp <= 0) {
            st.outcome = 'defeat';
          } else if (st.enemies.every(e => e.hp <= 0)) {
            st.outcome = 'victory';
          }

          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
          break;
        }

        if (msg.kind === 'move') {
          const me = st.players.get(pid);
          if (!me) return;
          if (st.pendingCombat) return;
          const dstCol = Number(msg.col), dstRow = Number(msg.row);
          if (!Number.isInteger(dstCol) || !Number.isInteger(dstRow)) return;
          if (!isCellWalkable(st, dstCol, dstRow, pid)) return;
          const range = MOVE_RANGE_BY_ROLE[me.role] || 4;
          const reach = reachable(st, me.col, me.row, range, pid);
          if (!reach.has(`${dstCol},${dstRow}`)) return;
          me.col = dstCol;
          me.row = dstRow;

          const adj = adjacentEnemyAt(st, dstCol, dstRow);
          if (adj) {
            st.pendingCombat = { attackerPid: pid, enemyId: adj.id };
          } else if (me.role === 'cleric') {
            const ally = adjacentHealableAllyAt(st, dstCol, dstRow);
            if (ally) {
              st.pendingHeal = { healerPid: pid, targetPid: ally.pid };
            } else {
              advanceTurn(st);
            }
          } else {
            advanceTurn(st);
          }
          broadcastStage(st, sess, { type: 'state_update', state: snapshotState(st) });
        }
        break;
      }

      case 'turn_continue': {
        if (role !== 'player' || !sess || !pid) return;
        const stageId = msg.stageId;
        const st = sess.stages.get(stageId);
        if (!st) return;
        const isMyCombat = st.pendingCombat?.attackerPid === pid;
        const isMyHeal   = st.pendingHeal?.healerPid === pid;
        if (!isMyCombat && !isMyHeal) return;
        st.pendingCombat = null;
        st.pendingHeal = null;
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
          return;
        }
        const ep = rs.players.get(msg.playerId);
        if (!ep) {
          console.log(`[player_rejoin] FAIL — player not found: ${msg.playerId} in session ${msg.code}`);
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
        if (sess.dm) send(sess.dm, { type: 'player_location', playerId: pid, location: ep.location });
        break;
      }

      case 'world_map_move': {
        // Party movement: any player triggering a move moves the WHOLE party to that stage
        if (role !== 'player' || !sess || !pid) return;
        const stageId = msg.stageId;
        if (typeof stageId !== 'string') return;
        if (!sess.unlockedStages.has(stageId)) return;
        for (const p of sess.players.values()) {
          p.worldMapStage = stageId;
        }
        broadcastWorldMapState(sess);
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
