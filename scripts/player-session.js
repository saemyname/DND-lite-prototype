// Drop-in WebSocket reconnect for any player-facing page.
// Import this module on any page that a player might be redirected to.
import { connect, send, on } from './game-socket.js';

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

if (sessionCode && playerId) {
  const pageName = location.pathname.split('/').pop().replace('.html', '');

  connect(() => {
    send({ type: 'player_rejoin', code: sessionCode, playerId, location: pageName });
    // Self-clear overlay on reconnect (handles mid-navigation case where dm_reconnected was missed)
    if (dmOverlay) dmOverlay.style.display = 'none';
  });

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
