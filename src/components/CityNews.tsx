import { useState } from 'react';
import type { BuildingInstance, GameState } from '../game/core/types';
import { calendar } from '../game/core/time';
import { defOf, specOf } from '../game/data/buildings';
import { homeProvince, idleWorkers } from '../game/systems/economy';
import { landmarkStage, requiredTicks } from '../game/systems/tick';
import { useApp } from '../app/store';
import { t } from '../i18n';

function inspectBuilding(b: BuildingInstance) {
  const app = useApp.getState();
  app.openPanel(null);
  app.setTool({ kind: 'select' });
  app.select(b.id);
  app.focusOn(b.x, b.y);
}

export function CityWork({ game }: { game: GameState }) {
  const province = homeProvince(game);
  const idle = idleWorkers(province);
  const projects = province.buildings.filter((b) => b.state !== 'active');
  const vacancies = province.buildings.filter((b) =>
    b.state === 'active' && b.connected && !b.unpaid && b.workers < specOf(b).workerSlots,
  );

  return (
    <section className="city-work" aria-label="Şehir işleri">
      <h4>Şehir İşleri</h4>
      {projects.length === 0 && <p className="hint">Devam eden inşaat veya yükseltme yok.</p>}
      {projects.map((b) => {
        const total = requiredTicks(b);
        const progress = Math.min(100, Math.floor(100 * b.progressTicks / Math.max(1, total)));
        const name = t(`building.${b.definitionId}.name`);
        const status = !b.connected ? 'Yol bağlantısı bekliyor' :
          defOf(b).landmark && b.state === 'construction' && landmarkStage(b).waiting ? 'Malzeme bekliyor' :
          defOf(b).landmark && b.state === 'construction' && b.workers === 0 ? 'İşçi bekliyor' :
          b.state === 'upgrading' ? 'Yükseltiliyor' : 'İnşa ediliyor';
        return (
          <div className="city-job" key={b.id}>
            <button type="button" className="btn link" onClick={() => inspectBuilding(b)}>{name}</button>
            <span>{status} · %{progress}</span>
            <progress value={progress} max={100} aria-label={`${name} ilerlemesi`} />
          </div>
        );
      })}
      <p><strong>{idle} boşta işçi</strong> · {vacancies.length} işçi alabilecek bina</p>
      {idle > 0 && vacancies.map((b) => (
        <div className="city-job" key={b.id}>
          <button type="button" className="btn link" onClick={() => inspectBuilding(b)}>
            {t(`building.${b.definitionId}.name`)} · {b.workers}/{specOf(b).workerSlots}
          </button>
          <button type="button" className="btn" onClick={() => useApp.getState().dispatch({
            type: 'assignWorkers', instanceId: b.id, workers: b.workers + 1,
          })}>+1 işçi ata</button>
        </div>
      ))}
    </section>
  );
}

export function CityNews({ game }: { game: GameState }) {
  const { openPanel, focusOn } = useApp.getState();
  const [expanded, setExpanded] = useState(true);
  const events = game.eventLog.slice(-2).reverse();
  const province = homeProvince(game);
  const projects = province.buildings.filter((b) => b.state !== 'active').length;
  const idle = idleWorkers(province);
  return (
    <aside className="city-news" aria-label="Şehirden Haberler">
      <div className="city-news-heading">
        <button type="button" className="btn" onClick={() => openPanel('log')}>Şehirden Haberler ↗</button>
        <button type="button" className="btn" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Haber özetini daralt' : 'Haber özetini göster'}>{expanded ? '−' : '+'}</button>
      </div>
      {expanded && (
        <>
          {events.map((event) => (
            <div className="city-news-story" key={event.id}>
              <small>{calendar(event.tick).day + 1}. gün</small>
              <span>{t(event.key, event.params)}</span>
              {event.at && <button type="button" className="btn" onClick={() => focusOn(event.at!.x, event.at!.y)}>Haritada gör</button>}
            </div>
          ))}
          <div className="city-news-links">
            <button type="button" className="btn" onClick={() => openPanel('log')}>{projects} proje · {idle} boşta işçi ↗</button>
            <button type="button" className="btn" onClick={() => openPanel('economy')}>Üretim</button>
          </div>
        </>
      )}
    </aside>
  );
}
