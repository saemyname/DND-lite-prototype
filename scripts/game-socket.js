let _ws = null;
const _handlers = {};
const _sendQueue = [];

export function connect(onOpen) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  _ws = new WebSocket(`${proto}//${location.host}`);

  _ws.addEventListener('open', () => {
    while (_sendQueue.length) _ws.send(_sendQueue.shift());
    onOpen?.();
  });

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

export function send(msg) {
  const data = JSON.stringify(msg);
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(data);
  } else {
    // Queue until connect() opens (or if we've never called connect, queue indefinitely)
    _sendQueue.push(data);
  }
}

export function on(type, handler) {
  _handlers[type] = handler;
}
