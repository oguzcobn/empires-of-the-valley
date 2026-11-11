export interface AppSettings {
  autosaveMinutes: 0 | 1 | 5 | 10;
  uiScale: 90 | 100 | 115 | 130;
  reducedMotion: boolean;
  muted: boolean;
  showPerf: boolean;
}

const KEY = 'eov-settings-v1';

export function defaultSettings(): AppSettings {
  const reduced =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return { autosaveMinutes: 5, uiScale: 100, reducedMotion: reduced, muted: false, showPerf: false };
}

/** UI preferences live in localStorage; failures (private mode, blocked storage) are harmless. */
export function loadSettings(): AppSettings {
  const base = defaultSettings();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const r = raw as Partial<AppSettings>;
      if ([0, 1, 5, 10].includes(r.autosaveMinutes as number)) base.autosaveMinutes = r.autosaveMinutes!;
      if ([90, 100, 115, 130].includes(r.uiScale as number)) base.uiScale = r.uiScale!;
      if (typeof r.reducedMotion === 'boolean') base.reducedMotion = r.reducedMotion;
      if (typeof r.muted === 'boolean') base.muted = r.muted;
      if (typeof r.showPerf === 'boolean') base.showPerf = r.showPerf;
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

export function storeSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* not persisted; still applies for this session */
  }
}
