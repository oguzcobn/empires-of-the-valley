import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import { DEMOLISH_REFUND_PERMILLE } from '../game/data/balance';
import { ValleyRenderer } from '../game/rendering/ValleyRenderer';
import { homeProvince } from '../game/systems/economy';
import { validatePlacement } from '../game/systems/commands';
import { buildingById, tileAt } from '../game/systems/grid';
import { t } from '../i18n';
import { artDetail, effectiveQuality, lowerQuality, setAutoCap } from '../app/settings';

/** The live renderer, for camera buttons and keyboard shortcuts. Null while not mounted. */
let current: ValleyRenderer | null = null;
export const getRenderer = (): ValleyRenderer | null => current;

/** Asks for confirmation, then demolishes a building or cancels its construction site. */
export function requestDemolish(buildingId: string): void {
  const app = useApp.getState();
  const game = app.game;
  if (!game) return;
  const b = buildingById(homeProvince(game), buildingId);
  if (!b) return;
  const name = t(`building.${b.definitionId}.name`);
  if (b.state === 'construction') {
    app.ask({
      title: t('confirm.cancel.title'),
      body: t('confirm.cancel.body', { building: name }),
      confirmLabel: t('inspector.cancelBuild'),
      danger: true,
      onConfirm: () => {
        if (useApp.getState().dispatch({ type: 'cancelConstruction', instanceId: buildingId }))
          useApp.getState().select(null);
      },
    });
    return;
  }
  app.ask({
    title: t('confirm.demolish.title'),
    body: t('confirm.demolish.body', { building: name, pct: DEMOLISH_REFUND_PERMILLE / 10 }),
    confirmLabel: t('inspector.demolish'),
    danger: true,
    onConfirm: () => {
      if (useApp.getState().dispatch({ type: 'demolishBuilding', instanceId: buildingId }))
        useApp.getState().select(null);
    },
  });
}

export function ValleyCanvas(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{x:number;y:number}|null>(null);
  const tool = useApp((s) => s.tool);
  const placing = tool.kind === 'build';
  useEffect(() => { setPlacement(null); }, [tool]);
  const focus = useApp((s) => s.focus);
  const graphics = useApp((s) => s.settings.graphics);
  const [capNonce, setCapNonce] = useState(0);
  const quality = effectiveQuality({ graphics });

  useEffect(() => {
    const host = hostRef.current!;
    const opts = {
      resolution: quality === 'low' ? 1 : quality === 'medium' ? 1.5 : quality === 'high' ? 2 : 2.5,
      antialias: quality !== 'low',
      cacheBodies: quality === 'low' || quality === 'medium',
    };
    let disposed = false;
    let renderer: ValleyRenderer | null = null;
    ValleyRenderer.create(host, {
      getView() {
        const s = useApp.getState();
        return s.game
          ? {
              game: s.game,
              tool: s.tool,
              selectedBuildingId: s.selectedBuildingId,
              reducedMotion: s.settings.reducedMotion,
              detail: artDetail(s.settings),
              dayNight: s.settings.dayNight,
              weather: s.settings.weather,
              autoQuality: s.settings.graphics === 'auto',
            }
          : null;
      },
      onHover: (tile) => useApp.getState().setHover(tile),
      onLowFps(fps) {
        const next = lowerQuality(effectiveQuality(useApp.getState().settings));
        if (!next) return;
        setAutoCap(next);
        useApp.getState().toast('info', t('graphics.autoLowered', { fps, q: `@graphics.${next}` }));
        setCapNonce((n) => n + 1);
      },
      onCancel() {
        const s = useApp.getState();
        if (s.tool.kind !== 'select') s.setTool({ kind: 'select' });
        else s.select(null);
      },
      onRoadPaint(x, y) {
        const s = useApp.getState();
        if (!s.game) return;
        const tile = tileAt(homeProvince(s.game), x, y);
        if (s.tool.kind === 'pave') {
          if (tile?.road && tile.roadType === 'dirt' && !tile.paved)
            s.dispatch({ type: 'paveRoad', x, y });
        } else if (s.tool.kind === 'road' && !tile?.road) {
          s.dispatch({ type: 'placeRoad', x, y });
        }
      },
      onTileClick(x, y, buildingId) {
        const s = useApp.getState();
        if (!s.game) return;
        const tool = s.tool;
        if (tool.kind === 'build') {
          if (window.matchMedia('(pointer: coarse)').matches) {
            setPlacement({ x, y });
            return;
          }
          if (
            !s.dispatch({
              type: 'placeBuilding',
              buildingId: tool.buildingId,
              x,
              y,
              style: tool.style,
              look: tool.look ?? null,
            })
          )
            return;
          const placed = homeProvince(useApp.getState().game!).buildings.at(-1)!;
          if (tool.buildingId !== 'hut') {
            s.setTool({ kind: 'select' });
            s.toggleBuild(false);
            s.select(placed.id);
          }
        } else if (tool.kind === 'army') {
          s.dispatch({ type: 'moveMilitia', x, y });
        } else if (tool.kind === 'terrace') {
          s.dispatch({ type: 'buildTerrace', x, y });
        } else if (tool.kind === 'demolish') {
          if (buildingId) requestDemolish(buildingId);
          else if (tileAt(homeProvince(s.game), x, y)?.road) s.dispatch({ type: 'removeRoad', x, y });
        } else if (tool.kind === 'select') {
          s.select(buildingId);
        }
      },
    }, opts)
      .then((r) => {
        if (disposed) r.destroy();
        else {
          renderer = r;
          current = r;
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      disposed = true;
      renderer?.destroy();
      if (current === renderer) current = null;
    };
  }, [quality, capNonce]);

  useEffect(() => {
    if (focus) current?.centerOnTile(focus.x + 0.5, focus.y + 0.5);
  }, [focus]);

  const game = useApp((s) => s.game);
  const placementError = placement && game && tool.kind === 'build'
    ? validatePlacement(game, tool.buildingId, placement.x, placement.y, tool.style, tool.look ?? null)
    : null;
  const nudgePlacement = (dx: number, dy: number) => {
    if (!placement || !game) return;
    const p = homeProvince(game);
    const x = Math.max(0, Math.min(p.width - 1, placement.x + dx));
    const y = Math.max(0, Math.min(p.height - 1, placement.y + dy));
    setPlacement({ x, y });
    useApp.getState().setHover({ x, y });
  };

  const confirmPlacement = () => {
    if (!placement || tool.kind !== 'build' || placementError) return;
    const s = useApp.getState();
    if (!s.game) return;
    const ok = s.dispatch({type:'placeBuilding',buildingId:tool.buildingId,x:placement.x,y:placement.y,style:tool.style,look:tool.look ?? null});
    if (ok) {
      setPlacement(null);
      if (tool.buildingId !== 'hut') {
        const placed = homeProvince(useApp.getState().game!).buildings.at(-1);
        s.setTool({kind:'select'});
        s.toggleBuild(false);
        if (placed) s.select(placed.id);
      }
    }
  };

  return (
    <div className="valley-canvas" ref={hostRef}>
      {placing && <div className="mobile-place-hint" aria-live="polite">{placement ? `Konum: ${placement.x + 1}, ${placement.y + 1} · Haritaya dokunarak değiştir` : 'Haritada bir yere dokun · Önizle · Onayla'}</div>}
      {placing && placement && <div className="mobile-placement-pad" aria-label="Bina konumunu hassas ayarla">
        <div className="mobile-placement-message" role="status">{placementError ? `⚠ ${t(placementError.key, placementError.params)}` : '✓ Bu konuma inşa edilebilir'}</div>
        <div className="mobile-placement-arrows">
          <button type="button" aria-label="Bir kare yukarı" onClick={() => nudgePlacement(0,-1)}>↑</button>
          <div><button type="button" aria-label="Bir kare sola" onClick={() => nudgePlacement(-1,0)}>←</button><button type="button" aria-label="Bir kare aşağı" onClick={() => nudgePlacement(0,1)}>↓</button><button type="button" aria-label="Bir kare sağa" onClick={() => nudgePlacement(1,0)}>→</button></div>
        </div>
        <div className="mobile-place-actions"><button type="button" onClick={() => {setPlacement(null);useApp.getState().setHover(null);}}>İptal</button><button type="button" disabled={!!placementError} onClick={confirmPlacement}>✓ Buraya inşa et</button></div>
      </div>}
      {error && (
        <div className="canvas-error" role="alert">
          <b>{t('ui.renderError')}</b>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
