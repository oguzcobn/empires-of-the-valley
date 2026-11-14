/** Phones in a narrow, upright viewport benefit from a landscape orientation suggestion. */
export function needsLandscapeHint(width: number, height: number, coarsePointer: boolean): boolean {
  return coarsePointer && width < height && width <= 900;
}

/** Browser orientation locking is optional; iOS Safari commonly only supports manual rotation. */
export async function requestLandscapeMode(doc: Document, deviceScreen: Screen): Promise<boolean> {
  if (!doc.fullscreenElement && typeof doc.documentElement.requestFullscreen === 'function') {
    try {
      await doc.documentElement.requestFullscreen();
    } catch {
      // Fullscreen may require an installed PWA or browser permission.
    }
  }
  const orientation = deviceScreen.orientation as ScreenOrientation & {
    lock?: (direction: 'landscape') => Promise<void>;
  };
  if (typeof orientation?.lock !== 'function') return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}
