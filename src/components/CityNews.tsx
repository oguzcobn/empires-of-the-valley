import { useState } from 'react';
import type { GameState } from '../game/core/types';
import { calendar } from '../game/core/time';
import { homeProvince, idleWorkers } from '../game/systems/economy';
import { useApp } from '../app/store';
import { t } from '../i18n';

export function CityNews({ game }: { game: GameState }) {
  const { openPanel, focusOn } = useApp.getState();
  const [expanded, setExpanded] = useState(true);
  const event = game.eventLog.at(-1);
  const province = homeProvince(game);
  const construction = province.buildings.filter((building) => building.state === 'construction').length;
  const idle = idleWorkers(province);
  return (
    <aside className="city-news" aria-label="Şehirden Haberler">
      <div className="city-news-heading">
        <button type="button" className="btn" onClick={() => openPanel('log')}>Şehirden Haberler ↗</button>
        <button type="button" className="btn" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Haber özetini daralt" : "Haber özetini göster"}>{expanded ? "−" : "+"}</button>
      </div>
      {expanded && event && (
        <div className="city-news-story">
          <small>{calendar(event.tick).day + 1}. gün</small>
          <span>{t(event.key, event.params)}</span>
          {event.at && <button type="button" className="btn" onClick={() => focusOn(event.at!.x, event.at!.y)}>Haritada gör</button>}
        </div>
      )}
      {expanded && <div className="city-news-links">
        <button type="button" className="btn" onClick={() => openPanel('economy')}>{construction} inşaat · Ekonomi</button>
        <button type="button" className="btn" onClick={() => openPanel('population')}>{idle} boşta işçi</button>
      </div>}
    </aside>
  );
}
