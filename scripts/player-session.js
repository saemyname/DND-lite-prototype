// Drop-in WebSocket reconnect for any player-facing page.
// Import this module on any page that a player might be redirected to.
import { connect, send, on } from './game-socket.js';

const sessionCode = localStorage.getItem('session-code');
const playerId    = localStorage.getItem('player-id');

if (sessionCode && playerId) {
  const pageName = location.pathname.split('/').pop().replace('.html', '');

  connect(() => {
    send({ type: 'player_rejoin', code: sessionCode, playerId, location: pageName });
  });

  on('player_redirect', (msg) => {
    window.location.href = msg.url;
  });
}
