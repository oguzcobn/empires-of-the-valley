import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { GameState } from '../game/core/types';
import { personProfile } from '../game/rendering/people';
import { homeProvince } from '../game/systems/economy';
import { buildingById } from '../game/systems/grid';
import { t } from '../i18n';
import { Row } from './common';

/** Card of the person tapped on the map: who they are, their job, home and what they are doing. */
export function PersonCard({ game }: { game: GameState }): ReactElement | null {
  const pick = useApp((s) => s.person);
  const selectPerson = useApp((s) => s.selectPerson);
  const select = useApp((s) => s.select);
  const focusOn = useApp((s) => s.focusOn);
  const dispatch = useApp((s) => s.dispatch);
  if (!pick) return null;
  const who = personProfile(game, pick.ref);
  const p = homeProvince(game);
  const work = who.workplaceId ? buildingById(p, who.workplaceId) : undefined;
  const home = who.homeId ? buildingById(p, who.homeId) : undefined;
  const goTo = (id: string): void => {
    const b = buildingById(p, id);
    if (!b) return;
    focusOn(b.x, b.y);
    select(b.id);
  };
  const soldier = pick.ref.kind === 'soldier';
  const stage = who.stage === 'child' ? 'Çocuk' : who.stage === 'elder' ? 'Yaşlı' : soldier ? 'Asker' : who.woman ? 'Kadın' : 'Erkek';
  return (
    <aside className="person-card card" aria-label="Kişi bilgisi" data-testid="person-card">
      <header className="card-head">
        <h3>
          <span aria-hidden="true">{soldier ? '🪖' : who.stage === 'child' ? '🧒' : who.stage === 'elder' ? '🧓' : who.woman ? '👩' : '👨'}</span> {who.name}
        </h3>
        <button className="btn icon-btn" onClick={() => selectPerson(null)} aria-label={t('ui.close')}>✕</button>
      </header>
      <p className="person-doing">{pick.activity}</p>
      <div className="rows">
        <Row label="Yaş">{`${who.age} · ${stage}`}</Row>
        <Row label="Meslek">{who.occupation}</Row>
        {work && <Row label="İşyeri">{t(`building.${work.definitionId}.name`)}</Row>}
        {home && <Row label="Ev">{t(`building.${home.definitionId}.name`)}</Row>}
      </div>
      <div className="actions">
        {work && <button className="btn" onClick={() => goTo(work.id)}>İşyerini göster</button>}
        {home && <button className="btn" onClick={() => goTo(home.id)}>Evini göster</button>}
        {who.index !== undefined && who.index < 1000 && (
          <button className="btn" onClick={() => {
            const name = window.prompt('Yeni ad', who.name);
            if (name && name.trim().length >= 2) dispatch({ type: 'renameCitizen', index: who.index!, name: name.trim().slice(0, 40) });
          }}>Adını değiştir</button>
        )}
      </div>
    </aside>
  );
}
