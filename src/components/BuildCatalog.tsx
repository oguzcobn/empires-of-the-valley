import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { BuildingCategory, GameState } from '../game/core/types';
import { BUILDABLE_IDS, BUILDINGS } from '../game/data/buildings';
import { missingFor } from '../game/systems/commands';
import { levelCost } from '../game/systems/architecture';
import { PLAYABLE_STYLES } from '../game/data/architecture';
import { homeProvince } from '../game/systems/economy';
import { t } from '../i18n';
import { CostList } from './common';
import { Icon } from './icons';

const CATEGORIES: ('all' | BuildingCategory)[] = ['all', 'housing', 'production', 'storage', 'education'];

export function BuildCatalog({ game }: { game: GameState }): ReactElement {
  const tool = useApp((s) => s.tool);
  const buildStyle = useApp((s) => s.buildStyle);
  const buildDesign = useApp((s) => s.buildDesign);
  const designs = useApp((s) => s.designs);
  const { startBuild, toggleBuild, setBuildStyle, setBuildDesign, refreshDesigns, dispatch } = useApp.getState();
  useEffect(() => {
    void refreshDesigns();
  }, [refreshDesigns]);
  const style = buildStyle ?? (game.culture === 'scottish' ? 'scottish' : 'turkish');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [query, setQuery] = useState('');
  const p = homeProvince(game);
  const needle = query.trim().toLocaleLowerCase('tr-TR');
  const items = BUILDABLE_IDS.filter(
    (id) => category === 'all' || BUILDINGS[id].category === category,
  ).filter((id) => !needle || t(`building.${id}.name`).toLocaleLowerCase('tr-TR').includes(needle));

  return (
    <aside className="catalog card" aria-label={t('catalog.title')}>
      <header className="card-head">
        <h3>{t('catalog.title')}</h3>
        <button className="btn icon-btn" onClick={() => toggleBuild(false)} aria-label={t('ui.close')}>
          ✕
        </button>
      </header>
      <div className="catalog-style" data-testid="catalog-style">
        <div className="spread">
          <span className="muted">{t('catalog.style')}</span>
          <div className="segmented" role="group" aria-label={t('catalog.style')}>
            {PLAYABLE_STYLES.map((st) => (
              <button
                key={st}
                className={`btn ${style === st ? 'active' : ''}`}
                aria-pressed={style === st}
                onClick={() => {
                  setBuildDesign(null);
                  setBuildStyle(st);
                }}
                data-testid={`catalog-style-${st}`}
              >
                {t(`style.${st}`)}
              </button>
            ))}
          </div>
        </div>
        {designs.length > 0 && (
          <label className="field inline">
            <span className="muted">{t('catalog.design')}</span>
            <select
              className="input"
              value={buildDesign?.id ?? ''}
              onChange={(e) => setBuildDesign(designs.find((d) => d.id === e.target.value) ?? null)}
              data-testid="catalog-design"
            >
              <option value="">{t('catalog.designNone')}</option>
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {t(`building.${d.buildingId}.name`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="spread">
          <span className="hint">{t('catalog.cityDefault', { style: `@style.${game.culture}` })}</span>
          {style !== game.culture && (
            <button className="btn" onClick={() => dispatch({ type: 'setCulture', style })} data-testid="catalog-make-default">
              {t('catalog.makeDefault')}
            </button>
          )}
        </div>
      </div>
      <div className="tabs" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            className={`tab ${category === c ? 'active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {t(`category.${c}`)}
          </button>
        ))}
      </div>
      <input
        className="input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('catalog.search')}
        aria-label={t('catalog.search')}
      />
      <div className="catalog-list">
        {items.length === 0 && <p className="muted">{t('catalog.empty')}</p>}
        {items.map((id) => {
          const def = BUILDINGS[id];
          const spec = def.levels[0]!;
          const design = buildDesign?.buildingId === id ? buildDesign : null;
          const cost = levelCost(id, 0, style, design?.look ?? null);
          const affordable = missingFor(p, cost) === null;
          const active = tool.kind === 'build' && tool.buildingId === id;
          return (
            <button
              key={id}
              className={`catalog-item ${active ? 'active' : ''} ${affordable ? '' : 'poor'}`}
              onClick={() => startBuild(id)}
              aria-pressed={active}
              data-testid={`build-${id}`}
            >
              <span className="catalog-name">
                {t(`building.${id}.name`)}
                <span className="muted">
                  {def.footprint[0]}×{def.footprint[1]}
                </span>
              </span>
              <span className="catalog-desc">{t(`building.${id}.effect`)}</span>
              <span className="catalog-meta">
                <CostList cost={cost} stocks={p.stocks} />
                <span className="cost" title={t('catalog.buildTime')}>
                  <Icon name="clock" size={15} />
                  {t('ui.days', { n: spec.buildTicks / 24 })}
                </span>
                {spec.workerSlots > 0 && (
                  <span className="cost" title={t('catalog.workers')}>
                    <Icon name="worker" size={15} />
                    {spec.workerSlots}
                  </span>
                )}
              </span>
              <span className="catalog-rule">{t(`building.${id}.rule`)}</span>
              {!affordable && <span className="catalog-warn">{t('catalog.cannotAfford')}</span>}
            </button>
          );
        })}
      </div>
      <p className="hint">{t('catalog.hint')}</p>
    </aside>
  );
}
