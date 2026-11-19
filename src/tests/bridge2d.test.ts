import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { BRIDGE_DECK_PX, drawGroundTile } from '../game/rendering/sprites';
import { SEASON_PALETTE } from '../game/rendering/palette';

describe('bridges join the road without a step', () => {
  it('2D: the deck stays low and tapers into the bank', () => {
    expect(BRIDGE_DECK_PX).toBeLessThanOrEqual(3);
    for (const ends of [{ start: true, end: false }, { start: false, end: true }, { start: false, end: false }]) {
      const g = new Graphics();
      drawGroundTile(g, 11, 12, 'water', 0, true, SEASON_PALETTE.summer, { height: 0, frontLeft: 0, frontRight: 0 }, 'bridge', 2, false,
        { negX: true, posX: true, negY: false, posY: false }, false, ends);
      expect(g.context.instructions.length).toBeGreaterThan(6);
    }
  });
});
