// Procedural Eldermoor village builder.
// Shared by the intro cutscene and stage01. Builds floor tiles (path/grass),
// optional houses on blocked cells, optional well decoration on walkable
// cells, and tree blocks on the remaining blocked cells.

import * as THREE from 'three';

const _v = (a, b) => a !== undefined ? a : b;

// cfg: {
//   cols, rows, cellSizeX, cellSizeZ, originX, originZ, floorY,
//   walkable: number[rows][cols] (1 = walkable, 0 = blocked),
//   houses?:  [[col,row], ...]   // blocked cells that get a house instead of a tree
//   wells?:   [[col,row], ...]   // walkable cells that get a well decoration
//   paths?:   [[col,row], ...]   // walkable cells with stone floor (else grass)
// }
export function buildVillage(scene, blockMats, cfg) {
  const { cols, rows, cellSizeX, cellSizeZ, originX, originZ, floorY, walkable } = cfg;
  const houses = new Set((cfg.houses || []).map(([c, r]) => `${c},${r}`));
  const wells  = new Set((cfg.wells  || []).map(([c, r]) => `${c},${r}`));
  const paths  = new Set((cfg.paths  || []).map(([c, r]) => `${c},${r}`));

  const cellCenter = (c, r) => ({
    x: originX + c * cellSizeX + cellSizeX / 2,
    z: originZ + r * cellSizeZ + cellSizeZ / 2,
  });

  // ── Floor ──
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = cellCenter(c, r);
      const isWalk  = walkable[r][c] === 1;
      const isPath  = isWalk && paths.has(`${c},${r}`);
      const matKey  = isPath ? 'stone_floor_top' : 'grass_top';
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(cellSizeX, 0.4, cellSizeZ),
        blockMats[matKey],
      );
      tile.position.set(x, floorY - 0.2, z);
      tile.receiveShadow = true;
      scene.add(tile);
    }
  }

  // ── Houses (blocked cells that are tagged) ──
  for (const key of houses) {
    const [c, r] = key.split(',').map(Number);
    const { x, z } = cellCenter(c, r);
    placeHouse(scene, blockMats, x, z, floorY, cellSizeX, cellSizeZ);
  }

  // ── Wells (walkable cells that are tagged) ──
  for (const key of wells) {
    const [c, r] = key.split(',').map(Number);
    const { x, z } = cellCenter(c, r);
    placeWell(scene, blockMats, x, z, floorY);
  }

  // ── Trees (remaining blocked cells) ──
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (walkable[r][c] === 1) continue;
      if (houses.has(`${c},${r}`)) continue;
      const { x, z } = cellCenter(c, r);
      placeTree(scene, blockMats, x, z, floorY);
    }
  }
}

function placeHouse(scene, blockMats, x, z, floorY, sx, sz) {
  // Walls: 2-block-tall box, brick_red on the sides, wood floor on top "porch step"
  const wallMat = blockMats['brick_red_side'] || blockMats['brick_red_top'];
  const roofMat = blockMats['wood_red_side'] || blockMats['wood_red_top'] || blockMats['dark_top'];

  const wallW = sx * 0.78;
  const wallD = sz * 0.78;
  const wallH = 4.4;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallD), wallMat);
  walls.position.set(x, floorY + wallH / 2, z);
  walls.castShadow = true;
  walls.receiveShadow = true;
  scene.add(walls);

  // Pyramid roof (use a slightly larger flat box for simple voxel look)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(wallW * 1.08, 1.0, wallD * 1.08),
    roofMat,
  );
  roof.position.set(x, floorY + wallH + 0.5, z);
  roof.castShadow = true;
  scene.add(roof);

  // Door (small dark block on +z face)
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(wallW * 0.32, wallH * 0.55, 0.2),
    blockMats['dark_top'] || blockMats['wood_top'] || wallMat,
  );
  door.position.set(x, floorY + wallH * 0.275, z + wallD / 2 + 0.1);
  scene.add(door);

  // Window (glass) on the front beside the door
  if (blockMats['glass_top']) {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(wallW * 0.22, wallH * 0.22, 0.2),
      blockMats['glass_top'],
    );
    win.position.set(x + wallW * 0.28, floorY + wallH * 0.65, z + wallD / 2 + 0.1);
    scene.add(win);
  }
}

export function placeWell(scene, blockMats, x, z, floorY) {
  // Stone ring + dark water surface inside
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 1.0, 16, 1, true),
    blockMats['stone_wall_side'] || blockMats['stone_wall_top'] || blockMats['stone_floor_top'],
  );
  rim.position.set(x, floorY + 0.5, z);
  rim.castShadow = true;
  scene.add(rim);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 0.05, 16),
    blockMats['water_top'] || new THREE.MeshStandardMaterial({ color: 0x1a3344 }),
  );
  water.position.set(x, floorY + 0.95, z);
  scene.add(water);

  // Simple roof posts + cap (decorative)
  const postMat = blockMats['wood_side'] || blockMats['wood_top'];
  for (const dx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), postMat);
    post.position.set(x + dx * 1.3, floorY + 1.0 + 1.4, z);
    scene.add(post);
  }
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.3, 1.8),
    blockMats['wood_red_top'] || blockMats['dark_top'] || postMat,
  );
  cap.position.set(x, floorY + 3.8, z);
  scene.add(cap);
}

function placeTree(scene, blockMats, x, z, floorY) {
  const trunkH = 4 + Math.random() * 2;
  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, trunkH, 1.4),
    blockMats['wood_side'] || blockMats['wood_top'],
  );
  trunk.position.set(
    x + (Math.random() - 0.5) * 1.5,
    floorY + trunkH / 2,
    z + (Math.random() - 0.5) * 1.5,
  );
  trunk.castShadow = true;
  scene.add(trunk);

  const foliageSize = 3.5;
  const foliage = new THREE.Mesh(
    new THREE.BoxGeometry(foliageSize, foliageSize, foliageSize),
    blockMats['grass_top'],
  );
  foliage.position.set(trunk.position.x, floorY + trunkH + foliageSize / 2 - 0.3, trunk.position.z);
  foliage.castShadow = true;
  scene.add(foliage);
}

// ── Cutscene-only NPC slimes ────────────────────────────────────────────────

// Draw a `>` or `<` shape onto a canvas for use as a closed-eye sprite.
function makeCryEyeTexture(direction) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (direction === '>') {
    ctx.moveTo(14, 14);
    ctx.lineTo(50, 32);
    ctx.lineTo(14, 50);
  } else {
    ctx.moveTo(50, 14);
    ctx.lineTo(14, 32);
    ctx.lineTo(50, 50);
  }
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Lyra: cyan body, no weapon, ✨ sprite floating above the head.
export function placeLyraSlime(scene, worldPos, height = 4) {
  const group = new THREE.Group();
  const anim = new THREE.Group();
  group.add(anim);
  group.userData.anim = anim;

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0x7ec7e8,
      roughness: 0.25,
      emissive: 0x336688,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.92,
    }),
  );
  body.scale.set(1.0, 0.7, 1.0);
  body.position.y = 0.35;
  body.castShadow = true;
  anim.add(body);
  group.userData.body = body;

  // Cat ears, matching the party slimes (see createSlimeMiniature) — Lyra's
  // glow with a pink inner-ear.
  const earMat = new THREE.MeshStandardMaterial({
    color: 0x7ec7e8, roughness: 0.25, emissive: 0x336688, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.92,
  });
  const innerEarMat = new THREE.MeshBasicMaterial({ color: 0xffb0c8 });
  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 20), earMat);
    ear.position.set(side * 0.28, 0.72, 0);
    ear.rotation.z = side * -0.55;
    anim.add(ear);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1, 3), innerEarMat); // flat pink triangle
    inner.scale.set(0.07, 0.13, 1);
    inner.position.set(side * 0.285, 0.70, 0.115);
    inner.rotation.z = side * -0.55;
    anim.add(inner);
  });

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeGeo = new THREE.SphereGeometry(0.09, 12, 12);
  const tears = [];
  const normalEyes = [];
  const cryEyes = [];
  [-0.15, 0.15].forEach((x, idx) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 0.42, 0.4);
    anim.add(eye);
    normalEyes.push(eye);

    const sparkle = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    sparkle.position.set(x + 0.03, 0.45, 0.475);
    anim.add(sparkle);
    normalEyes.push(sparkle);

    // Cry eye ('>' on the left, '<' on the right — closed, inward-pointing)
    const cry = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeCryEyeTexture(idx === 0 ? '>' : '<'),
      transparent: true,
      depthTest: false,
    }));
    cry.scale.set(0.26, 0.26, 1);
    cry.position.set(x, 0.42, 0.46);
    cry.renderOrder = 11;
    cry.visible = false;
    anim.add(cry);
    cryEyes.push(cry);

    // Teardrop under each eye — hidden until the cutscene sets userData.crying = true
    const tear = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0 }),
    );
    tear.scale.set(0.8, 1.4, 0.8);
    tear.position.set(x, 0.32, 0.46);
    anim.add(tear);
    tears.push(tear);
  });
  group.userData.tears = tears;
  group.userData.normalEyes = normalEyes;
  group.userData.cryEyes = cryEyes;

  // Sparkle aura above head
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✨', 64, 72);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  aura.scale.set(0.55, 0.55, 1);
  aura.position.set(0, 1.0, 0);
  aura.renderOrder = 10;
  anim.add(aura);
  group.userData.aura = aura;

  group.userData.kind = 'slime';
  group.scale.setScalar(height / 0.7);
  if (worldPos) group.position.copy(worldPos);
  scene.add(group);
  return group;
}

// Goblin: stage02-style box enemy (tall body + small head + red eyes).
// Not a slime — keeps the visual language consistent with combat stages.
export function placeGoblinBox(scene, worldPos, height = 3) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  const headMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), headMat);
  head.position.y = 1.45;
  head.castShadow = true;
  group.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  [-0.14, 0.14].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat);
    eye.position.set(ex, 1.48, 0.28);
    group.add(eye);
  });

  group.userData.materials = [bodyMat, headMat]; // for opacity fades
  group.scale.setScalar(height);
  if (worldPos) group.position.copy(worldPos);
  scene.add(group);
  return group;
}
