import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Graphics } from 'pixi.js';
import { useApp } from '../app/store';
import type { GameState, VesselKind } from '../game/core/types';
import { ATLAS } from '../game/data/atlas';
import type { AtlasEntry } from '../game/data/atlas';
import { BUILDINGS, defOf } from '../game/data/buildings';
import { MAX_ORDERS, VESSELS, VESSEL_KINDS } from '../game/data/shipyard';
import { drawStyledBuilding } from '../game/rendering/arch/buildings';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { renderToDataUrl } from '../game/rendering/preview';
import { repairCost } from '../game/systems/architecture';
import { validateCommand } from '../game/systems/commands';
import { homeProvince, isOperating } from '../game/systems/economy';
import { shipwrightHours, tourismReport } from '../game/systems/tourism';
import { fmtAmount, fmtRate, t, tm } from '../i18n';
import type { TKey } from '../i18n';
import { Bar, CostList, Row } from './common';

function Sprite({ entry, alt }: { entry: AtlasEntry; alt: string }): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const sp = entry.sprite;
    renderToDataUrl(`atlas|${entry.id}`, (g: Graphics) => {
      drawStyledBuilding(g, { definitionId: sp.definitionId, style: sp.style, look: sp.look, level: sp.level, condition: 10000 }, SEASON_PALETTE.summer, 2, 21);
    })
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [entry]);
  return url ? <img className="atlas-img" src={url} alt={alt} /> : <span className="atlas-img" aria-hidden="true" />;
}

const nameOf = (e: AtlasEntry): string =>
  e.landmark ? t(`building.${e.landmark}.name`) : t(`atlas.v.${e.id}.name` as TKey);
const field = (e: AtlasEntry, f: 'period' | 'location' | 'materials' | 'history'): string =>
  t((e.landmark ? `atlas.${e.landmark}.${f}` : `atlas.v.${e.id}.${f}`) as TKey);

export function AtlasPanel({ game }: { game: GameState | null }): ReactElement {
  const [culture, setCulture] = useState<'scottish' | 'turkish'>('scottish');
  const [open, setOpen] = useState<string>(ATLAS.find((e) => e.culture === 'scottish')!.id);
  const entries = ATLAS.filter((e) => e.culture === culture);
  const entry = ATLAS.find((e) => e.id === open && e.culture === culture) ?? entries[0]!;
  const built = (id?: string): boolean => !!game && !!id && homeProvince(game).buildings.some((b) => b.definitionId === id && b.state === 'active');
  return (
    <div className="atlas" data-testid="atlas">
      <p className="hint">{t('atlas.intro')}</p>
      <div className="segmented" role="tablist">
        {(['scottish', 'turkish'] as const).map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={culture === c}
            className={`btn ${culture === c ? 'active' : ''}`}
            onClick={() => {
              setCulture(c);
              setOpen(ATLAS.find((e) => e.culture === c)!.id);
            }}
            data-testid={`atlas-${c}`}
          >
            {t(c === 'scottish' ? 'atlas.scotland' : 'atlas.turkey')}
          </button>
        ))}
      </div>
      <div className="atlas-grid">
        <ul className="atlas-list">
          {(['monument', 'vernacular'] as const).map((kind) => (
            <li key={kind}>
              <h4>{t(kind === 'monument' ? 'atlas.monuments' : 'atlas.vernacular')}</h4>
              <ul>
                {entries
                  .filter((e) => e.kind === kind)
                  .map((e) => (
                    <li key={e.id}>
                      <button className={`btn block ${entry.id === e.id ? 'active' : ''}`} onClick={() => setOpen(e.id)} data-testid={`atlas-entry-${e.id}`}>
                        {nameOf(e)} {built(e.landmark) ? '✔' : ''}
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
        <article className="atlas-entry" data-testid="atlas-article">
          <Sprite entry={entry} alt={nameOf(entry)} />
          <h3>{nameOf(entry)}</h3>
          <Row label={t('atlas.country')}>{t(entry.culture === 'scottish' ? 'atlas.country.scotland' : 'atlas.country.turkey')}</Row>
          <Row label={t('atlas.period')}>{field(entry, 'period')}</Row>
          <Row label={t('atlas.location')}>{field(entry, 'location')}</Row>
          <Row label={t('atlas.materials')}>{field(entry, 'materials')}</Row>
          <h4>{t('atlas.history')}</h4>
          <p>{field(entry, 'history')}</p>
          {entry.landmark && (
            <>
              <h4>{t('atlas.inGame')}</h4>
              <p>{t(`building.${entry.landmark}.effect`)}</p>
              <h4>{t('atlas.conditions')}</h4>
              <p>{t(`building.${entry.landmark}.rule`)}</p>
              <p className={built(entry.landmark) ? 'status ok' : 'muted'}>{t(built(entry.landmark) ? 'atlas.built' : 'atlas.notBuilt')}</p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}

export function TourismPanel({ game }: { game: GameState }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  const r = tourismReport(game);
  const p = homeProvince(game);
  const tm_ = game.tourism;
  const monuments = p.buildings.filter((b) => defOf(b).landmark);
  return (
    <div className="tourism" data-testid="tourism">
      <p className="hint">{t('tourism.intro')}</p>
      <div className="stat-grid">
        <Row label={t('tourism.visitors')}>
          <b data-testid="tourism-visitors">{tm_.visitorsYesterday}</b>
        </Row>
        <Row label={t('tourism.demand')}>{tm_.demandYesterday}</Row>
        <Row label={t('tourism.capacity')}>{r.capacity}</Row>
        <Row label={t('tourism.beds')}>{r.beds}</Row>
        <Row label={t('tourism.income')}>{t('hud.perDay', { rate: fmtRate(tm_.incomeYesterday) })}</Row>
        <Row label={t('tourism.spend')}>{fmtAmount(r.spend)}</Row>
        <Row label={t('tourism.total')}>{tm_.totalVisitors}</Row>
        <Row label={t('tourism.culture')}>
          {Math.floor(tm_.culture / 1000)} ({t('tourism.culturePerDay', { n: fmtAmount(r.culturePerDay) })})
        </Row>
        <Row label={t('tourism.prestige')}>{r.prestige}</Row>
      </div>
      <h4>{t('tourism.satisfaction')}</h4>
      <Bar value={tm_.satisfaction} max={100} tone={tm_.satisfaction >= 60 ? 'ok' : tm_.satisfaction >= 40 ? 'warn' : 'bad'} />
      <p className="hint">
        {tm_.satisfaction} · {t('tourism.satisfactionTarget', { n: r.satisfactionTarget })}
      </p>
      {r.demand > r.capacity && <p className="hint warn">{t('tourism.crowded')}</p>}
      {!r.foodOk && <p className="hint warn">{t('tourism.noFood')}</p>}
      <section className="section">
        <h4>
          {t('tourism.attraction')}: {r.attraction}
        </h4>
        <ul className="why">
          {r.parts.map((x, i) => (
            <li key={i}>
              {x.label.startsWith('@') ? t(x.label.slice(1) as TKey) : x.label}: +{x.value}
            </li>
          ))}
        </ul>
        <h4>
          {t('tourism.safety')}: {r.safety}
        </h4>
        <ul className="why">
          <li>{t('tourism.base')}: 30</li>
          {r.safetySources.map((x) => (
            <li key={x.id}>
              {t(x.label.slice(1) as TKey)}: +{x.value}
            </li>
          ))}
        </ul>
      </section>
      <section className="section">
        <h4>{t('tourism.heritage')}</h4>
        <p className="hint">{t('tourism.heritageHint')}</p>
        {monuments.length === 0 && <p className="muted">{t('tourism.none')}</p>}
        {monuments.map((b) => {
          const cmd = { type: 'restoreBuilding' as const, instanceId: b.id };
          const error = validateCommand(game, cmd);
          return (
            <div key={b.id} className="row-actions">
              <span>
                {t(`building.${b.definitionId}.name`)} · {Math.floor(b.condition / 100)}%
              </span>
              {b.condition < 10000 && b.state !== 'construction' && (
                <span className="row-actions">
                  <CostList cost={repairCost(b)} stocks={p.stocks} />
                  <button className="btn" disabled={!!error} title={error ? tm(error) : undefined} onClick={() => dispatch(cmd)}>
                    {t('tourism.restore')}
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function ShipyardSection({ game }: { game: GameState }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  const p = homeProvince(game);
  const sy = game.shipyard;
  const hours = shipwrightHours(p);
  const upkeep = VESSEL_KINDS.reduce((a, k) => a + sy.fleet[k] * VESSELS[k].upkeepGold, 0);
  const running = p.buildings.some((b) => b.definitionId === 'shipyard' && isOperating(b));
  return (
    <section className="section" data-testid="shipyard">
      <h4>{t('shipyard.title')}</h4>
      <p className="hint">{t('shipyard.intro')}</p>
      {!running && <p className="hint warn">{t('shipyard.noWorkers')}</p>}
      {VESSEL_KINDS.map((kind: VesselKind) => {
        const cmd = { type: 'orderVessel' as const, kind };
        const error = validateCommand(game, cmd);
        const days = hours > 0 ? Math.ceil(VESSELS[kind].work / hours / 24) : null;
        return (
          <div key={kind} className="vessel">
            <div className="spread">
              <b>{t(`vessel.${kind}`)}</b>
              <span className="muted">
                {t('shipyard.fleet')}: {sy.fleet[kind]} / {VESSELS[kind].cap}
              </span>
            </div>
            <p className="hint">
              {t(`vessel.${kind}.effect`)}
              {days !== null && ` · ${t('ui.days', { n: days })}`}
            </p>
            <div className="row-actions">
              <CostList cost={VESSELS[kind].cost} stocks={p.stocks} />
              <button className="btn" disabled={!!error} title={error ? tm(error) : undefined} onClick={() => dispatch(cmd)} data-testid={`order-${kind}`}>
                {t('shipyard.order')}
              </button>
            </div>
          </div>
        );
      })}
      <h4>
        {t('shipyard.queue')} ({sy.queue.length}/{MAX_ORDERS})
      </h4>
      {sy.queue.length === 0 && <p className="muted">{t('shipyard.empty')}</p>}
      {sy.queue.map((o) => (
        <div key={o.id} className="row-actions" data-testid="vessel-order">
          <span>{t(`vessel.${o.kind}`)}</span>
          <Bar value={o.progress} max={VESSELS[o.kind].work} tone="info" />
          <button className="btn" onClick={() => dispatch({ type: 'cancelVessel', orderId: o.id })}>
            {t('shipyard.cancel')}
          </button>
        </div>
      ))}
      <p className="hint">{t('shipyard.upkeep', { n: fmtAmount(upkeep) })}</p>
      {sy.fleet.yacht > 0 && (
        <button className="btn" onClick={() => dispatch({ type: 'sellYacht' })} data-testid="sell-yacht">
          {t('shipyard.sell')}
        </button>
      )}
    </section>
  );
}

export const isHeritage = (id: string): boolean => !!BUILDINGS[id as keyof typeof BUILDINGS]?.landmark;
