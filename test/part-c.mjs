import WebSocket from 'ws';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function mk(){ const ws=new WebSocket('ws://localhost:3000'); ws._m=[]; ws.on('message',d=>{try{ws._m.push(JSON.parse(d))}catch{}}); return ws; }
const open=ws=>new Promise(r=>ws.on('open',r));
const got=async(ws,t,ms=1200)=>{const t0=Date.now();while(Date.now()-t0<ms){const m=ws._m.find(x=>x.type===t);if(m)return m;await wait(20);}return null;};
// A player_rejoin first broadcasts the player's *current* stage, then enter_stage
// switches stages — so wait for the state_update that actually matches the stage we entered.
const gotStage=async(ws,stageId,ms=1500)=>{const t0=Date.now();while(Date.now()-t0<ms){const m=ws._m.filter(x=>x.type==='state_update'&&x.state&&x.state.stageId===stageId).pop();if(m)return m;await wait(20);}return null;};
let pass=0,fail=0;const ck=(c,l)=>{c?pass++:fail++;console.log((c?'  ✓ ':'  ✗ FAIL: ')+l);};

const dm=mk();await open(dm);dm.send(JSON.stringify({type:'dm_create'}));
const code=(await got(dm,'session_created')).code;
const p=mk();await open(p);p.send(JSON.stringify({type:'player_join',code,name:'A'}));
const j=await got(p,'joined');

// stage02 is a voxel combat stage now: has goblins
p.send(JSON.stringify({type:'enter_stage',stageId:'stage02',hp:20,maxHp:20}));
let su=await gotStage(p,'stage02');
ck(su && su.state.enemies.length===3 && su.state.enemies.some(e=>e.id==='goblin3'),'stage02 is combat: 3 goblins');

// stage05 has no lyra_cage challenge anymore (only optional lifewater)
const p5=mk();await open(p5);p5.send(JSON.stringify({type:'player_rejoin',code,playerId:j.playerId,location:'stage05'}));await got(p5,'player_rejoined');
p5.send(JSON.stringify({type:'enter_stage',stageId:'stage05',hp:20,maxHp:20}));
su=await gotStage(p5,'stage05');
ck(su && su.state.enemies.length>0 && !su.state.challenges.some(c=>c.id==='lyra_cage'),'stage05: boss fight, lyra_cage removed');

// stage06 is non-combat with the free_lyra challenge
const p6=mk();await open(p6);p6.send(JSON.stringify({type:'player_rejoin',code,playerId:j.playerId,location:'stage06'}));await got(p6,'player_rejoined');
p6.send(JSON.stringify({type:'enter_stage',stageId:'stage06',hp:20,maxHp:20}));
su=await gotStage(p6,'stage06');
ck(su && su.state.enemies.length===0,'stage06: no enemies (non-combat)');
ck(su && su.state.challenges.some(c=>c.id==='free_lyra'),'stage06: free_lyra challenge present');

console.log(`\n${pass} passed, ${fail} failed`);
[dm,p,p5,p6].forEach(w=>{try{w.close()}catch{}});process.exit(fail?1:0);
