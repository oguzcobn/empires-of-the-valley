import { useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import type { PanelId } from '../app/store';
import type { GameState } from '../game/core/types';
import { t } from '../i18n';
import type { TKey } from '../i18n';
import { getRenderer } from './ValleyCanvas';

const PANELS: { id: PanelId; key: TKey; group: 'city' | 'world' | 'other'; campaignOnly?: boolean }[] = [
  { id: 'economy', key: 'panel.economy', group: 'city' },
  { id: 'population', key: 'panel.population', group: 'city' },
  { id: 'research', key: 'panel.research', group: 'city' },
  { id: 'workshop', key: 'panel.workshop', group: 'city' },
  { id: 'tourism', key: 'panel.tourism', group: 'world' },
  { id: 'transport', key: 'panel.transport', group: 'world' },
  { id: 'atlas', key: 'panel.atlas', group: 'world' },
  { id: 'journal', key: 'panel.journal', group: 'other', campaignOnly: true },
  { id: 'world', key: 'panel.world', group: 'world' },
  { id: 'army', key: 'panel.army', group: 'world' },
  { id: 'log', key: 'panel.log', group: 'other' },
  { id: 'help', key: 'panel.help', group: 'other' },
];

export function Toolbar({ game }: { game: GameState }): ReactElement {
  const tool = useApp((s) => s.tool);
  const buildOpen = useApp((s) => s.buildOpen);
  const panel = useApp((s) => s.panel);
  const [menuOpen, setMenuOpen] = useState(false);
  const { setTool, toggleBuild, openPanel } = useApp.getState();
  const selectedTool = tool.kind === 'roadPlan' ? (tool.bridge ? 'bridge' : 'roadPlan') : tool.kind;

  const chooseTool = (value: string): void => {
    setTool(value === 'select' ? { kind: 'select' }
      : value === 'road' ? { kind: 'road' }
      : value === 'bridge' ? { kind: 'roadPlan', bridge: true }
      : value === 'pave' ? { kind: 'pave' }
      : value === 'terrace' ? { kind: 'terrace' }
      : value === 'demolish' ? { kind: 'demolish' }
      : value === 'army' ? { kind: 'army' }
      : value === 'hunt' ? { kind: 'hunt', workers: 1 }
      : { kind: 'roadPlan' });
    toggleBuild(false);
    setMenuOpen(false);
  };

  const choosePanel = (value: string): void => {
    if (!value) {
      openPanel(null);
    } else {
      const id = value as PanelId;
      if (id === 'workshop') useApp.getState().openWorkshop();
      else openPanel(id);
    }
    setMenuOpen(false);
  };

  return (
    <nav className="toolbar game-toolbar" aria-label={t('toolbar.label')}>
      {menuOpen && <div className="game-menu-popover" id="game-menu" aria-label="Oyun menüsü">
        <div className="game-menu-heading"><span>OYUN MENÜSÜ</span><button type="button" className="game-menu-close" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat">×</button></div>
        <div className="game-menu-grid">
          <label className="game-menu-field"><span>Harita aracı</span>
            <select value={selectedTool} onChange={(event) => chooseTool(event.currentTarget.value)}>
              <option value="select">Seç ve incele</option>
              <option value="road">Tek kare yol</option>
              <option value="bridge">Köprü güzergâhı</option>
              <option value="pave">Asfalt fırçası</option>
              <option value="terrace">Teras yap</option>
              <option value="demolish">Yık / Ağaç &amp; Taş Temizle</option>
              <option value="army" disabled={(game.militia ?? 0) === 0}>Birlik taşı</option>
              <option value="hunt">Av ekibi gönder</option>
            </select>
          </label>
          <label className="game-menu-field"><span>Yönetim paneli</span>
            <select value={panel ?? ''} onChange={(event) => choosePanel(event.currentTarget.value)}>
              <option value="">Panel seç</option>
              <optgroup label="Şehir">
                {PANELS.filter((x) => x.group === 'city').map(({ id, key }) => <option key={id} value={id}>{t(key)}</option>)}
              </optgroup>
              <optgroup label="Dünya">
                {PANELS.filter((x) => x.group === 'world').map(({ id, key }) => <option key={id} value={id}>{t(key)}</option>)}
              </optgroup>
              <optgroup label="Diğer">
                {PANELS.filter((x) => x.group === 'other' && (!x.campaignOnly || game.mode === 'campaign')).map(({ id, key }) => <option key={id} value={id}>{t(key)}</option>)}
              </optgroup>
            </select>
          </label>
        </div>
        <div className="game-menu-footer">
          <span>Kamera</span>
          <div className="game-camera-controls">
            <button type="button" className="btn icon-btn" onClick={() => getRenderer()?.zoomBy(1.2)} title={t('camera.zoomIn')} aria-label={t('camera.zoomIn')}>＋</button>
            <button type="button" className="btn icon-btn" onClick={() => getRenderer()?.zoomBy(1 / 1.2)} title={t('camera.zoomOut')} aria-label={t('camera.zoomOut')}>－</button>
            <button type="button" className="btn icon-btn" onClick={() => getRenderer()?.resetCamera()} title={t('camera.reset')} aria-label={t('camera.reset')}>◎</button>
          </div>
        </div>
      </div>}

      <div className="tool-group game-toolbar-main">
        <button className={`btn tool primary ${buildOpen || tool.kind === 'build' ? 'active' : ''}`} aria-pressed={buildOpen}
          onClick={() => { setMenuOpen(false); toggleBuild(); setTool({ kind: 'select' }); }} title={`${t('tool.build')} (B)`} data-testid="tool-build">
          <span className="glyph">⌂</span><span>{t('tool.build')}</span>
        </button>
        <button className={`btn tool ${tool.kind === 'roadPlan' && !tool.bridge ? 'active' : ''}`} aria-pressed={tool.kind === 'roadPlan' && !tool.bridge}
          onClick={() => { setMenuOpen(false); toggleBuild(false); setTool(tool.kind === 'roadPlan' && !tool.bridge ? { kind: 'select' } : { kind: 'roadPlan' }); }}
          title="Güzergâh çiz ve yol önizle" data-testid="tool-road-plan">
          <span className="glyph">⌁</span><span>Yol</span>
        </button>
        <button className={`btn tool ${tool.kind === 'demolish' ? 'active' : ''}`} aria-pressed={tool.kind === 'demolish'}
          onClick={() => { setMenuOpen(false); toggleBuild(false); setTool(tool.kind === 'demolish' ? { kind: 'select' } : { kind: 'demolish' }); }}
          title="Bina/yol yık veya ağaçları ve taşları temizleyip arazi aç (X)" data-testid="tool-demolish">
          <span className="glyph">🪓</span><span>Temizle</span>
        </button>
        <button className={`btn tool game-menu-trigger ${menuOpen ? 'active' : ''}`} aria-expanded={menuOpen} aria-controls={menuOpen ? 'game-menu' : undefined}
          onClick={() => setMenuOpen((open) => !open)}>
          <span className="glyph">☰</span><span>Menü</span>
        </button>
      </div>
    </nav>
  );
}
