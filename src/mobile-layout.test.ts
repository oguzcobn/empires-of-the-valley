import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../mobile-layout.css', import.meta.url), 'utf8');

describe('mobile portrait layout regression', () => {
  it('keeps HUD resources and speed controls finger-scrollable', () => {
    expect(css).toMatch(/\.game-screen \.hud-resources\s*\{[^}]*overflow-x: auto/s);
    expect(css).toMatch(/\.game-screen \.hud-time\s*\{[^}]*overflow-x: auto/s);
  });
  it('allows catalog and panel scrolling without page overflow', () => {
    expect(css).toMatch(/\.game-screen \.left-column > \*,[\s\S]*?overflow-y: auto/);
    expect(css).toContain('.game-screen .catalog { max-height:');
    expect(css).toContain('height: 100dvh');
  });
  it('allows access to tools beyond the viewport', () => {
    expect(css).toMatch(/\.game-screen \.toolbar\s*\{[^}]*overflow-x: auto/s);
    expect(css).toContain('touch-action: pan-x');
    expect(css).toContain('min-height: 44px');
  });
});
