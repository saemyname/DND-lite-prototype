let _ws = null;
const _handlers = {};

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

export function send(msg) {
  if (_ws?.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

export function on(type, handler) {
  _handlers[type] = handler;
}
