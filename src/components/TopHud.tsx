import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import { calendar } from '../game/core/time';
import type { GameSpeed, GameState, ResourceId } from '../game/core/types';
import {
  UNCAPPED,
  computeFlows,
  homeProvince,
  housingCapacity,
  idleWorkers,
  storageCaps,
  totalPopulation,
} from '../game/systems/economy';
import { fmtInt, fmtRate, t } from '../i18n';
import { Icon } from './icons';

const HUD_RESOURCES: ResourceId[] = ['wood', 'stone', 'food', 'gold', 'tools', 'research'];
const SPEEDS: { speed: GameSpeed; label: string; key: string }[] = [
  { speed: 0, label: '❚❚', key: 'Space' },
  { speed: 1, label: '1×', key: '1' },
  { speed: 2, label: '2×', key: '2' },
  { speed: 4, label: '4×', key: '3' },
];

export function TopHud({ game }: { game: GameState }): ReactElement {
  const dispatch = useApp((s) => s.dispatch);
  const openPanel = useApp((s) => s.openPanel);
  const p = homeProvince(game);
  const flows = useMemo(() => computeFlows(game), [game]);
  const caps = useMemo(() => storageCaps(game, p), [game, p]);
  const cal = calendar(game.tick);
  const pop = totalPopulation(p);
  const housing = housingCapacity(p);

  return (
    <header className="top-hud">
      <button className="btn hud-menu" onClick={() => openPanel('saves')} title={t('hud.menu')}>
        ☰ <span className="hide-narrow">{t('hud.menu')}</span>
      </button>
      <div className="hud-resources" role="group" aria-label={t('hud.resources')}>
        {HUD_RESOURCES.map((id) => {
          const net = flows[id].net;
          const full = caps[id] !== UNCAPPED && p.stocks[id] >= caps[id];
          return (
            <button
              key={id}
              className={`chip ${full ? 'full' : ''} ${id === 'food' && net < 0 ? 'warn' : ''}`}
              onClick={() => openPanel(id === 'research' ? 'research' : 'economy')}
              title={`${t(`resource.${id}`)} — ${t('hud.perDay', { rate: fmtRate(net) })}${full ? ` · ${t('hud.storageFull')}` : ''}`}
              data-testid={`res-${id}`}
            >
              <Icon name={id} />
              <span className="chip-value">{fmtInt(p.stocks[id])}</span>
              {caps[id] !== UNCAPPED && <span className="chip-cap">/{fmtInt(caps[id])}</span>}
              <span className={`chip-rate ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}`}>{fmtRate(net)}</span>
            </button>
          );
        })}
        <button
          className={`chip ${pop > housing ? 'warn' : ''}`}
          onClick={() => openPanel('population')}
          title={t('hud.populationTip', { idle: idleWorkers(p) })}
          data-testid="res-population"
        >
          <Icon name="people" />
          <span className="chip-value">{pop}</span>
          <span className="chip-cap">/{housing}</span>
          <span className="chip-rate">
            <Icon name="worker" size={13} /> {idleWorkers(p)}
          </span>
        </button>
        <button className="chip" onClick={() => openPanel('population')} title={t('hud.happinessTip')}>
          <Icon name="happy" />
          <span className="chip-value">{p.happiness}</span>
        </button>
      </div>
      <div className="hud-time">
        <div className={`hud-date season-${cal.season}`} title={t('hud.dateTip')}>
          <b>{t(`season.${cal.season}`)}</b>
          <span data-testid="date">
            {t('hud.date', { year: cal.year, day: cal.dayOfSeason })} · {String(cal.hour).padStart(2, '0')}:00
          </span>
        </div>
        <div className="speed" role="group" aria-label={t('hud.speed')}>
          {SPEEDS.map(({ speed, label, key }) => (
            <button
              key={speed}
              className={`btn speed-btn ${game.speed === speed ? 'active' : ''}`}
              aria-pressed={game.speed === speed}
              onClick={() => dispatch({ type: 'setGameSpeed', speed })}
              title={`${speed === 0 ? t('hud.pause') : t('hud.speedN', { n: speed })} (${key})`}
              data-testid={`speed-${speed}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
