import WebSocket from 'ws';
const URL = 'ws://localhost:3000';
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function mk(){ const ws=new WebSocket(URL); ws._m=[]; ws.on('message',d=>{try{ws._m.push(JSON.parse(d))}catch{}}); return ws; }
const open=ws=>new Promise(r=>ws.on('open',r));
const got=async(ws,type,ms=900)=>{const t0=Date.now();while(Date.now()-t0<ms){const m=ws._m.find(x=>x.type===type);if(m)return m;await wait(20);}return null;};
const lastOf=(ws,type)=>{const a=ws._m.filter(x=>x.type===type);return a[a.length-1]||null;};
let pass=0,fail=0; const check=(c,l)=>{if(c){pass++;console.log('  ✓',l)}else{fail++;console.log('  ✗ FAIL:',l)}};

const dm=mk(); await open(dm); dm.send(JSON.stringify({type:'dm_create'}));
const code=(await got(dm,'session_created')).code;
const p1=mk(); await open(p1); p1.send(JSON.stringify({type:'player_join',code,name:'Alice'}));
const j1=await got(p1,'joined');
const p2=mk(); await open(p2); p2.send(JSON.stringify({type:'player_join',code,name:'Bob'}));
const j2=await got(p2,'joined');

const lob=lastOf(p2,'lobby_state');
check(lob?.players?.length===2, 'lobby_state lists both players');

// p1 picks blue
p1._m.length=0;
p1.send(JSON.stringify({type:'char_update',color:'blue'}));
await wait(150);
let ls=lastOf(p1,'lobby_state');
check(ls?.players?.find(p=>p.name==='Alice')?.color==='blue', 'Alice took blue');

// p2 tries blue too -> rejected, keeps its own color
p2._m.length=0;
p2.send(JSON.stringify({type:'char_update',color:'blue'}));
await wait(150);
ls=lastOf(p2,'lobby_state');
const bob=ls?.players?.find(p=>p.name==='Bob');
check(bob && bob.color!=='blue', 'Bob denied blue (kept his own color)');

// p1 switches to mage -> stats reflect mage in stage snapshot
p1.send(JSON.stringify({type:'char_update',role:'mage'}));
await wait(120);
ls=lastOf(p1,'lobby_state');
check(ls?.players?.find(p=>p.name==='Alice')?.role==='mage', 'Alice is now mage in lobby_state');
p1.send(JSON.stringify({type:'enter_stage',stageId:'stage02',hp:12,maxHp:12}));
const su=await got(p1,'state_update');
check(su?.state?.players?.find(p=>p.name==='Alice')?.stats?.int===14, 'Alice mage stats applied (int 14)');

// reconnect replays lobby_state
p2.close(); await wait(120);
const p2b=mk(); await open(p2b);
p2b.send(JSON.stringify({type:'player_rejoin',code,playerId:j2.playerId,location:'character-select'}));
const rls=await got(p2b,'lobby_state');
check(!!rls, 'reconnect replays lobby_state');

// char_update is ignored once a player is in a stage (lobby is over)
p2b._m.length = 0;
p1.send(JSON.stringify({type:'char_update',color:'gold'}));
await wait(150);
const lsAfter = lastOf(p2b,'lobby_state');
check(!lsAfter || lsAfter.players.find(p=>p.name==='Alice')?.color==='blue',
  'char_update ignored after entering a stage (Alice stays blue)');

console.log(`\n${pass} passed, ${fail} failed`);
[dm,p1,p2b].forEach(w=>{try{w.close()}catch{}});
process.exit(fail?1:0);
