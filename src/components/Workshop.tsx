import 'pixi.js/unsafe-eval';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { useApp } from '../app/store';
import type { BuildingId, BuildingLook, GameState } from '../game/core/types';
import {
  BALCONY_TYPES,
  CHIMNEY_TYPES,
  COURTYARD_TYPES,
  DECOR_TYPES,
  DESIGNABLE,
  DOOR_TYPES,
  FACADE_COLORS,
  FACADE_HEX,
  FLOOR_OPTIONS,
  GARDEN_TYPES,
  PLAYABLE_STYLES,
  ROOF_MATERIALS,
  ROOF_TYPES,
  TOWER_TYPES,
  WALL_MATERIALS,
  WINDOW_TYPES,
  defaultLook,
} from '../game/data/architecture';
import type { PlayableStyle } from '../game/data/architecture';
import { BUILDINGS } from '../game/data/buildings';
import { drawStyledBuilding } from '../game/rendering/arch/buildings';
import { P } from '../game/rendering/iso';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { cleanName, newDesignId } from '../game/save/designs';
import type { DesignRecord } from '../game/save/designs';
import { decayPerDay, levelCost, maxFloors, restyleCost } from '../game/systems/architecture';
import { validateCommand } from '../game/systems/commands';
import { homeProvince } from '../game/systems/economy';
import { buildingById } from '../game/systems/grid';
import { t, tm } from '../i18n';
import type { TKey } from '../i18n';
import { CostList, Row } from './common';
import { renderToDataUrl } from '../game/rendering/preview';

type LookKey = Exclude<keyof BuildingLook, 'floors' | 'facade'>;

const OPTIONS: { key: LookKey; values: readonly string[] }[] = [
  { key: 'roof', values: ROOF_TYPES },
  { key: 'roofMaterial', values: ROOF_MATERIALS },
  { key: 'wall', values: WALL_MATERIALS },
  { key: 'windows', values: WINDOW_TYPES },
  { key: 'door', values: DOOR_TYPES },
  { key: 'tower', values: TOWER_TYPES },
  { key: 'balcony', values: BALCONY_TYPES },
  { key: 'chimney', values: CHIMNEY_TYPES },
  { key: 'garden', values: GARDEN_TYPES },
  { key: 'courtyard', values: COURTYARD_TYPES },
  { key: 'decor', values: DECOR_TYPES },
];

const SCOTTISH_MARKS = new Set(['granite', 'harl', 'slate', 'thatch', 'crow_step', 'sash', 'fanlight', 'turret']);
const TURKISH_MARKS = new Set(['timber_frame', 'stone_timber', 'clay', 'shingle', 'dome', 'latticed', 'cumba', 'avlu']);

/** True when a look carries signature elements of both cultures. */
export function isMixed(look: BuildingLook): boolean {
  const values = Object.values(look).map(String);
  return values.some((v) => SCOTTISH_MARKS.has(v)) && values.some((v) => TURKISH_MARKS.has(v));
}

function LivePreview({
  buildingId,
  style,
  look,
  level,
  winter,
  night,
}: {
  buildingId: BuildingId;
  style: PlayableStyle;
  look: BuildingLook;
  level: number;
  winter: boolean;
  night: boolean;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const appRef = useRef<{ app: Application; g: Graphics; glow: Graphics; root: Container } | null>(null);
  useEffect(() => {
    const app = new Application();
    let dead = false;
    void app
      .init({ resizeTo: ref.current!, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true, preference: 'webgl' })
      .then(() => {
        if (dead) {
          app.destroy({ removeView: true });
          return;
        }
        ref.current!.appendChild(app.canvas);
        const root = new Container();
        const g = new Graphics();
        const glow = new Graphics();
        glow.blendMode = 'add';
        root.addChild(g, glow);
        app.stage.addChild(root);
        appRef.current = { app, g, glow, root };
        setTick((n) => n + 1);
      });
    return () => {
      dead = true;
      appRef.current = null;
      try {
        app.destroy({ removeView: true }, { children: true });
      } catch {
        /* never initialised */
      }
    };
  }, []);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const v = appRef.current;
    if (!v) return;
    const { app, g, glow, root } = v;
    g.clear();
    glow.clear();
    const [w, h] = BUILDINGS[buildingId].footprint;
    const pal = SEASON_PALETTE[winter ? 'winter' : 'summer'];
    g.poly([P(-0.3, -0.3), P(w + 0.3, -0.3), P(w + 0.3, h + 0.3), P(-0.3, h + 0.3)].flat()).fill(pal.grass[0]!);
    const info = drawStyledBuilding(g, { definitionId: buildingId, style, look, level, condition: 10000 }, pal, 2, 4242);
    g.tint = night ? 0x7381b8 : 0xffffff;
    if (night) for (const q of info.lights) glow.poly(q.flat()).fill({ color: 0xffc95a, alpha: 0.95 });
    const bounds = g.getLocalBounds();
    const scale = Math.min((app.screen.width - 24) / bounds.width, (app.screen.height - 24) / bounds.height, 4);
    root.scale.set(scale);
    root.position.set(
      app.screen.width / 2 - (bounds.x + bounds.width / 2) * scale,
      app.screen.height / 2 - (bounds.y + bounds.height / 2) * scale,
    );
  }, [buildingId, style, look, level, winter, night, tick]);
  return <div className="workshop-preview" ref={ref} data-testid="workshop-preview" aria-label={t('workshop.preview')} />;
}

function Thumb({ d }: { d: DesignRecord }): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    renderToDataUrl(`design|${d.buildingId}|${d.style}|${JSON.stringify(d.look)}`, (g: Graphics) => {
      drawStyledBuilding(g, { definitionId: d.buildingId, style: d.style, look: d.look, level: BUILDINGS[d.buildingId].levels.length, condition: 10000 }, SEASON_PALETTE.summer, 1, 7);
    })
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [d]);
  return url ? <img src={url} alt="" className="design-thumb" /> : <span className="design-thumb" />;
}

export function WorkshopPanel({ game }: { game: GameState }): ReactElement | null {
  const target = useApp((s) => s.workshop);
  const designs = useApp((s) => s.designs);
  const { refreshDesigns, saveDesign, removeDesign, exportAllDesigns, importDesignFile, placeDesign, dispatch, ask } =
    useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [buildingId, setBuildingId] = useState<BuildingId>(target?.buildingId ?? 'hut');
  const [style, setStyle] = useState<PlayableStyle>(target?.style ?? 'turkish');
  const maxLevel = BUILDINGS[buildingId].levels.length;
  const [level, setLevel] = useState(maxLevel);
  const [look, setLook] = useState<BuildingLook>(target?.look ?? defaultLook(style, buildingId, maxLevel));
  const [name, setName] = useState('');
  const [winter, setWinter] = useState(false);
  const [night, setNight] = useState(false);
  useEffect(() => {
    void refreshDesigns();
  }, [refreshDesigns]);

  const p = homeProvince(game);
  const instance = target?.instanceId ? buildingById(p, target.instanceId) : undefined;
  const applicable = instance && instance.definitionId === buildingId ? instance : undefined;
  const cost = useMemo(() => levelCost(buildingId, 0, style, look), [buildingId, style, look]);
  const decay = decayPerDay({ definitionId: buildingId, style, look, level: 1 });
  const baseDecay = decayPerDay({ definitionId: buildingId, style, look: null, level: 1 });
  const cap = maxFloors(buildingId, level);
  const pct = (n: number): string => (n / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const applyCmd = applicable
    ? ({ type: 'setBuildingStyle', instanceId: applicable.id, style, look } as const)
    : null;
  const applyError = applyCmd ? validateCommand(game, applyCmd) : null;

  const changeType = (id: BuildingId): void => {
    setBuildingId(id);
    const lv = BUILDINGS[id].levels.length;
    setLevel(lv);
    setLook(defaultLook(style, id, lv));
  };
  const loadDefault = (st: PlayableStyle): void => {
    setStyle(st);
    setLook(defaultLook(st, buildingId, level));
  };
  const set = <K extends keyof BuildingLook>(key: K, value: BuildingLook[K]): void => setLook({ ...look, [key]: value });

  return (
    <div className="workshop" data-testid="workshop">
      <p className="hint">{t('workshop.intro')}</p>
      <div className="workshop-grid">
        <div className="workshop-left">
          <LivePreview buildingId={buildingId} style={style} look={look} level={level} winter={winter} night={night} />
          <div className="workshop-toggles">
            <label className="check-field">
              <input type="checkbox" checked={winter} onChange={(e) => setWinter(e.target.checked)} />
              <span>{t('season.winter')}</span>
            </label>
            <label className="check-field">
              <input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} />
              <span>{t('workshop.night')}</span>
            </label>
            <label className="field inline">
              <span>{t('workshop.level')}</span>
              <select className="input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                {Array.from({ length: maxLevel }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {look.floors > cap && <p className="hint warn">{t('workshop.floorsCap', { n: cap })}</p>}
          {isMixed(look) && <p className="hint">{t('workshop.mixed')}</p>}
          <section className="section">
            <Row label={t('workshop.cost')}>
              <CostList cost={cost} stocks={p.stocks} />
            </Row>
            <p className="hint">{t('workshop.decay', { n: pct(decay), base: pct(baseDecay) })}</p>
          </section>
        </div>
        <div className="workshop-right">
          <label className="field">
            <span>{t('workshop.building')}</span>
            <select className="input" value={buildingId} onChange={(e) => changeType(e.target.value as BuildingId)} data-testid="ws-building">
              {DESIGNABLE.map((id) => (
                <option key={id} value={id}>
                  {t(`building.${id}.name`)}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>{t('workshop.base')}</span>
            <div className="segmented" role="group" aria-label={t('workshop.base')}>
              {PLAYABLE_STYLES.map((st) => (
                <button key={st} className={`btn ${style === st ? 'active' : ''}`} aria-pressed={style === st} onClick={() => setStyle(st)} data-testid={`ws-style-${st}`}>
                  {t(`style.${st}`)}
                </button>
              ))}
              <button className="btn" onClick={() => loadDefault(style)} data-testid="ws-default">
                {t('workshop.loadDefault')}
              </button>
            </div>
          </div>
          <div className="workshop-options">
            <label className="field">
              <span>{t('opt.floors')}</span>
              <select className="input" value={look.floors} onChange={(e) => set('floors', Number(e.target.value) as BuildingLook['floors'])} data-testid="ws-floors">
                {FLOOR_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {OPTIONS.map(({ key, values }) => (
              <label key={key} className="field">
                <span>{t(`opt.${key}` as TKey)}</span>
                <select className="input" value={look[key]} onChange={(e) => set(key, e.target.value as never)} data-testid={`ws-${key}`}>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {t(`opt.${key}.${v}` as TKey)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="field">
            <span>{t('opt.facade')}</span>
            <div className="swatches" role="group" aria-label={t('opt.facade')}>
              {FACADE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${look.facade === c ? 'active' : ''}`}
                  style={{ background: `#${FACADE_HEX[c].toString(16).padStart(6, '0')}` }}
                  aria-pressed={look.facade === c}
                  aria-label={t(`opt.facade.${c}`)}
                  title={t(`opt.facade.${c}`)}
                  onClick={() => set('facade', c)}
                />
              ))}
            </div>
          </div>
          <label className="field">
            <span>{t('workshop.name')}</span>
            <input className="input" value={name} maxLength={40} placeholder={t('workshop.namePlaceholder')} onChange={(e) => setName(e.target.value)} data-testid="ws-name" />
          </label>
          <div className="actions wrap">
            <button
              className="btn"
              disabled={!cleanName(name)}
              onClick={() =>
                void saveDesign({ id: newDesignId(), name: cleanName(name), buildingId, style, look, createdAt: new Date().toISOString() })
              }
              data-testid="ws-save"
            >
              {t('workshop.save')}
            </button>
            <button className="btn primary" onClick={() => placeDesign(buildingId, style, look)} data-testid="ws-place">
              {t('workshop.place')}
            </button>
          </div>
          {applicable && applyCmd && (
            <section className="section">
              <p className="hint">{t('workshop.applyHint', { building: `@building.${applicable.definitionId}.name` })}</p>
              <div className="row-actions">
                <CostList cost={restyleCost(buildingId, style, look)} stocks={p.stocks} />
                <button className="btn primary" disabled={!!applyError} title={applyError ? tm(applyError) : undefined} onClick={() => dispatch(applyCmd)} data-testid="ws-apply">
                  {t('workshop.apply')}
                </button>
              </div>
              {applyError && <p className="hint warn">{tm(applyError)}</p>}
            </section>
          )}
        </div>
      </div>
      <section className="section">
        <div className="spread">
          <h4>{t('workshop.library')}</h4>
          <span>
            <button className="btn" disabled={!designs.length} onClick={exportAllDesigns} data-testid="ws-export">
              {t('workshop.export')}
            </button>{' '}
            <button className="btn" onClick={() => fileRef.current?.click()}>
              {t('workshop.import')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              data-testid="ws-import"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void importDesignFile(file);
              }}
            />
          </span>
        </div>
        {designs.length === 0 ? (
          <p className="muted">{t('workshop.empty')}</p>
        ) : (
          <ul className="design-list" data-testid="ws-library">
            {designs.map((d) => (
              <li key={d.id} className="design-item">
                <Thumb d={d} />
                <div>
                  <b>{d.name}</b>
                  <p className="muted">
                    {t(`building.${d.buildingId}.name`)} · {t(`style.${d.style}`)}
                    {isMixed(d.look) ? ` · ${t('style.mixed')}` : ''}
                  </p>
                </div>
                <div className="design-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      setBuildingId(d.buildingId);
                      setStyle(d.style);
                      setLook(d.look);
                      setName(d.name);
                    }}
                  >
                    {t('workshop.edit')}
                  </button>
                  <button className="btn primary" onClick={() => placeDesign(d.buildingId, d.style, d.look)}>
                    {t('workshop.place')}
                  </button>
                  <button
                    className="btn danger"
                    onClick={() =>
                      ask({
                        title: t('workshop.delete'),
                        body: t('workshop.confirmDelete', { name: d.name }),
                        confirmLabel: t('workshop.delete'),
                        danger: true,
                        onConfirm: () => void removeDesign(d.id),
                      })
                    }
                  >
                    {t('workshop.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
