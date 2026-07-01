// Shared tactical-combat UI helpers, imported by every combat stage so the new
// pieces (the cooldown "ultimate" button and the poison/DoT badge) live in one
// place instead of being copy-pasted into each stage's panel code.
//
// Each stage keeps its own combat panel (they have drifted over time); these
// helpers are small and stage-agnostic — the stage injects its `panelEl`/`send`
// and the actor's snapshot entry.

let SKILLS = null;

// Fetch the per-class combat data once (same data the server uses). Safe to
// call repeatedly; resolves to {} if it can't be loaded so callers degrade
// gracefully (no ultimate button rather than a crash).
export async function loadSkills() {
  if (SKILLS) return SKILLS;
  try { SKILLS = await (await fetch('../data/skills.json')).json(); }
  catch { SKILLS = {}; }
  return SKILLS;
}

// Add an "ultimate" button to the combat action row for damage classes
// (Warrior/Rogue/Mage). The Cleric's ultimate is a heal handled by the existing
// heal/choice panels, so no button is added for it here.
//
//  panelEl   – id → element lookup (stage-local)
//  send      – game-socket send()
//  stageId   – e.g. 'stage04'
//  actAsPid  – debugActAs() result (bot pid or undefined)
//  me        – the acting player's snapshot entry ({ role, ultCD })
//
// Renders the ultimate as a skill icon tile. When ready it shows the icon + name
// with a "⟳N" corner badge so players see up front that it's a cooldown skill.
// While cooling down it desaturates and draws a radial sweep (dark wedge that
// shrinks as it recharges) with the remaining turn count in the centre.
export function addUltimateButton({ panelEl, send, stageId, actAsPid, me }) {
  const ult = (SKILLS || {})[me?.role]?.ultimate;
  if (!ult || ult.kind !== 'attack') return;       // cleric heal → not here
  injectCombatUiStyles();
  const total = ult.cooldown || 1;
  const remaining = me.ultCD ?? 0;
  const ready = remaining === 0;

  const tile = document.createElement('div');
  tile.className = 'ult-tile' + (ready ? ' ready' : ' cooling');
  tile.innerHTML =
    `<div class="ult-icon">${ult.icon}</div>` +
    `<div class="ult-name">${ult.name}</div>` +
    (ready
      ? `<div class="ult-cd-badge">⟳${total}</div>`
      : `<div class="ult-radial" style="--frac:${Math.min(1, remaining / total)}"></div>` +
        `<div class="ult-turns">${remaining}</div>`);
  tile.title = ready
    ? `${ult.name}: a stronger attack (${ult.dmg} damage), then a ${total}-turn cooldown`
    : `On cooldown — ready in ${remaining} turn${remaining === 1 ? '' : 's'}`;

  if (ready) {
    tile.addEventListener('click', () => {
      if (tile.classList.contains('used')) return;
      tile.classList.add('used');
      panelEl('d20-hud').classList.add('active');
      panelEl('d20-label').textContent = 'Roll d20';
      const onDice = () => {
        panelEl('d20-hud').removeEventListener('click', onDice);
        send({ type: 'action_request', stageId, kind: 'attack', ultimate: true, actAsPid });
      };
      panelEl('d20-hud').addEventListener('click', onDice);
    });
  }
  panelEl('event-actions').appendChild(tile);
}

// Inject the tile styles once (keeps all combat-ui CSS in the module rather than
// in each stage's <style>).
function injectCombatUiStyles() {
  if (document.getElementById('combat-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'combat-ui-styles';
  s.textContent = `
    .ult-tile { position:relative; width:78px; min-height:78px; box-sizing:border-box;
      display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
      gap:3px; padding:8px 4px; margin:2px; border-radius:11px; border:1px solid rgba(200,169,110,.35);
      background:#241d15; vertical-align:middle; }
    .ult-tile.ready { cursor:pointer; transition:border-color .12s, box-shadow .12s, transform .08s; }
    .ult-tile.ready:hover { border-color:#ffd27a; box-shadow:0 0 12px rgba(255,210,122,.4); transform:translateY(-1px); }
    .ult-tile.ready:active { transform:translateY(0); }
    .ult-tile.used { opacity:.6; cursor:default; }
    .ult-tile .ult-icon { font-size:28px; line-height:1; }
    .ult-tile.cooling .ult-icon { filter:grayscale(1) brightness(.55); }
    .ult-tile .ult-name { font-size:10px; letter-spacing:.2px; color:#e8d9b5; text-align:center; line-height:1.1; }
    .ult-tile.cooling .ult-name { color:#8c8069; }
    .ult-tile .ult-cd-badge { position:absolute; top:3px; right:6px; font-size:9px; color:#c8a96e; opacity:.85; }
    .ult-tile .ult-radial { position:absolute; inset:0; border-radius:11px; pointer-events:none;
      background:conic-gradient(rgba(0,0,0,.62) calc(var(--frac) * 360deg), transparent 0deg); }
    .ult-tile .ult-turns { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      font-size:26px; font-weight:800; color:#fff; text-shadow:0 1px 4px #000; pointer-events:none; }
  `;
  document.head.appendChild(s);
}

// Show/update/remove the poison badge on a player's nametag label. Null-safe:
// pass the player's `poison` ({ damage, turns } or null) from the snapshot.
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
