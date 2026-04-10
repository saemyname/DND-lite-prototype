/**
 * voxel-textures.js
 * Shared block definitions, texture loading, and face geometry for voxel rendering.
 *
 * Uses Kenney's Voxel Pack tiles (Assets/Tiles/*.png) — CC0.
 * Each block can have a single texture for all faces, or per-face textures
 * via { top, side, bottom } object.
 */

import * as THREE from 'three';

// ── Block definitions ──
// `textures` is either a string (one tile for all faces) or an object
// { top, side, bottom } for Minecraft-style per-face textures.
export const BLOCK_TYPES = {
  stone_floor: { textures: 'stone.png' },
  stone_wall:  { textures: 'greystone.png' },
  wood:        { textures: 'wood.png' },
  grass:       { textures: { top: 'grass_top.png', side: 'dirt_grass.png', bottom: 'dirt.png' } },
  water:       { textures: 'water.png' },
  lava:        { textures: 'lava.png', emissive: true, emissiveColor: '#ff6622' },
  gold:        { textures: 'stone_gold.png' },
  dark:        { textures: 'stone_coal.png' },
};

export const BLOCK_NAMES = Object.keys(BLOCK_TYPES);

// ── Face geometry ──
// `cat` groups faces by orientation so we can apply per-face textures.
// `uvs` maps each vertex to texture (U,V) so the texture stays upright on side faces
// (V always points up in world space).
export const FACES = [
  { dir: [1,0,0],  cat: 'side',
    verts: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], n: [1,0,0],
    uvs: [[0,0],[0,1],[1,1],[1,0]] },
  { dir: [-1,0,0], cat: 'side',
    verts: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], n: [-1,0,0],
    uvs: [[0,0],[0,1],[1,1],[1,0]] },
  { dir: [0,1,0],  cat: 'top',
    verts: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]], n: [0,1,0],
    uvs: [[0,1],[1,1],[1,0],[0,0]] },
  { dir: [0,-1,0], cat: 'bottom',
    verts: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], n: [0,-1,0],
    uvs: [[0,0],[1,0],[1,1],[0,1]] },
  { dir: [0,0,1],  cat: 'side',
    verts: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], n: [0,0,1],
    uvs: [[0,0],[0,1],[1,1],[1,0]] },
  { dir: [0,0,-1], cat: 'side',
    verts: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], n: [0,0,-1],
    uvs: [[0,0],[0,1],[1,1],[1,0]] },
];

// ── Helpers ──

/** Get the texture filename for a given block + face category. */
export function getTextureFile(blockName, category) {
  const def = BLOCK_TYPES[blockName].textures;
  if (typeof def === 'string') return def;
  return def[category] || def.side || def.top || Object.values(def)[0];
}

/** Get a thumbnail texture file (for UI swatches). Prefers the side view. */
export function getThumbnailFile(blockName) {
  const def = BLOCK_TYPES[blockName].textures;
  if (typeof def === 'string') return def;
  return def.side || def.top || Object.values(def)[0];
}

/**
 * Load all block materials. Returns a map keyed by `${blockName}_${category}`.
 * Textures are cached so identical files share the same texture object.
 * Loading is asynchronous — meshes referencing the materials will display once
 * the textures finish loading (Three.js auto-updates).
 */
export function loadBlockMaterials(basePath = '../Assets/Tiles/') {
  const loader = new THREE.TextureLoader();
  const textureCache = {};

  function getTexture(file) {
    if (!textureCache[file]) {
      const tex = loader.load(basePath + file);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      textureCache[file] = tex;
    }
    return textureCache[file];
  }

  const materials = {};
  for (const name of BLOCK_NAMES) {
    const info = BLOCK_TYPES[name];
    for (const cat of ['top', 'side', 'bottom']) {
      const file = getTextureFile(name, cat);
      const key = `${name}_${cat}`;
      const mat = new THREE.MeshStandardMaterial({
        map: getTexture(file),
        roughness: 0.9,
        metalness: 0.05,
      });
      if (info.emissive) {
        mat.emissive = new THREE.Color(info.emissiveColor || '#ffffff');
        mat.emissiveIntensity = 0.5;
      }
      materials[key] = mat;
    }
  }
  return materials;
}

/**
 * Build merged geometry for a voxel grid using per-face texture groups.
 * @param {Int8Array} grid — flat grid array; -1 = air, otherwise palette index
 * @param {[number,number,number]} size — [sx, sy, sz]
 * @param {string[]} paletteTypes — palette index → block name
 * @param {Object} [opts]
 * @param {(x,y,z)=>boolean} [opts.isCulled] — return true to skip a cell
 * @returns {Object<string, {positions, normals, uvs, indices}>} groups keyed by `${blockName}_${cat}`
 */
export function buildVoxelGroups(grid, size, paletteTypes, opts = {}) {
  const [sx, sy, sz] = size;
  const isCulled = opts.isCulled || (() => false);

  const idx = (x, y, z) => x + y * sx + z * sx * sy;

  function isSolid(x, y, z) {
    if (x < 0 || x >= sx || y < 0 || y >= sy || z < 0 || z >= sz) return false;
    if (grid[idx(x, y, z)] < 0) return false;
    if (isCulled(x, y, z)) return false;
    return true;
  }

  const groups = {};
  function getGroup(key) {
    if (!groups[key]) groups[key] = { positions: [], normals: [], uvs: [], indices: [] };
    return groups[key];
  }

  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const type = grid[idx(x, y, z)];
        if (type < 0) continue;
        if (isCulled(x, y, z)) continue;

        const blockName = paletteTypes[type];
        if (!blockName || !BLOCK_TYPES[blockName]) continue;

        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          if (isSolid(nx, ny, nz)) continue;

          const key = `${blockName}_${face.cat}`;
          const g = getGroup(key);
          const base = g.positions.length / 3;

          for (let i = 0; i < 4; i++) {
            const v = face.verts[i];
            g.positions.push(x + v[0], y + v[1], z + v[2]);
            g.normals.push(face.n[0], face.n[1], face.n[2]);
            g.uvs.push(face.uvs[i][0], face.uvs[i][1]);
          }
          g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }

  return groups;
}

/**
 * Convert a single group into a THREE.Mesh using the corresponding material.
 */
export function groupToMesh(key, group, materials) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(group.positions, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(group.normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(group.uvs, 2));
  geo.setIndex(group.indices);
  const mesh = new THREE.Mesh(geo, materials[key]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
