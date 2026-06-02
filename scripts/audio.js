// Lightweight HTMLAudio-based BGM + SFX manager.
//
// Usage:
//   import { playBGM, playSFX, mountAudioToggle } from '../scripts/audio.js';
//   mountAudioToggle();           // floating 🔊 / 🔇 button (top-right)
//   playBGM('world-map');         // crossfades into Assets/audio/bgm/world-map.mp3
//   playSFX('dice');              // one-shot Assets/audio/sfx/dice.mp3
//
// File layout:
//   Assets/audio/bgm/<name>.mp3   — looped background music
//   Assets/audio/sfx/<name>.mp3   — one-shot sound effects
//
// Mute state + volumes persist in localStorage ('dnd-audio').

const PREF_KEY  = 'dnd-audio';
const STATE_KEY = 'dnd-audio-state'; // tracks current BGM + playback position across pages
const BGM_DIR   = '../Assets/audio/bgm/';
const SFX_DIR   = '../Assets/audio/sfx/';
const BGM_FADE_MS    = 1200;
const SFX_POOL_MAX   = 4;
const RESUME_WINDOW_MS = 5000; // if the same track was playing within this many ms,
                               // pick up where it left off (page navigation case)

let muted  = false;
let bgmVol = 0.35;  // BGM stays in the background
let sfxVol = 0.7;
let currentBgm = null;        // { name, audio }
const sfxPools = new Map();   // name → HTMLAudioElement[]

(function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (typeof p.muted  === 'boolean') muted  = p.muted;
    if (typeof p.bgmVol === 'number')  bgmVol = p.bgmVol;
    if (typeof p.sfxVol === 'number')  sfxVol = p.sfxVol;
  } catch {}
})();

function savePrefs() {
  localStorage.setItem(PREF_KEY, JSON.stringify({ muted, bgmVol, sfxVol }));
}

// Persist {name, time, ts} of the currently playing BGM so the next page can
// resume from the same position without a noticeable cut. ts = timestamp the
// snapshot was taken; we add (now - ts) when resuming so the track keeps
// "playing" even during the brief silence between page loads.
function snapshotState() {
  if (!currentBgm) return;
  const audio = currentBgm.audio;
  if (!audio.duration || Number.isNaN(audio.duration)) return;
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      name: currentBgm.name,
      time: audio.currentTime,
      duration: audio.duration,
      ts: Date.now(),
    }));
  } catch {}
}
function readState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }
  catch { return null; }
}
// Snapshot frequently so cross-page resume is accurate
setInterval(snapshotState, 500);
window.addEventListener('beforeunload', snapshotState);
window.addEventListener('pagehide',     snapshotState);

function fadeAudio(audio, from, to, durMs, onDone) {
  const start = performance.now();
  function step() {
    const t = Math.min((performance.now() - start) / durMs, 1);
    audio.volume = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(step);
    else if (onDone) onDone();
  }
  requestAnimationFrame(step);
}

// Play a BGM by name. If the same BGM is already playing, no-op. Otherwise
// crossfades. Browsers may block playback until a user gesture — if so, we
// retry on the next click anywhere on the page.
export function playBGM(name, fadeMs = BGM_FADE_MS) {
  if (currentBgm?.name === name) return;
  if (currentBgm) {
    const old = currentBgm.audio;
    fadeAudio(old, old.volume, 0, fadeMs, () => old.pause());
  }
  const audio = new Audio(BGM_DIR + name + '.mp3');
  audio.loop = true;
  audio.volume = 0;
  const target = muted ? 0 : bgmVol;

  // Cross-page continuity: if the saved state names the same track and is
  // fresh, resume from the saved position (advanced by the time the page took
  // to load) instead of restarting from zero. Music feels continuous across
  // world-map ↔ stage navigation.
  const state = readState();
  let resumeTime = 0;
  let resumeFade = fadeMs;
  if (state && state.name === name && Date.now() - state.ts < RESUME_WINDOW_MS) {
    const elapsedMs = Date.now() - state.ts;
    const dur = state.duration || 0;
    resumeTime = dur > 0 ? (state.time + elapsedMs / 1000) % dur : state.time;
    resumeFade = 250; // near-instant when resuming the same track
  }

  const setAndPlay = () => {
    if (resumeTime > 0) {
      // Wait for metadata before seeking — Safari can throw otherwise
      if (audio.readyState >= 1 && !Number.isNaN(audio.duration)) {
        audio.currentTime = resumeTime;
      } else {
        audio.addEventListener('loadedmetadata', () => {
          try { audio.currentTime = resumeTime; } catch {}
        }, { once: true });
      }
    }
    return audio.play();
  };

  const tryPlay = () => setAndPlay()
    .then(() => fadeAudio(audio, 0, target, resumeFade))
    .catch(() => {
      // Autoplay blocked — wait for user gesture
      const onGesture = () => {
        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown',     onGesture);
        if (currentBgm?.audio === audio) tryPlay();
      };
      window.addEventListener('pointerdown', onGesture, { once: true });
      window.addEventListener('keydown',     onGesture, { once: true });
    });
  currentBgm = { name, audio };
  tryPlay();
}

export function stopBGM(fadeMs = 800) {
  if (!currentBgm) return;
  const { audio } = currentBgm;
  fadeAudio(audio, audio.volume, 0, fadeMs, () => audio.pause());
  currentBgm = null;
}

// One-shot SFX. Pooled so a rapid sequence can overlap (e.g. several dice rolls).
export function playSFX(name) {
  if (muted) return;
  let pool = sfxPools.get(name);
  if (!pool) { pool = []; sfxPools.set(name, pool); }
  let audio = pool.find(a => a.paused || a.ended);
  if (!audio) {
    if (pool.length < SFX_POOL_MAX) {
      audio = new Audio(SFX_DIR + name + '.mp3');
      pool.push(audio);
    } else {
      audio = pool[0];
      audio.currentTime = 0;
    }
  }
  audio.volume = sfxVol;
  audio.play().catch(() => {/* swallowed — likely autoplay block before gesture */});
}

export function setMuted(value) {
  muted = !!value;
  if (currentBgm) currentBgm.audio.volume = muted ? 0 : bgmVol;
  savePrefs();
  refreshToggleUI();
}
export function toggleMute() { setMuted(!muted); return muted; }
export function isMuted()    { return muted; }

export function setBGMVolume(v) {
  bgmVol = Math.max(0, Math.min(1, v));
  if (currentBgm && !muted) currentBgm.audio.volume = bgmVol;
  savePrefs();
}
export function setSFXVolume(v) {
  sfxVol = Math.max(0, Math.min(1, v));
  savePrefs();
}

// Floating 🔊 / 🔇 button — top-right of the viewport. Idempotent.
function refreshToggleUI() {
  const btn = document.getElementById('audio-toggle');
  if (btn) btn.textContent = muted ? '🔇' : '🔊';
}
export function mountAudioToggle() {
  if (document.getElementById('audio-toggle')) return;
  const btn = document.createElement('button');
  btn.id = 'audio-toggle';
  btn.title = 'Mute audio';
  btn.textContent = muted ? '🔇' : '🔊';
  btn.style.cssText =
    'position:fixed;top:14px;right:14px;z-index:200;background:rgba(0,0,0,.55);' +
    'border:1px solid rgba(255,255,255,.25);color:#fff;width:36px;height:36px;' +
    'border-radius:50%;font-size:16px;cursor:pointer;line-height:1;';
  btn.addEventListener('click', () => toggleMute());
  document.body.appendChild(btn);
}
