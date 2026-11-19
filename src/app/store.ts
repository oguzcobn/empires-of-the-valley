import { create } from 'zustand';
import { nextRotation } from '../game/rendering/rotation';
import type { Rotation } from '../game/rendering/rotation';
import type { PersonPick } from '../game/rendering/people';
import { advanceClock } from '../game/core/clock';
import type { ArchitectureStyle, BuildingId, EventKind, GameMode, GameState, MessageRef } from '../game/core/types';
import type { Tool } from '../game/rendering/ValleyRenderer';
import { SLOT_IDS, deleteSlot, listBackups, listSlots, readSlot, writeBackup, writeSlot } from '../game/save/db';
import type { BackupRecord } from '../game/save/db';
import {
  deleteDesign,
  exportDesigns as designsToJson,
  importDesigns,
  listDesigns,
  parseDesignFile,
  putDesign,
} from '../game/save/designs';
import type { DesignRecord } from '../game/save/designs';
import type { PlayableStyle } from '../game/data/architecture';
import type { BuildingLook } from '../game/core/types';
import { SCHEMA_VERSION } from '../game/data/balance';
import type { SlotId } from '../game/save/db';
import { createSaveFile, loadSaveFile, parseSaveText, MAX_IMPORT_BYTES } from '../game/save/serialize';
import type { SaveMeta } from '../game/save/serialize';
import { createNewGame } from '../game/scenarios/newGame';
import { executeCommand } from '../game/systems/commands';
import type { Command } from '../game/systems/commands';
import { applyTick } from '../game/systems/tick';
import { t, tm } from '../i18n';
import { getSfxVolume, playSfx, setMuted } from './audio';
import { getAmbienceVolume, setAmbienceMuted } from './ambience';
import { loadSettings, storeSettings } from './settings';
import type { AppSettings } from './settings';

export type PanelId =
  | 'economy'
  | 'population'
  | 'research'
  | 'journal'
  | 'world'
  | 'army'
  | 'saves'
  | 'settings'
  | 'log'
  | 'help'
  | 'credits'
  | 'workshop'
  | 'tourism'
  | 'transport'
  | 'atlas';

export interface Toast {
  id: number;
  kind: EventKind | 'error';
  text: string;
  at?: { x: number; y: number };
  expires: number;
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface SlotInfo {
  slotId: SlotId;
  meta: SaveMeta;
}

interface AppStore {
  screen: 'title' | 'game';
  game: GameState | null;
  tool: Tool;
  selectedBuildingId: string | null;
  panel: PanelId | null;
  buildOpen: boolean;
  introOpen: boolean;
  chapterDialog: boolean;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  settings: AppSettings;
  hover: { x: number; y: number } | null;
  slots: SlotInfo[];
  slotsError: string | null;
  lastSavedAt: number | null;
  tickMs: number;
  focus: { x: number; y: number; n: number } | null;
  /** Camera quarter turns (0 = the classic view from the south). */
  rotation: Rotation;
  rotateCamera(step: 1 | -1): void;
  /** Person tapped on the map, shown in the person card. */
  person: PersonPick | null;
  selectPerson(person: PersonPick | null): void;

  startNewGame(mode: GameMode, seed: number, culture?: ArchitectureStyle, difficulty?: 'easy' | 'normal' | 'hard'): void;
  backups: BackupRecord[];
  /** Style chosen in the build catalog (null = the city's culture). */
  buildStyle: PlayableStyle | null;
  /** Workshop design chosen in the build catalog for its building type. */
  buildDesign: DesignRecord | null;
  setBuildStyle(style: PlayableStyle | null): void;
  setBuildDesign(design: DesignRecord | null): void;
  /** What the workshop edits: a building type, optionally an existing building to apply to. */
  workshop: { buildingId: BuildingId; instanceId: string | null; style: PlayableStyle; look: BuildingLook | null } | null;
  openWorkshop(target?: { buildingId: BuildingId; instanceId?: string | null; style?: PlayableStyle; look?: BuildingLook | null }): void;
  designs: DesignRecord[];
  refreshDesigns(): Promise<void>;
  saveDesign(d: DesignRecord): Promise<boolean>;
  removeDesign(id: string): Promise<void>;
  exportAllDesigns(): void;
  importDesignFile(file: File): Promise<boolean>;
  placeDesign(buildingId: BuildingId, style: PlayableStyle, look: BuildingLook | null): void;
  refreshBackups(): Promise<void>;
  downloadBackup(id: string): void;
  dispatch(cmd: Command, quiet?: boolean): boolean;
  frame(dtMs: number): void;
  setTool(tool: Tool): void;
  startBuild(id: BuildingId): void;
  select(id: string | null): void;
  openPanel(panel: PanelId | null): void;
  toggleBuild(open?: boolean): void;
  setHover(tile: { x: number; y: number } | null): void;
  toast(kind: Toast['kind'], text: string, at?: Toast['at']): void;
  dismissToast(id: number): void;
  ask(request: ConfirmRequest | null): void;
  updateSettings(patch: Partial<AppSettings>): void;
  focusOn(x: number, y: number): void;
  closeIntro(): void;
  closeChapterDialog(): void;
  togglePause(): void;
  refreshSlots(): Promise<void>;
  saveTo(slot: SlotId, silent?: boolean): Promise<boolean>;
  loadFrom(slot: SlotId): Promise<boolean>;
  removeSlot(slot: SlotId): Promise<void>;
  continueLatest(): Promise<boolean>;
  exportSave(): void;
  importSave(file: File): Promise<boolean>;
  exitToTitle(): Promise<void>;
}

let toastId = 1;
let accumulator = 0;
let lastEventId = 0;
let lastSpeed: 1 | 2 | 4 = 1;
let sinceAutosave = 0;
let saving = false;
let pendingSave: { slot: SlotId; silent: boolean } | null = null;
let saveFlight: Promise<boolean> | null = null;

const initialSettings = loadSettings();
setMuted(initialSettings.muted);
setAmbienceMuted(initialSettings.muted);
getAmbienceVolume();
getSfxVolume(); // Restore persisted sound level before any gameplay sound plays.

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Stores an untouched copy of an older-format save before it is migrated. Returns true if old. */
async function backupIfOld(source: string, raw: unknown): Promise<boolean> {
  const version = (raw as { state?: { schemaVersion?: unknown } } | null)?.state?.schemaVersion;
  if (typeof version !== 'number' || version >= SCHEMA_VERSION) return false;
  try {
    await writeBackup(source, version, raw);
    useApp.getState().toast('info', t('save.backupMade'));
    void useApp.getState().refreshBackups();
  } catch (e) {
    useApp.getState().toast('error', t('save.backupFailed', { detail: errorText(e) }));
  }
  return true;
}

export const useApp = create<AppStore>((set, get) => {
  /** Single place where a new game state enters the store: surfaces new events as notifications. */
  function commit(next: GameState, extra?: Partial<AppStore>): void {
    const state = get();
    let game = next;
    const toasts = [...state.toasts];
    let chapterDialog = state.chapterDialog;
    let autosave = false;
    for (const event of next.eventLog) {
      if (event.id <= lastEventId) continue;
      lastEventId = event.id;
      if (event.kind === 'info') continue;
      toasts.push({
        id: toastId++,
        kind: event.kind,
        text: t(event.key, event.params),
        at: event.at,
        expires: performance.now() + 7000,
      });
      if (event.kind === 'quest') playSfx('quest');
      else if (event.kind === 'success') playSfx('complete');
      else if (event.kind === 'danger' || event.kind === 'warning') playSfx('error');
      if (event.kind === 'quest') autosave = true;
      if (event.key === 'event.chapterComplete') {
        chapterDialog = true;
        if (game.settings.autoPauseOnMilestone && game.speed !== 0) {
          const paused = executeCommand(game, { type: 'setGameSpeed', speed: 0 });
          if (paused.ok) game = paused.state;
        }
      }
    }
    set({ ...extra, game, toasts: toasts.slice(-3), chapterDialog });
    if (autosave) void get().saveTo('auto', true); // milestone autosave
  }

  function enterGame(game: GameState): void {
    accumulator = 0;
    sinceAutosave = 0;
    lastEventId = game.eventLog.reduce((max, e) => Math.max(max, e.id), 0);
    lastSpeed = game.speed !== 0 ? game.speed : 1;
    set({
      screen: 'game',
      game,
      tool: { kind: 'select' },
      selectedBuildingId: null,
      panel: null,
      buildOpen: false,
      toasts: [],
      confirm: null,
      chapterDialog: false,
      hover: null,
      person: null,
      rotation: 0,
      buildStyle: null,
      buildDesign: null,
      workshop: null,
      focus: null,
      lastSavedAt: null,
    });
  }

  return {
    screen: 'title',
    game: null,
    tool: { kind: 'select' },
    selectedBuildingId: null,
    panel: null,
    buildOpen: false,
    introOpen: false,
    chapterDialog: false,
    toasts: [],
    confirm: null,
    settings: initialSettings,
    hover: null,
    slots: [],
    slotsError: null,
    lastSavedAt: null,
    tickMs: 0,
    focus: null,
    rotation: 0,
    rotateCamera(step) {
      set({ rotation: nextRotation(get().rotation, step) });
    },
    person: null,
    selectPerson(person) {
      set({ person, ...(person ? { selectedBuildingId: null } : {}) });
    },

    backups: [],
    buildStyle: null,
    buildDesign: null,
    setBuildStyle(style) {
      const curDesign = get().buildDesign;
      set({ buildStyle: style, buildDesign: curDesign && curDesign.style === style ? curDesign : null });
      const tool = get().tool;
      if (tool.kind === 'build') get().startBuild(tool.buildingId);
    },
    setBuildDesign(design) {
      set({ buildDesign: design, buildStyle: design ? design.style : get().buildStyle });
      if (design) get().startBuild(design.buildingId);
    },
    workshop: null,
    openWorkshop(target) {
      const game = get().game;
      const fallback = (game?.culture ?? 'turkish') as PlayableStyle;
      set({
        workshop: {
          buildingId: target?.buildingId ?? 'hut',
          instanceId: target?.instanceId ?? null,
          style: target?.style ?? fallback,
          look: target?.look ?? null,
        },
        panel: 'workshop',
      });
    },
    designs: [],
    async refreshDesigns() {
      try {
        set({ designs: await listDesigns() });
      } catch (e) {
        set({ designs: [] });
        get().toast('error', t('workshop.storageFailed', { detail: errorText(e) }));
      }
    },
    async saveDesign(d) {
      try {
        await putDesign(d);
        await get().refreshDesigns();
        get().toast('success', t('workshop.saved', { name: d.name }));
        return true;
      } catch (e) {
        get().toast('error', t('workshop.storageFailed', { detail: errorText(e) }));
        return false;
      }
    },
    async removeDesign(id) {
      try {
        await deleteDesign(id);
        if (get().buildDesign?.id === id) set({ buildDesign: null });
      } catch (e) {
        get().toast('error', t('workshop.storageFailed', { detail: errorText(e) }));
      }
      await get().refreshDesigns();
    },
    exportAllDesigns() {
      const designs = get().designs;
      if (!designs.length) return;
      const blob = new Blob([designsToJson(designs)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'empires-of-the-valley-tasarimlar.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    async importDesignFile(file) {
      if (file.size > MAX_IMPORT_BYTES) {
        get().toast('error', t('workshop.importFailed', { reason: 'tooLarge' }));
        return false;
      }
      const parsed = parseDesignFile(await file.text());
      if (!parsed.ok) {
        get().toast('error', t('workshop.importFailed', { reason: parsed.reason }));
        return false;
      }
      try {
        const n = await importDesigns(parsed.designs);
        await get().refreshDesigns();
        get().toast('success', t('workshop.imported', { n }));
        return true;
      } catch (e) {
        await get().refreshDesigns();
        get().toast('error', t('workshop.storageFailed', { detail: errorText(e) }));
        return false;
      }
    },
    placeDesign(buildingId, style, look) {
      set({ panel: null, buildOpen: false, buildStyle: style, tool: { kind: 'build', buildingId, style, look }, selectedBuildingId: null });
    },
    async refreshBackups() {
      try {
        set({ backups: await listBackups() });
      } catch {
        set({ backups: [] });
      }
    },
    downloadBackup(id) {
      const record = get().backups.find((b) => b.id === id);
      if (!record) return;
      const blob = new Blob([JSON.stringify(record.raw)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `empires-of-the-valley-yedek-${record.source}-v${record.schemaVersion}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },

    startNewGame(mode, seed, culture, difficulty) {
      enterGame(createNewGame({ mode, seed, culture, difficulty }));
      set({ introOpen: true });
    },

    dispatch(cmd, quiet = false) {
      const game = get().game;
      if (!game) return false;
      const result = executeCommand(game, cmd);
      if (!result.ok) {
        if (!quiet) {
          get().toast('error', tm(result.error));
          playSfx('error');
        }
        return false;
      }
      if (cmd.type === 'setGameSpeed' && cmd.speed !== 0) lastSpeed = cmd.speed;
      if (!quiet) {
        const placeCmds = new Set(['placeBuilding', 'placeRoad', 'placeRoadRoute', 'paveRoad', 'buildTerrace', 'upgradeBuilding']);
        const sound = placeCmds.has(cmd.type) ? 'place' : cmd.type === 'demolishBuilding' || cmd.type === 'clearTerrain' ? 'error' : 'click';
        playSfx(sound);
      }
      commit(result.state);
      return true;
    },

    frame(dtMs) {
      const state = get();
      const now = performance.now();
      if (state.toasts.length > 0 && state.toasts.some((x) => x.expires < now))
        set({ toasts: state.toasts.filter((x) => x.expires >= now) });
      if (state.screen !== 'game' || !state.game) return;
      const safeDt = dtMs > 0 ? dtMs : 0;
      // Dialogs that demand a decision hold the clock without changing the chosen speed.
      const held = state.introOpen || state.chapterDialog || state.confirm !== null;
      const effectiveSpeed = held ? 0 : state.game.speed;
      const step = advanceClock(accumulator, safeDt, effectiveSpeed);
      accumulator = step.accumulator;
      if (step.ticks > 0) {
        const t0 = performance.now();
        let game = state.game;
        for (let i = 0; i < step.ticks; i++) game = applyTick(game);
        commit(game, { tickMs: (performance.now() - t0) / step.ticks });
      }
      const minutes = state.settings.autosaveMinutes;
      if (minutes > 0 && effectiveSpeed > 0 && safeDt > 0) {
        sinceAutosave += Math.min(safeDt, 1000);
        if (sinceAutosave >= minutes * 60_000) {
          sinceAutosave = 0;
          void get().saveTo('auto', true);
        }
      }
    },

    setTool(tool) {
      set({ tool, selectedBuildingId: tool.kind === 'select' ? get().selectedBuildingId : null });
    },
    startBuild(id) {
      const st = get();
      const design = st.buildDesign?.buildingId === id ? st.buildDesign : null;
      set({
        tool: { kind: 'build', buildingId: id, style: st.buildStyle ?? st.game?.culture, look: design?.look ?? null },
        selectedBuildingId: null,
      });
    },
    select(id) {
      set({ selectedBuildingId: id, ...(id ? { person: null } : {}) });
    },
    openPanel(panel) {
      set({ panel });
    },
    toggleBuild(open) {
      set({ buildOpen: open ?? !get().buildOpen });
    },
    setHover(tile) {
      set({ hover: tile });
    },
    toast(kind, text, at) {
      if (get().toasts.at(-1)?.text === text) return; // do not stack identical messages
      set({
        toasts: [...get().toasts, { id: toastId++, kind, text, at, expires: performance.now() + 5000 }].slice(
          -3,
        ),
      });
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((x) => x.id !== id) });
    },
    ask(request) {
      set({ confirm: request });
    },
    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      setMuted(settings.muted);
      setAmbienceMuted(settings.muted);
      storeSettings(settings);
      set({ settings });
    },
    focusOn(x, y) {
      set({ focus: { x, y, n: (get().focus?.n ?? 0) + 1 } });
    },
    closeIntro() {
      set({ introOpen: false });
    },
    closeChapterDialog() {
      set({ chapterDialog: false });
    },
    togglePause() {
      const game = get().game;
      if (!game) return;
      get().dispatch({ type: 'setGameSpeed', speed: game.speed === 0 ? lastSpeed : 0 });
    },

    async refreshSlots() {
      try {
        set({ slots: await listSlots(), slotsError: null });
      } catch (e) {
        set({ slots: [], slotsError: errorText(e) });
      }
    },

    async saveTo(slot, silent = false) {
      const game = get().game;
      if (!game) return false;
      if (saving) {
        pendingSave = { slot, silent: pendingSave ? pendingSave.silent && silent : silent };
        return saveFlight ?? false;
      }
      const runSave = async (targetSlot: SlotId, isSilent: boolean): Promise<boolean> => {
        const current = get().game;
        if (!current) return false;
        const file = createSaveFile(current);
        if (!file.ok) {
          get().toast('error', tm(file.error));
          return false;
        }
        saving = true;
        try {
          await writeSlot(targetSlot, file.file);
          set({ lastSavedAt: Date.now() });
          if (!isSilent) get().toast('success', t('save.saved', { slot: `@save.slot.${targetSlot}` }));
          await get().refreshSlots();
          return true;
        } catch (e) {
          get().toast('error', t('save.err.write', { detail: errorText(e) }));
          return false;
        } finally {
          saving = false;
          if (pendingSave) {
            const next = pendingSave;
            pendingSave = null;
            saveFlight = runSave(next.slot, next.silent);
          } else {
            saveFlight = null;
          }
        }
      };
      saveFlight = runSave(slot, silent);
      return saveFlight;
    },

    async loadFrom(slot) {
      try {
        const raw = await readSlot(slot);
        if (!raw) {
          get().toast('error', t('save.err.empty'));
          return false;
        }
        const loaded = loadSaveFile(raw);
        if (!loaded.ok) {
          get().toast('error', tm(loaded.error));
          return false;
        }
        const legacy = await backupIfOld(slot, raw);
        // Always resume paused so the player can look around first.
        enterGame({ ...loaded.state, speed: 0 });
        set({ introOpen: false });
        get().toast('success', t('save.loaded'));
        if (legacy) get().toast('info', t('arch.legacyNote'));
        return true;
      } catch (e) {
        get().toast('error', t('save.err.read', { detail: errorText(e) }));
        return false;
      }
    },

    async removeSlot(slot) {
      try {
        await deleteSlot(slot);
      } catch (e) {
        get().toast('error', t('save.err.write', { detail: errorText(e) }));
      }
      await get().refreshSlots();
    },

    async continueLatest() {
      await get().refreshSlots();
      const latest = get().slots[0];
      if (!latest) {
        get().toast('error', t('save.err.empty'));
        return false;
      }
      return get().loadFrom(latest.slotId);
    },

    exportSave() {
      const game = get().game;
      if (!game) return;
      const file = createSaveFile(game);
      if (!file.ok) {
        get().toast('error', tm(file.error));
        return;
      }
      const blob = new Blob([JSON.stringify(file.file)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `empires-of-the-valley-gun${file.file.meta.day}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      get().toast('success', t('save.exported'));
    },

    async importSave(file) {
      if (file.size > MAX_IMPORT_BYTES) {
        get().toast('error', t('save.err.tooLarge'));
        return false;
      }
      let text = '';
      let loaded;
      try {
        text = await file.text();
        loaded = parseSaveText(text);
      } catch (e) {
        get().toast('error', t('save.err.read', { detail: errorText(e) }));
        return false;
      }
      if (!loaded.ok) {
        get().toast('error', tm(loaded.error as MessageRef));
        return false;
      }
      let legacy = false;
      try {
        legacy = await backupIfOld(`import-${file.name.slice(0, 40)}`, JSON.parse(text));
      } catch {
        /* already validated above; a failed backup must not block the import */
      }
      enterGame({ ...loaded.state, speed: 0 });
      if (legacy) get().toast('info', t('arch.legacyNote'));
      set({ introOpen: false });
      get().toast('success', t('save.imported'));
      return true;
    },

    async exitToTitle() {
      if (get().game) {
        await get().saveTo('auto', true);
        if (saveFlight) await saveFlight;
      }
      accumulator = 0;
      sinceAutosave = 0;
      lastEventId = 0;
      set({
        screen: 'title',
        game: null,
        tool: { kind: 'select' },
        selectedBuildingId: null,
        panel: null,
        buildOpen: false,
        confirm: null,
        toasts: [],
        chapterDialog: false,
        introOpen: false,
        hover: null,
        person: null,
        rotation: 0,
        buildStyle: null,
        buildDesign: null,
        workshop: null,
        focus: null,
        lastSavedAt: null,
      });
      await get().refreshSlots();
    },
  };
});

export { SLOT_IDS };
export type { SlotId };

/** Starts the single requestAnimationFrame loop that feeds real time into the fixed-step clock. */
export function startMainLoop(): () => void {
  let raf = 0;
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = now - last;
    last = now;
    useApp.getState().frame(dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  // Leaving the tab: save once. rAF stops in the background and the clock clamps on return,
  // so no time passes while the game is not visible (offline progression is disabled).
  const onHide = (): void => {
    if (document.visibilityState === 'hidden' && useApp.getState().screen === 'game')
      void useApp.getState().saveTo('auto', true);
    last = performance.now();
  };
  const onPageHide = (): void => {
    if (useApp.getState().screen === 'game') void useApp.getState().saveTo('auto', true);
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  };
}
