import WebSocket from 'ws';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function mk(){ const ws=new WebSocket('ws://localhost:3000'); ws._m=[]; ws.on('message',d=>{try{ws._m.push(JSON.parse(d))}catch{}}); return ws; }
const open=ws=>new Promise(r=>ws.on('open',r));
const got=async(ws,t,ms=1500)=>{const t0=Date.now();while(Date.now()-t0<ms){const m=ws._m.find(x=>x.type===t);if(m)return m;await wait(20);}return null;};
const gotStage=async(ws,sid,ms=1500)=>{const t0=Date.now();while(Date.now()-t0<ms){const m=ws._m.filter(x=>x.type==='state_update'&&x.state&&x.state.stageId===sid).pop();if(m)return m;await wait(20);}return null;};
let pass=0,fail=0;const ck=(c,l)=>{c?pass++:fail++;console.log((c?'  ✓ ':'  ✗ FAIL: ')+l);};
const cheb=(a,b,c,d)=>Math.max(Math.abs(a-c),Math.abs(b-d));

const dm=mk();await open(dm);dm.send(JSON.stringify({type:'dm_create'}));
const code=(await got(dm,'session_created')).code;
const p=mk();await open(p);p.send(JSON.stringify({type:'player_join',code,name:'A'}));
const j=await got(p,'joined');

p.send(JSON.stringify({type:'enter_stage',stageId:'stage04',hp:20,maxHp:20}));
let su=await gotStage(p,'stage04');
ck(!!su, 'entered stage04');
const me0 = su.state.players.find(x=>x.pid===j.playerId);
ck(su.state.activeTurnPid===j.playerId, 'player has the turn');
const enemies0 = su.state.enemies.map(e=>({id:e.id,col:e.col,row:e.row,hp:e.hp}));
// nearest enemy distance before
const myc=me0.col, myr=me0.row;
const near0 = Math.min(...enemies0.map(e=>cheb(e.col,e.row,myc,myr)));

// Move one cell (turn ends with no adjacent enemy -> solo round boundary -> enemy phase)
p._m.length=0;
p.send(JSON.stringify({type:'action_request',stageId:'stage04',kind:'move',col:myc,row:myr+( myr>0?-1:1 )}));
const ep = await got(p,'enemy_phase');
ck(!!ep, 'enemy_phase broadcast after the player turn');
ck(ep && Array.isArray(ep.actions) && ep.actions.length>0, 'enemy_phase has actions');
const moved = ep && ep.actions.some(a=>a.path && a.path.length>0);
ck(moved, 'at least one enemy moved (path length > 0)');

// after enemy phase, nearest enemy should be closer (or an attack landed)
const su2 = await gotStage(p,'stage04');
const me2 = su2.state.players.find(x=>x.pid===j.playerId);
const near2 = Math.min(...su2.state.enemies.filter(e=>e.hp>0).map(e=>cheb(e.col,e.row,me2.col,me2.row)));
ck(near2 <= near0, `enemies advanced (nearest dist ${near0} -> ${near2})`);
const anyAttack = ep && ep.actions.some(a=>a.attack);
console.log(`  · enemy attacks this phase: ${ep ? ep.actions.filter(a=>a.attack).length : 0}; my HP ${me0.hp} -> ${me2.hp}`);

console.log(`\n${pass} passed, ${fail} failed`);
[dm,p].forEach(w=>{try{w.close()}catch{}});process.exit(fail?1:0);
