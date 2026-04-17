/**
 * face-camera.js
 * Shared face tracking + off-axis projection for all scenes.
 *
 * Usage:
 *   import { initFaceCamera, updateFaceCamera } from '../scripts/face-camera.js';
 *
 *   // Once, after scene setup:
 *   await initFaceCamera();
 *
 *   // Every frame in tick():
 *   updateFaceCamera(camera, config);
 *
 *   // On resize:
 *   onResizeFaceCamera(canvasWidth, canvasHeight);
 */

// ── Constants ──
const FACE_STRENGTH = 2.5;
const SMOOTH        = 0.04;
const NEAR          = 0.1;
const FAR           = 100;
const SCREEN_W      = 40;

// ── State ──
let rawFX = 0, rawFY = 0, rawFZ = 0;
let smFX  = 0, smFY  = 0;
let faceDetected  = false;
let faceLandmarker = null;
let webcamActive   = false;
let initialized    = false;
let screenH = SCREEN_W / (window.innerWidth / window.innerHeight);

// ── Rotation button state ──
let rotationEnabled = false;
let targetAngleY    = 0;
let currentAngleY   = 0;
const ROT_STEP      = Math.PI / 2;
const ROT_LERP      = 0.08;

// Expose for scenes that read raw values (e.g. Gaussian Splatting)
window.faceTrack = { rawFX: 0, rawFY: 0, rawFZ: 0, detected: false };
window.FACE_STRENGTH = FACE_STRENGTH;
window.SMOOTH        = SMOOTH;
window.SPLAT_NEAR    = NEAR;
window.SPLAT_FAR     = FAR;
window.SPLAT_SCREEN_W = SCREEN_W;

/**
 * Initialize MediaPipe face tracking + webcam.
 * Safe to call multiple times — only runs once.
 * Requires #webcam, #webcam-preview, #face-canvas elements in the DOM.
 */
export async function initFaceCamera() {
  if (initialized) return;
  initialized = true;

  // Inject shared webcam preview styles
  const wcStyle = document.createElement('style');
  wcStyle.textContent = `
    #webcam-preview {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 60;
      width: 140px;
      border-radius: 8px;
      overflow: hidden;
      border: none;
      background: transparent;
    }
    #webcam-preview.hidden { display: none; }
    #webcam-preview video,
    #webcam-preview canvas {
      display: block;
      width: 100%;
    }
    #webcam-preview canvas {
      position: absolute;
      top: 0;
      left: 0;
    }
  `;
  document.head.appendChild(wcStyle);

  // MediaPipe
  const MP_URLS = [
    '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs',
  ];

  let FaceLandmarker, FilesetResolver, DrawingUtils;
  for (const url of MP_URLS) {
    try {
      const mp = await import(url);
      FaceLandmarker  = mp.FaceLandmarker;
      FilesetResolver = mp.FilesetResolver;
      DrawingUtils    = mp.DrawingUtils;
      if (FaceLandmarker) { console.log('✅ MediaPipe loaded:', url); break; }
    } catch(e) {
      console.warn('⚠️ MediaPipe load failed:', url, e.message);
    }
  }

  if (FaceLandmarker) {
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceLandmarks: true,
      });
    } catch(e) {
      console.warn('FaceLandmarker init failed:', e);
    }
  }

  // Webcam
  const webcamEl = document.getElementById('webcam');
  if (!webcamEl) { console.warn('No #webcam element'); return; }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 320, height: 240 }
    });
    webcamEl.srcObject = stream;
    await new Promise(res => webcamEl.onloadedmetadata = res);
    webcamEl.play();
    webcamActive = true;
    // Mirror webcam preview (selfie-style)
    webcamEl.style.transform = 'scaleX(-1)';
    const faceCanvasEl = document.getElementById('face-canvas');
    if (faceCanvasEl) faceCanvasEl.style.transform = 'scaleX(-1)';
    const preview = document.getElementById('webcam-preview');
    if (preview) preview.classList.remove('hidden');
  } catch(e) {
    const preview = document.getElementById('webcam-preview');
    if (preview) preview.classList.add('hidden');
    // Mouse fallback
    document.addEventListener('mousemove', e => {
      rawFX = -((e.clientX / window.innerWidth  - 0.5) * 2);
      rawFY = -((e.clientY / window.innerHeight - 0.5) * 2);
      faceDetected = true;
      window.faceTrack.rawFX = rawFX;
      window.faceTrack.rawFY = rawFY;
      window.faceTrack.detected = true;
    });
  }

  // Face detection loop
  if (faceLandmarker && webcamActive) {
    const faceCanvas = document.getElementById('face-canvas');
    const ctx = faceCanvas ? faceCanvas.getContext('2d') : null;
    let drawingUtils = (DrawingUtils && ctx) ? new DrawingUtils(ctx) : null;

    let detectFrame = 0;
    function detect() {
      detectFrame++;
      if (detectFrame % 3 !== 0) { requestAnimationFrame(detect); return; }
      if (webcamEl.readyState >= 2) {
        if (ctx && faceCanvas.width !== webcamEl.videoWidth) {
          faceCanvas.width  = webcamEl.videoWidth;
          faceCanvas.height = webcamEl.videoHeight;
          if (DrawingUtils) drawingUtils = new DrawingUtils(ctx);
        }
        if (ctx) ctx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
        try {
          const results = faceLandmarker.detectForVideo(webcamEl, performance.now());
          if (results.faceLandmarks?.length > 0) {
            const lm = results.faceLandmarks[0];
            const nose = lm[1];
            rawFX = -((nose.x - 0.5) * 2);
            rawFY = -((nose.y - 0.5) * 2);
            // Depth
            const earL = lm[234], earR = lm[454];
            const faceWidth = Math.sqrt((earR.x - earL.x) ** 2 + (earR.y - earL.y) ** 2);
            rawFZ = (faceWidth - 0.25) * 8;
            faceDetected = true;
            window.faceTrack.rawFX = rawFX;
            window.faceTrack.rawFY = rawFY;
            window.faceTrack.rawFZ = rawFZ;
            window.faceTrack.detected = true;
            if (drawingUtils && ctx) {
              for (const landmarks of results.faceLandmarks) {
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                  { color: 'rgba(255,255,255,0.6)', lineWidth: 1.5 });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                  { color: 'rgba(255,255,255,0.9)', lineWidth: 2 });
                drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                  { color: 'rgba(255,255,255,0.9)', lineWidth: 2 });
              }
            }
          } else {
            faceDetected = false;
          }
        } catch(e) { console.warn('face detect error:', e); }
      }
      requestAnimationFrame(detect);
    }
    detect();
  }
}

/**
 * Update camera position + off-axis projection each frame.
 *
 * @param {THREE.Camera} camera
 * @param {Object} config
 * @param {THREE.Vector3} config.basePos     — default camera position
 * @param {THREE.Vector3} config.lookTarget  — point the camera faces
 * @param {number}        config.screenDist  — distance from camera to virtual screen
 * @param {THREE.Euler}   [config.baseRotation] — fixed rotation (if not (0,0,0))
 * @param {number}        [config.near]      — override near plane
 * @param {number}        [config.far]       — override far plane
 * @param {number}        [config.strength]  — override head-tracking strength (default FACE_STRENGTH = 2.5)
 * @param {number}        [config.strengthY] — override strength for Y axis only (default = strength)
 * @param {number}        [config.maxHeadY]  — max absolute Y offset (default scales with strengthY)
 */
export function updateFaceCamera(camera, config) {
  const { basePos, lookTarget, screenDist } = config;
  const near = config.near || NEAR;
  const far  = config.far  || FAR;
  const strength  = config.strength  ?? FACE_STRENGTH;
  const strengthY = config.strengthY ?? strength;
  // Preserve the default ratio (original clamp of 1 at strength 2.5 → factor 0.4)
  const maxHeadY = config.maxHeadY ?? (strengthY * 0.4);

  // Rotation lerp
  if (rotationEnabled) {
    currentAngleY += (targetAngleY - currentAngleY) * ROT_LERP;
  }

  // Smoothed face tracking
  smFX += (rawFX - smFX) * SMOOTH;
  smFY += (rawFY - smFY) * SMOOTH;
  const headX = smFX * strength;
  const headY = Math.max(-maxHeadY, Math.min(maxHeadY, smFY * strengthY));

  // Compute orbital position if rotated
  let camX = basePos.x;
  let camZ = basePos.z;
  const dx = basePos.x - lookTarget.x;
  const dz = basePos.z - lookTarget.z;
  const c = Math.cos(currentAngleY);
  const s = Math.sin(currentAngleY);

  if (rotationEnabled && Math.abs(currentAngleY) > 0.0001) {
    camX = lookTarget.x + dx * c - dz * s;
    camZ = lookTarget.z + dx * s + dz * c;
  }

  // Add head offset (rotated to match camera orientation)
  const hx = rotationEnabled ? headX * c : headX;
  const hz = rotationEnabled ? headX * s : 0;

  // Set rotation from base position (no head offset) so it stays fixed
  camera.position.set(camX, basePos.y, camZ);
  camera.lookAt(lookTarget);

  // Then shift position only — rotation stays locked
  camera.position.set(camX + hx, basePos.y + headY, camZ + hz);

  if (config.offAxis !== false) {
    // Off-axis projection (for forward-facing scenes)
    const totalX = (basePos.x - lookTarget.x) + headX;
    const totalY = (basePos.y - lookTarget.y) + headY;
    const left   = (-SCREEN_W / 2 - totalX) * near / screenDist;
    const right  = ( SCREEN_W / 2 - totalX) * near / screenDist;
    const top    = (-screenH / 2 - totalY) * near / screenDist;
    const bottom = ( screenH / 2 - totalY) * near / screenDist;
    camera.projectionMatrix.makePerspective(left, right, bottom, top, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  } else {
    // Standard perspective (for top-down views like map)
    camera.updateProjectionMatrix();
  }
}

/**
 * Call on window resize to update screen aspect.
 */
export function onResizeFaceCamera(width, height) {
  screenH = SCREEN_W / (width / height);
}

/**
 * Get current smoothed face values (for custom use).
 */
export function getFaceData() {
  return { smFX, smFY, rawFX, rawFY, rawFZ, faceDetected };
}

/**
 * Inject 90° rotation buttons and wire up rotation state.
 * Camera orbits around lookTarget when rotated.
 *
 * @param {HTMLElement} [container=document.body] — where to append buttons
 */
export function initRotationButtons(container = document.body) {
  if (rotationEnabled) return;

  targetAngleY = 0;
  currentAngleY = 0;
  rotationEnabled = true;

  // Inject CSS
  const style = document.createElement('style');
  style.textContent = `
    .cam-arrow {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      z-index: 200;
      width: 60px;
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(200,169,110,.12);
      border: 2px solid rgba(200,169,110,.5);
      color: rgba(200,169,110,.85);
      font-size: 32px;
      cursor: pointer;
      transition: all .2s;
      user-select: none;
      pointer-events: all;
      text-shadow: 0 0 12px rgba(200,169,110,.6);
    }
    .cam-arrow:hover {
      background: rgba(200,169,110,.25);
      color: #c8a96e;
      border-color: rgba(200,169,110,.9);
      text-shadow: 0 0 20px rgba(200,169,110,.9);
    }
    .cam-arrow:active { background: rgba(200,169,110,.4); }
    #cam-left  { left: 16px;  border-radius: 4px; }
    #cam-right { right: 16px; border-radius: 4px; }
  `;
  document.head.appendChild(style);

  // Inject buttons
  const leftBtn = document.createElement('button');
  leftBtn.className = 'cam-arrow';
  leftBtn.id = 'cam-left';
  leftBtn.textContent = '\u21BB'; // ↻
  leftBtn.addEventListener('click', () => { targetAngleY += ROT_STEP; });

  const rightBtn = document.createElement('button');
  rightBtn.className = 'cam-arrow';
  rightBtn.id = 'cam-right';
  rightBtn.textContent = '\u21BA'; // ↺
  rightBtn.addEventListener('click', () => { targetAngleY -= ROT_STEP; });

  container.appendChild(leftBtn);
  container.appendChild(rightBtn);
}
