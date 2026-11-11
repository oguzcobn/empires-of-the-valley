import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import { DEMOLISH_REFUND_PERMILLE } from '../game/data/balance';
import { ValleyRenderer } from '../game/rendering/ValleyRenderer';
import { homeProvince } from '../game/systems/economy';
import { buildingById, tileAt } from '../game/systems/grid';
import { t } from '../i18n';

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
  const focus = useApp((s) => s.focus);

  useEffect(() => {
    const host = hostRef.current!;
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
            }
          : null;
      },
      onHover: (tile) => useApp.getState().setHover(tile),
      onCancel() {
        const s = useApp.getState();
        if (s.tool.kind !== 'select') s.setTool({ kind: 'select' });
        else s.select(null);
      },
      onRoadPaint(x, y) {
        const s = useApp.getState();
        if (!s.game || tileAt(homeProvince(s.game), x, y)?.road) return;
        s.dispatch({ type: 'placeRoad', x, y });
      },
      onTileClick(x, y, buildingId) {
        const s = useApp.getState();
        if (!s.game) return;
        const tool = s.tool;
        if (tool.kind === 'build') {
          if (!s.dispatch({ type: 'placeBuilding', buildingId: tool.buildingId, x, y })) return;
          const placed = homeProvince(useApp.getState().game!).buildings.at(-1)!;
          if (tool.buildingId !== 'hut') {
            s.setTool({ kind: 'select' });
            s.toggleBuild(false);
            s.select(placed.id);
          }
        } else if (tool.kind === 'demolish') {
          if (buildingId) requestDemolish(buildingId);
          else if (tileAt(homeProvince(s.game), x, y)?.road) s.dispatch({ type: 'removeRoad', x, y });
        } else if (tool.kind === 'select') {
          s.select(buildingId);
        }
      },
    })
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
  }, []);

  useEffect(() => {
    if (focus) current?.centerOnTile(focus.x + 0.5, focus.y + 0.5);
  }, [focus]);

  return (
    <div className="valley-canvas" ref={hostRef}>
      {error && (
        <div className="canvas-error" role="alert">
          <b>{t('ui.renderError')}</b>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
