import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSfxVolume, setSfxVolume } from '../app/audio';

const originalStorage = globalThis.localStorage;

afterEach(() => {
  vi.stubGlobal('localStorage', originalStorage);
  setSfxVolume(60);
  vi.unstubAllGlobals();
});

describe('sound effect volume', () => {
  it('clamps volume and saves it without changing game saves', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    setSfxVolume(135);
    expect(getSfxVolume()).toBe(100);
    setSfxVolume(-10);
    expect(getSfxVolume()).toBe(0);
    setSfxVolume(35);
    expect(values.get('eov-sfx-volume-v1')).toBe('35');
  });

  it('survives blocked local storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    setSfxVolume(45);
    expect(getSfxVolume()).toBe(45);
  });
});
