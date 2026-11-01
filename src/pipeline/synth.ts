import fs from "node:fs/promises";
import type { AdScript, Energy, Score } from "./types";

// A small offline synthesizer that plays the composer's score: pads, bass, drums, arp,
// risers and crashes, with kick sidechain so it pumps like a produced track.
const SR = 44100;
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Record<string, number[]> = {
  "": [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], "7": [0, 4, 7, 10],
  sus2: [0, 2, 7], sus4: [0, 5, 7], add9: [0, 4, 7, 14],
};

function parseChord(name: string) {
  const m = name.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return { root: 9, intervals: QUALITY.m };
  const root = (NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  return { root, intervals: QUALITY[m[3]] ?? QUALITY[""] };
}

// Keep pad chords between A3 and G#4 so the voicing stays in one register.
const padBase = (root: number) => 57 + ((root - 9 + 12) % 12);

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function renderMusic(script: AdScript, score: Score, outFile: string) {
  const beatSec = 60 / script.bpm;
  const stepSec = beatSec / 4;
  const totalBeats = script.shots.reduce((n, s) => n + s.beats, 0);
  const steps = totalBeats * 4;
  const tailSec = 2.5;
  const length = Math.ceil((totalBeats * beatSec + tailSec) * SR);
  const noise = rng(7);

  const drums = new Float32Array(length);
  const bass = new Float32Array(length);
  const pad = new Float32Array(length);
  const arp = new Float32Array(length);
  const duck = new Float32Array(length).fill(1);

  // Energy for every 16th step, taken from the shot it falls in.
  const energyAt: Energy[] = [];
  for (const shot of script.shots) for (let i = 0; i < shot.beats * 4; i++) energyAt.push(shot.energy);
  const chords = score.progression.map(parseChord);
  const chordAt = (step: number) => chords[Math.floor(step / 16) % chords.length];

  const at = (sec: number) => Math.floor(sec * SR);

  const { kit, lead, pad: padTone, swing } = score.sound;
  const lowpassCoef = (hz: number) => 1 - Math.exp((-2 * Math.PI * hz) / SR);

  // Kick: a pitch-dropping sine. 808 is long and deep, soft is gentle, punchy is tight.
  const kick = (t0: number) => {
    const shape = {
      punchy: { from: 115, to: 45, decay: 0.3, gain: 0.95, click: 0.15 },
      "808": { from: 90, to: 38, decay: 0.85, gain: 1, click: 0.08 },
      soft: { from: 70, to: 48, decay: 0.2, gain: 0.7, click: 0.03 },
      lofi: { from: 80, to: 46, decay: 0.25, gain: 0.8, click: 0.05 },
    }[kit];
    let phase = 0;
    const start = at(t0);
    for (let i = 0; i < at(shape.decay * 3) && start + i < length; i++) {
      const t = i / SR;
      phase += (shape.to + shape.from * Math.exp(-t / 0.03)) / SR;
      let v = Math.sin(2 * Math.PI * phase) * Math.exp(-t / shape.decay) * shape.gain;
      if (kit === "808") v = Math.tanh(v * 1.6) * 0.8;
      drums[start + i] += v;
      if (i < 90) drums[start + i] += (noise() * 2 - 1) * shape.click * (1 - i / 90);
      duck[start + i] = Math.min(duck[start + i], 1 - (kit === "soft" ? 0.35 : 0.65) * Math.exp(-t / 0.13));
    }
  };

  // Snare voice per kit: snare (punchy), clap (808), rimshot (soft), muffled snare (lofi).
  const snare = (t0: number) => {
    const start = at(t0);
    let prev = 0;
    let lp = 0;
    for (let i = 0; i < at(0.35) && start + i < length; i++) {
      const t = i / SR;
      const n = noise() * 2 - 1;
      let v = 0;
      if (kit === "punchy") v = (n - prev) * 0.32 * Math.exp(-t / 0.11) + Math.sin(2 * Math.PI * 190 * t) * 0.28 * Math.exp(-t / 0.05);
      if (kit === "808") {
        const burst = [0, 0.011, 0.022].reduce((sum, o) => sum + (t >= o ? Math.exp(-(t - o) / (o === 0.022 ? 0.1 : 0.008)) : 0), 0);
        v = (n - prev) * 0.3 * burst;
      }
      if (kit === "soft") v = Math.sin(2 * Math.PI * 420 * t) * 0.22 * Math.exp(-t / 0.018) + (n - prev) * 0.1 * Math.exp(-t / 0.03);
      if (kit === "lofi") {
        lp += lowpassCoef(2200) * (n - lp);
        v = lp * 0.4 * Math.exp(-t / 0.13) + Math.sin(2 * Math.PI * 180 * t) * 0.2 * Math.exp(-t / 0.06);
      }
      drums[start + i] += v;
      prev = n;
    }
  };

  // Hats: bright ticks for electronic kits, a softer shaker for soft and lofi.
  const hat = (t0: number, open: boolean) => {
    const start = at(t0);
    let p1 = 0;
    let p2 = 0;
    const shaker = kit === "soft" || kit === "lofi";
    const decay = open ? 0.14 : shaker ? 0.05 : 0.03;
    const gain = shaker ? 0.045 : kit === "808" ? 0.06 : 0.07;
    for (let i = 0; i < at(decay * 5) && start + i < length; i++) {
      const n = noise() * 2 - 1;
      const hp = n - 2 * p1 + p2; // second difference: a cheap steep high-pass
      p2 = p1;
      p1 = n;
      const env = shaker ? Math.min(1, i / (SR * 0.008)) * Math.exp(-(i / SR) / decay) : Math.exp(-(i / SR) / decay);
      drums[start + i] += hp * gain * env;
    }
  };

  const crash = (t0: number) => {
    const start = at(t0);
    let prev = 0;
    const gain = kit === "soft" ? 0.08 : 0.16;
    for (let i = 0; i < at(2.2) && start + i < length; i++) {
      const n = noise() * 2 - 1;
      drums[start + i] += (n - prev) * gain * Math.exp(-(i / SR) / 0.7);
      prev = n;
    }
  };

  const riser = (t0: number, dur: number) => {
    const start = at(t0);
    const n = at(dur);
    let lp = 0;
    for (let i = 0; i < n && start + i < length; i++) {
      const p = i / n;
      lp += (0.02 + 0.5 * p * p) * (noise() * 2 - 1 - lp); // filter opens as it rises
      drums[start + i] += lp * (kit === "soft" ? 0.12 : 0.22) * p * p;
    }
  };

  // Bass: saw plus sine sub through a low-pass, held until the next bass hit. 808 kits use a gliding sine.
  const bassNote = (t0: number, dur: number, midi: number) => {
    const start = at(t0);
    const n = at(dur);
    const f = freq(midi);
    let lp = 0;
    const a = lowpassCoef(kit === "lofi" ? 220 : 320);
    for (let i = 0; i < n && start + i < length; i++) {
      const t = i / SR;
      const env = Math.min(1, t / 0.005) * (0.7 + 0.3 * Math.exp(-t / 0.08)) * Math.min(1, (n - i) / (SR * 0.03));
      if (kit === "808") {
        bass[start + i] += Math.tanh(Math.sin(2 * Math.PI * f * t) * 1.8) * env * 0.38;
        continue;
      }
      lp += a * (2 * ((f * t) % 1) - 1 - lp);
      bass[start + i] += (lp * 0.6 + Math.sin(2 * Math.PI * f * t) * 0.5) * env * 0.4;
    }
  };

  // Pads: warm detuned saws, airy triangles an octave up, or dark low-passed saws with a sub.
  const padChord = (t0: number, dur: number, midis: number[], energy: Energy) => {
    const start = at(t0);
    const n = at(dur + 0.5);
    const cutoff = { warm: 500 + 1800 * score.padBrightness, airy: 1500 + 3000 * score.padBrightness, dark: 300 + 700 * score.padBrightness }[padTone] + 450 * energy;
    const a = lowpassCoef(cutoff);
    const attack = padTone === "airy" ? 0.6 : 0.35;
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < n && start + i < length; i++) {
      const t = i / SR;
      let s = 0;
      for (const m of midis) {
        const f = freq(padTone === "airy" ? m + 12 : m);
        if (padTone === "airy") {
          s += (4 * Math.abs(((f * 1.003 * t) % 1) - 0.5) - 1) + Math.sin(2 * Math.PI * f * 0.997 * t);
        } else {
          s += 2 * ((f * 1.004 * t) % 1) - 1 + 2 * ((f * 0.996 * t) % 1) - 1;
        }
      }
      if (padTone === "dark") s += Math.sin(2 * Math.PI * freq(midis[0] - 12) * t) * 1.2;
      lp += a * (s - lp);
      lp2 += a * (lp - lp2);
      const env = Math.min(1, t / attack) * Math.min(1, Math.max(0, (n - i) / (SR * 0.5)));
      pad[start + i] += lp2 * env * (padTone === "airy" ? 0.05 : 0.045);
    }
  };

  // The lead voice that plays the arpeggio.
  const leadNote = (t0: number, midi: number) => {
    const start = at(t0);
    const f = freq(midi);
    const len = { pluck: 0.35, piano: 1.1, bell: 1.4, saw: 0.3 }[lead];
    let lp = 0;
    for (let i = 0; i < at(len) && start + i < length; i++) {
      const t = i / SR;
      let v = 0;
      if (lead === "pluck") v = (4 * Math.abs(((f * t) % 1) - 0.5) - 1) * Math.exp(-t / 0.11) * 0.11;
      if (lead === "piano") {
        // A few decaying harmonics with a soft hammer attack.
        v = [1, 0.5, 0.28, 0.14].reduce((sum, amp, h) => sum + amp * Math.sin(2 * Math.PI * f * (h + 1) * t) * Math.exp(-t / (0.5 / (h + 1))), 0);
        v *= Math.min(1, t / 0.004) * 0.07;
      }
      if (lead === "bell") v = Math.sin(2 * Math.PI * f * t + 2.2 * Math.exp(-t / 0.25) * Math.sin(2 * Math.PI * f * 3.5 * t)) * Math.exp(-t / 0.5) * 0.075;
      if (lead === "saw") {
        lp += lowpassCoef(1800 + 2500 * Math.exp(-t / 0.08)) * (2 * ((f * t) % 1) - 1 - lp);
        v = lp * Math.exp(-t / 0.12) * 0.08;
      }
      arp[start + i] += v;
    }
  };

  for (let step = 0; step < steps; step++) {
    // Swing pushes every off-beat 16th late, which is what gives lofi and hip-hop their bounce.
    const t = step * stepSec + (step % 2 === 1 ? swing * stepSec : 0);
    const e = energyAt[step] ?? 1;
    const p = score.patterns[String(e) as "0"];
    const s = step % 16;
    const chord = chordAt(step);

    if (s === 0) {
      const tones = chord.intervals.map((iv) => padBase(chord.root) + iv);
      padChord(step * stepSec, 16 * stepSec, tones, e);
    }
    if (p.kick[s] === "x") kick(t);
    if (p.snare[s] === "x") snare(t);
    if (p.hat[s] === "x") hat(t, e >= 3 && s % 4 === 2);
    if (p.bass[s] === "x") {
      let len = 1;
      while (len < 8 && s + len < 16 && p.bass[s + len] !== "x") len++;
      bassNote(t, len * stepSec * 0.92, 36 + chord.root);
    }
    // Piano and bell ring longer, so they play 8ths instead of 16ths to stay uncluttered.
    const arpEvery = lead === "piano" || lead === "bell" ? 2 : 1;
    if (p.arp && e >= 2 && step % arpEvery === 0) {
      const tones = chord.intervals.map((iv) => 72 + chord.root + iv);
      const k = step / arpEvery;
      leadNote(t, tones[k % tones.length] + (Math.floor(k / tones.length) % 2) * 12);
    }

    // Build into every rise to high energy, and land it with a crash.
    const next = energyAt[step + 16];
    if (s === 0 && next !== undefined && next >= 2 && next > e) riser(step * stepSec, 16 * stepSec);
    if (step > 0 && e >= 2 && e > (energyAt[step - 1] ?? 0)) crash(t);
  }

  // Lofi gets a little vinyl crackle under everything.
  if (kit === "lofi") {
    for (let i = 0; i < length; i++) if (noise() < 0.0004) drums[i] += (noise() * 2 - 1) * 0.12;
  }

  // Final chord rings out over the tail.
  const last = chordAt(steps - 1);
  padChord(steps * stepSec, tailSec - 0.5, last.intervals.map((iv) => padBase(last.root) + iv), 1);
  crash(steps * stepSec);

  // Dotted-eighth echo on the arp for width.
  const delay = at(stepSec * 3);
  for (let i = delay; i < length; i++) arp[i] += arp[i - delay] * 0.35;

  const mix = new Float32Array(length);
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const x = drums[i] + (bass[i] + pad[i]) * duck[i] + arp[i] * (0.6 + 0.4 * duck[i]);
    mix[i] = Math.tanh(x * 1.3);
    peak = Math.max(peak, Math.abs(mix[i]));
  }
  const gain = peak > 0 ? 0.89 / peak : 1;
  const fadeStart = length - at(1.5);
  for (let i = 0; i < length; i++) mix[i] *= gain * (i > fadeStart ? (length - i) / (length - fadeStart) : 1);

  await fs.writeFile(outFile, toWav(mix));
  return { durationMs: (length / SR) * 1000 };
}

function toWav(samples: Float32Array) {
  const channels = 2;
  const data = Buffer.alloc(samples.length * 2 * channels);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i])) * 32767;
    data.writeInt16LE(v | 0, i * 4);
    data.writeInt16LE(v | 0, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
