import { useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react';
import { useApp } from '../app/store';
import { calendar, clockHour } from '../game/core/time';
import { nightFactor } from '../game/rendering/weather';
import type { GameState } from '../game/core/types';
import { defOf } from '../game/data/buildings';
import { homeProvince } from '../game/systems/economy';
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
import { CityNews } from './CityNews';
import { TopHud } from './TopHud';
import { MobileLandscapePrompt } from './MobileLandscapePrompt';
import { ValleyCanvas, getRenderer } from './ValleyCanvas';

/** Clickable overview map for quickly moving the camera around the valley. */
function RadarMinimap({ game }: { game: GameState }): ReactElement {
  const focusOn = useApp((s) => s.focusOn);
  const selectedId = useApp((s) => s.selectedBuildingId);
  const openPanel = useApp((s) => s.openPanel);
  const province = homeProvince(game);
  const { width, height } = province;

  const handleMapClick = (e: ReactMouseEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const yRatio = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    focusOn(Math.min(width - 1, Math.floor(xRatio * width)), Math.min(height - 1, Math.floor(yRatio * height)));
  };

  const handleMapKeyDown = (e: React.KeyboardEvent<SVGSVGElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      focusOn(Math.floor(width / 2), Math.floor(height / 2));
    }
  };

  return (
    <section className="card radar-minimap" aria-label="Vadi radar mini haritası">
      <div className="radar-head">
        <span>🧭 <b>Vadi radarı</b> ({width}×{height})</span>
        <button type="button" className="btn small" onClick={() => openPanel('world')} title="Bölge ve dünya haritası">
          Harita
        </button>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="radar-svg"
        onClick={handleMapClick}
        onKeyDown={handleMapKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Vadi mini haritası. Tıklayarak kamerayı o noktaya taşı."
      >
        <rect x={0} y={0} width={width} height={height} fill="#365c32" />
        {province.tiles.map((tile, index) => {
          const x = index % width;
          const y = Math.floor(index / width);
          if (tile.road) {
            return <rect key={index} x={x} y={y} width={1.05} height={1.05} fill={tile.paved ? '#525866' : '#c2a675'} />;
          }
          const color = tile.terrain === 'water' || tile.terrain === 'lake' ? '#1f6f9f'
            : tile.terrain === 'forest' ? '#234721'
              : tile.terrain === 'stone' || tile.terrain === 'rocky' || tile.terrain === 'mountain' ? '#7c8288'
                : tile.terrain === 'sand' ? '#d8c38a'
                  : tile.terrain === 'hill' || tile.terrain === 'terrace' ? '#71864a'
                    : null;
          return color ? <rect key={index} x={x} y={y} width={1.05} height={1.05} fill={color} /> : null;
        })}
        {province.buildings.map((building) => {
          const [buildingWidth, buildingHeight] = defOf(building).footprint;
          const selected = building.id === selectedId;
          const fill = selected ? '#ffd54f'
            : building.definitionId === 'town_center' ? '#f59e0b'
              : building.definitionId === 'shipyard' || building.definitionId === 'airport' ? '#38bdf8'
                : building.definitionId === 'hotel' ? '#a78bfa' : '#e8dcc4';
          return (
            <rect
              key={building.id}
              x={building.x}
              y={building.y}
              width={Math.max(1.4, buildingWidth)}
              height={Math.max(1.4, buildingHeight)}
              fill={fill}
              stroke={selected ? '#fff' : '#1b1b18'}
              strokeWidth={selected ? 0.6 : 0.25}
            />
          );
        })}
      </svg>
    </section>
  );
}

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
      if (key === 'v') {
        s.updateSettings({ muted: !s.settings.muted });
        return;
      }
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
    <main className={`game-screen season-${season} tool-${tool.kind}${buildOpen ? ' build-catalog-open' : ''}`}
      style={{ '--sky-night': nightFactor(clockHour(game.tick)) } as React.CSSProperties}>
      <ValleyCanvas />
      <TopHud game={game} />
      <MobileLandscapePrompt />
      <div className="left-column">
        {buildOpen ? <BuildCatalog game={game} /> : <>
          <CityNews game={game} />
          <QuestTracker game={game} />
        </>}
      </div>
      <div className="right-column">
        <Inspector game={game} />
        <AlertsList game={game} />
        <RadarMinimap game={game} />
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
