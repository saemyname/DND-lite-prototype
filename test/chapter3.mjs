// Chapter-3 integration tests: lava hazard tick (players burn at turn start,
// enemies immune), boss eruption cadence, and the 09→10→11→12 progression
// chain. Isolated server, d20 pinned to 20.
import WebSocket from 'ws';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const PORT = 3195;
const URL = `ws://localhost:${PORT}`;
const STAGE = 'test-volcano';
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
    for (const [a, b] of [['stage09', 'stage_10'], ['stage10', 'stage_11'], ['stage11', 'stage_12']]) {
      ck(new RegExp(`${a}:\\s*'${b}'`).test(src), `${a} → ${b}`);
    }
    ck(!/stage12:\s*'/.test(src), 'stage12 terminates the chain');
  }

  const dm = mk(); await open(dm); dm.send(J({ type: 'dm_create' }));
  const code = (await got(dm, 'session_created')).code;
  const p = mk(); await open(p); p.send(J({ type: 'player_join', code, name: 'V' }));
  const pid = (await got(p, 'joined')).playerId;
  await wait(50);
  p._m.length = 0;
  p.send(J({ type: 'enter_stage', stageId: STAGE }));
  await gotStage(p, STAGE);

  const me = (snap) => snap.players.find(x => x.pid === pid);
  const drake = (snap) => snap.enemies.find(e => e.id === 'drake');
  const move = async (c, r) => {
    p._m.length = 0;
    p.send(J({ type: 'action_request', stageId: STAGE, kind: 'move', col: c, row: r }));
    const ep = await got(p, 'enemy_phase');
    await wait(150);
    return ep;
  };

  console.log('\nT1 — lava hazard burns players at turn start; enemies immune');
  {
    const ep1 = await move(2, 1);           // end the turn standing on lava
    ck(!ep1?.actions?.some(a => a.eruption), 'no eruption on the first phase (every 2)');
    const tick = await got(p, 'poison_tick');
    const hz = tick?.ticks?.find(t => t.hazard);
    ck(hz?.pid === pid && hz?.dmg === 3, `hazard tick -3 at turn start (got ${JSON.stringify(hz)})`);
    let snap = (await gotStage(p, STAGE)).state;
    ck(me(snap).hp === 17, `player 20 → 17 on lava (got ${me(snap).hp})`);
    ck(drake(snap).hp === 30, 'drake standing on lava is unharmed (immune)');
  }

  console.log('\nT2 — eruption fires every 2nd enemy phase, hits all players');
  {
    const ep2 = await move(4, 1);           // step off the lava; phase #2 erupts
    const er = ep2?.actions?.find(a => a.eruption);
    ck(er?.enemyId === 'drake' && er?.dmg === 2, `eruption action on phase 2 (got ${JSON.stringify(er)})`);
    let snap = (await gotStage(p, STAGE)).state;
    ck(me(snap).hp === 15, `eruption -2, no hazard tick off-lava (17 → ${me(snap).hp})`);
    const ep3 = await move(5, 1);           // phase #3: no eruption
    ck(!ep3?.actions?.some(a => a.eruption), 'no eruption on phase 3');
    snap = (await gotStage(p, STAGE)).state;
    ck(me(snap).hp === 15, `hp unchanged on a quiet phase (got ${me(snap).hp})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  srv.kill();
  await wait(100);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
