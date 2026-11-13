export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export type GraphicsSetting = 'auto' | GraphicsQuality;
export const GRAPHICS_SETTINGS: readonly GraphicsSetting[] = ['auto', 'low', 'medium', 'high', 'ultra'];

export interface AppSettings {
  autosaveMinutes: 0 | 1 | 5 | 10;
  uiScale: 90 | 100 | 115 | 130;
  reducedMotion: boolean;
  muted: boolean;
  showPerf: boolean;
  graphics: GraphicsSetting;
  dayNight: boolean;
  weather: boolean;
}

/** Device class guess for the automatic quality: phones and low-memory devices start lower. */
export function autoQuality(): GraphicsQuality {
  if (typeof window === 'undefined') return 'high';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  const lowMem = (nav.deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 3;
  if (lowMem) return 'low';
  if (coarse || small) return 'medium';
  return 'high';
}

/** Runtime downgrade applied by the FPS watchdog when Auto is selected (session only). */
let autoCap: GraphicsQuality | null = null;
export const setAutoCap = (q: GraphicsQuality | null): void => {
  autoCap = q;
};
const ORDER: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];
export function effectiveQuality(s: Pick<AppSettings, 'graphics'>): GraphicsQuality {
  if (s.graphics !== 'auto') return s.graphics;
  const q = autoQuality();
  return autoCap && ORDER.indexOf(autoCap) < ORDER.indexOf(q) ? autoCap : q;
}
export const lowerQuality = (q: GraphicsQuality): GraphicsQuality | null =>
  ORDER.indexOf(q) > 0 ? ORDER[ORDER.indexOf(q) - 1]! : null;

export function artDetail(s: Pick<AppSettings, 'graphics'>): 0 | 1 | 2 {
  const q = effectiveQuality(s);
  return q === 'low' ? 0 : q === 'medium' ? 1 : 2;
}

const KEY = 'eov-settings-v1';

export function defaultSettings(): AppSettings {
  const reduced =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return {
    autosaveMinutes: 5,
    uiScale: 100,
    reducedMotion: reduced,
    muted: false,
    showPerf: false,
    graphics: 'auto',
    dayNight: true,
    weather: true,
  };
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
      if (GRAPHICS_SETTINGS.includes(r.graphics as GraphicsSetting)) base.graphics = r.graphics!;
      if (typeof r.dayNight === 'boolean') base.dayNight = r.dayNight;
      if (typeof r.weather === 'boolean') base.weather = r.weather;
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
