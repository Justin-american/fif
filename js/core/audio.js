// audio.js — all sound effects synthesised at runtime with the Web Audio API.
// No audio files: kicks, whistles, crowd swells, posts and net are generated
// from oscillators + noise so the whole game ships as static text/JS only.

let ctx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let settingsRef = null;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  masterGain = ctx.createGain();
  sfxGain = ctx.createGain();
  musicGain = ctx.createGain();
  sfxGain.connect(masterGain);
  musicGain.connect(masterGain);
  masterGain.connect(ctx.destination);
  applyVolumes();
  return ctx;
}

export function initAudio(settings) {
  settingsRef = settings;
  ensureCtx();
  // Browsers require a user gesture to start audio; resume on first interaction.
  const resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('pointerdown', resume, { once: false });
  window.addEventListener('keydown', resume, { once: false });
}

export function applyVolumes() {
  if (!ctx || !settingsRef) return;
  masterGain.gain.value = settingsRef.masterVolume;
  sfxGain.gain.value = settingsRef.sfxVolume;
  musicGain.gain.value = settingsRef.musicVolume;
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function blip(freq, dur, type = 'sine', gain = 0.4, slideTo = null) {
  if (!ensureCtx()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function thud(intensity = 1) {
  if (!ensureCtx()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.08);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 240;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5 * intensity, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(bp); bp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.1);
}

export const sfx = {
  kick(power = 1) { thud(0.7 + power * 0.6); blip(180 + power * 90, 0.07, 'triangle', 0.25, 90); },
  pass() { thud(0.5); },
  trap() { thud(0.35); },
  post() { blip(1200, 0.18, 'square', 0.3, 600); },
  crossbar() { blip(900, 0.2, 'square', 0.3, 500); },
  net() { blip(70, 0.18, 'sine', 0.25); thud(0.4); },
  save() { thud(0.6); blip(300, 0.06, 'sine', 0.2); },
  whistleShort() { blip(2300, 0.16, 'sawtooth', 0.25, 2500); },
  whistleLong() { blip(2300, 0.5, 'sawtooth', 0.28, 2400); },
  whistleDouble() { this.whistleShort(); setTimeout(() => this.whistleShort(), 140); },
  card() { blip(520, 0.1, 'square', 0.2); },
  uiClick() { blip(660, 0.05, 'square', 0.18, 880); },
  goalHorn() {
    blip(330, 0.6, 'sawtooth', 0.3);
    setTimeout(() => blip(440, 0.7, 'sawtooth', 0.3), 120);
  },
};
