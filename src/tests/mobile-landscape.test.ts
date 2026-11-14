import { describe, expect, it, vi } from 'vitest';
import { needsLandscapeHint, requestLandscapeMode } from '../app/landscape';

describe('landscape mobile helper', () => {
  it('prompts only on upright touch-sized devices', () => {
    expect(needsLandscapeHint(390, 844, true)).toBe(true);
    expect(needsLandscapeHint(844, 390, true)).toBe(false);
    expect(needsLandscapeHint(390, 844, false)).toBe(false);
    expect(needsLandscapeHint(1080, 1920, true)).toBe(false);
  });

  it('requests fullscreen and landscape from a direct user click', async () => {
    const full = vi.fn().mockResolvedValue(undefined);
    const lock = vi.fn().mockResolvedValue(undefined);
    const doc = { fullscreenElement: null, documentElement: { requestFullscreen: full } } as unknown as Document;
    const screen = { orientation: { lock } } as unknown as Screen;
    await expect(requestLandscapeMode(doc, screen)).resolves.toBe(true);
    expect(full).toHaveBeenCalledOnce();
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('falls back when the browser refuses or lacks orientation locking', async () => {
    const full = vi.fn().mockRejectedValue(new Error('denied'));
    const lock = vi.fn().mockRejectedValue(new Error('unsupported'));
    const doc = { fullscreenElement: null, documentElement: { requestFullscreen: full } } as unknown as Document;
    await expect(requestLandscapeMode(doc, { orientation: { lock } } as unknown as Screen)).resolves.toBe(false);
    await expect(requestLandscapeMode(doc, { orientation: {} } as Screen)).resolves.toBe(false);
  });
});
