// Debug bot controls — one-browser 4-player testing.
//
// Usage in a stage scene:
//   import { initDebugBots, debugActAs, isControlledBy, debugBotsAreActive }
//     from '../scripts/debug-bots.js';
//   initDebugBots({ myPid, getServerState: () => serverState });
//   ...
//   send({ type: 'action_request', stageId: 'stage02', kind: 'move',
//          col, row, actAsPid: debugActAs() });
//
// Usage in world-map (no stage state — just the spawn button + status HUD):
//   initDebugBots({ myPid, getServerState: () => null });

import { send, on } from './game-socket.js';

let debugBotsActive = false;
let _myPid = null;
let _getServerState = () => null;
let _btn = null;
let _hud = null;

export function initDebugBots({ myPid, getServerState }) {
  _myPid = myPid;
  _getServerState = getServerState || (() => null);

  _btn = document.createElement('button');
  _btn.textContent = '+3 Bots (debug)';
  _btn.style.cssText =
    'position:fixed;bottom:80px;right:16px;z-index:9999;background:rgba(60,40,20,.9);' +
    'color:#ffe9a0;border:2px solid #c8a96e;padding:8px 14px;' +
    'font-family:Georgia,serif;font-size:13px;cursor:pointer;border-radius:4px;' +
    'letter-spacing:1px;';
  document.body.appendChild(_btn);

  _hud = document.createElement('div');
  _hud.style.cssText =
    'position:fixed;bottom:80px;right:16px;z-index:9999;background:rgba(60,40,20,.9);' +
    'color:#88c8ff;border:2px solid rgba(136,200,255,.6);padding:8px 14px;' +
    'font-family:Georgia,serif;font-size:13px;border-radius:4px;display:none;' +
    'letter-spacing:1px;';
  document.body.appendChild(_hud);

  _btn.addEventListener('click', () => {
    console.log('[debug-bots] +3 Bots clicked, sending debug_spawn_bots');
    send({ type: 'debug_spawn_bots' });
  });
  on('bots_spawned', (msg) => {
    console.log('[debug-bots] bots_spawned received:', msg);
    activateBots();
  });

  // Auto-detect existing bots in the session after a page nav — check both
  // stage state (inside stages) and world-map state (between stages).
  const sniffPlayers = (players) => {
    if (!Array.isArray(players)) return;
    if (players.some(p => typeof p.pid === 'string' && p.pid.startsWith('bot_'))) {
      activateBots();
    }
  };
  on('state_update', (msg) => sniffPlayers(msg?.state?.players));
  on('world_map_state', (msg) => sniffPlayers(msg?.players));

  setInterval(refreshHud, 250);
}

function activateBots() {
  debugBotsActive = true;
  if (_btn) _btn.style.display = 'none';
  if (_hud) _hud.style.display = 'block';
  refreshHud();
}

function refreshHud() {
  if (!debugBotsActive || !_hud) return;
  const state = _getServerState();
  if (!state) {
    _hud.textContent = '🤖 Bots in session — they follow your party';
    return;
  }
  const turnPid = state.activeTurnPid;
  if (!turnPid) {
    _hud.textContent = '🤖 Bots active';
  } else if (turnPid === _myPid) {
    _hud.textContent = '🤖 Bots active — your turn';
  } else {
    const p = (state.players || []).find(pp => pp.pid === turnPid);
    _hud.textContent = `🤖 Controlling: ${p?.name || '?'}`;
  }
}

// Returns the pid to act as (a bot's pid) if bots are active and the current
// active turn is not the local player; otherwise undefined (act as self).
export function debugActAs() {
  if (!debugBotsActive) return undefined;
  const state = _getServerState();
  const t = state?.activeTurnPid;
  return (t && t !== _myPid) ? t : undefined;
}

// True if this client should drive UI for the given pid — own pid always,
// any active-turn pid when in bot debug mode.
export function isControlledBy(pid) {
  if (pid === _myPid) return true;
  if (debugBotsActive && pid === _getServerState()?.activeTurnPid) return true;
  return false;
}

export function debugBotsAreActive() {
  return debugBotsActive;
}
