import { describe, expect, it } from 'vitest';
import { ambience, ambienceMix, getAmbienceVolume, setAmbienceVolume } from '../app/ambience';

const base = { night: 0, season: 'summer' as const, weather: 'clear', traffic: 7, siren: false, paused: false };

describe('city soundscape', () => {
  it('mixes birds by day, crickets on warm nights, rain and traffic', () => {
    expect(ambienceMix(base).birds).toBeGreaterThan(0.5);
    expect(ambienceMix(base).crickets).toBe(0);
    const night = ambienceMix({ ...base, night: 1 });
    expect(night.birds).toBe(0);
    expect(night.crickets).toBeGreaterThan(0.5);
    expect(ambienceMix({ ...base, night: 1, season: 'winter' }).crickets).toBe(0);
    expect(ambienceMix({ ...base, weather: 'rain' }).rain).toBe(1);
    expect(ambienceMix({ ...base, traffic: 14 }).hum).toBeGreaterThan(ambienceMix({ ...base, traffic: 2 }).hum);
    expect(ambienceMix({ ...base, siren: true }).siren).toBe(1);
  });

  it('keeps its volume in range and stays silent without Web Audio', () => {
    setAmbienceVolume(150);
    expect(getAmbienceVolume()).toBe(100);
    setAmbienceVolume(-5);
    expect(getAmbienceVolume()).toBe(0);
    setAmbienceVolume(45);
    // node has no AudioContext: update must not throw, before or after a gesture
    expect(() => ambience.update(base)).not.toThrow();
    ambience.unlock();
    expect(() => ambience.update(base)).not.toThrow();
  });
});
