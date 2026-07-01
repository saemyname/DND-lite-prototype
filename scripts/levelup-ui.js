// Shared level-up UI (Phase 2 growth), imported by the combat stages.
//
// renderLevelUpPanel — stat-point allocation panel shown inside the victory
// overlay whenever the local player has unspent points. Each player allocates
// their own points ("Later" just leaves them banked — the panel re-offers on
// the next victory, and the HUD chip keeps a reminder visible).
//
// updateLevelChip — small fixed HUD chip ("⭐ Lv 2 · 3 pts") kept in sync from
// the stage's state_update loop.

const STAT_ROWS = [
  ['str', 'STR'], ['agi', 'AGI'], ['int', 'INT'], ['lck', 'LCK'], ['hp', 'HP +2'],
];

export function renderLevelUpPanel({ victoryEl, send, me }) {
  injectLevelUpStyles();
  let panel = victoryEl.querySelector('.lvlup-panel');
  const points = me?.unspentPoints ?? 0;
  if (!me || points <= 0) { if (panel) panel.remove(); return; }
  // Re-render only when the banked total changes (so teammates' allocations
  // broadcasting state_update don't wipe this player's pending +/− clicks).
  if (panel && Number(panel.dataset.points) === points) return;
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.className = 'lvlup-panel';
  panel.dataset.points = points;

  const pending = { str: 0, agi: 0, int: 0, lck: 0, hp: 0 };
  const spent = () => Object.values(pending).reduce((a, b) => a + b, 0);

  const head = document.createElement('div');
  head.className = 'lvlup-head';
  panel.appendChild(head);

  const rows = document.createElement('div');
  rows.className = 'lvlup-rows';
  panel.appendChild(rows);

  const rowEls = {};
  for (const [key, label] of STAT_ROWS) {
    const row = document.createElement('div');
    row.className = 'lvlup-row';
    const base = key === 'hp' ? (me.maxHp ?? 0) : (me.stats?.[key] ?? 10);
    row.innerHTML =
      `<span class="lv-label">${label}</span>` +
      `<span class="lv-val">${base}</span>` +
      `<button class="lv-btn lv-minus">−</button>` +
      `<span class="lv-delta"></span>` +
      `<button class="lv-btn lv-plus">+</button>`;
    rows.appendChild(row);
    rowEls[key] = { row, base };
    row.querySelector('.lv-plus').addEventListener('click', () => { if (spent() < points) { pending[key]++; refresh(); } });
    row.querySelector('.lv-minus').addEventListener('click', () => { if (pending[key] > 0) { pending[key]--; refresh(); } });
  }

  const foot = document.createElement('div');
  foot.className = 'lvlup-foot';
  const confirm = document.createElement('button');
  confirm.className = 'event-btn lv-confirm';
  confirm.textContent = 'Confirm';
  confirm.addEventListener('click', () => {
    if (spent() < 1) return;
    confirm.disabled = true;
    send({ type: 'allocate_stats', alloc: { ...pending } });
    // The server's state_update broadcast re-renders (points changed) or, at 0
    // remaining, removes the panel.
  });
  foot.appendChild(confirm);
  panel.appendChild(foot);

  function refresh() {
    head.textContent = `⭐ Level ${me.level ?? 1} — ${points - spent()} point${points - spent() === 1 ? '' : 's'} to spend`;
    for (const [key] of STAT_ROWS) {
      const d = pending[key];
      const el = rowEls[key].row;
      el.querySelector('.lv-delta').textContent = d > 0 ? `+${key === 'hp' ? d * 2 : d}` : '';
      el.querySelector('.lv-val').textContent = key === 'hp' ? rowEls[key].base + d * 2 : rowEls[key].base + d;
      el.classList.toggle('boosted', d > 0);
      el.querySelector('.lv-minus').disabled = d === 0;
    }
    const allIn = spent() >= points;
    for (const [key] of STAT_ROWS) rowEls[key].row.querySelector('.lv-plus').disabled = allIn;
    confirm.disabled = spent() < 1;
    confirm.textContent = spent() >= 1 ? `Confirm (${spent()})` : 'Confirm';
  }
  refresh();

  // Insert above the overlay's Continue button so the flow reads top-down.
  const continueBtn = victoryEl.querySelector('button');
  victoryEl.insertBefore(panel, continueBtn || null);
}

// "⭐ Lv 2 · 3 pts" chip pinned above the stats panel; the pts part only shows
// while points are banked. Call with the local player's snapshot entry.
export function updateLevelChip(me) {
  injectLevelUpStyles();
  let chip = document.getElementById('level-chip');
  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'level-chip';
    document.body.appendChild(chip);
  }
  const pts = me?.unspentPoints ?? 0;
  chip.textContent = `⭐ Lv ${me?.level ?? 1}` + (pts > 0 ? ` · ${pts} pts` : '');
  chip.classList.toggle('has-points', pts > 0);
}

function injectLevelUpStyles() {
  if (document.getElementById('levelup-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'levelup-ui-styles';
  s.textContent = `
    .lvlup-panel { margin:14px auto 6px; padding:14px 18px; max-width:320px; text-align:left;
      background:rgba(20,16,10,.92); border:1px solid rgba(200,169,110,.4); border-radius:12px; }
    .lvlup-head { font-size:14px; color:#ffd27a; margin-bottom:10px; text-align:center; letter-spacing:.4px; }
    .lvlup-row { display:grid; grid-template-columns:56px 34px 28px 34px 28px; align-items:center;
      gap:6px; padding:3px 0; font-size:13px; color:#e8d9b5; }
    .lvlup-row.boosted .lv-val { color:#9fe89f; font-weight:700; }
    .lv-label { letter-spacing:.5px; font-size:11px; color:#c8a96e; }
    .lv-val { text-align:right; font-variant-numeric:tabular-nums; }
    .lv-delta { text-align:center; color:#9fe89f; font-size:11px; min-width:24px; }
    .lv-btn { width:26px; height:26px; border-radius:8px; border:1px solid rgba(200,169,110,.4);
      background:#241d15; color:#e8d9b5; font-size:15px; line-height:1; cursor:pointer; }
    .lv-btn:hover:not(:disabled) { border-color:#ffd27a; }
    .lv-btn:disabled { opacity:.3; cursor:default; }
    .lvlup-foot { margin-top:10px; text-align:center; }
    .lv-confirm:disabled { opacity:.45; }
    #level-chip { position:fixed; left:16px; bottom:calc(16px + 200px); z-index:40; padding:4px 10px;
      font-size:11px; letter-spacing:.4px; color:#c8a96e; background:rgba(20,16,10,.85);
      border:1px solid rgba(200,169,110,.3); border-radius:9px; pointer-events:none; }
    #level-chip.has-points { color:#ffd27a; border-color:#ffd27a; }
  `;
  document.head.appendChild(s);
}
