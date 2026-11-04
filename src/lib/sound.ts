import { useSettings } from '../stores/settings';

// Tiny WebAudio synth: no audio assets to download, everything respects the mute/volume setting.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.2) {
  const { muted, volume } = useSettings.getState();
  const a = audio();
  if (!a || muted || volume <= 0) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain * volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(start: number, dur: number, gain = 0.15) {
  const { muted, volume } = useSettings.getState();
  const a = audio();
  if (!a || muted || volume <= 0) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = gain * volume;
  src.buffer = buf;
  src.connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

export const sfx = {
  dice() {
    for (let i = 0; i < 6; i++) noise(i * 0.07, 0.05, 0.12);
  },
  step() {
    tone(660, 0, 0.06, 'triangle', 0.08);
  },
  buy() {
    [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle', 0.15));
  },
  cash() {
    tone(1318, 0, 0.12, 'square', 0.06);
    tone(1760, 0.07, 0.18, 'square', 0.06);
  },
  build() {
    noise(0, 0.08, 0.2);
    tone(196, 0, 0.18, 'sawtooth', 0.08);
    tone(196, 0.16, 0.18, 'sawtooth', 0.08);
  },
  jail() {
    tone(220, 0, 0.3, 'sawtooth', 0.1);
    tone(165, 0.2, 0.45, 'sawtooth', 0.1);
  },
  card() {
    tone(880, 0, 0.1, 'sine', 0.1);
    tone(1175, 0.06, 0.16, 'sine', 0.1);
  },
  turn() {
    tone(784, 0, 0.12, 'sine', 0.12);
    tone(1047, 0.1, 0.2, 'sine', 0.12);
  },
  pop() {
    tone(990, 0, 0.08, 'sine', 0.08);
  },
  victory() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => tone(f, i * 0.14, 0.32, 'triangle', 0.14));
  },
};
