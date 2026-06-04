// Offline SFX renderer — mirrors the 8-bit synth in scenes/sfx-preview.html.
// Renders the *selected* variant of each event to Assets/audio/sfx/<event>.wav.
//
//   node scripts/gen-sfx.mjs
//
// Keep the primitives (tone/noise/arp) in sync with sfx-preview.html if you
// re-tune sounds. To swap a sound's variant, edit BUILD below (copy the exact
// params from the GEN map in the preview page) and re-run.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const TAIL = 0.06;            // silence after a sound's nominal duration
const FLOOR = 0.0001;         // exponential-ramp floor (matches Web Audio)
const TWO_PI = Math.PI * 2;

// ── envelope / frequency helpers (match Web Audio automation curves) ──
const expRamp = (x, x0, x1, v0, v1) => {
  if (x <= x0) return v0;
  if (x >= x1) return v1;
  return v0 * Math.pow(v1 / v0, (x - x0) / (x1 - x0));
};
const linRamp = (x, x0, x1, v0, v1) => v0 + (v1 - v0) * (x - x0) / (x1 - x0);

function wave(type, phase) {
  const p = (phase / TWO_PI) % 1;            // 0..1
  switch (type) {
    case 'sine':     return Math.sin(phase);
    case 'square':   return Math.sin(phase) >= 0 ? 1 : -1;
    case 'sawtooth': return 2 * p - 1;
    case 'triangle': return 4 * Math.abs(p - 0.5) - 1;
    default:         return Math.sin(phase);
  }
}

// One oscillator note → additively mixed into `buf`.
function tone(buf, t, o) {
  const { f0, f1 = f0, type = 'square', dur = 0.15, a = 0.004, peak = 0.5,
          vibHz = 0, vibDepth = 0 } = o;
  const i0 = Math.floor(t * SR);
  const i1 = Math.ceil((t + dur + TAIL) * SR);
  let phase = 0;
  for (let i = i0; i < i1 && i < buf.length; i++) {
    const x = i / SR;
    const rel = x - t;
    // frequency (exponential ramp, then hold) + vibrato
    let f = (f1 === f0 || rel >= dur) ? (rel >= dur ? f1 : f0)
                                      : expRamp(x, t, t + dur, f0, f1);
    if (vibHz > 0) f += vibDepth * Math.sin(TWO_PI * vibHz * rel);
    phase += TWO_PI * Math.max(1, f) / SR;
    // gain envelope: lin attack → exp decay
    let g;
    if (rel < 0) g = 0;
    else if (rel <= a) g = linRamp(x, t, t + a, FLOOR, peak);
    else if (rel <= dur) g = expRamp(x, t + a, t + dur, peak, FLOOR);
    else g = 0;
    buf[i] += wave(type, phase) * g;
  }
}

// Filtered white-noise burst (RBJ biquad, time-varying cutoff).
function noise(buf, t, o) {
  const { dur = 0.2, type = 'lowpass', f0 = 2000, f1 = f0, q = 1, peak = 0.5 } = o;
  const i0 = Math.floor(t * SR);
  const i1 = Math.ceil((t + dur + TAIL) * SR);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = i0; i < i1 && i < buf.length; i++) {
    const x = i / SR;
    const rel = x - t;
    const fc = (f1 === f0) ? f0 : expRamp(x, t, t + dur, f0, f1);
    // RBJ cookbook coefficients
    const w0 = TWO_PI * Math.max(1, fc) / SR;
    const cos = Math.cos(w0), sin = Math.sin(w0);
    const alpha = sin / (2 * q);
    let b0, b1, b2;
    const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    if (type === 'highpass')      { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
    else if (type === 'bandpass') { b0 = alpha;          b1 = 0;          b2 = -alpha; }
    else                          { b0 = (1 - cos) / 2; b1 = 1 - cos;    b2 = (1 - cos) / 2; } // lowpass
    const input = rel >= 0 && rel <= dur ? Math.random() * 2 - 1 : 0;
    const out = (b0 / a0) * input + (b1 / a0) * x1 + (b2 / a0) * x2
              - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = input; y2 = y1; y1 = out;
    let g = 0;
    if (rel >= 0 && rel <= dur) g = expRamp(x, t, t + dur, peak, FLOOR);
    buf[i] += out * g;
  }
}

function arp(buf, t, notes, o = {}) {
  const { step = 0.075, type = 'triangle', dur = 0.12, peak = 0.42 } = o;
  notes.forEach((f, i) => tone(buf, t + i * step, { f0: f, type, dur, peak }));
}

// ── Selected sounds (event → builder, total duration). Mirrors GEN picks. ──
const BUILD = {
  attack_melee: [0.16, (b) => { noise(b,0,{dur:0.09,type:'highpass',f0:1800,f1:5000,peak:0.25}); tone(b,0,{f0:880,f1:200,type:'square',dur:0.12,peak:0.4}); }],
  attack_ranged:[0.22, (b) => { tone(b,0,{f0:380,f1:1700,type:'triangle',dur:0.16,peak:0.32}); noise(b,0.1,{dur:0.1,type:'highpass',f0:4000,peak:0.18}); }],
  enemy_down:   [0.42, (b) => { tone(b,0,{f0:600,f1:70,type:'square',dur:0.36,peak:0.36}); noise(b,0.28,{dur:0.12,type:'lowpass',f0:1200,f1:200,peak:0.3}); }],
  dice_roll:    [0.42, (b) => { for(let i=0;i<7;i++) noise(b,i*0.05,{dur:0.03,type:'bandpass',f0:2600,q:4,peak:0.6}); }],
  heal:         [0.55, (b) => arp(b,0,[523,659,784,1047],{step:0.09,type:'sine',dur:0.24,peak:0.4})],
  skill_success:[0.26, (b) => arp(b,0,[660,990],{step:0.1,type:'square',dur:0.14,peak:0.34})],
  fail:         [0.32, (b) => tone(b,0,{f0:200,type:'square',dur:0.3,peak:0.32,vibHz:18,vibDepth:14})],
  jump:         [0.16, (b) => tone(b,0,{f0:200,f1:520,type:'sine',dur:0.14,peak:0.8})],
  ui_click:     [0.05, (b) => tone(b,0,{f0:1600,type:'sine',dur:0.035,peak:0.3})],
  victory:      [0.62, (b) => { arp(b,0,[523,659,784,1047],{step:0.1,type:'square',dur:0.18,peak:0.3}); arp(b,0,[392,523,659,784],{step:0.1,type:'triangle',dur:0.18,peak:0.2}); }],
  defeat:       [0.74, (b) => arp(b,0,[440,349,294,220],{step:0.16,type:'square',dur:0.26,peak:0.34})],
  unlock:       [0.52, (b) => { tone(b,0,{f0:784,type:'triangle',dur:0.5,peak:0.26}); tone(b,0,{f0:988,type:'triangle',dur:0.5,peak:0.22}); tone(b,0,{f0:1319,type:'triangle',dur:0.5,peak:0.2}); noise(b,0,{dur:0.5,type:'highpass',f0:3000,f1:8000,peak:0.12}); }],
  chat_ping:    [0.12, (b) => tone(b,0,{f0:1320,f1:1500,type:'sine',dur:0.1,peak:0.3})],
};

// ── master soft-limit + 16-bit WAV writer ──
function toWav(buf) {
  const n = buf.length;
  const ab = Buffer.alloc(44 + n * 2);
  ab.write('RIFF', 0); ab.writeUInt32LE(36 + n * 2, 4); ab.write('WAVE', 8);
  ab.write('fmt ', 12); ab.writeUInt32LE(16, 16); ab.writeUInt16LE(1, 20);
  ab.writeUInt16LE(1, 22); ab.writeUInt32LE(SR, 24); ab.writeUInt32LE(SR * 2, 28);
  ab.writeUInt16LE(2, 32); ab.writeUInt16LE(16, 34);
  ab.write('data', 36); ab.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let s = Math.tanh(buf[i] * 0.85);          // gentle limiter ≈ master compressor
    s = Math.max(-1, Math.min(1, s));
    ab.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return ab;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'Assets', 'audio', 'sfx');
mkdirSync(OUT, { recursive: true });

for (const [name, [dur, build]] of Object.entries(BUILD)) {
  const buf = new Float32Array(Math.ceil((dur + TAIL) * SR));
  build(buf);
  writeFileSync(join(OUT, `${name}.wav`), toWav(buf));
  console.log(`✓ ${name}.wav  (${(dur).toFixed(2)}s)`);
}
console.log(`\nDone → ${OUT}`);
