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
