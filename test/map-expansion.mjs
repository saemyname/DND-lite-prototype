import { readFileSync } from 'fs';

const TARGETS = {
  'rooms/stage01-grid.json': { cols: 10, rows: 10 },
  'rooms/stage03-grid.json': { cols: 14, rows: 14 },
  'rooms/stage04-grid.json': { cols: 14, rows: 14 },
  'rooms/stage05-grid.json': { cols: 15, rows: 14 },
};

let pass = 0, fail = 0;
const check = (c, l) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + l); };

for (const [file, dim] of Object.entries(TARGETS)) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const { cols, rows } = d.grid;
  check(cols === dim.cols && rows === dim.rows, `${file} dims ${cols}x${rows} == ${dim.cols}x${dim.rows}`);
  check(d.walkable.length === rows && d.walkable.every(r => r.length === cols), `${file} walkable is ${rows}x${cols}`);

  const inb = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  const walkAt = (c, r) => inb(c, r) && d.walkable[r][c] === 1;
  const entities = [
    ['spawn', d.playerSpawn[0], d.playerSpawn[1]],
    ...(d.enemies || []).map(e => [e.id, e.col, e.row]),
    ...(d.challenges || []).map(c => [c.id, c.col, c.row]),
  ];
  let ok = true; const uniq = new Set();
  for (const [id, c, r] of entities) {
    if (!walkAt(c, r)) { ok = false; console.log(`     ${id} @${c},${r} not in-bounds/walkable`); }
    const k = `${c},${r}`; if (uniq.has(k)) { ok = false; console.log(`     ${id} collides @${k}`); } uniq.add(k);
  }
  check(ok, `${file} entities all in-bounds + walkable + unique`);

  const [sc, sr] = d.playerSpawn;
  const seen = new Set([`${sc},${sr}`]); const q = [[sc, sr]];
  while (q.length) {
    const [c, r] = q.shift();
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nc = c + dc, nr = r + dr, k = `${nc},${nr}`;
      if (walkAt(nc, nr) && !seen.has(k)) { seen.add(k); q.push([nc, nr]); }
    }
  }
  const unreachable = entities.filter(([, c, r]) => !seen.has(`${c},${r}`));
  check(unreachable.length === 0, `${file} all entities reachable from spawn` + (unreachable.length ? ` (missing: ${unreachable.map(x => x[0]).join(',')})` : ''));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
