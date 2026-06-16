let _ws = null;
const _handlers = {};
const _sendQueue = [];
let _onOpen = null;
let _shouldReconnect = false;
let _reconnectAttempts = 0;
let _reconnectTimer = null;

const MAX_BACKOFF_MS = 15000;

export function connect(onOpen) {
  // Remember the handshake so reconnects can replay it (rejoin, status, etc.)
  if (onOpen) _onOpen = onOpen;
  _shouldReconnect = true;
  _open();
}

function _open() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  _ws = new WebSocket(`${proto}//${location.host}`);

  _ws.addEventListener('open', () => {
    const wasReconnect = _reconnectAttempts > 0;
    _reconnectAttempts = 0;
    // Run onOpen FIRST so the rejoin handshake goes out before any queued
    // messages (otherwise stage scenes that queue enter_stage before connect()
    // is called by player-session.js race ahead of the rejoin and get rejected).
    _onOpen?.();
    while (_sendQueue.length) _ws.send(_sendQueue.shift());
    if (wasReconnect) _handlers['_reconnect']?.();
  });

  _ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    _handlers[msg.type]?.(msg);
  });

  _ws.addEventListener('close', () => {
    console.warn('[game-socket] disconnected');
    _handlers['_disconnect']?.();
    if (_shouldReconnect) _scheduleReconnect();
  });

  // A socket error is always followed by a close; let close drive the reconnect.
  _ws.addEventListener('error', () => { try { _ws.close(); } catch {} });
}

function _scheduleReconnect() {
  if (_reconnectTimer) return; // a reconnect is already pending
  const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** _reconnectAttempts);
  _reconnectAttempts++;
  console.warn(`[game-socket] reconnecting in ${delay}ms (attempt ${_reconnectAttempts})`);
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _open();
  }, delay);
}

// Intentional teardown — stops the auto-reconnect loop (e.g. session ended).
export function disconnect() {
  _shouldReconnect = false;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  try { _ws?.close(); } catch {}
}

export function send(msg) {
  const data = JSON.stringify(msg);
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(data);
  } else {
    // Queue until (re)connect opens; server validates everything, so flushing
    // any actions queued while offline is safe (stale ones get rejected).
    _sendQueue.push(data);
  }
}

export function on(type, handler) {
  _handlers[type] = handler;
}
