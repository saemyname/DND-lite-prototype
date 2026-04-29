import { send, on } from './game-socket.js';

const COLLAPSED_KEY = 'chat-collapsed';

function injectStyles() {
  if (document.getElementById('chat-panel-styles')) return;
  const style = document.createElement('style');
  style.id = 'chat-panel-styles';
  style.textContent = `
    #chat-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 70;
      width: 380px;
      height: 500px;
      display: flex;
      flex-direction: column;
      background: rgba(0,0,0,.72);
      border: 1px solid rgba(200,169,110,.25);
      border-radius: 6px;
      backdrop-filter: blur(4px);
      font-family: 'Georgia', serif;
      color: #c8a96e;
      transition: height .25s ease;
    }
    #chat-panel.collapsed { height: 36px; }
    #chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      cursor: pointer;
      user-select: none;
      font-size: 13px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(200,169,110,.7);
      border-bottom: 1px solid rgba(200,169,110,.15);
      flex-shrink: 0;
    }
    #chat-panel.collapsed #chat-header { border-bottom: none; }
    #chat-toggle-arrow { font-size: 12px; transition: transform .25s; }
    #chat-panel.collapsed #chat-toggle-arrow { transform: rotate(-90deg); }
    #chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px 14px;
      font-size: 14px;
      line-height: 1.5;
      letter-spacing: .3px;
      min-height: 0;
    }
    #chat-panel.collapsed #chat-messages,
    #chat-panel.collapsed #chat-input-row { display: none; }
    .chat-msg { margin-bottom: 8px; word-wrap: break-word; }
    .chat-msg-from { font-weight: 600; margin-right: 4px; }
    .chat-msg.dm .chat-msg-from { color: #ffe97a; }
    .chat-msg.player .chat-msg-from { color: #88c8ff; }
    .chat-msg-text { color: rgba(200,169,110,.85); }
    #chat-input-row {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid rgba(200,169,110,.15);
      flex-shrink: 0;
    }
    #chat-input {
      flex: 1;
      background: rgba(0,0,0,.4);
      border: 1px solid rgba(200,169,110,.2);
      border-radius: 4px;
      color: #ffe9a0;
      padding: 7px 10px;
      font-family: 'Georgia', serif;
      font-size: 14px;
      outline: none;
    }
    #chat-input:focus { border-color: rgba(200,169,110,.55); }
    #chat-send {
      background: rgba(200,169,110,.15);
      border: 1px solid rgba(200,169,110,.35);
      color: #c8a96e;
      border-radius: 4px;
      padding: 0 14px;
      font-family: 'Georgia', serif;
      font-size: 14px;
      letter-spacing: 1px;
      cursor: pointer;
    }
    #chat-send:hover { background: rgba(200,169,110,.3); color: #ffe9a0; }
  `;
  document.head.appendChild(style);
}

function buildPanel() {
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <div id="chat-header">
      <span>Chat</span>
      <span id="chat-toggle-arrow">▾</span>
    </div>
    <div id="chat-messages"></div>
    <div id="chat-input-row">
      <input id="chat-input" type="text" maxlength="200" placeholder="Say something..." />
      <button id="chat-send">Send</button>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

function appendMessage(panel, msg) {
  const list = panel.querySelector('#chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (msg.role === 'dm' ? 'dm' : 'player');
  const fromSpan = document.createElement('span');
  fromSpan.className = 'chat-msg-from';
  fromSpan.textContent = msg.from + ':';
  const textSpan = document.createElement('span');
  textSpan.className = 'chat-msg-text';
  textSpan.textContent = ' ' + msg.text;
  div.appendChild(fromSpan);
  div.appendChild(textSpan);
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function init() {
  injectStyles();
  const panel = buildPanel();

  if (localStorage.getItem(COLLAPSED_KEY) === '1') {
    panel.classList.add('collapsed');
  }

  panel.querySelector('#chat-header').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    localStorage.setItem(COLLAPSED_KEY, panel.classList.contains('collapsed') ? '1' : '0');
  });

  const input = panel.querySelector('#chat-input');
  const sendBtn = panel.querySelector('#chat-send');
  function submit() {
    const text = input.value.trim();
    if (!text) return;
    send({ type: 'chat_send', text });
    input.value = '';
  }
  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  on('chat_message', (msg) => appendMessage(panel, msg));
  on('chat_history', (msg) => {
    const list = panel.querySelector('#chat-messages');
    list.innerHTML = '';
    (msg.messages || []).forEach(m => appendMessage(panel, m));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
