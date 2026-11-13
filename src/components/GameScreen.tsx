import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import { calendar } from '../game/core/time';
import type { GameState } from '../game/core/types';
import { BuildCatalog } from './BuildCatalog';
import { Inspector } from './Inspector';
import {
  AlertsList,
  ChapterDialog,
  ConfirmDialog,
  InfoStrip,
  IntroDialog,
  PerfOverlay,
  Toasts,
} from './Overlays';
import { PanelHost } from './Panels';
import { QuestTracker } from './QuestTracker';
import { Toolbar } from './Toolbar';
import { TopHud } from './TopHud';
import { ValleyCanvas, getRenderer } from './ValleyCanvas';

/** Keyboard shortcuts. Ignored while typing in a field; Esc always backs out one level. */
function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useApp.getState();
      if (!s.game) return;
      const modal = s.panel !== null || s.confirm !== null || s.introOpen || s.chapterDialog;
      if (e.key === 'Escape') {
        if (s.confirm) s.ask(null);
        else if (s.introOpen) s.closeIntro();
        else if (s.chapterDialog) s.closeChapterDialog();
        else if (s.panel) s.openPanel(null);
        else if (s.tool.kind !== 'select') s.setTool({ kind: 'select' });
        else if (s.buildOpen) s.toggleBuild(false);
        else s.select(null);
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        s.updateSettings({ showPerf: !s.settings.showPerf });
        return;
      }
      if (modal) return;
      const key = e.key.toLowerCase();
      const pan = 60;
      if (e.code === 'Space') {
        e.preventDefault();
        s.togglePause();
      } else if (key === '1') s.dispatch({ type: 'setGameSpeed', speed: 1 });
      else if (key === '2') s.dispatch({ type: 'setGameSpeed', speed: 2 });
      else if (key === '3') s.dispatch({ type: 'setGameSpeed', speed: 4 });
      else if (key === 'b') s.toggleBuild();
      else if (key === 'r') s.setTool(s.tool.kind === 'road' ? { kind: 'select' } : { kind: 'road' });
      else if (key === 'p') s.setTool(s.tool.kind === 'pave' ? { kind: 'select' } : { kind: 'pave' });
      else if (key === 't') s.setTool(s.tool.kind === 'terrace' ? { kind: 'select' } : { kind: 'terrace' });
      else if (key === 'x') s.setTool(s.tool.kind === 'demolish' ? { kind: 'select' } : { kind: 'demolish' });
      else if (key === 'm') s.openPanel('world');
      else if (key === 'g') s.setTool(s.tool.kind === 'army' ? { kind: 'select' } : { kind: 'army' });
      else if (key === '+' || key === '=') getRenderer()?.zoomBy(1.2);
      else if (key === '-' || key === '_') getRenderer()?.zoomBy(1 / 1.2);
      else if (key === 'home') getRenderer()?.resetCamera();
      else if (key === 'arrowleft' || key === 'a') getRenderer()?.panBy(pan, 0);
      else if (key === 'arrowright' || key === 'd') getRenderer()?.panBy(-pan, 0);
      else if (key === 'arrowup' || key === 'w') getRenderer()?.panBy(0, pan);
      else if (key === 'arrowdown' || key === 's') getRenderer()?.panBy(0, -pan);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function GameScreen({ game }: { game: GameState }): ReactElement {
  const buildOpen = useApp((s) => s.buildOpen);
  const tool = useApp((s) => s.tool);
  useShortcuts();
  const season = calendar(game.tick).season;
  return (
    <main className={`game-screen season-${season} tool-${tool.kind}`}>
      <ValleyCanvas />
      <TopHud game={game} />
      <div className="left-column">
        {buildOpen ? <BuildCatalog game={game} /> : <QuestTracker game={game} />}
      </div>
      <div className="right-column">
        <Inspector game={game} />
        <AlertsList game={game} />
      </div>
      <InfoStrip game={game} />
      <Toolbar game={game} />
      <Toasts />
      <PerfOverlay />
      <PanelHost game={game} />
      <IntroDialog game={game} />
      <ChapterDialog game={game} />
      <ConfirmDialog />
      {game.speed === 0 && (
        <div className="paused-banner" data-testid="paused">
          ❚❚
        </div>
      )}
    </main>
  );
}
