import * as THREE from 'three';
import { COLOR_PALETTE } from './colors.js';

// Ear personality per player color — five distinct cat-slime silhouettes.
// sx/sy/sz scale the hemisphere dome, px/py place it, rz tilts it outward.
const EAR_VARIANTS = {
  red:    { sx: 1.0,  sy: 1.5, sz: 0.8,  px: 0.27, py: 0.55, rz: 0.5 },   // classic rounded
  green:  { sx: 0.8,  sy: 2.3, sz: 0.7,  px: 0.24, py: 0.57, rz: 0.25 },  // tall perky ears
  blue:   { sx: 1.05, sy: 1.6, sz: 0.75, px: 0.40, py: 0.48, rz: 1.25 },  // folded flop-ears
  purple: { sx: 0.7,  sy: 3.1, sz: 0.6,  px: 0.20, py: 0.64, rz: 0.12 },  // long bunny ears
  gold:   { sx: 0.75, sy: 1.0, sz: 0.7,  px: 0.30, py: 0.59, rz: 0.7 },   // tiny teddy ears
};

function earKeyForColor(hex) {
  for (const [key, val] of Object.entries(COLOR_PALETTE)) {
    if (val === hex) return key;
  }
  return 'red';
}

const ROLE_EMOJI = {
  warrior: '🗡️',
  rogue:   '🏹',
  mage:    '🔮',
  cleric:  '🪄',
};

// Per-role emoji rotation in degrees (clockwise on the rendered canvas).
const ROLE_EMOJI_ROTATION = {
  warrior: 180,
};

const ROLE_COLOR = {
  warrior: 0xd65555,
  rogue:   0x5dbf6a,
  mage:    0x9a6cd1,
  cleric:  0xf5d878,
};

export function emojiForRole(role) {
  return ROLE_EMOJI[String(role || '').toLowerCase()] || '👤';
}

export function colorForRole(role) {
  return ROLE_COLOR[String(role || '').toLowerCase()] ?? 0xaaaaaa;
}

// Procedural slime: squashed translucent sphere + 2 eyes + a tiny highlight,
// holding the role's emoji as a sprite "in its right hand".
// Group origin sits at the GROUND.
export function createSlimeMiniature(role, height = 3, colorHex) {
  const group = new THREE.Group();
  // Inner group receives squash/stretch — scales about origin (y=0 = ground)
  // so the slime's bottom stays anchored to the floor during animation.
  const anim = new THREE.Group();
  group.add(anim);
  group.userData.anim = anim;

  // Explicit per-player color wins; otherwise fall back to the role color.
  const color = (typeof colorHex === 'number') ? colorHex : colorForRole(role);

  // Body — squashed sphere, slightly translucent for jelly look
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 24),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.25,
      metalness: 0.0,
      transparent: true,
      opacity: 0.88,
    })
  );
  body.scale.set(1.0, 0.7, 1.0);
  body.position.y = 0.35;
  body.castShadow = true;
  anim.add(body);
  group.userData.body = body;

  // Cat ears — rounded jelly domes (hemispheres, not cones — cones read as
  // horns) sharing the body material so they squash and bounce with the slime.
  // Each player color gets its own ear personality (EAR_VARIANTS above).
  const earMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.88,
  });
  const earGeo = new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const ears = EAR_VARIANTS[earKeyForColor(color)] || EAR_VARIANTS.red;
  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(earGeo, earMat);
    ear.scale.set(ears.sx, ears.sy, ears.sz);
    ear.position.set(side * ears.px, ears.py, 0);
    ear.rotation.z = side * -ears.rz;
    ear.castShadow = true;
    anim.add(ear);
  });

  // Eyes + eye-dots — flat 2D ellipses on the front (+z). CircleGeometry is a
  // unit disc in the XY plane (faces +z); scale (rx, ry) makes the ellipse.
  const eyeGeo = new THREE.CircleGeometry(1, 24);
  [-0.16, 0.16].forEach(x => {
    const eye = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(x, 0.42, 0.5);
    eye.scale.set(0.085, 0.1, 1);
    anim.add(eye);
    // Eye highlight (tiny white dot)
    const sparkle = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    sparkle.position.set(x + 0.035, 0.46, 0.505);
    sparkle.scale.set(0.028, 0.03, 1);
    anim.add(sparkle);
  });

  // Body highlight — flat 2D ellipse, tilted to sit on the curved top-left surface.
  const shine = new THREE.Mesh(
    eyeGeo,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
  );
  shine.position.set(-0.29, 0.58, 0.265);
  shine.scale.set(0.075, 0.075, 1);
  shine.rotation.set(-70 * Math.PI / 180, -30 * Math.PI / 180, 0);
  anim.add(shine);

  // "Weapon" — role emoji as a billboard sprite on the slime's right side
  const emoji = emojiForRole(role);
  const rotDeg = ROLE_EMOJI_ROTATION[String(role || '').toLowerCase()] || 0;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '100px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (rotDeg) {
    ctx.translate(64, 64);
    ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.fillText(emoji, 0, 8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.fillText(emoji, 64, 72);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const weapon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  weapon.scale.set(0.45, 0.45, 1);
  weapon.position.set(0.45, 0.47, 0.41); // pushed forward (+z) but closer to body
  anim.add(weapon);
  group.userData.weapon = weapon;
  group.userData.weaponBaseRot = ((ROLE_EMOJI_ROTATION[String(role || '').toLowerCase()] || 0) * Math.PI) / 180;

  // Mark as slime so callers can branch on token type
  group.userData.kind = 'slime';

  // Scale whole group to requested height (squashed sphere is ~0.7 tall)
  group.scale.setScalar(height / 0.7);

  return group;
}

// Advance one frame of slime jump / idle animation.
// `group` must be a token returned by createSlimeMiniature.
// State is stored on group.userData. Caller is responsible for setting
// `group.userData.jumpStart`, `jumpFrom` (Vector3), `jumpTo` (Vector3),
// `jumpDuration` when a move begins. This function consumes that state.
export function updateSlimeAnimation(group, nowMs, floorY) {
  const ud = group.userData;
  const anim = ud.anim;
  if (!anim) return;

  // Attack animation takes priority over jump/idle when active
  if (ud.attackStart != null) {
    const t = Math.min((nowMs - ud.attackStart) / ud.attackDuration, 1);
    let sx = 1, sy = 1, sz = 1;
    if (t < 0.15) {
      const u = t / 0.15;
      sx = 1 + 0.25 * u; sz = 1 + 0.25 * u; sy = 1 - 0.30 * u;
    } else if (t < 0.5) {
      const u = (t - 0.15) / 0.35;
      sx = 1.25 - 0.40 * u; sz = 1.25 - 0.40 * u; sy = 0.70 + 0.55 * u;
    } else if (t < 0.75) {
      const u = (t - 0.5) / 0.25;
      sx = 0.85 + 0.45 * u; sz = 0.85 + 0.45 * u; sy = 1.25 - 0.65 * u;
    } else {
      const u = (t - 0.75) / 0.25;
      sx = 1.30 - 0.30 * u; sz = 1.30 - 0.30 * u; sy = 0.60 + 0.40 * u;
    }
    anim.scale.set(sx, sy, sz);
    // Small vertical hop (in-place)
    if (ud.targetPos) {
      group.position.y = floorY + Math.sin(t * Math.PI) * 0.55;
    }
    // Weapon swing — additional rotation on top of the baked base rotation
    if (ud.weapon) {
      const swing = t < 0.5 ? -t * Math.PI : -(1 - (t - 0.5)) * Math.PI; // 0 → -π → 0
      ud.weapon.material.rotation = (ud.weaponBaseRot || 0) + swing * 0.5;
    }
    if (t >= 1) {
      ud.attackStart = null;
      anim.scale.set(1, 1, 1);
      if (ud.weapon) ud.weapon.material.rotation = ud.weaponBaseRot || 0;
      if (ud.targetPos) group.position.y = floorY;
    }
    return;
  }

  if (ud.jumpStart != null) {
    const t = Math.min((nowMs - ud.jumpStart) / ud.jumpDuration, 1);
    // Position arc — parabolic hop in world space
    const x = ud.jumpFrom.x + (ud.jumpTo.x - ud.jumpFrom.x) * t;
    const z = ud.jumpFrom.z + (ud.jumpTo.z - ud.jumpFrom.z) * t;
    const arcHeight = 1.6;
    const y = floorY + Math.sin(t * Math.PI) * arcHeight;
    group.position.set(x, y, z);

    // Squash & stretch phases (around resting anim.scale = 1,1,1)
    let sx = 1, sy = 1, sz = 1;
    if (t < 0.15) {
      // Anticipation: squash down before takeoff
      const u = t / 0.15;
      sx = 1 + 0.25 * u; sz = 1 + 0.25 * u;
      sy = 1 - 0.30 * u;
    } else if (t < 0.85) {
      // Airborne: stretch tall, slim middle
      const u = (t - 0.15) / 0.70;
      const arc = Math.sin(u * Math.PI); // 0→1→0
      sx = 1.25 - 0.40 * arc; sz = 1.25 - 0.40 * arc;
      sy = 0.70 + 0.55 * arc;
    } else {
      // Landing squash
      const u = (t - 0.85) / 0.15;
      sx = 1.30 - 0.30 * u; sz = 1.30 - 0.30 * u;
      sy = 0.55 + 0.45 * u;
    }
    anim.scale.set(sx, sy, sz);

    if (t >= 1) {
      ud.jumpStart = null;
      anim.scale.set(1, 1, 1);
    }
  } else {
    // Idle breathing wobble — gentle, no position bob (looks too floaty otherwise)
    const w = Math.sin(nowMs * 0.003) * 0.04;
    anim.scale.set(1 + w, 1 - w, 1 + w);
    // Snap group y to floor when grounded
    if (ud.targetPos) {
      group.position.y = floorY;
    }
  }
}

// Floating labels: only the name has the bordered box; the HP bar sits below,
// outside the box. Outer wrap handles screen positioning; inner name keeps its
// existing class (.player-name-label or .enemy-hp) so theme styles apply.
function makeHpBar() {
  const bar = document.createElement('div');
  bar.style.cssText =
    'width:56px;height:4px;margin:3px auto 0;background:rgba(0,0,0,.55);' +
    'border:1px solid rgba(255,255,255,.2);border-radius:2px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText =
    'height:100%;width:100%;background:#66dd66;transition:width 0.2s ease,background 0.2s ease;';
  bar.appendChild(fill);
  return { bar, fill };
}

function buildLabelWrap(name, innerClass) {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;pointer-events:none;z-index:30;transform:translate(-50%,-100%);' +
    'text-align:center;';

  const nameEl = document.createElement('div');
  nameEl.className = innerClass;
  nameEl.textContent = name;
  // Override position/transform so the inner sits in normal flow inside wrap
  nameEl.style.position = 'static';
  nameEl.style.transform = 'none';
  nameEl.style.display = 'inline-block';
  wrap.appendChild(nameEl);

  const { bar, fill } = makeHpBar();
  wrap.appendChild(bar);

  return { label: wrap, fillEl: fill, nameEl };
}

export function buildPlayerLabel(name) {
  return buildLabelWrap(name, 'player-name-label');
}

export function buildEnemyLabel(name) {
  return buildLabelWrap(name, 'enemy-hp');
}

export function updatePlayerLabelHp(fillEl, hp, maxHp) {
  if (!fillEl) return;
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  fillEl.style.width = pct + '%';
  const color = pct > 60 ? '#66dd66' : pct > 30 ? '#ddcc44' : '#e85d5d';
  fillEl.style.background = color;
}

// Death fade for a player token entry — call each frame while entry._dying
// is true. Caches original opacities once, then multiplies by the remaining
// fade ratio so transparent materials don't pop to full opacity afterwards.
// Returns true once the fade has fully completed so the caller can dispose
// of the token.
export function fadeOutToken(entry, nowMs, durationMs = 2000) {
  if (entry._deathStart == null) entry._deathStart = nowMs;
  const t = Math.min((nowMs - entry._deathStart) / durationMs, 1);
  const fade = 1 - t;
  if (!entry._origOpacities) {
    entry._origOpacities = new Map();
    entry.group.traverse(child => {
      if (!child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m) continue;
        entry._origOpacities.set(m, m.opacity ?? 1);
        m.transparent = true;
      }
    });
  }
  entry._origOpacities.forEach((orig, m) => { m.opacity = orig * fade; });
  if (entry.label) entry.label.style.opacity = String(fade);
  return t >= 1;
}

// Trigger an in-place attack animation on a slime token. Call when the
// attacker takes a swing — squashes, hops, and swings the weapon sprite.
export function triggerSlimeAttack(group, duration = 450) {
  const ud = group.userData;
  if (!ud || ud.kind !== 'slime') return;
  ud.attackStart = performance.now();
  ud.attackDuration = duration;
}

// Flash an enemy mesh red briefly to indicate damage. Walks the mesh tree
// and pulses `emissive` on every MeshStandardMaterial back to its original.
export function flashEnemyDamage(mesh, duration = 350) {
  const records = [];
  mesh.traverse(obj => {
    if (obj.isMesh && obj.material && obj.material.emissive) {
      const m = obj.material;
      records.push({ m, origHex: m.emissive.getHex(), origIntensity: m.emissiveIntensity ?? 1 });
      m.emissive.setHex(0xff2020);
      m.emissiveIntensity = 1.6;
    }
  });
  if (!records.length) return;
  const start = performance.now();
  function step() {
    const t = Math.min((performance.now() - start) / duration, 1);
    records.forEach(({ m, origIntensity }) => {
      m.emissiveIntensity = 1.6 * (1 - t) + origIntensity * t;
    });
    if (t >= 1) {
      records.forEach(({ m, origHex, origIntensity }) => {
        m.emissive.setHex(origHex);
        m.emissiveIntensity = origIntensity;
      });
    } else {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

// Returns a THREE.Group with a Sprite of the emoji.
// Group origin sits at the GROUND. Sprite is centered at y = height/2.
export function createEmojiMiniature(role, height = 3) {
  const emoji = emojiForRole(role);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.font = '200px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 128, 140);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(height, height, 1);
  sprite.position.y = height / 2;

  const group = new THREE.Group();
  group.add(sprite);
  return group;
}
