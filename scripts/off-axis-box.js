/**
 * off-axis-box.js
 * Builds an open-front rectangular box (5 walls, front is "the window").
 * Shared between off-axis projection test pages.
 */

import * as THREE from 'three';

/**
 * @param {THREE.Object3D} group  — parent group to attach walls/frame/grid to
 * @param {Object} opts
 * @param {number} opts.w         — box width  (x)
 * @param {number} opts.h         — box height (y)
 * @param {number} opts.d         — box depth  (z), extends from 0 back to -d
 * @param {number} [opts.wallColor]
 * @param {number} [opts.frameColor]
 * @param {number} [opts.frameThickness]
 * @param {boolean}[opts.withGrid]
 * @param {number} [opts.gridColor]
 * @param {number} [opts.gridStep]  — spacing between grid lines (world units)
 */
export function buildBox(group, opts = {}) {
  const {
    w, h, d,
    wallColor = 0x8a7a5a,
    frameColor = 0x3a2a1a,
    frameThickness = 0.36,
    withGrid = false,
    gridColor = 0x66ddff,
    gridStep = 1.5,
  } = opts;
  const HW = w / 2, HH = h / 2;

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide,
  });

  function wall(ww, hh, pos, rot) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), wallMat);
    mesh.position.copy(pos);
    if (rot) mesh.rotation.copy(rot);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  wall(w, h, new THREE.Vector3(0, 0, -d));                                              // back
  wall(w, d, new THREE.Vector3(0, -HH, -d / 2), new THREE.Euler(-Math.PI / 2, 0, 0));   // floor
  wall(w, d, new THREE.Vector3(0,  HH, -d / 2), new THREE.Euler( Math.PI / 2, 0, 0));   // ceiling
  wall(d, h, new THREE.Vector3(-HW, 0, -d / 2), new THREE.Euler(0,  Math.PI / 2, 0));   // left
  wall(d, h, new THREE.Vector3( HW, 0, -d / 2), new THREE.Euler(0, -Math.PI / 2, 0));   // right

  // Window frame (around open front face)
  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColor, roughness: 0.7, metalness: 0.2,
  });
  const ft = frameThickness;
  function frame(fw, fh, pos) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, ft), frameMat);
    mesh.position.copy(pos);
    group.add(mesh);
  }
  frame(w + ft * 2, ft, new THREE.Vector3(0,  HH + ft / 2, 0));
  frame(w + ft * 2, ft, new THREE.Vector3(0, -HH - ft / 2, 0));
  frame(ft, h,        new THREE.Vector3(-HW - ft / 2, 0, 0));
  frame(ft, h,        new THREE.Vector3( HW + ft / 2, 0, 0));

  // Grid lines inset from walls
  if (withGrid) {
    const pts = [];
    const eps = 0.02;
    const range = (a, b, s) => {
      const arr = [];
      for (let v = a; v <= b + 1e-6; v += s) arr.push(v);
      return arr;
    };
    const xs = range(-HW, HW, gridStep);
    const ys = range(-HH, HH, gridStep);
    const zs = range(-d, 0, gridStep);

    xs.forEach(x => pts.push(x, -HH, -d + eps,  x,  HH, -d + eps));   // back
    ys.forEach(y => pts.push(-HW, y, -d + eps,  HW, y,  -d + eps));
    xs.forEach(x => pts.push(x, -HH + eps, 0,   x,  -HH + eps, -d));  // floor
    zs.forEach(z => pts.push(-HW, -HH + eps, z, HW, -HH + eps,  z));
    xs.forEach(x => pts.push(x,  HH - eps, 0,   x,   HH - eps, -d));  // ceiling
    zs.forEach(z => pts.push(-HW, HH - eps, z,  HW,  HH - eps,  z));
    ys.forEach(y => pts.push(-HW + eps, y, 0,   -HW + eps, y,  -d));  // left
    zs.forEach(z => pts.push(-HW + eps, -HH, z, -HW + eps, HH,  z));
    ys.forEach(y => pts.push( HW - eps, y, 0,    HW - eps, y,  -d));  // right
    zs.forEach(z => pts.push( HW - eps, -HH, z,  HW - eps, HH,  z));

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: gridColor, transparent: true, opacity: 0.6,
    });
    group.add(new THREE.LineSegments(geo, mat));
  }
}
