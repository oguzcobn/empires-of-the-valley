import { getSharedAudioContext } from './audio';
/**
 * City soundscape synthesised with Web Audio (no audio files): traffic hum that follows the
 * number of cars, wind, rain, birdsong by day, crickets on warm nights and a siren while an
 * emergency vehicle is out. Silent when muted, at volume 0 or before the first user gesture
 * (browsers only allow audio after one).
 */

export interface AmbienceState {
  /** 0 day .. 1 night. */
  night: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  weather: 'clear' | 'overcast' | 'rain' | 'snow' | string;
  /** Moving vehicles on screen (ambient and journeys). */
  traffic: number;
  /** An ambulance, patrol car or fire engine is driving with lights on. */
  siren: boolean;
  /** Game paused or the tab is in the background. */
  paused: boolean;
}

const KEY = 'eov-ambience-volume-v1';
let volume = 45;
let muted = false;

export function getAmbienceVolume(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null && Number.isFinite(Number(raw))) volume = Math.max(0, Math.min(100, Math.round(Number(raw))));
  } catch {
    /* blocked storage keeps the default */
  }
  return volume;
}

export function setAmbienceVolume(next: number): void {
  if (!Number.isFinite(next)) return;
  volume = Math.max(0, Math.min(100, Math.round(next)));
  try {
    localStorage.setItem(KEY, String(volume));
  } catch {
    /* harmless */
  }
}

export const setAmbienceMuted = (value: boolean): void => {
  muted = value;
};

/** Target loudness (0..1) of each layer for a city state; shared with the tests. */
export function ambienceMix(s: AmbienceState): { hum: number; wind: number; rain: number; birds: number; crickets: number; siren: number } {
  const day = 1 - s.night;
  const warm = s.season === 'summer' || s.season === 'spring';
  return {
    hum: Math.min(1, s.traffic / 14) * (0.35 + 0.65 * day),
    wind: s.season === 'winter' || s.weather === 'snow' ? 0.6 : s.weather === 'overcast' ? 0.4 : 0.2,
    rain: s.weather === 'rain' ? 1 : 0,
    birds: s.season !== 'winter' && s.weather !== 'rain' ? Math.max(0, day - 0.2) : 0,
    crickets: warm && s.weather !== 'rain' ? Math.max(0, s.night - 0.4) * 1.6 : 0,
    siren: s.siren ? 1 : 0,
  };
}

type Layer = { gain: GainNode };

class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: Record<'hum' | 'wind' | 'rain' | 'siren', Layer> | null = null;
  private nextChirp = 0;
  private nextCricket = 0;
  private unlocked = false;

  /** Call from a user gesture (click, key, touch) so the browser lets audio start. */
  unlock(): void {
    this.unlocked = true;
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private noise(ctx: AudioContext, brown: boolean): AudioBufferSourceNode {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = brown ? (last + 0.02 * white) / 1.02 : white;
      data[i] = brown ? last * 3.5 : white;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private build(): void {
    const ctx = (this.ctx = getSharedAudioContext());
    const master = (this.master = ctx.createGain());
    master.gain.value = 0;
    master.connect(ctx.destination);
    const layer = (src: AudioNode, filter: BiquadFilterType, freq: number, q = 0.7): Layer => {
      const f = ctx.createBiquadFilter();
      f.type = filter;
      f.frequency.value = freq;
      f.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(master);
      return { gain };
    };
    const brown = this.noise(ctx, true);
    const white = this.noise(ctx, false);
    const hum = layer(brown, 'lowpass', 260);
    const wind = layer(brown, 'bandpass', 520, 0.4);
    const rain = layer(white, 'highpass', 1400);
    // two-tone siren: an oscillator swept by a slow LFO
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 760;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    const depth = ctx.createGain();
    depth.gain.value = 240;
    lfo.connect(depth).connect(osc.frequency);
    const siren = layer(osc, 'lowpass', 1800);
    brown.start();
    white.start();
    osc.start();
    lfo.start();
    this.layers = { hum, wind, rain, siren };
  }

  private chirp(t: number, loud: number): void {
    const ctx = this.ctx!;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1800;
    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const at = t + i * (0.07 + Math.random() * 0.05);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (1 + Math.random() * 0.3), at);
      osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.5), at + 0.06);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05 * loud, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + 0.09);
    }
  }

  private cricket(t: number, loud: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 4300 + Math.random() * 500;
    g.gain.value = 0;
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.012 * loud, at + 0.004);
      g.gain.linearRampToValueAtTime(0.0001, at + 0.025);
    }
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /** Eases every layer towards the city's current state. Cheap; call a few times a second. */
  update(s: AmbienceState): void {
    const silent = muted || volume === 0 || s.paused || !this.unlocked;
    if (silent && !this.ctx) return;
    try {
      if (!this.ctx) this.build();
      const ctx = this.ctx!;
      const t = ctx.currentTime;
      if (silent) {
        this.master!.gain.setTargetAtTime(0, t, 0.15);
        if (ctx.state === 'running' && (s.paused || muted || volume === 0)) void ctx.suspend();
        return;
      }
      if (ctx.state === 'suspended' && this.unlocked) void ctx.resume();
      this.master!.gain.setTargetAtTime((volume / 100) * 0.5, t, 0.2);
      const mix = ambienceMix(s);
      const L = this.layers!;
      L.hum.gain.gain.setTargetAtTime(mix.hum * 0.22, t, 1.2);
      L.wind.gain.gain.setTargetAtTime(mix.wind * 0.12, t, 2);
      L.rain.gain.gain.setTargetAtTime(mix.rain * 0.16, t, 1.5);
      L.siren.gain.gain.setTargetAtTime(mix.siren * 0.035, t, 0.4);
      if (mix.birds > 0.05 && t >= this.nextChirp) {
        this.chirp(t + 0.05, mix.birds);
        this.nextChirp = t + 0.8 + Math.random() * 3.5 / mix.birds;
      }
      if (mix.crickets > 0.05 && t >= this.nextCricket) {
        this.cricket(t + 0.05, Math.min(1, mix.crickets));
        this.nextCricket = t + 0.4 + Math.random() * 0.9;
      }
    } catch {
      /* audio unavailable: stay silent */
    }
  }
}

export const ambience = new Ambience();
