import { describe, expect, it } from 'vitest';
import { OceanSpectrum } from './ocean';

describe('FFT water', () => {
  it('preserves zero mean, requested RMS and normalized finite normals at multiple phases', () => {
    const water = new OceanSpectrum(458, .16);
    for (const t of [0, .175, 451.8]) {
      water.update(t);
      const n = water.heights.length;
      expect(water.heights.reduce((s, h) => s + h, 0) / n).toBeCloseTo(0, 12);
      expect(Math.sqrt(water.heights.reduce((s, h) => s + h * h, 0) / n)).toBeCloseTo(.16, 10);
      for (let i = 0; i < n; i++) expect(Math.hypot(...water.normals.subarray(3*i, 3*i+3))).toBeCloseTo(1, 6);
    }
  });
  it('reconstructs the same field for a given time, independent of the render cadence', () => {
    const water = new OceanSpectrum();
    const first = water.heights.slice();
    water.update(5);
    expect(water.heights).not.toEqual(first);
    water.update(0);
    expect(water.heights).toEqual(first);
  });
});
