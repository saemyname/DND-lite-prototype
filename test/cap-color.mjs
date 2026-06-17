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

const ps=[];
for (let i=0;i<5;i++){ const p=mk(); await open(p); p.send(JSON.stringify({type:'player_join',code,name:'P'+i})); ps.push(p); }
const joins = await Promise.all(ps.map(p=>got(p,'joined')));
check(joins.every(j=>j&&j.playerId), 'all 5 players joined (cap raised to 5)');
check(joins.every(j=>j.color), '"joined" returns an assigned color');
check(joins.every(j=>j.color==='red'), 'all join with the red default (duplicates allowed; recolor in lobby)');

const p6=mk(); await open(p6); p6.send(JSON.stringify({type:'player_join',code,name:'P6'}));
const err=await got(p6,'error');
check(err?.message==='Session full', '6th player rejected: Session full');

const wms=lastOf(dm,'world_map_state');
check(wms?.players?.every(p=>p.color), 'world_map_state players include color');

ps[0].send(JSON.stringify({type:'enter_stage',stageId:'stage02',hp:20,maxHp:20}));
const su=await got(dm,'state_update');
check(su?.state?.players?.[0]?.color!=null, 'state_update snapshot players include color');

console.log(`\n${pass} passed, ${fail} failed`);
[dm,...ps,p6].forEach(w=>{try{w.close()}catch{}});
process.exit(fail?1:0);
