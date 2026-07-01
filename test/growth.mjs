// Character-growth integration tests (Phase 2): party-wide level-up on victory,
// individual stat allocation, validation, persistence across stages, damage
// growth from the attack stat, enemy scaling with party level, and no grant on
// enemy-less stages. Runs an isolated server with every d20 pinned to 20.
import WebSocket from 'ws';
import { spawn } from 'child_process';

const PORT = 3198;
const URL = `ws://localhost:${PORT}`;
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

  // Session: A = warrior (acts), B = cleric (idle — must still level up).
  const dm = mk(); await open(dm); dm.send(J({ type: 'dm_create' }));
  const code = (await got(dm, 'session_created')).code;
  const A = mk(); await open(A); A.send(J({ type: 'player_join', code, name: 'A' }));
  const aPid = (await got(A, 'joined')).playerId;
  const B = mk(); await open(B); B.send(J({ type: 'player_join', code, name: 'B' }));
  const bPid = (await got(B, 'joined')).playerId;
  B.send(J({ type: 'char_update', role: 'cleric' }));
  await wait(80);

  const me = (snap, pid) => snap.players.find(p => p.pid === pid);
  const enemy = (snap, id) => snap.enemies.find(e => e.id === id);
  const enter = async (ws, sid) => { ws._m.length = 0; ws.send(J({ type: 'enter_stage', stageId: sid })); return (await gotStage(ws, sid)).state; };
  const killSlime = async () => {
    A._m.length = 0;
    A.send(J({ type: 'action_request', stageId: 'test-growth', kind: 'ranged_attack', enemyId: 'slime' }));
    await got(A, 'state_update');
    A._m.length = 0;
    A.send(J({ type: 'action_request', stageId: 'test-growth', kind: 'attack' }));
    await got(A, 'combat_event');
    return (await gotStage(A, 'test-growth')).state;
  };

  console.log('\nT1 — party-wide grant on victory');
  {
    let snap = await enter(A, 'test-growth');
    await enter(B, 'test-growth');
    ck(me(snap, aPid).level === 1 && me(snap, aPid).unspentPoints === 0, 'starts at level 1 with 0 points');
    ck(enemy(snap, 'slime').hp === 4, 'level-1 party: enemy unscaled (hp 4)');
    snap = await killSlime();
    ck(snap.outcome === 'victory', 'one basic hit (4+1 dmg) kills the hp-4 slime → victory');
    ck(me(snap, aPid).level === 2 && me(snap, aPid).unspentPoints === 3, `attacker leveled (lv ${me(snap, aPid).level}, pts ${me(snap, aPid).unspentPoints})`);
    ck(me(snap, bPid)?.level === 2 && me(snap, bPid)?.unspentPoints === 3, 'idle cleric leveled too (kill-agnostic)');
  }

  console.log('\nT2 — allocation applies to stats / HP');
  {
    A._m.length = 0;
    A.send(J({ type: 'allocate_stats', alloc: { str: 2, hp: 1 } }));
    const r = await got(A, 'stats_allocated');
    ck(!!r, 'stats_allocated received');
    ck(r?.stats?.str === 16, `STR 14 → 16 (got ${r?.stats?.str})`);
    ck(r?.maxHp === 22 && r?.hp === 22, `maxHp/hp 20 → 22 (got ${r?.maxHp}/${r?.hp})`);
    ck(r?.unspentPoints === 0, 'all 3 points spent');
  }

  console.log('\nT3 — validation rejects bad allocations');
  {
    for (const [alloc, why] of [
      [{ str: 4 }, 'over-spend'],
      [{ str: -1, hp: 2 }, 'negative'],
      [{ str: 1.5, agi: 1 }, 'non-integer'],
    ]) {
      B._m.length = 0;
      B.send(J({ type: 'allocate_stats', alloc }));
      await wait(200);
      ck(!B._m.some(m => m.type === 'stats_allocated'), `${why} rejected`);
    }
    B._m.length = 0;
    B.send(J({ type: 'allocate_stats', alloc: { int: 3 } }));
    const r = await got(B, 'stats_allocated');
    ck(r?.stats?.int === 15 && r?.unspentPoints === 0, `valid allocation still works (INT 12 → ${r?.stats?.int})`);
  }

  console.log('\nT4 — persistence + enemy scaling on re-entry');
  {
    const snap = await enter(A, 'test-growth'); // outcome was set → stage rebuilds at party level 2
    ck(me(snap, aPid).stats.str === 16 && me(snap, aPid).maxHp === 22, 'allocated stats/maxHp persist into the next stage');
    ck(enemy(snap, 'slime').hp === 5, `level-2 party: slime hp 4 → ${enemy(snap, 'slime').hp} (×1.15)`);
    const after = await killSlime();
    ck(after.outcome === 'victory', 'scaled slime still dies to one 5-dmg hit → victory 2');
    ck(me(after, aPid).level === 3 && me(after, aPid).unspentPoints === 3, 'second level-up banked');
    A._m.length = 0;
    A.send(J({ type: 'allocate_stats', alloc: { str: 2, lck: 1 } }));
    const r = await got(A, 'stats_allocated');
    ck(r?.stats?.str === 18, `STR 16 → 18 (got ${r?.stats?.str})`);
  }

  console.log('\nT5 — damage grows with the attack stat');
  {
    const snap = await enter(A, 'test-arena');   // Phase-1 dummy, hp 100 base
    const d0 = enemy(snap, 'dummy');
    ck(d0.hp === 130, `level-3 party: dummy hp 100 → ${d0.hp} (×1.30)`);
    ck(d0.atk === 3, `dummy atk 2 → ${d0.atk} (+1 per 2 levels)`);
    A._m.length = 0;
    A.send(J({ type: 'action_request', stageId: 'test-arena', kind: 'ranged_attack', enemyId: 'dummy' }));
    await got(A, 'state_update');
    A._m.length = 0;
    A.send(J({ type: 'action_request', stageId: 'test-arena', kind: 'attack' }));
    await got(A, 'combat_event');
    const after = (await gotStage(A, 'test-arena')).state;
    ck(d0.hp - enemy(after, 'dummy').hp === 6, `STR 18 basic deals 6 (4 + floor(4/2)) — was 5 at base STR (dealt ${d0.hp - enemy(after, 'dummy').hp})`);
  }

  console.log('\nT6 — enemy-less stage grants nothing');
  {
    await enter(A, 'test-empty');
    A._m.length = 0;
    A.send(J({ type: 'action_request', stageId: 'test-empty', kind: 'move', col: 0, row: 0 })); // adjacent to the shrine
    await wait(150);
    A._m.length = 0;
    A.send(J({ type: 'action_request', stageId: 'test-empty', kind: 'attempt' }));
    await got(A, 'skill_check_event');
    const snap = (await gotStage(A, 'test-empty')).state;
    ck(snap.outcome === 'victory', 'challenge-only stage clears');
    ck(me(snap, aPid).level === 3 && me(snap, aPid).unspentPoints === 0, `no level/points from an enemy-less stage (lv ${me(snap, aPid).level}, pts ${me(snap, aPid).unspentPoints})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  srv.kill();
  await wait(100);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
