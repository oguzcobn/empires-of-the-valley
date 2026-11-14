import { describe, expect, it } from 'vitest';
import { smoothVehicleTurnOffset, vehicleLaneOffset } from '../game/rendering/trafficMath';

describe('traffic lane interpolation safety', () => {
  it.each([false, true])('keeps %s-side driving turns continuous', (leftSide) => {
    const incoming = vehicleLaneOffset(1, 0, leftSide);
    const outgoing = vehicleLaneOffset(0, 1, leftSide);
    expect(smoothVehicleTurnOffset(1, 0, 0, 1, 0, leftSide)).toEqual(incoming);
    expect(smoothVehicleTurnOffset(1, 0, 0, 1, 0.4, leftSide)).toEqual(outgoing);
    for (const progress of [0.05, 0.1, 0.2, 0.3]) {
      const result = smoothVehicleTurnOffset(1, 0, 0, 1, progress, leftSide);
      expect(result.every(Number.isFinite)).toBe(true);
      expect(Math.abs(result[0])).toBeLessThanOrEqual(0.13);
      expect(Math.abs(result[1])).toBeLessThanOrEqual(0.13);
    }
  });
  it('never produces NaN coordinates after a paused or malformed frame', () => {
    for (const progress of [NaN, Infinity, -Infinity]) {
      expect(smoothVehicleTurnOffset(1, 0, 0, 1, progress, false)).toEqual(vehicleLaneOffset(1, 0, false));
    }
  });
});
