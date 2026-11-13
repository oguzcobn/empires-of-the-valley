import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { PanelId } from '../app/store';
import type { GameState } from '../game/core/types';
import { t } from '../i18n';
import type { TKey } from '../i18n';
import { getRenderer } from './ValleyCanvas';

const PANELS: { id: PanelId; key: TKey; hint?: string; campaignOnly?: boolean }[] = [
  { id: 'economy', key: 'panel.economy' },
  { id: 'population', key: 'panel.population' },
  { id: 'research', key: 'panel.research' },
  { id: 'workshop', key: 'panel.workshop' },
  { id: 'tourism', key: 'panel.tourism' },
  { id: 'atlas', key: 'panel.atlas' },
  { id: 'journal', key: 'panel.journal', campaignOnly: true },
  { id: 'world', key: 'panel.world', hint: 'M' },
  { id: 'log', key: 'panel.log' },
  { id: 'help', key: 'panel.help' },
];

export function Toolbar({ game }: { game: GameState }): ReactElement {
  const tool = useApp((s) => s.tool);
  const buildOpen = useApp((s) => s.buildOpen);
  const panel = useApp((s) => s.panel);
  const { setTool, toggleBuild, openPanel } = useApp.getState();

  return (
    <nav className="toolbar" aria-label={t('toolbar.label')}>
      <div className="tool-group">
        <button
          className={`btn tool ${tool.kind === 'select' && !buildOpen ? 'active' : ''}`}
          aria-pressed={tool.kind === 'select'}
          onClick={() => {
            setTool({ kind: 'select' });
            toggleBuild(false);
          }}
          title={`${t('tool.select')} (Esc)`}
        >
          <span className="glyph">➤</span>
          {t('tool.select')}
        </button>
        <button
          className={`btn tool primary ${buildOpen || tool.kind === 'build' ? 'active' : ''}`}
          aria-pressed={buildOpen}
          onClick={() => toggleBuild()}
          title={`${t('tool.build')} (B)`}
          data-testid="tool-build"
        >
          <span className="glyph">⌂</span>
          {t('tool.build')}
        </button>
        <button
          className={`btn tool ${tool.kind === 'road' ? 'active' : ''}`}
          aria-pressed={tool.kind === 'road'}
          onClick={() => setTool(tool.kind === 'road' ? { kind: 'select' } : { kind: 'road' })}
          title={`${t('tool.road')} (R)`}
          data-testid="tool-road"
        >
          <span className="glyph">▤</span>
          {t('tool.road')}
        </button>
        <button
          className={`btn tool ${tool.kind === 'terrace' ? 'active' : ''}`}
          aria-pressed={tool.kind === 'terrace'}
          onClick={() => setTool(tool.kind === 'terrace' ? { kind: 'select' } : { kind: 'terrace' })}
          title={`${t('tool.terrace')} (T)`}
          data-testid="tool-terrace"
        >
          <span className="glyph">≋</span>
          {t('tool.terrace')}
        </button>
        <button
          className={`btn tool ${tool.kind === 'demolish' ? 'active danger' : ''}`}
          aria-pressed={tool.kind === 'demolish'}
          onClick={() => setTool(tool.kind === 'demolish' ? { kind: 'select' } : { kind: 'demolish' })}
          title={`${t('tool.demolish')} (X)`}
        >
          <span className="glyph">✖</span>
          {t('tool.demolish')}
        </button>
      </div>
      <div className="tool-group">
        {PANELS.filter((x) => !x.campaignOnly || game.mode === 'campaign').map(({ id, key, hint }) => (
          <button
            key={id}
            className={`btn tool small ${panel === id ? 'active' : ''}`}
            onClick={() =>
              panel === id ? openPanel(null) : id === 'workshop' ? useApp.getState().openWorkshop() : openPanel(id)
            }
            title={hint ? `${t(key)} (${hint})` : t(key)}
            data-testid={`panel-${id}`}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <div className="tool-group camera">
        <button
          className="btn icon-btn"
          onClick={() => getRenderer()?.zoomBy(1.2)}
          title={`${t('camera.zoomIn')} (+)`}
          aria-label={t('camera.zoomIn')}
        >
          ＋
        </button>
        <button
          className="btn icon-btn"
          onClick={() => getRenderer()?.zoomBy(1 / 1.2)}
          title={`${t('camera.zoomOut')} (−)`}
          aria-label={t('camera.zoomOut')}
        >
          －
        </button>
        <button
          className="btn icon-btn"
          onClick={() => getRenderer()?.resetCamera()}
          title={`${t('camera.reset')} (Home)`}
          aria-label={t('camera.reset')}
        >
          ◎
        </button>
      </div>
    </nav>
  );
}
