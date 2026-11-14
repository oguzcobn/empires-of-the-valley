import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { Difficulty, GameMode } from '../game/core/types';
import { DIFFICULTY_RULES } from '../game/data/difficulty';
import { isPlayableStyle } from '../game/data/architecture';
import type { PlayableStyle } from '../game/data/architecture';
import { MonumentPreview } from './MonumentPreview';
import { CITIES } from '../game/data/cities';
import type { CityId } from '../game/data/cities';
import { t } from '../i18n';
import { Modal } from './common';
import { PanelHost } from './Panels';
import { Toasts, ConfirmDialog } from './Overlays';

const randomSeed = (): number => Math.floor(Math.random() * 900000) + 100000;

function NewGameDialog({ mode, onClose }: { mode: GameMode; onClose: () => void }): ReactElement {
  const startNewGame = useApp((s) => s.startNewGame);
  const [seedText, setSeedText] = useState(String(randomSeed()));
  const [culture, setCulture] = useState<PlayableStyle>('turkish');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const seed = Number(seedText);
  const valid = /^\d{1,9}$/.test(seedText);
  return (
    <Modal title={t(mode === 'campaign' ? 'newGame.campaign' : 'newGame.sandbox')} onClose={onClose} wide>
      <p>{t(mode === 'campaign' ? 'newGame.campaignDesc' : 'newGame.sandboxDesc')}</p>
      <label className="field">
        <span>{t('newGame.seed')}</span>
        <span className="seed-row">
          <input
            className="input"
            inputMode="numeric"
            value={seedText}
            onChange={(e) => setSeedText(e.target.value.trim())}
            aria-invalid={!valid}
            data-testid="seed-input"
          />
          <button className="btn" onClick={() => setSeedText(String(randomSeed()))}>
            {t('newGame.random')}
          </button>
        </span>
      </label>
      <p className={`hint ${valid ? '' : 'warn'}`}>{t(valid ? 'newGame.seedHint' : 'newGame.seedInvalid')}</p>
      <fieldset className="field plain">
        <legend>{t('city.selectTitle')}</legend>
        <p className="hint">{t('city.startNote')}</p>
        <div className="culture-pick city-pick" role="group" aria-label={t('city.selectTitle')}>
          {(['trabzon','edinburgh','kyoto','prague'] as CityId[]).map((id) => {
            const city = CITIES[id];
            return (
              <button key={id} type="button" className={`culture-card city-card city-${id}`}
                aria-pressed={culture === city.culture}
                onClick={() => { if (isPlayableStyle(city.culture)) setCulture(city.culture); }}
                data-testid={`culture-${city.culture}`}>
                <MonumentPreview cityId={id} />
                <h4>{city.name}</h4>
                <span className="muted">{city.leaderTitle}</span>
                <strong>{city.leader}</strong>
                <small>{id === 'trabzon' ? 'Sümela Manastırı · Akçaabat · Maçka · Araklı' : id === 'edinburgh' ? 'Scott Monument · Leith · Portobello · Morningside' : id === 'kyoto' ? 'Gion · Higashiyama · Arashiyama · Fushimi' : 'Stare Mesto · Mala Strana · Hradcany · Vysehrad'}</small>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="field plain" data-testid="difficulty-picker">
        <legend>Zorluk seviyesi</legend>
        <div className="segmented" role="group" aria-label="Zorluk seviyesi">
          {(['easy', 'normal', 'hard'] as Difficulty[]).map((id) => (
            <button
              key={id}
              type="button"
              className={`btn ${difficulty === id ? 'active' : ''}`}
              aria-pressed={difficulty === id}
              onClick={() => setDifficulty(id)}
              data-testid={`difficulty-${id}`}
            >
              {DIFFICULTY_RULES[id].label}
            </button>
          ))}
        </div>
        <p className="hint">{DIFFICULTY_RULES[difficulty].description}. Oyun hızını 1×, 2× veya 4× seçerek zamanı ayrıca hızlandırabilirsin.</p>
      </fieldset>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          {t('ui.cancel')}
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => startNewGame(mode, seed, culture, difficulty)}
          data-testid="start-game"
        >
          {t('newGame.start')}
        </button>
      </div>
    </Modal>
  );
}

export function TitleScreen(): ReactElement {
  const slots = useApp((s) => s.slots);
  const { refreshSlots, continueLatest, openPanel } = useApp.getState();
  const [newGame, setNewGame] = useState<GameMode | null>(null);
  useEffect(() => {
    void refreshSlots();
  }, [refreshSlots]);
  const hasSave = slots.length > 0;
  return (
    <main className="title-screen">
      <div className="title-art" aria-hidden="true" />
      <div className="title-card">
        <h1>Empires <span>of the</span> Valley</h1>
        <p className="tagline">{t('title.tagline')}</p>
        <div className="title-menu">
          <button
            className="btn primary big"
            onClick={() => setNewGame('campaign')}
            data-testid="new-campaign"
          >
            {t('title.newCampaign')}
          </button>
          <button className="btn big" onClick={() => setNewGame('sandbox')} data-testid="new-sandbox">
            {t('title.sandbox')}
          </button>
          <button
            className="btn big"
            disabled={!hasSave}
            onClick={() => void continueLatest()}
            title={hasSave ? undefined : t('title.noSave')}
            data-testid="continue"
          >
            {t('title.continue')}
          </button>
          <button className="btn big" onClick={() => openPanel('saves')} data-testid="open-load">
            {t('title.load')}
          </button>
          <button className="btn big" onClick={() => openPanel('settings')}>
            {t('panel.settings')}
          </button>
          <button className="btn big" onClick={() => openPanel('credits')}>
            {t('title.credits')}
          </button>
        </div>
      </div>
      {newGame && <NewGameDialog mode={newGame} onClose={() => setNewGame(null)} />}
      <PanelHost game={null} />
      <ConfirmDialog />
      <Toasts />
    </main>
  );
}
