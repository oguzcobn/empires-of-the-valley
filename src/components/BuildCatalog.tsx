import { useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { BuildingCategory, GameState } from '../game/core/types';
import { BUILDABLE_IDS, BUILDINGS } from '../game/data/buildings';
import { missingFor } from '../game/systems/commands';
import { levelCost } from '../game/systems/architecture';
import { homeProvince } from '../game/systems/economy';
import { t } from '../i18n';
import { CostList } from './common';
import { Icon } from './icons';

const CATEGORIES: ('all' | BuildingCategory)[] = ['all', 'housing', 'production', 'storage', 'education'];

export function BuildCatalog({ game }: { game: GameState }): ReactElement {
  const tool = useApp((s) => s.tool);
  const { startBuild, toggleBuild } = useApp.getState();
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
          const cost = levelCost(id, 0, game.culture);
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
