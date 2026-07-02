// Chapter-2 integration tests (Phase 3): shaman heal behavior, boss enrage
// (harder hits + starts chasing), and the stage06 → stage_07 progression hook.
// Isolated server, every d20 pinned to 20.
import WebSocket from 'ws';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const PORT = 3197;
const URL = `ws://localhost:${PORT}`;
const STAGE = 'test-shadow';
const J = JSON.stringify;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ck = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + l); };

function mk() { const ws = new WebSocket(URL); ws._m = []; ws.on('message', d => { try { ws._m.push(JSON.parse(d)); } catch {} }); return ws; }
const open = ws => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
const got = async (ws, t, ms = 1500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = ws._m.find(x => x.type === t); if (m) return m; await wait(15); } return null; };
const gotStage = async (ws, sid, ms = 1500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = ws._m.filter(x => x.type === 'state_update' && x.state?.stageId === sid).pop(); if (m) return m; await wait(15); } return null; };

const srv = spawn('node', ['server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), DND_FORCE_ROLL: '20' },
  stdio: 'ignore',
});
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { const w = new WebSocket(URL); await new Promise((res, rej) => { w.on('open', res); w.on('error', rej); }); w.close(); return true; }
    catch { await wait(100); }
  }
  return false;
}

(async () => {
  if (!(await waitForServer())) { console.error('server did not start'); srv.kill(); process.exit(1); }

  console.log('\nT0 — progression chain (NEXT_STAGE data)');
  {
    const src = readFileSync('server.js', 'utf8');
    for (const [a, b] of [['stage06', 'stage_07'], ['stage07', 'stage_08'], ['stage08', 'stage_09']]) {
      ck(new RegExp(`${a}:\\s*'${b}'`).test(src), `${a} → ${b}`);
    }
  }

  // Session: warrior in the shadow test court.
  const dm = mk(); await open(dm); dm.send(J({ type: 'dm_create' }));
  const code = (await got(dm, 'session_created')).code;
  const p = mk(); await open(p); p.send(J({ type: 'player_join', code, name: 'W' }));
  const pid = (await got(p, 'joined')).playerId;
  await wait(50);
  p._m.length = 0;
  p.send(J({ type: 'enter_stage', stageId: STAGE }));
  await gotStage(p, STAGE);

  const enemy = (snap, id) => snap.enemies.find(e => e.id === id);
  const move = async (c, r) => { p._m.length = 0; p.send(J({ type: 'action_request', stageId: STAGE, kind: 'move', col: c, row: r })); await wait(200); };
  const strike = async (id, ult) => {
    p._m.length = 0;
    p.send(J({ type: 'action_request', stageId: STAGE, kind: 'ranged_attack', enemyId: id }));
    await got(p, 'state_update');
    p._m.length = 0;
    p.send(J({ type: 'action_request', stageId: STAGE, kind: 'attack', ...(ult ? { ultimate: true } : {}) }));
    await got(p, 'combat_event');
    p._m.length = 0;
    p.send(J({ type: 'turn_continue', stageId: STAGE }));      // ends turn → enemy phase
    const ep = await got(p, 'enemy_phase');
    await wait(150);
    return ep;
  };

  console.log('\nT1 — shaman heals its wounded ally instead of acting');
  {
    await move(4, 1); // adjacent to the brute (5,1), out of the boss's reach
    const ep = await strike('brute', false); // brute 10 → 5, then the phase runs
    const heal = ep?.actions?.find(a => a.heal);
    ck(!!heal, 'enemy phase contains a heal action');
    ck(heal?.enemyId === 'shaman' && heal?.heal?.targetId === 'brute', `shaman → brute (got ${heal?.enemyId} → ${heal?.heal?.targetId})`);
    const snap = (await gotStage(p, STAGE)).state;
    ck(enemy(snap, 'brute').hp === 9, `brute mended 5 → 9 (+4) (got ${enemy(snap, 'brute').hp})`);
    const sh = enemy(snap, 'shaman');
    ck(sh.col === 6 && sh.row === 2, 'shaman did not move while healing');
  }

  console.log('\nT2 — boss enrages below half HP');
  {
    await move(2, 1); // adjacent to the boss (1,1)
    let ep = await strike('boss', true);  // ultimate 9 → boss 15 (> 12: no enrage yet)
    ck(!ep?.actions?.some(a => a.enrage), 'no enrage above the threshold');
    ep = await strike('boss', false);     // basic 5 → boss 10 (≤ 12: enrage)
    const enr = ep?.actions?.find(a => a.enrage);
    ck(enr?.enemyId === 'boss', 'enrage action fires once below half');
    const snap = (await gotStage(p, STAGE)).state;
    ck(enemy(snap, 'boss').atk === 5, `boss atk 2 → 5 (got ${enemy(snap, 'boss').atk})`);

    // retreat out of everyone's reach: the enraged boss now chases (moveRange 0 → 2)
    await move(3, 0);
    const ep2 = await got(p, 'enemy_phase');
    const bossAct = ep2?.actions?.find(a => a.enemyId === 'boss');
    ck((bossAct?.path?.length || 0) > 0, `enraged boss chases (path length ${bossAct?.path?.length || 0})`);
  }

  console.log('\nT3 — clearing stage06 unlocks stage_07 (chapter-2 hook)');
  {
    const dm2 = mk(); await open(dm2); dm2.send(J({ type: 'dm_create' }));
    const code2 = (await got(dm2, 'session_created')).code;
    const q = mk(); await open(q); q.send(J({ type: 'player_join', code: code2, name: 'Q' }));
    await got(q, 'joined');
    q._m.length = 0;
    q.send(J({ type: 'enter_stage', stageId: 'stage06' }));
    await gotStage(q, 'stage06');
    const qmove = async (c, r) => { q._m.length = 0; q.send(J({ type: 'action_request', stageId: 'stage06', kind: 'move', col: c, row: r })); await wait(200); };
    await qmove(2, 2);  // spawn (2,5) → 3 tiles up the corridor
    await qmove(2, 1);  // adjacent to free_lyra (2,0) → challenge opens
    q._m.length = 0;
    q.send(J({ type: 'action_request', stageId: 'stage06', kind: 'attempt' })); // d20=20 ≥ dc12
    await got(q, 'skill_check_event');
    const unlock = await got(q, 'stage_unlock', 2000);
    ck(unlock?.stageKey === 'stage_07', `stage06 victory unlocks stage_07 (got ${unlock?.stageKey})`);
    const snap = (await gotStage(q, 'stage06')).state;
    ck(snap.outcome === 'victory', 'stage06 outcome is victory');
    [dm2, q].forEach(w => { try { w.close(); } catch {} });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  srv.kill();
  await wait(100);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
