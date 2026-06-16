// Drop-in WebSocket reconnect for any player-facing page.
// Import this module on any page that a player might be redirected to.
import { connect, send, on, disconnect } from './game-socket.js';

const sessionCode = localStorage.getItem('session-code');
const playerId    = localStorage.getItem('player-id');

let dmOverlay = null;

function createDMOverlay() {
  const div = document.createElement('div');
  div.id = 'dm-disconnect-overlay';
  div.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'background:rgba(0,0,0,.78)', 'display:flex',
    'align-items:center', 'justify-content:center',
    'flex-direction:column', 'gap:20px',
    "font-family:'Georgia',serif", 'color:#c8a96e',
    'pointer-events:all',
  ].join(';');
  div.innerHTML = `
    <div style="font-size:36px;letter-spacing:4px;opacity:0.35">✦</div>
    <div style="font-size:15px;letter-spacing:5px;text-transform:uppercase">DM Disconnected</div>
    <div style="font-size:12px;letter-spacing:3px;opacity:0.45">Please wait...</div>
  `;
  document.body.appendChild(div);
  return div;
}

// Small banner shown while OUR own socket is down and auto-reconnecting.
let reconnectBanner = null;
function showReconnecting() {
  if (!reconnectBanner) {
    reconnectBanner = document.createElement('div');
    reconnectBanner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9998',
      'background:rgba(60,40,20,.92)', 'color:#ffe9a0', 'text-align:center',
      'padding:8px', "font-family:'Georgia',serif", 'font-size:13px',
      'letter-spacing:2px', 'border-bottom:1px solid rgba(200,169,110,.5)',
    ].join(';');
    reconnectBanner.textContent = '⟳ Connection lost — reconnecting…';
    document.body.appendChild(reconnectBanner);
  }
  reconnectBanner.style.display = 'block';
}
function hideReconnecting() {
  if (reconnectBanner) reconnectBanner.style.display = 'none';
}

// Session no longer exists on the server (e.g. server restarted). Stop the
// reconnect loop and tell the player, instead of leaving a frozen screen.
function showSessionEnded() {
  disconnect();
  hideReconnecting();
  const div = document.createElement('div');
  div.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:10000',
    'background:rgba(0,0,0,.85)', 'display:flex',
    'align-items:center', 'justify-content:center',
    'flex-direction:column', 'gap:22px',
    "font-family:'Georgia',serif", 'color:#c8a96e', 'text-align:center',
  ].join(';');
  div.innerHTML = `
    <div style="font-size:36px;letter-spacing:4px;opacity:0.35">✦</div>
    <div style="font-size:16px;letter-spacing:4px;text-transform:uppercase">Session Ended</div>
    <div style="font-size:12px;letter-spacing:2px;opacity:0.5;max-width:320px;line-height:1.7">
      The game session is no longer available.<br>The host may have restarted the server.
    </div>
    <a href="../index.html" style="margin-top:6px;padding:12px 32px;text-decoration:none;
       background:rgba(200,169,110,.12);border:1px solid rgba(200,169,110,.5);border-radius:6px;
       color:#ffe9a0;font-size:14px;letter-spacing:3px;text-transform:uppercase">▶ Back to Start</a>
  `;
  document.body.appendChild(div);
}

if (sessionCode && playerId) {
  const pageName = location.pathname.split('/').pop().replace('.html', '');

  connect(() => {
    send({ type: 'player_rejoin', code: sessionCode, playerId, location: pageName });
    // Self-clear overlays on (re)connect (handles mid-navigation case where
    // dm_reconnected was missed, and our own reconnect after a drop).
    if (dmOverlay) dmOverlay.style.display = 'none';
    hideReconnecting();
  });

  // Our own socket dropped — game-socket is already retrying with backoff.
  on('_disconnect', () => { showReconnecting(); });
  on('_reconnect', () => { hideReconnecting(); });

  on('rejoin_failed', () => { showSessionEnded(); });

  on('player_redirect', (msg) => {
    window.location.href = msg.url;
  });

  on('dm_disconnected', () => {
    if (!dmOverlay) dmOverlay = createDMOverlay();
    dmOverlay.style.display = 'flex';
  });

  on('dm_reconnected', () => {
    if (dmOverlay) dmOverlay.style.display = 'none';
  });
}
