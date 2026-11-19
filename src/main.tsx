import { createRoot } from 'react-dom/client';
import { personPoints } from './game/rendering/people';
import { App } from './app/App';
import { useApp } from './app/store';
import { getRenderer } from './components/ValleyCanvas';
import { BUILDINGS } from './game/data/buildings';
import { homeProvince } from './game/systems/economy';
import { findSite } from './game/systems/placement';
import { applyTicks } from './game/systems/tick';
import { levelCost } from './game/systems/architecture';
import './styles.css';
import './mobile-layout.css';

createRoot(document.getElementById('root')!).render(<App />);

// Debug/automation hook, enabled in dev and in test builds (VITE_E2E=1, used by the pull request
// checks); the published game never exposes it. Playwright uses it to fast-forward the same pure
// simulation the game loop runs. It adds no gameplay features.
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
  (window as unknown as Record<string, unknown>).__EOV__ = {
    store: useApp,
    defs: BUILDINGS,
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
    /** Canvas positions of the people on screen (automated tests tap them). */
    people(): unknown {
      return personPoints();
    },
  };
}
