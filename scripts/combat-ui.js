// Shared tactical-combat UI, imported by every combat stage so the action panel
// (basic attack + the cooldown "ultimate") and the poison/DoT badge live in one
// place instead of being copy-pasted into each stage's panel code.
//
// The stages keep their own combat panel shell; this renders the action row so
// the buttons look consistent — both actions are skill icon tiles of the same
// size, and the ultimate shows a radial cooldown.

let SKILLS = null;

// Fetch the per-class combat data once (same data the server uses). Resolves to
// {} if it can't load so callers degrade gracefully.
export async function loadSkills() {
  if (SKILLS) return SKILLS;
  try { SKILLS = await (await fetch('../data/skills.json')).json(); }
  catch { SKILLS = {}; }
  return SKILLS;
}

// Render the combat action row into #event-actions.
//  panelEl    – id → element lookup (stage-local)
//  send       – game-socket send()
//  stageId    – e.g. 'stage04'
//  actAsPid   – debugActAs() result (bot pid or undefined)
//  isAttacker – whether the local client controls the acting player
//  me         – the acting player's snapshot entry ({ role, ultCD }) — may be undefined
export function renderCombatActions({ panelEl, send, stageId, actAsPid, isAttacker, me }) {
  injectCombatUiStyles();
  const actions = panelEl('event-actions');
  if (!isAttacker) {
    const note = document.createElement('div');
    note.className = 'combat-watch';
    note.textContent = 'Watching…';
    actions.appendChild(note);
    return;
  }

  // Basic attack — always available.
  const atk = actionTile('⚔️', 'Attack');
  atk.classList.add('ready');
  atk.title = 'A basic attack';
  wireDiceActivate(atk, { panelEl, send, stageId, actAsPid, ultimate: false });
  actions.appendChild(atk);

  // Ultimate — damage classes only (the Cleric's ultimate is the heal panel).
  const ult = (SKILLS || {})[me?.role]?.ultimate;
  if (ult && ult.kind === 'attack') {
    const total = ult.cooldown || 1;
    const remaining = me.ultCD ?? 0;
    const ready = remaining === 0;
    const tile = actionTile(ult.icon, ult.name);
    tile.classList.add(ready ? 'ready' : 'cooling');
    if (ready) {
      const badge = document.createElement('div');
      badge.className = 'ct-cd-badge';
      badge.textContent = `⟳${total}`;                       // shows it's a cooldown skill up front
      tile.appendChild(badge);
      tile.title = `${ult.name}: a stronger attack (${ult.dmg} damage), then a ${total}-turn cooldown`;
      wireDiceActivate(tile, { panelEl, send, stageId, actAsPid, ultimate: true });
    } else {
      const radial = document.createElement('div');
      radial.className = 'ct-radial';
      radial.style.setProperty('--frac', Math.min(1, remaining / total)); // dark wedge shrinks as it recharges
      const turns = document.createElement('div');
      turns.className = 'ct-turns';
      turns.textContent = remaining;
      tile.appendChild(radial);
      tile.appendChild(turns);
      tile.title = `On cooldown — ready in ${remaining} turn${remaining === 1 ? '' : 's'}`;
    }
    actions.appendChild(tile);
  }
}

function actionTile(icon, name) {
  const t = document.createElement('div');
  t.className = 'combat-tile';
  t.innerHTML = `<div class="ct-icon">${icon}</div><div class="ct-name">${name}</div>`;
  return t;
}

// Clicking a ready tile activates the d20 HUD; clicking the die sends the action.
function wireDiceActivate(tile, { panelEl, send, stageId, actAsPid, ultimate }) {
  tile.addEventListener('click', () => {
    if (tile.classList.contains('used')) return;
    tile.classList.add('used');
    panelEl('d20-hud').classList.add('active');
    panelEl('d20-label').textContent = 'Roll d20';
    const onDice = () => {
      panelEl('d20-hud').removeEventListener('click', onDice);
      send({ type: 'action_request', stageId, kind: 'attack', ...(ultimate ? { ultimate: true } : {}), actAsPid });
    };
    panelEl('d20-hud').addEventListener('click', onDice);
  });
}

// Show/update/remove the poison badge on a player's nametag label. Null-safe.
export function updatePoisonBadge(labelEl, poison) {
  if (!labelEl) return;
  let badge = labelEl.querySelector('.poison-badge');
  if (poison && poison.turns > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'poison-badge';
      badge.style.cssText = 'margin-left:4px;font-size:11px;vertical-align:middle;';
      labelEl.appendChild(badge);
    }
    badge.textContent = `🟢${poison.turns}`;
    badge.title = `Poisoned: ${poison.damage} HP/turn, ${poison.turns} turn(s) left`;
  } else if (badge) {
    badge.remove();
  }
}

// Inject the tile styles once (keeps all combat-ui CSS in the module).
function injectCombatUiStyles() {
  if (document.getElementById('combat-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'combat-ui-styles';
  s.textContent = `
    #event-actions { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-start; }
    .combat-tile { position:relative; width:82px; min-height:82px; box-sizing:border-box;
      display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
      gap:4px; padding:8px 4px; border-radius:12px; border:1px solid rgba(200,169,110,.35);
      background:#241d15; }
    .combat-tile.ready { cursor:pointer; transition:border-color .12s, box-shadow .12s, transform .08s; }
    .combat-tile.ready:hover { border-color:#ffd27a; box-shadow:0 0 12px rgba(255,210,122,.4); transform:translateY(-1px); }
    .combat-tile.ready:active { transform:translateY(0); }
    .combat-tile.used { opacity:.6; cursor:default; }
    .combat-tile .ct-icon { font-size:30px; line-height:1; }
    .combat-tile.cooling .ct-icon { filter:grayscale(1) brightness(.55); }
    .combat-tile .ct-name { font-size:11px; letter-spacing:.2px; color:#e8d9b5; text-align:center; line-height:1.1; }
    .combat-tile.cooling .ct-name { color:#8c8069; }
    .combat-tile .ct-cd-badge { position:absolute; top:3px; right:6px; font-size:9px; color:#c8a96e; opacity:.85; }
    .combat-tile .ct-radial { position:absolute; inset:0; border-radius:12px; pointer-events:none;
      background:conic-gradient(rgba(0,0,0,.62) calc(var(--frac) * 360deg), transparent 0deg); }
    .combat-tile .ct-turns { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font-size:28px; font-weight:800; color:#fff; text-shadow:0 1px 4px #000; pointer-events:none; }
    .combat-watch { font-size:11px; opacity:.5; }
  `;
  document.head.appendChild(s);
}
