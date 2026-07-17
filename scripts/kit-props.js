// Kenney kit prop loader — shared by scenes that dress their maps with GLB
// props (Nature Kit / Fantasy Town Kit under Assets/Kits/).
//
// Models are fetched once (cached promise) and cloned per placement. Props are
// grounded automatically: after scaling, the object is lifted so its bounding
// box sits on the requested floor y.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map(); // url → Promise<THREE.Group>

export const KIT = {
  nature: name => `../Assets/Kits/Nature Kit/${name}.glb`,
  town:   name => `../Assets/Kits/Fantasy Town Kit/${name}.glb`,
};

export function loadKitModel(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        gltf.scene.traverse(c => {
          if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
        });
        resolve(gltf.scene);
      }, undefined, reject);
    }));
  }
  return cache.get(url);
}

// Place a clone of `url` at (x, z) on floor `y`.
//  fitHeight — scale so the model is exactly this many world units tall
//  scale    — explicit scalar (ignored when fitHeight is set)
//  rotY     — rotation around Y in radians
export async function placeProp(scene, url, { x = 0, z = 0, y = 0, fitHeight = null, scale = 1, rotY = 0 } = {}) {
  const src = await loadKitModel(url);
  const obj = src.clone(true);
  let s = scale;
  if (fitHeight != null) {
    const box = new THREE.Box3().setFromObject(obj);
    s = fitHeight / Math.max(0.0001, box.max.y - box.min.y);
  }
  obj.scale.setScalar(s);
  obj.rotation.y = rotY;
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.set(x, y - box.min.y, z);
  scene.add(obj);
  return obj;
}
