import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { useApp } from './app/store';
import { getRenderer } from './components/ValleyCanvas';
import { BUILDINGS } from './game/data/buildings';
import { homeProvince } from './game/systems/economy';
import { findSite } from './game/systems/placement';
import { applyTicks } from './game/systems/tick';
import { levelCost } from './game/systems/architecture';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// Debug/automation hook, enabled only with ?debug=1 or in dev. Used by the Playwright smoke test
// to fast-forward the same pure simulation the game loop runs. It adds no gameplay features.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__EOV__ = {
    store: useApp,
    advance(ticks: number): void {
      const game = useApp.getState().game;
      if (game) useApp.setState({ game: applyTicks(game, ticks) });
    },
    plan(buildingId: keyof typeof BUILDINGS): unknown {
      const game = useApp.getState().game;
      return game ? findSite(homeProvince(game), BUILDINGS[buildingId]) : null;
    },
    cost(buildingId: keyof typeof BUILDINGS): unknown {
      const game = useApp.getState().game;
      return game ? levelCost(buildingId, 0, game.culture) : null;
    },
    stats(): unknown {
      return getRenderer()?.getStats() ?? null;
    },
    tilePoint(x: number, y: number): unknown {
      return getRenderer()?.tileToClient(x, y) ?? null;
    },
  };
}
