# D&D Lite Prototype

An immersive web prototype exploring visual experiences for a lightweight D&D-style game.

**Live demo → https://saemyname.github.io/DND-lite-prototype/**

---

## Experiences

### Parallax — Dungeon
A 6-layer parallax dungeon scene with mouse-driven depth. Torch glow animations and vignette overlays create a moody, atmospheric feel.

### Gaussian Splatting — Open World
Real 3D scenes rendered via [Gaussian Splatting](https://github.com/mkkellogg/GaussianSplats3D), with head-coupled perspective powered by MediaPipe face tracking. Rotate your head to shift the camera viewpoint.

---

## Running Locally

Requires Python 3. The custom server sets Cross-Origin Isolation headers needed for SharedArrayBuffer (used by the Gaussian Splatting renderer).

```bash
git clone https://github.com/saemyname/DND-lite-prototype.git
cd DND-lite-prototype
npm install
./start-server.sh
# → http://localhost:8080
```

---

## Tech

- Parallax: vanilla CSS + JS, 6-layer PNG composition
- 3D rendering: [`@mkkellogg/gaussian-splats-3d`](https://github.com/mkkellogg/GaussianSplats3D) (Three.js)
- Face tracking: MediaPipe FaceLandmarker (facial transformation matrix → yaw/pitch)
- GitHub Pages: [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) for SharedArrayBuffer support
