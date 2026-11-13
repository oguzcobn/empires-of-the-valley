import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { GameScreen } from '../components/GameScreen';
import { TitleScreen } from '../components/TitleScreen';
import { startMainLoop, useApp } from './store';
import { ArtGallery } from '../components/ArtGallery';

const GALLERY = new URLSearchParams(location.search).has('gallery');

export function App(): ReactElement {
  if (GALLERY) return <ArtGallery />;
  return <Game />;
}

function Game(): ReactElement {
  const screen = useApp((s) => s.screen);
  const game = useApp((s) => s.game);
  const uiScale = useApp((s) => s.settings.uiScale);
  const reducedMotion = useApp((s) => s.settings.reducedMotion);

  useEffect(() => startMainLoop(), []);
  useEffect(() => {
    document.documentElement.style.fontSize = `${uiScale}%`;
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  }, [uiScale, reducedMotion]);

  return screen === 'game' && game ? <GameScreen game={game} /> : <TitleScreen />;
}
