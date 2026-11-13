import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import { calendar } from '../game/core/time';
import type { BuildingInstance, GameState, Province, ResourceId, TaxRate } from '../game/core/types';
import { NO_TOOLS_OUTPUT_PERMILLE, TAX_HAPPINESS, TRADE_OFFERS } from '../game/data/balance';
import { defOf, specOf } from '../game/data/buildings';
import { missingFor, requirementError, validateCommand } from '../game/systems/commands';
import {
  dailyOutput,
  dailyTaxIncome,
  depositInRange,
  homeProvince,
  idleWorkers,
  isBuilt,
  techOutputPermille,
} from '../game/systems/economy';
import { buildingById } from '../game/systems/grid';
import { requiredTicks } from '../game/systems/tick';
import { PLAYABLE_STYLES } from '../game/data/architecture';
import { conditionBand, decayPerDay, levelCost, repairCost, restyleCost } from '../game/systems/architecture';
import { fmtAmount, fmtInt, fmtRate, t, tm } from '../i18n';
import { Bar, CostList, Row } from './common';
import { Icon } from './icons';
import { requestDemolish } from './ValleyCanvas';

function StatusLine({ b }: { b: BuildingInstance }): ReactElement {
  const spec = specOf(b);
  let key:
    | 'status.construction'
    | 'status.upgrading'
    | 'status.disconnected'
    | 'status.unpaid'
    | 'status.unstaffed'
    | 'status.working'
    | 'status.ok' = 'status.ok';
  let tone = 'ok';
  if (!b.connected) [key, tone] = ['status.disconnected', 'bad'];
  else if (b.state === 'construction') [key, tone] = ['status.construction', 'info'];
  else if (b.unpaid) [key, tone] = ['status.unpaid', 'bad'];
  else if (spec.workerSlots > 0 && b.workers === 0) [key, tone] = ['status.unstaffed', 'warn'];
  else if (b.state === 'upgrading') [key, tone] = ['status.upgrading', 'info'];
  else if (spec.workerSlots > 0) key = 'status.working';
  return <p className={`status ${tone}`}>{t(key)}</p>;
}

/** Culture, condition and repairs of one building. */
function ArchitectureSection({ game, b }: { game: GameState; b: BuildingInstance }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  const p = homeProvince(game);
  const band = conditionBand(b.condition);
  const repair = repairCost(b);
  const repairError = validateCommand(game, { type: 'restoreBuilding', instanceId: b.id });
  const others = PLAYABLE_STYLES.filter((st) => st !== b.style || b.look !== null);
  return (
    <section className="section" data-testid="arch-section">
      <h4>{t('arch.style')}</h4>
      <Row label={t('arch.style')}>
        <span className={`style-badge style-${b.style}`} data-testid="building-style">
          {t(`style.${b.style}`)}
          {b.look ? ` · ${t('workshop.custom')}` : ''}
        </span>
      </Row>
      {isBuilt(b) && (
        <>
          <Row label={t('condition.label')}>
            <span className={`status-inline ${band === 'good' ? 'ok' : band === 'worn' ? 'warn' : 'bad'}`}>
              {Math.floor(b.condition / 100)}% · {t(`condition.${band}`)}
            </span>
          </Row>
          <Bar value={b.condition} max={10000} tone={band === 'good' ? 'ok' : band === 'worn' ? 'warn' : 'bad'} />
          <p className="hint">
            {t('condition.decay', { n: (decayPerDay(b) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) })} ·{' '}
            {t('condition.repairHint')}
          </p>
          {b.condition < 10000 && (
            <div className="row-actions">
              <CostList cost={repair} stocks={p.stocks} />
              <button
                className="btn"
                disabled={!!repairError}
                title={repairError ? tm(repairError) : undefined}
                onClick={() => dispatch({ type: 'restoreBuilding', instanceId: b.id })}
                data-testid="restore"
              >
                {t('condition.repair')}
              </button>
            </div>
          )}
        </>
      )}
      {b.state === 'active' && others.length > 0 && (
        <div className="restyle">
          <p className="hint">{t('arch.change')}</p>
          {others.map((st) => {
            const cmd = { type: 'setBuildingStyle' as const, instanceId: b.id, style: st, look: null };
            const error = validateCommand(game, cmd);
            return (
              <div key={st} className="row-actions">
                <CostList cost={restyleCost(b.definitionId, st, null)} stocks={p.stocks} />
                <button
                  className="btn"
                  disabled={!!error}
                  title={error ? tm(error) : undefined}
                  onClick={() => dispatch(cmd)}
                  data-testid={`restyle-${st}`}
                >
                  {t(`style.${st}.long`)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Explains, factor by factor, why a production building yields what it yields. */
function OutputBreakdown({
  game,
  p,
  b,
}: {
  game: GameState;
  p: Province;
  b: BuildingInstance;
}): ReactElement | null {
  const spec = specOf(b);
  const def = defOf(b);
  if (!spec.produces) return null;
  const res = spec.produces.resourceId;
  const tech = techOutputPermille(game, def.id);
  const winter = def.seasonal && calendar(game.tick).season === 'winter';
  const noTools = def.usesTools && p.stocks.tools <= 0;
  const out = dailyOutput(game, p, b);
  const inRange = def.harvests ? depositInRange(p, b) : null;
  return (
    <section className="section">
      <h4>{t('inspector.production')}</h4>
      <Row
        label={
          <>
            <Icon name={res} size={15} /> {t(`resource.${res}`)}
          </>
        }
      >
        <b className={out > 0 ? 'pos' : ''}>{t('hud.perDay', { rate: fmtRate(out) })}</b>
      </Row>
      <ul className="why">
        <li>{t('why.base', { n: fmtAmount(spec.produces.perDay), slots: spec.workerSlots })}</li>
        <li className={b.workers < spec.workerSlots ? 'warn' : ''}>
          {t('why.staff', {
            n: b.workers,
            slots: spec.workerSlots,
            pct: Math.round((b.workers / spec.workerSlots) * 100),
          })}
        </li>
        {tech !== 1000 && <li className="pos">{t('why.tech', { pct: Math.round(tech / 10 - 100) })}</li>}
        {b.condition < 5000 && (
          <li className="bad">{t(b.condition < 2500 ? 'condition.poor' : 'condition.worn')}</li>
        )}
        {def.id === 'school' && b.style === 'scottish' && <li className="pos">{t('style.scottish.bonus2')}</li>}
        {noTools && <li className="bad">{t('why.noTools', { pct: 100 - NO_TOOLS_OUTPUT_PERMILLE / 10 })}</li>}
        {winter && <li className="bad">{t('why.winter')}</li>}
        {!b.connected && <li className="bad">{t('why.disconnected')}</li>}
        {b.unpaid && <li className="bad">{t('why.unpaid')}</li>}
        {inRange !== null && (
          <li className={inRange <= 0 ? 'bad' : ''}>
            {t(def.harvests!.terrain === 'forest' ? 'why.forestLeft' : 'why.stoneLeft', {
              n: fmtInt(inRange),
              r: def.harvests!.radius,
            })}
          </li>
        )}
      </ul>
    </section>
  );
}

function TownHall({ game, p }: { game: GameState; p: Province }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  return (
    <>
      <section className="section">
        <h4>{t('inspector.tax')}</h4>
        <div className="segmented" role="group" aria-label={t('inspector.tax')}>
          {(['low', 'normal', 'high'] as TaxRate[]).map((rate) => (
            <button
              key={rate}
              className={`btn ${p.taxRate === rate ? 'active' : ''}`}
              aria-pressed={p.taxRate === rate}
              onClick={() => dispatch({ type: 'setTaxRate', taxRate: rate })}
            >
              {t(`tax.${rate}`)}
            </button>
          ))}
        </div>
        <p className="hint">
          {t('inspector.taxEffect', {
            gold: fmtRate(dailyTaxIncome(p)),
            happy: (TAX_HAPPINESS[p.taxRate] > 0 ? '+' : '') + TAX_HAPPINESS[p.taxRate],
          })}
        </p>
      </section>
      <section className="section">
        <h4>{t('inspector.merchant')}</h4>
        <p className="hint">{t('inspector.merchantHint')}</p>
        <div className="trade-list">
          {TRADE_OFFERS.map((offer) => {
            const error = validateCommand(game, { type: 'trade', offerId: offer.id });
            const giveId = Object.keys(offer.give)[0] as ResourceId;
            const getId = Object.keys(offer.get)[0] as ResourceId;
            return (
              <button
                key={offer.id}
                className="btn trade"
                disabled={!!error}
                title={error ? tm(error) : t('inspector.tradeDo')}
                onClick={() => dispatch({ type: 'trade', offerId: offer.id })}
                data-testid={`trade-${offer.id}`}
              >
                <span className="cost">
                  <Icon name={giveId} size={15} />
                  {fmtAmount(offer.give[giveId]!)}
                </span>
                <span aria-hidden="true">→</span>
                <span className="cost">
                  <Icon name={getId} size={15} />
                  {fmtAmount(offer.get[getId]!)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function Inspector({ game }: { game: GameState }): ReactElement | null {
  const selectedId = useApp((s) => s.selectedBuildingId);
  const dispatch = useApp((s) => s.dispatch);
  const select = useApp((s) => s.select);
  const p = homeProvince(game);
  const b = selectedId ? buildingById(p, selectedId) : undefined;
  if (!b) return null;
  const def = defOf(b);
  const spec = specOf(b);
  const next = def.levels[b.level];
  const nextCost = next ? levelCost(b.definitionId, b.level, b.style, b.look) : {};
  const idle = idleWorkers(p);
  const busy = b.state !== 'active';
  const upgradeError = next ? validateCommand(game, { type: 'upgradeBuilding', instanceId: b.id }) : null;
  const demolishError = validateCommand(game, { type: 'demolishBuilding', instanceId: b.id });
  const storage = Object.keys(spec.storage) as ResourceId[];

  return (
    <aside className="inspector card" aria-label={t('inspector.title')} data-testid="inspector">
      <header className="card-head">
        <h3>
          {t(`building.${b.definitionId}.name`)}
          {isBuilt(b) && (
            <span className="level">{t('inspector.level', { n: b.level, max: def.levels.length })}</span>
          )}
        </h3>
        <button className="btn icon-btn" onClick={() => select(null)} aria-label={t('ui.close')}>
          ✕
        </button>
      </header>
      <p className="muted">{t(`building.${b.definitionId}.desc`)}</p>
      <StatusLine b={b} />

      {busy && (
        <section className="section">
          <Row label={t(b.state === 'construction' ? 'inspector.building' : 'inspector.upgrading')}>
            {t('inspector.daysLeft', { n: Math.ceil((requiredTicks(b) - b.progressTicks) / 24) })}
          </Row>
          <Bar value={b.progressTicks} max={requiredTicks(b)} tone="info" />
          <button
            className="btn danger block"
            onClick={() =>
              b.state === 'construction'
                ? requestDemolish(b.id)
                : dispatch({ type: 'cancelConstruction', instanceId: b.id })
            }
          >
            {t(b.state === 'construction' ? 'inspector.cancelBuild' : 'inspector.cancelUpgrade')}
          </button>
          <p className="hint">{t('inspector.cancelHint')}</p>
        </section>
      )}

      {isBuilt(b) && spec.workerSlots > 0 && (
        <section className="section">
          <h4>{t('inspector.workers')}</h4>
          <div className="stepper">
            <button
              className="btn icon-btn"
              onClick={() => dispatch({ type: 'assignWorkers', instanceId: b.id, workers: b.workers - 1 })}
              disabled={b.workers <= 0}
              aria-label={t('inspector.removeWorker')}
              data-testid="worker-minus"
            >
              −
            </button>
            <span className="stepper-value" data-testid="worker-count">
              <Icon name="worker" /> {b.workers} / {spec.workerSlots}
            </span>
            <button
              className="btn icon-btn"
              onClick={() => dispatch({ type: 'assignWorkers', instanceId: b.id, workers: b.workers + 1 })}
              disabled={b.workers >= spec.workerSlots || idle <= 0}
              aria-label={t('inspector.addWorker')}
              data-testid="worker-plus"
            >
              +
            </button>
            <button
              className="btn"
              onClick={() =>
                dispatch({
                  type: 'assignWorkers',
                  instanceId: b.id,
                  workers: Math.min(spec.workerSlots, b.workers + idle),
                })
              }
              disabled={b.workers >= spec.workerSlots || idle <= 0}
              data-testid="worker-max"
            >
              {t('inspector.fill')}
            </button>
          </div>
          <p className={`hint ${idle === 0 && b.workers < spec.workerSlots ? 'warn' : ''}`}>
            {idle === 0 && b.workers < spec.workerSlots
              ? t('inspector.noIdle')
              : t('inspector.idle', { n: idle })}
          </p>
        </section>
      )}

      {isBuilt(b) && <OutputBreakdown game={game} p={p} b={b} />}

      <ArchitectureSection game={game} b={b} />

      {isBuilt(b) &&
        (spec.housing > 0 || storage.length > 0 || spec.goldIncome > 0 || spec.upkeepGold > 0) && (
          <section className="section">
            <h4>{t('inspector.effects')}</h4>
            {spec.housing > 0 && (
              <Row
                label={
                  <>
                    <Icon name="home" size={15} /> {t('inspector.housing')}
                  </>
                }
              >
                {b.connected ? `+${spec.housing}` : t('inspector.inactive')}
              </Row>
            )}
            {spec.taxIncome > 0 && (
              <Row
                label={
                  <>
                    <Icon name="gold" size={15} /> {t('inspector.taxIncome')}
                  </>
                }
              >
                {t('hud.perDay', { rate: fmtRate(spec.taxIncome) })}
              </Row>
            )}
            {spec.goldIncome > 0 && (
              <Row
                label={
                  <>
                    <Icon name="gold" size={15} /> {t('inspector.income')}
                  </>
                }
              >
                {t('hud.perDay', { rate: fmtRate(spec.goldIncome) })}
              </Row>
            )}
            {storage.map((id) => (
              <Row
                key={id}
                label={
                  <>
                    <Icon name={id} size={15} /> {t('inspector.storage', { resource: `@resource.${id}` })}
                  </>
                }
              >
                +{fmtInt(spec.storage[id]!)}
              </Row>
            ))}
            {spec.upkeepGold > 0 && (
              <Row
                label={
                  <>
                    <Icon name="gold" size={15} /> {t('inspector.upkeep')}
                  </>
                }
              >
                {t('hud.perDay', { rate: fmtRate(-spec.upkeepGold) })}
              </Row>
            )}
          </section>
        )}

      {b.definitionId === 'town_center' && <TownHall game={game} p={p} />}

      {isBuilt(b) && (
        <section className="section">
          <h4>{t('inspector.upgrade')}</h4>
          {next ? (
            <>
              <Row label={t('inspector.upgradeCost')}>
                <CostList cost={nextCost} stocks={p.stocks} />
              </Row>
              <p className="hint">{t(`building.${b.definitionId}.upgrade`)}</p>
              <button
                className="btn primary block"
                disabled={!!upgradeError}
                onClick={() => dispatch({ type: 'upgradeBuilding', instanceId: b.id })}
                data-testid="upgrade"
              >
                {t('inspector.upgradeTo', { n: b.level + 1 })}
              </button>
              {upgradeError && (
                <p className="hint warn">
                  {tm(requirementError(game, next) ?? missingFor(p, nextCost) ?? upgradeError)}
                </p>
              )}
            </>
          ) : (
            <p className="hint">{t('inspector.maxLevel')}</p>
          )}
        </section>
      )}

      {def.demolishable && b.state === 'active' && (
        <section className="section">
          <button
            className="btn danger block"
            disabled={!!demolishError}
            onClick={() => requestDemolish(b.id)}
          >
            {t('inspector.demolish')}
          </button>
          {demolishError && <p className="hint warn">{tm(demolishError)}</p>}
        </section>
      )}
    </aside>
  );
}
