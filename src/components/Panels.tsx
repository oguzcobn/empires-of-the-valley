import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { SLOT_IDS, useApp } from '../app/store';
import type { SlotId } from '../app/store';
import { calendar } from '../game/core/time';
import type { GameState, ResourceId, TechId } from '../game/core/types';
import { GAME_VERSION } from '../game/data/balance';
import { QUESTS } from '../game/data/quests';
import { TECHNOLOGIES, TECH_IDS } from '../game/data/technologies';
import { WORLD_PROVINCES } from '../game/data/worldMap';
import { cityOf, districtName } from '../game/data/cities';
import { citizens } from '../game/data/citizens';
import type { WorldProvince } from '../game/data/worldMap';
import { validateCommand } from '../game/systems/commands';
import { forecastBattle } from '../game/systems/combat';
import {
  UNCAPPED,
  computeFlows,
  homeProvince,
  housingCapacity,
  idleWorkers,
  assignedWorkers,
  storageCaps,
  totalPopulation,
} from '../game/systems/economy';
import { growthBlocker, happinessFactors, happinessTarget } from '../game/systems/population';
import { fmtAmount, fmtInt, fmtRate, t, tm } from '../i18n';
import { Bar, Modal, Row } from './common';
import { GRAPHICS_SETTINGS, effectiveQuality } from '../app/settings';
import { Icon } from './icons';
import { ObjectiveList, rewardLabel } from './QuestTracker';
import { WorkshopPanel } from './Workshop';
import { AtlasPanel, TourismPanel } from './Heritage';

const RESOURCES: ResourceId[] = ['wood', 'stone', 'food', 'gold', 'tools', 'research'];

function EconomyPanel({ game }: { game: GameState }): ReactElement {
  const p = homeProvince(game);
  const flows = useMemo(() => computeFlows(game), [game]);
  const caps = storageCaps(game, p);
  return (
    <>
      <p className="hint">{t('economy.intro')}</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('economy.resource')}</th>
              <th>{t('economy.stock')}</th>
              <th>{t('economy.net')}</th>
              <th>{t('economy.sources')}</th>
              <th>{t('economy.consumers')}</th>
              <th>{t('economy.yesterday')}</th>
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map((id) => {
              const f = flows[id];
              const capped = caps[id] !== UNCAPPED;
              return (
                <tr key={id}>
                  <th scope="row">
                    <Icon name={id} /> {t(`resource.${id}`)}
                  </th>
                  <td>
                    {fmtInt(p.stocks[id])}
                    {capped && <span className="muted"> / {fmtInt(caps[id])}</span>}
                    {capped && (
                      <Bar
                        value={p.stocks[id]}
                        max={caps[id]}
                        tone={p.stocks[id] >= caps[id] ? 'warn' : 'ok'}
                      />
                    )}
                  </td>
                  <td className={f.net > 0 ? 'pos' : f.net < 0 ? 'neg' : ''}>{fmtRate(f.net)}</td>
                  <td>
                    {f.sources.length ? (
                      f.sources.map((l) => (
                        <div key={l.label}>
                          {t('economy.line', { label: l.label, rate: fmtRate(l.amount) })}
                        </div>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {f.consumers.length ? (
                      f.consumers.map((l) => (
                        <div key={l.label}>
                          {t('economy.line', { label: l.label, rate: fmtRate(-l.amount) })}
                        </div>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="muted">
                    +{fmtAmount(p.yesterday.produced[id])} / −{fmtAmount(p.yesterday.consumed[id])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('economy.note')}</p>
    </>
  );
}

function PopulationPanel({ game }: { game: GameState }): ReactElement {
  const p = homeProvince(game);
  const pop = totalPopulation(p);
  const cap = housingCapacity(p);
  const factors = happinessFactors(p);
  const blocker = growthBlocker(p, calendar(game.tick).day);
  return (
    <div className="grid-2">
      <section>
        <h4>{t('population.demographics')}</h4>
        <Row label={t('population.adults')}>{p.population.adults}</Row>
        <Row label={t('population.children')}>{p.population.children}</Row>
        <Row label={t('population.elders')}>{p.population.elders}</Row>
        <Row label={<b>{t('population.total')}</b>}>
          <b>
            {pop} / {cap}
          </b>
        </Row>
        <Bar value={pop} max={Math.max(cap, 1)} tone={pop > cap ? 'bad' : pop === cap ? 'warn' : 'ok'} />
        <h4>{t('population.employment')}</h4>
        <Row label={t('population.employed')}>{assignedWorkers(p)}</Row>
        <Row label={t('population.idle')}>{idleWorkers(p)}</Row>
        <h4>{t('population.growth')}</h4>
        <p className={blocker && blocker !== 'interval' ? 'hint warn' : 'hint'}>
          {t(`growth.${blocker ?? 'ready'}`)}
        </p>
      </section>
      <section>
        <h4>
          {t('population.happiness')}: {p.happiness} <span className="muted">→ {happinessTarget(p)}</span>
        </h4>
        <Bar
          value={p.happiness}
          max={100}
          tone={p.happiness >= 60 ? 'ok' : p.happiness >= 40 ? 'warn' : 'bad'}
        />
        <p className="hint">{t('population.happinessHint')}</p>
        {factors.map((f) => (
          <Row key={f.id} label={t(`happiness.${f.id}`)}>
            <span className={f.value > 0 ? 'pos' : f.value < 0 ? 'neg' : 'muted'}>
              {f.value > 0 ? `+${f.value}` : f.value}
            </span>
          </Row>
        ))}
        <p className="hint">{t('population.services')}</p>
      </section>
      <section className="citizen-roster">
        <h4>Şehrin Sakinleri</h4>
        <p className="hint">İsme sahip örnek vatandaşlar; isimler kaydedilen şehir ve harita tohumuyla aynı kalır.</p>
        <div className="citizens-list">
          {citizens(game, 18).map((person) => (
            <div key={person.id} className="citizen-row" title={person.occupation}>
              <span aria-hidden="true">◉</span>
              <span><strong>{person.name}</strong><small>{person.age} yaş · {person.occupation}</small></span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResearchPanel({ game }: { game: GameState }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  const p = homeProvince(game);
  const active = game.researchQueue[0];
  return (
    <>
      <p className="hint">{t('research.intro', { points: fmtAmount(p.stocks.research) })}</p>
      {active ? (
        <div className="research-active">
          <Row label={<b>{t('research.active', { tech: `@tech.${active}.name` })}</b>}>
            {fmtAmount(game.researchProgress)} / {fmtAmount(TECHNOLOGIES[active].cost)}
          </Row>
          <Bar value={game.researchProgress} max={TECHNOLOGIES[active].cost} tone="info" />
        </div>
      ) : (
        <p className="hint">{t('research.none')}</p>
      )}
      <div className="tech-grid">
        {TECH_IDS.map((id: TechId) => {
          const tech = TECHNOLOGIES[id];
          const done = game.researchedTechIds.includes(id);
          const queuedAt = game.researchQueue.indexOf(id);
          const error =
            done || queuedAt >= 0 ? null : validateCommand(game, { type: 'queueResearch', techId: id });
          const state = done
            ? 'done'
            : queuedAt === 0
              ? 'active'
              : queuedAt > 0
                ? 'queued'
                : error
                  ? 'locked'
                  : 'available';
          return (
            <article key={id} className={`tech ${state}`} data-testid={`tech-${id}`}>
              <header>
                <h4>{t(`tech.${id}.name`)}</h4>
                <span className="badge">
                  {t(`research.state.${state}`)}
                  {queuedAt > 0 ? ` #${queuedAt + 1}` : ''}
                </span>
              </header>
              <p className="eyebrow">
                {t(`branch.${tech.branch}`)} · {t('research.cost', { n: fmtAmount(tech.cost) })}
              </p>
              <p>{t(`tech.${id}.desc`)}</p>
              {tech.prerequisites.length > 0 && (
                <p className="hint">
                  {t('research.requires', {
                    tech: tech.prerequisites.map((x) => t(`tech.${x}.name`)).join(', '),
                  })}
                </p>
              )}
              {!done && queuedAt < 0 && (
                <button
                  className="btn primary"
                  disabled={!!error}
                  onClick={() => dispatch({ type: 'queueResearch', techId: id })}
                  data-testid={`queue-${id}`}
                >
                  {t('research.queue')}
                </button>
              )}
              {queuedAt >= 0 && (
                <button className="btn" onClick={() => dispatch({ type: 'dequeueResearch', techId: id })}>
                  {t('research.dequeue')}
                </button>
              )}
              {error && <p className="hint warn">{tm(error)}</p>}
            </article>
          );
        })}
      </div>
      <p className="hint">{t('research.eraNote')}</p>
    </>
  );
}

function JournalPanel({ game }: { game: GameState }): ReactElement {
  const done = QUESTS.filter((q) => game.questProgress[q.id]?.status === 'completed').length;
  return (
    <>
      <p className="eyebrow">{t('chapter.1.title')}</p>
      <p className="story">{t('intro.story')}</p>
      <Row label={t('journal.progress')}>
        {done} / {QUESTS.length}
      </Row>
      <Bar value={done} max={QUESTS.length} />
      <ol className="journal">
        {QUESTS.map((q) => {
          const progress = game.questProgress[q.id];
          const status = progress?.status ?? 'locked';
          return (
            <li key={q.id} className={status} data-testid={`journal-${q.id}`} data-status={status}>
              <h4>
                <span aria-hidden="true">
                  {status === 'completed' ? '✔' : status === 'active' ? '➤' : '◌'}
                </span>{' '}
                {t(`quest.${q.id}.title`)}
                <span className="badge">{t(`journal.${status}`)}</span>
              </h4>
              {status !== 'locked' && <p>{t(`quest.${q.id}.desc`)}</p>}
              {status === 'active' && <ObjectiveList game={game} quest={q} />}
              {status !== 'locked' && (
                <p className="reward">
                  {t('quest.reward')}: {rewardLabel(q)}
                  {status === 'completed' && progress?.completedTick != null && (
                    <span className="muted">
                      {' '}
                      · {t('journal.doneOn', { n: Math.floor(progress.completedTick / 24) + 1 })}
                    </span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="hint">{t('journal.later')}</p>
    </>
  );
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

const BIOME_COLOR: Record<WorldProvince['biome'], string> = {
  capital: '#e0b23c',
  fertile_plain: '#9ccc65',
  forest: '#4f9a54',
  mountain: '#9aa0a6',
  river_valley: '#6fb7d9',
  coast: '#5aa7cf',
  steppe: '#cdbf7a',
  trade_crossroads: '#d99a5b',
};

function WorldPanel({ game }: { game: GameState }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  const city = cityOf(game.cityId, game.culture);
  const [picked, setPicked] = useState<string>(game.homeProvinceId);
  const R = 46;
  const W = Math.sqrt(3) * R;
  const center = (p: WorldProvince): [number, number] => [
    60 + p.col * W + (p.row % 2 === 1 ? W / 2 : 0),
    60 + p.row * R * 1.5,
  ];
  const pickedProvince = WORLD_PROVINCES.find((p) => p.id === picked) ?? WORLD_PROVINCES[0]!;
  const owned = [game.homeProvinceId, ...(game.claimedDistricts ?? [])];
  const claimed = owned.includes(picked);
  const adjacent = pickedProvince.neighbors.some((id) => owned.includes(id));
  const cost = 20 + (game.claimedDistricts?.length ?? 0) * 10;
  const available = validateCommand(game, { type: 'claimDistrict', provinceId: picked }) === null;
  const attackAvailable = validateCommand(game, { type: 'attackDistrict', provinceId: picked }) === null;
  const battle = forecastBattle(game, picked);
  const label = (p: WorldProvince): string => p.id === game.homeProvinceId
    ? city.name
    : districtName(game.cityId, game.culture, WORLD_PROVINCES.indexOf(p));

  return (
    <>
      <p className="notice">
        <strong>{city.name}</strong> · {city.leaderTitle}: {city.leader}. İlçeleri komşuluk sırasıyla
        yönetimine kat; her yeni bölge günlük altın ve yiyecek getirir.
      </p>
      <div className="world">
        <svg viewBox="0 0 560 330" role="group" aria-label={t('panel.world')}>
          {WORLD_PROVINCES.map((p) => {
            const [cx, cy] = center(p);
            const home = p.id === game.homeProvinceId;
            const secured = owned.includes(p.id);
            const name = label(p);
            return (
              <g key={p.id}
                className={`hex ${picked === p.id ? 'picked' : ''}`}
                onClick={() => setPicked(p.id)}
                tabIndex={0} role="button" aria-label={name}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPicked(p.id)}
                data-testid={`province-${p.id}`}
                data-known={game.revealedProvinceIds.includes(p.id)}
              >
                <polygon points={hexPoints(cx, cy, R - 2)}
                  fill={secured ? BIOME_COLOR[p.biome] : '#aebdcb'}
                  stroke={adjacent ? '#c8823b' : '#8ca1ac'} strokeWidth={adjacent ? 2.5 : 1}
                  opacity={secured ? 1 : 0.78} />
                {home && <polygon points={hexPoints(cx, cy, R - 8)} fill="none" stroke="#7a3b1c" strokeWidth="3" />}
                <text x={cx} y={cy - 2} textAnchor="middle" className="hex-label"
                  style={{fontSize: name.length > 11 ? '9px' : '11px'}}>
                  {name.length > 15 ? name.slice(0, 14) + '…' : name}
                </text>
                <text x={cx} y={cy + 13} textAnchor="middle" className="hex-sub">
                  {home ? '★ Başkent' : secured ? '✓' : adjacent ? '◎ Komşu' : '·'}
                </text>
              </g>
            );
          })}
        </svg>
        <aside className="world-info">
          <h4>{label(pickedProvince)}</h4>
          <Row label="Durum">{claimed ? 'Yönetiminde' : adjacent ? 'Genişlemeye uygun komşu' : 'Önce komşuları al'}</Row>
          <Row label="Arazi">{t(`biome.${pickedProvince.biome}`)}</Row>
          <Row label="Bağlantılar">{pickedProvince.neighbors.length}</Row>
          <Row label="Kontrol edilen bölge">{owned.length} / {WORLD_PROVINCES.length}</Row>
          {!claimed && (
            <>
              <p className="hint">Genişleme: {cost} altın · en az 20 nüfus · 1. bölüm tamamlanmış olmalı.</p>
              <button className="btn primary" disabled={!available}
                onClick={() => dispatch({ type: 'claimDistrict', provinceId: picked })}
                data-testid="claim-district">
                İlçeyi Yönetimine Kat
              </button>
              {!available && <p className="hint">Yeterli altın, nüfus ve komşu toprak şartlarını kontrol et.</p>}
              <div className="actions">
                <button className="btn" disabled={!attackAvailable}
                  onClick={() => dispatch({ type: 'attackDistrict', provinceId: picked })}
                  data-testid="attack-district">
                  ⚔ Otomatik Savaş
                </button>
              </div>
              {battle && <p className="hint">Milis: {battle.attackers} · Hücum: {battle.attackPower} · Savunma: {battle.defensePower} · Tahmini kayıp: {battle.casualties} · {battle.victory ? 'Zafer bekleniyor' : 'Mağlubiyet bekleniyor'}. Sefer bedeli: 5 altın, 3 yiyecek.</p>}

            </>
          )}
          <p className="hint">Bölgeler stratejik haritada genişler. Ayrı ilçelerde bina inşası sonraki geliştirme aşamasıdır.</p>
        </aside>
      </div>
    </>
  );
}

function ArmyPanel({ game }: { game: GameState }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  const setTool = useApp((s) => s.setTool);
  const openPanel = useApp((s) => s.openPanel);
  const p = homeProvince(game);
  const ready = validateCommand(game, { type: 'recruitMilitia', amount: 5 }) === null;
  const towers = p.buildings.filter((b) => b.definitionId === 'watchtower' && b.state === 'active').length;
  const force = game.militia ?? 0;
  const order = game.armyOrder ?? 'defend';
  return (
    <div className="grid-2">
      <section>
        <h4>Şehir Savunma Birliği</h4>
        <Row label="Eğitimli milis">{force} asker</Row>
        <Row label="Gözetleme kulesi">{towers}</Row>
        <Row label="Güvenli ilçeler">{game.claimedDistricts?.length ?? 0}</Row>
        <p className="hint">5 milis eğitmek için 10 altın, 5 yiyecek ve çalışan bir gözetleme kulesi gerekir.</p>
        <button className="btn primary" disabled={!ready} onClick={() => dispatch({ type: 'recruitMilitia', amount: 5 })}>
          +5 Milis Eğit
        </button>
      </section>
      <section>
        <h4>Birlik Emirleri</h4>
        <div className="actions">
          <button className={`btn ${order === 'defend' ? 'primary' : ''}`}
            onClick={() => dispatch({ type: 'setArmyOrder', order: 'defend' })}>Şehri Savun</button>
          <button className={`btn ${order === 'patrol' ? 'primary' : ''}`}
            onClick={() => dispatch({ type: 'setArmyOrder', order: 'patrol' })}>Sınır Devriyesi</button>
        </div>
        <button className="btn" disabled={force === 0} onClick={() => {
          setTool({ kind: 'army' });
          openPanel(null);
        }}>⚔ Haritada Birlikleri Taşı (G)</button>
        <p className="hint">Birlik Taşı aracını seçip yol karelerine tıkla. Muhafızlar kesişen yollar üzerinden hedefe yürür; savaşların sonucu şimdilik stratejik savunma puanlarıyla hesaplanır.</p>
      </section>
    </div>
  );
}

export function SavePanel({ inGame }: { inGame: boolean }): ReactElement {
  const slots = useApp((s) => s.slots);
  const slotsError = useApp((s) => s.slotsError);
  const { saveTo, loadFrom, removeSlot, exportSave, importSave, ask, exitToTitle, openPanel } =
    useApp.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmLoad = (run: () => void): void => {
    if (!inGame) return run();
    ask({
      title: t('confirm.load.title'),
      body: t('confirm.load.body'),
      confirmLabel: t('save.load'),
      onConfirm: run,
    });
  };
  return (
    <>
      <p className="notice">{t('save.localOnly')}</p>
      {slotsError && (
        <p className="hint warn" role="alert">
          {t('save.err.unavailable', { detail: slotsError })}
        </p>
      )}
      <ul className="slots">
        {SLOT_IDS.map((slotId: SlotId) => {
          const info = slots.find((s) => s.slotId === slotId);
          return (
            <li key={slotId} className="slot" data-testid={`slot-${slotId}`}>
              <div>
                <h4>{t(`save.slot.${slotId}`)}</h4>
                {info ? (
                  <p className="muted">
                    {t('save.meta', { day: info.meta.day, pop: info.meta.population, seed: info.meta.seed })}{' '}
                    · {t(`mode.${info.meta.mode}`)}
                    <br />
                    {new Date(info.meta.savedAt).toLocaleString('tr-TR')} · v{info.meta.gameVersion} ·{' '}
                    {t('save.schema', { n: info.meta.schemaVersion })}
                  </p>
                ) : (
                  <p className="muted">{t('save.emptySlot')}</p>
                )}
              </div>
              <div className="slot-actions">
                {inGame && slotId !== 'auto' && (
                  <button
                    className="btn primary"
                    onClick={() => void saveTo(slotId)}
                    data-testid={`save-${slotId}`}
                  >
                    {t('save.save')}
                  </button>
                )}
                <button
                  className="btn"
                  disabled={!info}
                  onClick={() => confirmLoad(() => void loadFrom(slotId))}
                  data-testid={`load-${slotId}`}
                >
                  {t('save.load')}
                </button>
                <button
                  className="btn danger"
                  disabled={!info}
                  onClick={() =>
                    ask({
                      title: t('confirm.delete.title'),
                      body: t('confirm.delete.body'),
                      confirmLabel: t('save.delete'),
                      danger: true,
                      onConfirm: () => void removeSlot(slotId),
                    })
                  }
                >
                  {t('save.delete')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="actions spread">
        <span>
          {inGame && (
            <button className="btn" onClick={exportSave} data-testid="export">
              {t('save.export')}
            </button>
          )}{' '}
          <button className="btn" onClick={() => fileRef.current?.click()}>
            {t('save.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="import-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) confirmLoad(() => void importSave(file));
            }}
          />
        </span>
        {inGame && (
          <span>
            <button className="btn" onClick={() => openPanel('settings')}>
              {t('panel.settings')}
            </button>{' '}
            <button className="btn" onClick={() => void exitToTitle()} data-testid="exit-title">
              {t('save.exit')}
            </button>
          </span>
        )}
      </div>
      <BackupList />
    </>
  );
}

function BackupList(): ReactElement | null {
  const backups = useApp((s) => s.backups);
  const { refreshBackups, downloadBackup } = useApp.getState();
  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);
  if (!backups.length) return null;
  return (
    <section className="section" data-testid="backups">
      <h4>{t('save.backups')}</h4>
      <p className="hint">{t('save.backupsHint')}</p>
      <ul className="slots">
        {backups.slice(0, 6).map((b) => (
          <li key={b.id} className="slot">
            <div>
              <b>{b.source}</b>
              <p className="muted">
                v{b.schemaVersion} · {new Date(b.createdAt).toLocaleString('tr-TR')}
              </p>
            </div>
            <div className="slot-actions">
              <button className="btn" onClick={() => downloadBackup(b.id)}>
                {t('save.backupDownload')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SettingsPanel({ game }: { game: GameState | null }): ReactElement {
  const settings = useApp((s) => s.settings);
  const { updateSettings, dispatch } = useApp.getState();
  return (
    <div className="settings">
      <label className="field">
        <span>{t('settings.autosave')}</span>
        <select
          className="input"
          value={settings.autosaveMinutes}
          onChange={(e) => updateSettings({ autosaveMinutes: Number(e.target.value) as 0 | 1 | 5 | 10 })}
        >
          <option value={0}>{t('settings.autosaveOff')}</option>
          {[1, 5, 10].map((m) => (
            <option key={m} value={m}>
              {t('settings.minutes', { n: m })}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('settings.uiScale')}</span>
        <select
          className="input"
          value={settings.uiScale}
          onChange={(e) => updateSettings({ uiScale: Number(e.target.value) as 90 | 100 | 115 | 130 })}
        >
          {[90, 100, 115, 130].map((s) => (
            <option key={s} value={s}>
              %{s}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('settings.language')}</span>
        <select className="input" value="tr" onChange={() => undefined} aria-describedby="lang-note">
          <option value="tr">Türkçe</option>
        </select>
      </label>
      <p className="hint" id="lang-note">
        {t('settings.languageNote')}
      </p>
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(e) => updateSettings({ muted: e.target.checked })}
        />
        <span>{t('settings.mute')}</span>
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
        />
        <span>{t('settings.reducedMotion')}</span>
      </label>
      <fieldset className="field plain" data-testid="graphics-settings">
        <legend>{t('graphics.quality')}</legend>
        <div className="segmented" role="group" aria-label={t('graphics.quality')}>
          {GRAPHICS_SETTINGS.map((q) => (
            <button
              key={q}
              className={`btn ${settings.graphics === q ? 'active' : ''}`}
              aria-pressed={settings.graphics === q}
              onClick={() => updateSettings({ graphics: q })}
              data-testid={`graphics-${q}`}
            >
              {t(`graphics.${q}`)}
            </button>
          ))}
        </div>
        <p className="hint">
          {t('graphics.hint')} {t('graphics.active', { q: `@graphics.${effectiveQuality(settings)}` })}
        </p>
      </fieldset>
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.dayNight}
          onChange={(e) => updateSettings({ dayNight: e.target.checked })}
        />
        <span>{t('graphics.dayNight')}</span>
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.weather}
          onChange={(e) => updateSettings({ weather: e.target.checked })}
        />
        <span>{t('graphics.weather')}</span>
      </label>
      {game && (
        <label className="check-field">
          <input
            type="checkbox"
            checked={game.settings.autoPauseOnMilestone}
            onChange={(e) => dispatch({ type: 'setAutoPause', enabled: e.target.checked })}
          />
          <span>{t('settings.autoPause')}</span>
        </label>
      )}
      <label className="check-field">
        <input
          type="checkbox"
          checked={settings.showPerf}
          onChange={(e) => updateSettings({ showPerf: e.target.checked })}
        />
        <span>{t('settings.perf')}</span>
      </label>
    </div>
  );
}

function LogPanel({ game }: { game: GameState }): ReactElement {
  const { focusOn, openPanel } = useApp.getState();
  const events = [...game.eventLog].reverse();
  return (
    <ul className="log">
      {events.map((e) => {
        const cal = calendar(e.tick);
        return (
          <li key={e.id} className={e.kind}>
            <span className="muted">
              {t(`season.${cal.season}`)} {cal.dayOfSeason}
            </span>
            <span>{t(e.key, e.params)}</span>
            {e.at && (
              <button
                className="btn link"
                onClick={() => {
                  focusOn(e.at!.x, e.at!.y);
                  openPanel(null);
                }}
              >
                {t('alerts.jump')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const SHORTCUTS: [
  string,
  (
    | 'help.key.pause'
    | 'help.key.speed'
    | 'help.key.cancel'
    | 'help.key.build'
    | 'help.key.road'
    | 'help.key.demolish'
    | 'help.key.map'
    | 'help.key.zoom'
    | 'help.key.pan'
    | 'help.key.perf'
  ),
][] = [
  ['Space', 'help.key.pause'],
  ['1 / 2 / 3', 'help.key.speed'],
  ['Esc', 'help.key.cancel'],
  ['B', 'help.key.build'],
  ['R', 'help.key.road'],
  ['X', 'help.key.demolish'],
  ['M', 'help.key.map'],
  ['+ / −', 'help.key.zoom'],
  ['W A S D / ← ↑ → ↓', 'help.key.pan'],
  ['F3', 'help.key.perf'],
];
const GLOSSARY = [
  'road',
  'storage',
  'workers',
  'happiness',
  'seasons',
  'tools',
  'merchant',
  'forest',
] as const;

function HelpPanel(): ReactElement {
  return (
    <div className="grid-2">
      <section>
        <h4>{t('help.shortcuts')}</h4>
        {SHORTCUTS.map(([key, label]) => (
          <Row key={key} label={<kbd>{key}</kbd>}>
            {t(label)}
          </Row>
        ))}
        <p className="hint">{t('help.mouse')}</p>
      </section>
      <section>
        <h4>{t('help.glossary')}</h4>
        <dl className="glossary">
          {GLOSSARY.map((g) => (
            <div key={g}>
              <dt>{t(`glossary.${g}.term`)}</dt>
              <dd>{t(`glossary.${g}.text`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function CreditsPanel(): ReactElement {
  return (
    <>
      <p>{t('credits.body')}</p>
      <p className="hint">{t('credits.tech')}</p>
      <p className="hint">{t('credits.version', { v: GAME_VERSION })}</p>
    </>
  );
}

/** Renders whichever panel is open. Each panel is a real, working screen — no placeholders. */
export function PanelHost({ game }: { game: GameState | null }): ReactElement | null {
  const panel = useApp((s) => s.panel);
  const openPanel = useApp((s) => s.openPanel);
  if (!panel) return null;
  const close = (): void => openPanel(null);
  if (panel === 'saves')
    return (
      <Modal title={t(game ? 'panel.saves' : 'title.load')} onClose={close}>
        <SavePanel inGame={!!game} />
      </Modal>
    );
  if (panel === 'settings')
    return (
      <Modal title={t('panel.settings')} onClose={close}>
        <SettingsPanel game={game} />
      </Modal>
    );
  if (panel === 'credits')
    return (
      <Modal title={t('title.credits')} onClose={close}>
        <CreditsPanel />
      </Modal>
    );
  if (panel === 'help')
    return (
      <Modal title={t('panel.help')} onClose={close} wide>
        <HelpPanel />
      </Modal>
    );
  if (!game) return null;
  switch (panel) {
    case 'economy':
      return (
        <Modal title={t('panel.economy')} onClose={close} wide>
          <EconomyPanel game={game} />
        </Modal>
      );
    case 'population':
      return (
        <Modal title={t('panel.population')} onClose={close} wide>
          <PopulationPanel game={game} />
        </Modal>
      );
    case 'research':
      return (
        <Modal title={t('panel.research')} onClose={close} wide>
          <ResearchPanel game={game} />
        </Modal>
      );
    case 'journal':
      return (
        <Modal title={t('panel.journal')} onClose={close}>
          <JournalPanel game={game} />
        </Modal>
      );
    case 'army':
      return (
        <Modal title={t('panel.army')} onClose={close} wide>
          <ArmyPanel game={game} />
        </Modal>
      );
    case 'world':
      return (
        <Modal title={t('panel.world')} onClose={close} wide>
          <WorldPanel game={game} />
        </Modal>
      );
    case 'log':
      return (
        <Modal title={t('panel.log')} onClose={close}>
          <LogPanel game={game} />
        </Modal>
      );
    case 'tourism':
      return (
        <Modal title={t('panel.tourism')} onClose={close} wide>
          <TourismPanel game={game} />
        </Modal>
      );
    case 'atlas':
      return (
        <Modal title={t('panel.atlas')} onClose={close} wide>
          <AtlasPanel game={game} />
        </Modal>
      );
    case 'workshop':
      return (
        <Modal title={t('panel.workshop')} onClose={close} wide>
          <WorkshopPanel game={game} />
        </Modal>
      );
  }
  return null;
}
