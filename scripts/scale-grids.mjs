// Dev tool: enlarge the voxel stage grids (~area 2x). Idempotent — targets
// absolute dims, so re-running is a no-op. Run: node scripts/scale-grids.mjs
import { readFileSync, writeFileSync } from 'fs';

const CONFIG = [
  { file: 'rooms/stage01-grid.json', cols: 10, rows: 10, addEnemies: [] },
  { file: 'rooms/stage03-grid.json', cols: 14, rows: 14, addEnemies: [] },
  { file: 'rooms/stage04-grid.json', cols: 14, rows: 14, addEnemies: [
    { id: 'goblin4', col: 4, row: 10, name: 'Goblin Guard', hp: 6, maxHp: 6, stat: 'str', dc: 10,
      description: 'Another guard scrambles out of a tent, spear leveled!',
      successText: 'You drop the guard before the spear lands!',
      failText: 'The spear grazes your side.', successHp: 0, failHp: -3 },
  ] },
  { file: 'rooms/stage05-grid.json', cols: 15, rows: 14, addEnemies: [
    { id: 'minion3', col: 8, row: 4, name: 'Royal Guard', hp: 6, maxHp: 6, stat: 'str', dc: 10,
      description: 'A third guard breaks from the dais, blade raised!',
      successText: 'A clean strike — the guard crumples!',
      failText: 'The blade bites into your shoulder.', successHp: 0, failHp: -3 },
  ] },
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

for (const cfg of CONFIG) {
  const data = JSON.parse(readFileSync(cfg.file, 'utf8'));
  const g = data.grid;
  const oldCols = g.cols, oldRows = g.rows;
  const newCols = cfg.cols, newRows = cfg.rows;
  const sc = newCols / oldCols, sr = newRows / oldRows;

  const centerX = g.originX + oldCols * g.cellSizeX / 2;
  const centerZ = g.originZ + oldRows * g.cellSizeZ / 2;
  g.cols = newCols; g.rows = newRows;
  g.originX = centerX - newCols * g.cellSizeX / 2;
  g.originZ = centerZ - newRows * g.cellSizeZ / 2;

  const oldWalk = data.walkable;
  const walk = Array.from({ length: newRows }, () => Array(newCols).fill(1));
  for (let r = 0; r < oldRows; r++) {
    for (let c = 0; c < oldCols; c++) {
      if (oldWalk[r][c] === 0) {
        walk[clamp(Math.round(r * sr), 0, newRows - 1)][clamp(Math.round(c * sc), 0, newCols - 1)] = 0;
      }
    }
  }
  data.walkable = walk;

  const scaleCell = (col, row) => [clamp(Math.round(col * sc), 0, newCols - 1), clamp(Math.round(row * sr), 0, newRows - 1)];
  [data.playerSpawn[0], data.playerSpawn[1]] = scaleCell(data.playerSpawn[0], data.playerSpawn[1]);
  for (const e of (data.enemies || [])) [e.col, e.row] = scaleCell(e.col, e.row);
  for (const ch of (data.challenges || [])) [ch.col, ch.row] = scaleCell(ch.col, ch.row);

  data.enemies = data.enemies || [];
  for (const ne of cfg.addEnemies) {
    if (!data.enemies.some(e => e.id === ne.id)) data.enemies.push({ ...ne });
  }

  const occupied = new Set();
  const place = (obj) => {
    let key = `${obj.col},${obj.row}`;
    if (occupied.has(key)) {
      const seen = new Set([key]); const q = [[obj.col, obj.row]];
      outer: while (q.length) {
        const [c, r] = q.shift();
        for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nc = c + dc, nr = r + dr, k = `${nc},${nr}`;
          if (nc < 0 || nr < 0 || nc >= newCols || nr >= newRows || seen.has(k)) continue;
          seen.add(k);
          if (!occupied.has(k)) { obj.col = nc; obj.row = nr; key = k; break outer; }
          q.push([nc, nr]);
        }
      }
    }
    walk[obj.row][obj.col] = 1;
    occupied.add(key);
  };
  const spawn = { col: data.playerSpawn[0], row: data.playerSpawn[1] };
  place(spawn); data.playerSpawn = [spawn.col, spawn.row];
  for (const e of data.enemies) place(e);
  for (const ch of (data.challenges || [])) place(ch);

  writeFileSync(cfg.file, JSON.stringify(data, null, 2) + '\n');
  console.log(`${cfg.file}: ${oldCols}x${oldRows} -> ${newCols}x${newRows}, enemies=${data.enemies.length}, challenges=${(data.challenges || []).length}`);
}
