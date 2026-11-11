/** Tiny synthesized UI sounds (Web Audio). No audio files; fully silent when muted. */
export type Sfx = 'click' | 'place' | 'error' | 'complete' | 'quest';

let ctx: AudioContext | null = null;
let muted = false;

export const setMuted = (value: boolean): void => {
  muted = value;
};

const NOTES: Record<Sfx, [number, number, OscillatorType][]> = {
  click: [[520, 0.04, 'triangle']],
  place: [
    [300, 0.06, 'square'],
    [420, 0.08, 'triangle'],
  ],
  error: [[160, 0.14, 'sawtooth']],
  complete: [
    [523, 0.09, 'triangle'],
    [659, 0.12, 'triangle'],
  ],
  quest: [
    [523, 0.1, 'triangle'],
    [659, 0.1, 'triangle'],
    [784, 0.18, 'triangle'],
  ],
};

export function playSfx(name: Sfx): void {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    let t = ctx.currentTime;
    for (const [freq, dur, type] of NOTES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      t += dur * 0.8;
    }
  } catch {
    /* audio unavailable: stay silent */
  }
}
