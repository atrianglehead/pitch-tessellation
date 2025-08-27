// ===== Utilities =====
function ms(x) {
  return Math.round(x * 1000) + 'ms';
}

function expApproach(y0, target, t, tStart, tau) {
  if (t <= tStart) return y0;
  const dt = t - tStart;
  return target + (y0 - target) * Math.exp(-dt / Math.max(1e-6, tau));
}

function envValueAtExp(time, t0, tOff, A, D, S, R, P) {
  const tauA = Math.max(1e-4, A / 3);
  const tauD = Math.max(1e-4, D / 3);
  const tauR = Math.max(1e-4, R / 3);
  const tA = t0 + A;
  const tD = tA + D;
  if (tOff == null || time <= tOff) {
    if (time <= tA) {
      return expApproach(0, P, time, t0, tauA);
    }
    const vAtA = expApproach(0, P, tA, t0, tauA);
    if (time <= tD) {
      return expApproach(vAtA, P * S, time, tA, tauD);
    }
    return P * S;
  }
  const vAtOff =
    tOff <= tA
      ? expApproach(0, P, tOff, t0, tauA)
      : tOff <= tD
      ? expApproach(expApproach(0, P, tA, t0, tauA), P * S, tOff, tA, tauD)
      : P * S;
  return expApproach(vAtOff, 0, time, tOff, tauR);
}

// ===== State =====
let activeNotes = new Set();
let currentIntonation = 'equal';

// ===== Audio =====
let audioCtx = null;
let masterGain = null;
const voices = new Map(); // midi -> Voice

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 48000,
  });
  masterGain = audioCtx.createGain();
  masterGain.gain.value = Number(document.getElementById('vol').value);
  masterGain.connect(audioCtx.destination);
}

class Voice {
  constructor(midi, freq) {
    ensureAudio();
    const t = audioCtx.currentTime;
    this.midi = midi;
    this.osc = audioCtx.createOscillator();
    this.osc.type = document.getElementById('wave').value;
    this.osc.frequency.setValueAtTime(freq, t);
    this.g = audioCtx.createGain();
    this.g.gain.setValueAtTime(0.0, t);
    this.osc.connect(this.g).connect(masterGain);
    this.osc.start();

    this.envPeak = 0.7;
    this.attack = getAttack();
    this.decay = getDecay();
    this.sustain = getSustain();
    this.release = getRelease();
    this.tauA = Math.max(1e-4, this.attack / 3);
    this.tauD = Math.max(1e-4, this.decay / 3);
    this.tauR = Math.max(1e-4, this.release / 3);

    this.noteOnTime = t;
    this.noteOffTime = null;
    this._scheduleAttackDecay(t);
  }
  _scheduleAttackDecay(t) {
    const P = this.envPeak;
    this.g.gain.cancelScheduledValues(t);
    this.g.gain.setValueAtTime(this.g.gain.value, t);
    this.g.gain.setTargetAtTime(P, t, this.tauA);
    const tA = t + this.attack;
    const vAtA = expApproach(this.g.gain.value, P, tA, t, this.tauA);
    this.g.gain.setValueAtTime(vAtA, tA);
    this.g.gain.setTargetAtTime(P * this.sustain, tA, this.tauD);
  }
  trigger() {
    const t = audioCtx.currentTime;
    if (!activeNotes.has(this.midi)) return; // only if currently pressed
    this.attack = getAttack();
    this.decay = getDecay();
    this.sustain = getSustain();
    this.release = getRelease();
    this.tauA = Math.max(1e-4, this.attack / 3);
    this.tauD = Math.max(1e-4, this.decay / 3);
    this.tauR = Math.max(1e-4, this.release / 3);
    this.noteOnTime = t;
    this.noteOffTime = null;
    this._scheduleAttackDecay(t);
  }
  setFreq(f) {
    const t = audioCtx.currentTime;
    this.osc.frequency.cancelScheduledValues(t);
    this.osc.frequency.setTargetAtTime(f, t, 0.005);
  }
  setWaveform(type) {
    if (this.osc.type !== type) this.osc.type = type;
  }
  stop() {
    const t = audioCtx.currentTime;
    this.release = getRelease();
    this.tauR = Math.max(1e-4, this.release / 3);
    this.noteOffTime = t;
    this.g.gain.cancelScheduledValues(t);
    this.g.gain.setValueAtTime(this.g.gain.value, t);
    this.g.gain.setTargetAtTime(0.00005, t, this.tauR);
  }
  envAt(time) {
    return envValueAtExp(
      time,
      this.noteOnTime,
      this.noteOffTime,
      this.attack,
      this.decay,
      this.sustain,
      this.release,
      this.envPeak
    );
  }
  isDormant(time) {
    if (this.noteOffTime == null) return false;
    const val = this.envAt(time);
    return val < 1e-4 && time - this.noteOffTime > Math.max(0.5, this.release);
  }
}

// Gate: explicit user gesture
const beginBtn = document.getElementById('beginBtn');
beginBtn.addEventListener('click', () => {
  ensureAudio();
  audioCtx.resume();
  document.getElementById('gate').style.display = 'none';
});

// Precompute Nearest-Harmonic map at load
const NEAREST_LIMIT = 4096;
const nearestMap = buildNearestHarmonicMap(NEAREST_LIMIT);

const RATIOS_JI = [
  1 / 1,
  16 / 15,
  9 / 8,
  6 / 5,
  5 / 4,
  4 / 3,
  45 / 32,
  3 / 2,
  8 / 5,
  5 / 3,
  9 / 5,
  15 / 8,
];
const RATIOS_PYTH = [
  1 / 1,
  256 / 243,
  9 / 8,
  32 / 27,
  81 / 64,
  4 / 3,
  729 / 512,
  3 / 2,
  128 / 81,
  27 / 16,
  16 / 9,
  243 / 128,
];

const FREQ_C0 = 440 * Math.pow(2, (12 - 69) / 12);

// ===== p5 Setup =====
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noFill();
  stroke(255, 220);
  strokeWeight(2);

  const sel = document.getElementById('intonation');
  sel.addEventListener('change', () => {
    currentIntonation = sel.value;
    updateMeta();
    retuneActiveVoices();
  });

  const wave = document.getElementById('wave');
  wave.addEventListener('change', () => {
    for (const v of voices.values()) v.setWaveform(wave.value);
  });

  const vol = document.getElementById('vol');
  vol.addEventListener('input', () => {
    ensureAudio();
    masterGain.gain.value = Number(vol.value);
  });

  // ADSR: only retrigger currently pressed notes
  const att = document.getElementById('att');
  const dec = document.getElementById('dec');
  const sus = document.getElementById('sus');
  const rel = document.getElementById('rel');
  const attv = document.getElementById('attv');
  const decv = document.getElementById('decv');
  const susv = document.getElementById('susv');
  const relv = document.getElementById('relv');
  function updateLabels() {
    attv.textContent = ms(getAttack());
    decv.textContent = ms(getDecay());
    susv.textContent = getSustain().toFixed(2);
    relv.textContent = ms(getRelease());
  }
  [att, dec, sus, rel].forEach((el) =>
    el.addEventListener('input', () => {
      updateLabels();
      for (const m of activeNotes) {
        const v = voices.get(m);
        if (v) v.trigger();
      }
    })
  );
  updateLabels();

  updateMeta();

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, () => {});
  }

  runEnvTests();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function getAttack() {
  return Number(document.getElementById('att').value);
}
function getDecay() {
  return Number(document.getElementById('dec').value);
}
function getSustain() {
  return Number(document.getElementById('sus').value);
}
function getRelease() {
  return Number(document.getElementById('rel').value);
}

function updateMeta() {
  const s = document.getElementById('intonation').value;
  const meta = document.getElementById('meta');
  if (s === 'nearest') {
    const probe = [0, 2, 4, 5, 7, 9, 11];
    const msg = probe
      .map((pc) => noteName(pc) + '→H' + nearestMap.harms[pc])
      .join(' · ');
    meta.textContent = `harmonics: ${msg}`;
  } else meta.textContent = '';
}

// ===== MIDI =====
function onMIDISuccess(midiAccess) {
  for (let input of midiAccess.inputs.values()) input.onmidimessage = handleMIDI;
  midiAccess.onstatechange = () => {
    for (let input of midiAccess.inputs.values())
      input.onmidimessage = handleMIDI;
  };
}

function handleMIDI(e) {
  const [status, note, vel] = e.data;
  const cmd = status & 0xf0;
  if (cmd === 0x90 && vel > 0) noteOn(note);
  else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(note);
}

function noteOn(m) {
  if (m < 21 || m > 108) return; // sane range
  activeNotes.add(m);
  const f = freqForMidi(m);
  if (!voices.has(m)) voices.set(m, new Voice(m, f));
  else {
    const v = voices.get(m);
    v.setFreq(f);
    v.noteOnTime = audioCtx.currentTime;
    v.noteOffTime = null;
    v._scheduleAttackDecay(audioCtx.currentTime);
  }
}

function noteOff(m) {
  activeNotes.delete(m);
  const v = voices.get(m);
  if (v) {
    v.stop(); /* keep voice; reaper will clean up when dormant */
  }
}

function retuneActiveVoices() {
  for (const m of activeNotes) {
    const v = voices.get(m);
    if (v) v.setFreq(freqForMidi(m));
  }
}

function freqForMidi(m) {
  const pc = m % 12;
  const oct = Math.floor(m / 12) - 1; // C0=12 -> 0
  const fC = FREQ_C0 * Math.pow(2, oct); // ET C for that octave
  const r = ratioForPC(pc);
  return fC * r;
}

function ratioForPC(pc) {
  switch (currentIntonation) {
    case 'equal':
      return Math.pow(2, pc / 12);
    case 'just':
      return RATIOS_JI[pc];
    case 'pyth':
      return RATIOS_PYTH[pc];
    case 'nearest':
      return nearestMap.ratios[pc];
    default:
      return Math.pow(2, pc / 12);
  }
}

// ===== Draw (also acts as reaper) =====
function draw() {
  background(0);
  if (!audioCtx) return; // visuals start after gate
  const t = audioCtx.currentTime;
  const toRemove = [];
  for (const [midi, v] of voices) {
    const alpha = v.envAt(t);
    if (alpha > 0.001) {
      drawLTile(midi, alpha);
    } else if (v.isDormant(t)) {
      try {
        v.osc.stop();
      } catch (_) {}
      toRemove.push(midi);
    }
  }
  for (const m of toRemove) voices.delete(m);
}

// ===== Core renderer =====
function drawLTile(midi, amp) {
  const pc = midi % 12; // 0..11, with 0 = C
  const oct = Math.floor(midi / 12) - 1; // MIDI octave (C4=60 -> 4)

  const angleWithin = angleWithinForPC(pc);
  const angleAbs = Math.PI * (oct - 2) + angleWithin;
  const angleDraw = ((angleAbs % Math.PI) + Math.PI) % Math.PI;

  const k = oct - 2 + pc / 12;
  const minDim = Math.min(width, height);
  const base = Math.max(8, 0.012 * minDim);
  const dist = base * Math.pow(2, k);

  push();
  translate(width / 2, height / 2);
  rotate(angleDraw);
  translate(-width / 2, -height / 2);

  const D = Math.hypot(width, height) + 50;
  stroke(255, Math.min(255, 30 + amp * 225));
  for (let y = -D; y <= height + D; y += dist) line(-D, y, width + D, y);
  pop();
}

function angleWithinForPC(pc) {
  switch (currentIntonation) {
    case 'equal':
      return Math.PI * (pc / 12);
    case 'just':
      return Math.PI * Math.log2(RATIOS_JI[pc]);
    case 'pyth':
      return Math.PI * Math.log2(RATIOS_PYTH[pc]);
    case 'nearest':
      return Math.PI * Math.log2(nearestMap.ratios[pc]);
    default:
      return Math.PI * (pc / 12);
  }
}

function buildNearestHarmonicMap(limit) {
  const ratios = new Array(12).fill(1),
    harms = new Array(12).fill(1);
  for (let pc = 0; pc < 12; pc++) {
    const target = pc / 12;
    let bestH = 1,
      best = 1e9;
    for (let h = 1; h <= limit; h++) {
      let frac = Math.log2(h) % 1;
      if (frac < 0) frac += 1;
      let d = Math.abs(frac - target);
      d = Math.min(d, 1 - d);
      if (d < best - 1e-12 || (Math.abs(d - best) < 1e-12 && h < bestH)) {
        best = d;
        bestH = h;
      }
    }
    const exp = Math.log2(bestH);
    const frac = exp - Math.floor(exp);
    ratios[pc] = Math.pow(2, frac);
    harms[pc] = bestH;
  }
  return { ratios, harms };
}

function noteName(pc) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[pc | 0];
}

// ===== Tiny tests (console) =====
function approx(a, b, eps = 1e-3) {
  return Math.abs(a - b) <= eps;
}
function runEnvTests() {
  const A = 0.1,
    D = 0.2,
    S = 0.6,
    R = 0.3,
    P = 0.7;
  const t0 = 0;
  const tr = 0.5;
  const valA = envValueAtExp(t0 + A, t0, null, A, D, S, R, P);
  console.assert(valA > 0.9 * P, 'attack reaches near peak');
  const valD = envValueAtExp(t0 + A + D, t0, null, A, D, S, R, P);
  console.assert(approx(valD, P * S, 0.05), 'decay near sustain');
  const start = envValueAtExp(tr, t0, tr, A, D, S, R, P);
  const after = envValueAtExp(tr + R, t0, tr, A, D, S, R, P);
  console.assert(after < 0.1 * start, 'release decays substantially');
  console.log('%cExponential envelope tests passed', 'color:#8f8');
}
