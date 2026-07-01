// Tactical-combat integration tests: class-based basic damage, the cooldown
// "ultimate" (stronger attack for damage classes, heal for the Cleric), and the
// enemy-only poison/DoT. Boots its own server on a private port with every d20
// pinned to 20 (DND_FORCE_ROLL) so damage/heal amounts are exact.
import WebSocket from 'ws';
import { spawn } from 'child_process';

const PORT = 3199;
const URL = `ws://localhost:${PORT}`;
const STAGE = 'test-arena';
const J = JSON.stringify;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ck = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + l); };

function mk() { const ws = new WebSocket(URL); ws._m = []; ws.on('message', d => { try { ws._m.push(JSON.parse(d)); } catch {} }); return ws; }
const open = ws => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
const got = async (ws, t, ms = 1500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = ws._m.find(x => x.type === t); if (m) return m; await wait(15); } return null; };
const gotStage = async (ws, ms = 1500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = ws._m.filter(x => x.type === 'state_update' && x.state?.stageId === STAGE).pop(); if (m) return m; await wait(15); } return null; };

// ── boot an isolated, deterministic server ──────────────────────────────────
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

// ── per-test helpers ────────────────────────────────────────────────────────
async function freshPlayer(role) {
  const dm = mk(); await open(dm); dm.send(J({ type: 'dm_create' }));
  const code = (await got(dm, 'session_created')).code;
  const p = mk(); await open(p); p.send(J({ type: 'player_join', code, name: role }));
  const pid = (await got(p, 'joined')).playerId;
  p.send(J({ type: 'char_update', role }));
  await wait(60);
  p._m.length = 0;
  p.send(J({ type: 'enter_stage', stageId: STAGE, hp: 20, maxHp: 20 }));
  await gotStage(p);
  return { dm, p, pid };
}
const myPlayer = (snap, pid) => snap.players.find(x => x.pid === pid);
const dummy = (snap) => snap.enemies.find(e => e.id === 'dummy');

async function rangedAttack(p) { p._m.length = 0; p.send(J({ type: 'action_request', stageId: STAGE, kind: 'ranged_attack', enemyId: 'dummy' })); await got(p, 'state_update'); }
async function attack(p, ult) { p._m.length = 0; p.send(J({ type: 'action_request', stageId: STAGE, kind: 'attack', ...(ult ? { ultimate: true } : {}) })); return await got(p, 'combat_event'); }
async function cont(p) { p._m.length = 0; p.send(J({ type: 'turn_continue', stageId: STAGE })); await wait(150); }
async function passTurn(p) { await rangedAttack(p); await cont(p); }      // burn a turn without dealing damage
async function move(p, c, r) { p._m.length = 0; p.send(J({ type: 'action_request', stageId: STAGE, kind: 'move', col: c, row: r })); await wait(150); }

(async () => {
  if (!(await waitForServer())) { console.error('server did not start'); srv.kill(); process.exit(1); }

  // ── T1: basic damage is class-based (Warrior 4 vs Cleric 2) ───────────────
  console.log('\nT1 — class-based basic damage');
  {
    const { p, pid } = await freshPlayer('warrior');
    await rangedAttack(p);
    const before = dummy((await gotStage(p)).state).hp;
    const ev = await attack(p, false);
    const after = dummy((await gotStage(p)).state).hp;
    ck(ev?.success === true, 'warrior basic attack hits (forced roll 20)');
    ck(before - after === 5, `warrior basic deals 5 = 4 + stat bonus (was ${before} → ${after})`);
  }
  {
    const { p } = await freshPlayer('cleric');
    await rangedAttack(p);
    const before = dummy((await gotStage(p)).state).hp;
    await attack(p, false);
    const after = dummy((await gotStage(p)).state).hp;
    ck(before - after === 2, `cleric basic deals 2 — weakest attacker (was ${before} → ${after})`);
  }

  // ── T2: ultimate > basic, and the cooldown gates it ───────────────────────
  console.log('\nT2 — ultimate damage + cooldown');
  {
    const { p, pid } = await freshPlayer('warrior');
    // turn 1: ultimate ready
    await rangedAttack(p);
    let before = dummy((await gotStage(p)).state).hp;
    let ev = await attack(p, true);
    let snap = (await gotStage(p)).state;
    let after = dummy(snap).hp;
    ck(ev?.ultimate === true, 'ultimate accepted when ready');
    ck(before - after === 9, `ultimate deals 9 > basic 5 (was ${before} → ${after})`);
    ck(myPlayer(snap, pid).ultCD === 3, `ultimate put on cooldown (ultCD=${myPlayer(snap, pid).ultCD})`);

    // next turn: cooldown decremented to 2, ultimate must be refused → basic
    await cont(p);
    await rangedAttack(p);
    before = dummy((await gotStage(p)).state).hp;
    ev = await attack(p, true);
    after = dummy((await gotStage(p)).state).hp;
    ck(ev?.ultimate === false, 'ultimate refused while on cooldown');
    ck(before - after === 5, `falls back to basic 5 while cooling down (was ${before} → ${after})`);

    // burn turns until the cooldown clears, then it works again
    await cont(p);        // ultCD 2 → 1
    await passTurn(p);    // ultCD 1 → 0
    snap = (await gotStage(p)).state;
    ck(myPlayer(snap, pid).ultCD === 0, `cooldown cleared after waiting (ultCD=${myPlayer(snap, pid).ultCD})`);
    await rangedAttack(p);
    before = dummy((await gotStage(p)).state).hp;
    ev = await attack(p, true);
    after = dummy((await gotStage(p)).state).hp;
    ck(ev?.ultimate === true && before - after === 9, 'ultimate ready again once cooldown elapsed');
  }

  // ── T3: enemy poison applies on a hit, ticks, and expires ─────────────────
  console.log('\nT3 — enemy poison (DoT)');
  {
    const { p, pid } = await freshPlayer('warrior');
    // burn a turn so the dummy gets its enemy phase and poisons us
    p._m.length = 0;
    p.send(J({ type: 'action_request', stageId: STAGE, kind: 'ranged_attack', enemyId: 'dummy' }));
    await got(p, 'state_update');
    p._m.length = 0;
    p.send(J({ type: 'turn_continue', stageId: STAGE }));
    const ep = await got(p, 'enemy_phase');
    await wait(120);
    const hit = ep?.actions?.find(a => a.attack);
    ck(!!hit?.attack?.poison, 'enemy applies poison on its hit');
    let snap = (await gotStage(p)).state;
    let me = myPlayer(snap, pid);
    ck(me.poison && me.poison.turns === 2, `poison active, ticked once at turn start (turns=${me.poison?.turns})`);
    const hpAfterFirst = me.hp;
    ck(hpAfterFirst <= 20 - 2, `poison + hit reduced HP (hp=${hpAfterFirst})`);

    // retreat out of reach (dummy moveRange 0) so poison ticks down without refresh
    await move(p, 0, 1);
    me = myPlayer((await gotStage(p)).state, pid);
    ck(me.poison?.turns === 1, `poison ticks down out of reach (turns=${me.poison?.turns})`);
    const hpMid = me.hp;
    ck(hpMid < hpAfterFirst, `poison keeps draining HP (${hpAfterFirst} → ${hpMid})`);

    await move(p, 0, 0);
    me = myPlayer((await gotStage(p)).state, pid);
    ck(me.poison == null, 'poison expires after its duration');
  }

  // ── T4: Cleric heal IS the ultimate — it goes on cooldown and is gated ─────
  console.log('\nT4 — Cleric heal cooldown');
  {
    const { p, pid } = await freshPlayer('cleric');
    await passTurn(p); // get hit + poisoned → wounded
    let snap = (await gotStage(p)).state;
    let me = myPlayer(snap, pid);
    ck(me.hp < me.maxHp, `cleric is wounded before healing (hp=${me.hp}/${me.maxHp})`);

    // heal self
    p._m.length = 0;
    p.send(J({ type: 'action_request', stageId: STAGE, kind: 'ranged_heal', targetPid: pid }));
    await got(p, 'state_update');
    p._m.length = 0;
    p.send(J({ type: 'action_request', stageId: STAGE, kind: 'heal' }));
    const healEv = await got(p, 'heal_event');
    snap = (await gotStage(p)).state;
    me = myPlayer(snap, pid);
    ck(healEv && healEv.restored > 0, `heal restores HP (restored=${healEv?.restored})`);
    ck(me.ultCD === 3, `heal put on cooldown (ultCD=${me.ultCD})`);

    // end the turn (heal left pendingHeal set), take another hit → hp < max, ultCD 3 → 2
    await cont(p);
    snap = (await gotStage(p)).state;
    me = myPlayer(snap, pid);
    const wounded = me.hp < me.maxHp;
    p._m.length = 0;
    p.send(J({ type: 'action_request', stageId: STAGE, kind: 'ranged_heal', targetPid: pid }));
    await wait(200);
    // A refused heal broadcasts nothing — no heal_event, no pendingHeal state.
    const refused = !p._m.some(m => m.type === 'heal_event' || (m.type === 'state_update' && m.state?.pendingHeal));
    ck(wounded && me.ultCD > 0 && refused, `heal refused while on cooldown though still wounded (hp=${me.hp}/${me.maxHp}, ultCD=${me.ultCD})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  srv.kill();
  await wait(100);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
