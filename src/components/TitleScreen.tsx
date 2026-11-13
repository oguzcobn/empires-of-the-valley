import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { GameMode } from '../game/core/types';
import { PLAYABLE_STYLES } from '../game/data/architecture';
import type { PlayableStyle } from '../game/data/architecture';
import { CulturePreview } from './CulturePreview';
import { GAME_VERSION } from '../game/data/balance';
import { t } from '../i18n';
import { Modal } from './common';
import { PanelHost } from './Panels';
import { Toasts, ConfirmDialog } from './Overlays';

const randomSeed = (): number => Math.floor(Math.random() * 900000) + 100000;

function NewGameDialog({ mode, onClose }: { mode: GameMode; onClose: () => void }): ReactElement {
  const startNewGame = useApp((s) => s.startNewGame);
  const [seedText, setSeedText] = useState(String(randomSeed()));
  const [culture, setCulture] = useState<PlayableStyle>('turkish');
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
        <legend>{t('arch.pickCulture')}</legend>
        <p className="hint">{t('arch.pickCultureHint')}</p>
        <div className="culture-pick" role="group" aria-label={t('newGame.culture')}>
          {PLAYABLE_STYLES.map((st) => (
            <button
              key={st}
              type="button"
              className="culture-card"
              aria-pressed={culture === st}
              onClick={() => setCulture(st)}
              data-testid={`culture-${st}`}
            >
              <CulturePreview style={st} />
              <h4>{t(`style.${st}.long`)}</h4>
              <span className="muted">{t(`style.${st}.desc`)}</span>
              <ul>
                <li>{t(`style.${st}.bonus1`)}</li>
                <li>{t(`style.${st}.bonus2`)}</li>
                <li>{t(`style.${st}.bonus3`)}</li>
              </ul>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          {t('ui.cancel')}
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => startNewGame(mode, seed, culture)}
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
      <div className="title-art" aria-hidden="true">
        <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice">
          <path d="M0 250 120 150l90 70 110-120 130 110 100-80 250 150v80H0z" fill="#9fc7a0" />
          <path d="M0 290 160 210l140 60 160-90 180 80 160-50v150H0z" fill="#7fb56a" />
          <path d="M0 330 200 270l200 40 200-50 200 40v60H0z" fill="#69a551" />
          <path
            d="M330 300c40-30 60-60 50-110"
            stroke="#5ab0dc"
            strokeWidth="16"
            fill="none"
            strokeLinecap="round"
          />
          <g transform="translate(470 250)">
            <path d="M0 0 40 20 0 40-40 20z" fill="#d8c79c" />
            <path d="M-22 20V2L0-10 22 2v18L0 31z" fill="#eedfb8" />
            <path d="M-26 2 0-24 26 2 0 14z" fill="#c9793f" />
            <rect x="-4" y="14" width="8" height="14" fill="#5a3b22" />
          </g>
          <g fill="#3f8a4a">
            <path d="M150 300l14-40 14 40zM185 310l12-34 12 34zM620 300l14-40 14 40zM655 312l12-34 12 34zM580 318l10-28 10 28z" />
          </g>
        </svg>
      </div>
      <div className="title-card card">
        <p className="eyebrow">{t('title.eyebrow')}</p>
        <h1>Empires of the Valley</h1>
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
        <p className="hint">{t('title.phase', { v: GAME_VERSION })}</p>
      </div>
      {newGame && <NewGameDialog mode={newGame} onClose={() => setNewGame(null)} />}
      <PanelHost game={null} />
      <ConfirmDialog />
      <Toasts />
    </main>
  );
}
