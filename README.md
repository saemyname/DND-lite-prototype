# D&D Lite

A lightweight web-based D&D game with immersive visuals. Create a character, explore a voxel dungeon, and roll d20s.

**Live demo → https://saemyname.github.io/DND-lite-prototype/**

## Features

- Character creation (Warrior / Rogue / Mage)
- 3D tabletop map with room-to-room navigation
- Voxel rooms with grid-based movement and turn-based d20 combat
- Face-tracked camera via MediaPipe
- Visual scenes: parallax, Gaussian Splatting, Three.js GLB
- Voxel room editor

## Run Locally

```bash
npm install
npx serve .
```

## Tech

Three.js, MediaPipe FaceLandmarker, Gaussian Splatting, vanilla JS — no framework, no build step.
