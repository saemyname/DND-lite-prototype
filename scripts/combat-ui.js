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
export function addUltimateButton({ panelEl, send, stageId, actAsPid, me }) {
  const ult = (SKILLS || {})[me?.role]?.ultimate;
  if (!ult || ult.kind !== 'attack') return;       // cleric heal → not here
  const ready = (me.ultCD ?? 0) === 0;
  const btn = document.createElement('button');
  btn.className = 'event-btn';
  btn.textContent = ready ? `${ult.icon} ${ult.name}` : `${ult.icon} ${ult.name} · CD ${me.ultCD}`;
  if (!ready) {
    btn.disabled = true;
    btn.style.opacity = '0.45';
    btn.title = `On cooldown — ready in ${me.ultCD} turn(s)`;
  } else {
    btn.title = `${ult.name}: a stronger attack (${ult.dmg} damage), then a ${ult.cooldown}-turn cooldown`;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      panelEl('d20-hud').classList.add('active');
      panelEl('d20-label').textContent = 'Roll d20';
      const onDice = () => {
        panelEl('d20-hud').removeEventListener('click', onDice);
        send({ type: 'action_request', stageId, kind: 'attack', ultimate: true, actAsPid });
      };
      panelEl('d20-hud').addEventListener('click', onDice);
    });
  }
  panelEl('event-actions').appendChild(btn);
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
