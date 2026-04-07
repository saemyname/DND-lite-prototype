# D&D Lite Prototype

An immersive web prototype exploring visual experiences for a lightweight D&D-style game.

**Live demo → https://saemyname.github.io/DND-lite-prototype/**

---

## Experiences

### Parallax — Dungeon
A 6-layer parallax dungeon scene with mouse-driven depth. Torch glow animations and vignette overlays create a moody, atmospheric feel.

### Gaussian Splatting — Open World
Real 3D scenes rendered via [Gaussian Splatting](https://github.com/mkkellogg/GaussianSplats3D), with head-coupled perspective powered by MediaPipe face tracking. Rotate your head to shift the camera viewpoint.

### 3D Scene — The Tavern
A GLB model rendered with Three.js from a fixed first-person camera position. Use the ↻ ↺ buttons to rotate the view 90° at a time. Flickering torch lights and mouse-driven camera sway create an immersive atmosphere.

### HUD
A persistent overlay across all three scenes: character name, role, and four stats (Strength, Agility, Intelligence, Luck) in the bottom-left; a clickable d20 die in the bottom-right.

---

## Running Locally

```bash
git clone https://github.com/saemyname/DND-lite-prototype.git
cd DND-lite-prototype
npm install
npx serve .
# → http://localhost:3000
```

---

## Tech

- Parallax: vanilla CSS + JS, 6-layer PNG composition
- Gaussian Splatting: [`@mkkellogg/gaussian-splats-3d`](https://github.com/mkkellogg/GaussianSplats3D) (Three.js)
- Face tracking: MediaPipe FaceLandmarker (facial transformation matrix → yaw/pitch)
- 3D Scene: Three.js GLTFLoader, PCFSoft shadow mapping, ACES tonemapping, flickering PointLights, mouse sway
- HUD: vanilla JS/CSS overlay — stats panel, animated d20 roller
- GitHub Pages: [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) for SharedArrayBuffer support

---

## Credits

- 3D model: [The Tavern Under the Falling Pigeon](https://skfb.ly/pD7uU) — licensed under [CC Attribution](http://creativecommons.org/licenses/by/4.0/)
