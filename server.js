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
        sess = { dm: ws, players: new Map(), unlockedStages: new Set(['stage_01']) };
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
        broadcastPlayers(sess, { type: 'dm_reconnected' });
        console.log(`[dm_rejoin] notified ${sess.players.size} players of dm_reconnected`);
        break;
      }

      case 'player_join': {
        sess = sessions.get(msg.code);
        if (!sess)                  { send(ws, { type: 'error', message: 'Invalid code' }); return; }
        if (ws === sess.dm) { send(ws, { type: 'error', message: 'DM cannot join as player' }); return; }
        if (sess.players.size >= 4) { send(ws, { type: 'error', message: 'Session full' });  return; }
        pid  = `p${Date.now()}`;
        role = 'player';
        sess.players.set(pid, { ws, name: msg.name, role: msg.role, location: 'world-map' });
        console.log(`[player_join] session=${msg.code}, pid=${pid}, name=${msg.name}`);
        send(ws, { type: 'joined', playerId: pid, unlockedStages: [...sess.unlockedStages] });
        send(sess.dm, { type: 'player_joined', playerId: pid, name: msg.name, role: msg.role });
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
        if (role !== 'dm' || !sess) return;
        broadcastPlayers(sess, { type: 'fog_reveal', x: msg.x, z: msg.z });
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
        if (sess.dm) send(sess.dm, { type: 'player_location', playerId: pid, location: ep.location });
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
