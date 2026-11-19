import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import { DEMOLISH_REFUND_PERMILLE } from '../game/data/balance';
import { ValleyRenderer } from '../game/rendering/ValleyRenderer';
import type { RendererHost } from '../game/rendering/ValleyRenderer';
import type { ValleyView } from '../game/rendering/view';
import { ROTATION_LABEL } from '../game/rendering/rotation';
import { homeProvince, idleWorkers } from '../game/systems/economy';
import { planRoadRoute, validatePlacement } from '../game/systems/commands';
import { buildingById, tileAt } from '../game/systems/grid';
import { fmtAmount, t } from '../i18n';
import { artDetail, effectiveQuality, lowerQuality, setAutoCap } from '../app/settings';
import { ambience } from '../app/ambience';
import { calendar } from '../game/core/time';

/** The live renderer, for camera buttons and keyboard shortcuts. Null while not mounted. */
let current: ValleyView | null = null;
export const getRenderer = (): ValleyView | null => current;

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
  const game = useApp((s) => s.game);
  const roadTarget = useApp((s) => s.tool.kind === 'roadPlan' ? s.tool.end ?? s.hover : null);
  const roadPlan = useMemo(
    () => game && tool.kind === 'roadPlan' && tool.start && roadTarget
      ? planRoadRoute(game, tool.start, roadTarget, tool.bridge, tool.paved) : null,
    [game, tool, roadTarget],
  );
  const roadPlanRef = useRef(roadPlan);
  useEffect(() => { roadPlanRef.current = roadPlan; }, [roadPlan]);
  useEffect(() => { setPlacement(null); }, [tool]);
  const focus = useApp((s) => s.focus);
  const graphics = useApp((s) => s.settings.graphics);
  const [capNonce, setCapNonce] = useState(0);
  const quality = effectiveQuality({ graphics });
  const rotation = useApp((s) => s.rotation);

  useEffect(() => {
    const host = hostRef.current!;
    const opts = {
      resolution: quality === 'low' ? 1 : quality === 'medium' ? 1.5 : quality === 'high' ? 2 : 2.5,
      antialias: quality !== 'low',
      cacheBodies: quality === 'low' || quality === 'medium',
      rotation,
      // keep looking at the same spot when the camera turns or the renderer is rebuilt
      camera: current?.getCamera() ?? null,
    };
    let disposed = false;
    let renderer: ValleyView | null = null;
    // the previous view stays on screen until the new one has drawn (no blank flash on rotation)
    const previous = current;
    setError(null);
    const callbacks: RendererHost = {
      getView() {
        const s = useApp.getState();
        return s.game
          ? {
              game: s.game,
              tool: s.tool,
              roadPlan: roadPlanRef.current,
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
      onPersonClick(person) {
        useApp.getState().selectPerson(person);
      },
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
        if (tool.kind === 'roadPlan') {
          if (!tileAt(homeProvince(s.game), x, y)) return;
          const point = { x, y };
          if (tool.start) s.setTool({ ...tool, end: point });
          else s.setTool({ ...tool, start: point });
        } else if (tool.kind === 'build') {
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
          if (tool.buildingId !== 'hut' && !s.buildOpen) {
            s.setTool({ kind: 'select' });
            s.select(placed.id);
          }
        } else if (tool.kind === 'hunt') {
          if (s.dispatch({ type: 'hunt', x, y, workers: tool.workers })) s.setTool({ kind: 'select' });
        } else if (tool.kind === 'army') {
          s.dispatch({ type: 'moveMilitia', x, y });
        } else if (tool.kind === 'terrace') {
          s.dispatch({ type: 'buildTerrace', x, y });
        } else if (tool.kind === 'demolish') {
          const tile = tileAt(homeProvince(s.game), x, y);
          if (buildingId) requestDemolish(buildingId);
          else if (tile?.road) s.dispatch({ type: 'removeRoad', x, y });
          else if (tile && ['forest', 'stone', 'rocky', 'hill', 'mountain'].includes(tile.terrain)) {
            s.dispatch({ type: 'clearTerrain', x, y });
          }
        } else if (tool.kind === 'select') {
          const transit = homeProvince(s.game).transit;
          if ([transit?.rail, transit?.air].some((line) => line?.route[0]?.x === x && line.route[0].y === y)) {
            s.openPanel('transport');
            return;
          }
          s.select(buildingId);
        }
      },
    };
    let destroyTimer = 0;
    const created: Promise<ValleyView> = ValleyRenderer.create(host, callbacks, opts);
    created
      .then((r) => {
        if (disposed) {
          r.destroy();
        } else {
          renderer = r;
          current = r;
          if (previous && previous !== r) {
            destroyTimer = window.setTimeout(() => {
              previous.destroy();
              destroyTimer = 0;
            }, 120);
          }
        }
      })
      .catch((e: unknown) => {
        if (previous) previous.destroy();
        if (disposed) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      disposed = true;
      if (destroyTimer) {
        window.clearTimeout(destroyTimer);
        if (previous) previous.destroy();
      }
      if (renderer) {
        renderer.destroy();
        if (current === renderer) current = null;
      }
    };
  }, [quality, capNonce, rotation]);

  useEffect(() => {
    if (focus) current?.centerOnTile(focus.x + 0.5, focus.y + 0.5);
  }, [focus]);

  // City soundscape: unlock audio on the first gesture, then follow the city a few times a second.
  useEffect(() => {
    const unlock = () => ambience.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const timer = window.setInterval(() => {
      const game = useApp.getState().game;
      const stats = current?.getStats();
      if (!game || !stats) return;
      const jobs = game.cityLife?.jobs ?? [];
      ambience.update({
        night: stats.night,
        season: calendar(game.tick).season,
        weather: stats.weather,
        traffic: (stats.traffic ?? 0) + jobs.filter((j) => j.stage === 'outbound' || j.stage === 'return').length,
        siren: jobs.some((j) => (j.kind === 'ambulance' || j.kind === 'patrol' || j.kind === 'fire') && j.stage === 'outbound'),
        paused: game.speed === 0 || document.hidden,
      });
    }, 400);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.clearInterval(timer);
      ambience.update({ night: 0, season: 'summer', weather: 'clear', traffic: 0, siren: false, paused: true });
    };
  }, []);

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

  const findNearbyPlacement = () => {
    if (!placement || !game || tool.kind !== 'build') return;
    for (let distance = 1; distance <= 4; distance++) {
      for (let dx = -distance; dx <= distance; dx++) {
        const dy = distance - Math.abs(dx);
        for (const sign of dy > 0 ? [-1, 1] : [1]) {
          const spot = { x: placement.x + dx, y: placement.y + sign * dy };
          if (validatePlacement(game, tool.buildingId, spot.x, spot.y, tool.style, tool.look)) continue;
          setPlacement(spot);
          useApp.getState().setHover(spot);
          return;
        }
      }
    }
    useApp.getState().toast('info', 'Yakında inşa edilebilecek bir yer bulunamadı.');
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
        <div className="mobile-place-actions">
          <button type="button" onClick={() => { setPlacement(null); useApp.getState().setHover(null); }}>İptal</button>
          {placementError ? <button type="button" onClick={findNearbyPlacement}>Yakında yer bul</button>
            : <button type="button" onClick={confirmPlacement}>✓ Buraya inşa et</button>}
        </div>
      </div>}
      {tool.kind === 'demolish' && (
        <div className="road-plan-controls" aria-label="Yıkım ve arazi temizleme aracı">
          <p role="status">
            🪓 <b>Yık / Arazi Temizle:</b> Bina veya yolu yıkmak ya da <b>ağaçları, taşları ve engebeleri temizleyip düz inşaat alanı açmak (+15 odun/taş)</b> için kareye tıkla.
          </p>
          <div>
            <button type="button" className="btn" onClick={() => useApp.getState().setTool({ kind: 'select' })}>Kapat</button>
          </div>
        </div>
      )}
      {tool.kind === 'hunt' && game && (
        <div className="road-plan-controls">
          <p>Avcı sayısını seç, sonra haritada işaretli bir hayvana dokun. Boşta işçi: {idleWorkers(homeProvince(game))}</p>
          <div>
            <label>Avcı sayısı <select value={tool.workers} onChange={(event) => useApp.getState().setTool({ kind: 'hunt', workers: Number(event.currentTarget.value) })}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>
            <button type="button" className="btn" onClick={() => useApp.getState().setTool({ kind: 'select' })}>Kapat</button>
          </div>
        </div>
      )}
      {tool.kind === 'roadPlan' && (
        <div className="road-plan-controls" aria-label={tool.bridge ? 'Köprü planı' : 'Yol planı'}>
          <p role="status">
            {!tool.start ? (tool.bridge ? 'Yola bağlı bir kıyı karesi seç.' : 'Mevcut yola veya yolun yanındaki bir kareye dokun.') :
              !tool.end ? (tool.bridge ? 'Aynı hizada karşı kıyıyı seç.' : 'Yolun biteceği kareyi seç.') :
              roadPlan?.error ? t(roadPlan.error.key, roadPlan.error.params) :
              roadPlan && [
                `${roadPlan.tiles.length} yeni kare${roadPlan.paveTiles.length ? ` · ${roadPlan.paveTiles.length} kare asfaltlanacak` : ''}`,
                ...Object.entries(roadPlan.cost).map(([id, amount]) =>
                  `${fmtAmount(amount)} ${t(`resource.${id}` as Parameters<typeof t>[0])}`,
                ),
              ].join(' · ')}
          </p>
          <div>
            {!tool.bridge && <label className="road-surface-toggle">
              <input type="checkbox" checked={!!tool.paved} onChange={(event) => useApp.getState().setTool({ ...tool, paved: event.currentTarget.checked })} />
              Asfalt yol
            </label>}
            <button type="button" className="btn" onClick={() => useApp.getState().setTool({ kind: 'select' })}>Kapat</button>
            {tool.start && (
              <button type="button" className="btn" onClick={() => useApp.getState().setTool({ kind: 'roadPlan', bridge: tool.bridge, paved: tool.paved })}>Sıfırla</button>
            )}
            {tool.start && tool.end && (
              <button type="button" className="btn primary" disabled={!roadPlan || !!roadPlan.error} onClick={() => {
                const s = useApp.getState();
                if (tool.start && tool.end && s.dispatch({ type: 'placeRoadRoute', start: tool.start, end: tool.end, bridge: tool.bridge, paved: tool.paved }))
                  s.setTool({ kind: 'roadPlan', bridge: tool.bridge, paved: tool.paved });
              }}>{tool.bridge ? 'Köprüyü İnşa Et' : tool.paved ? 'Asfalt Yolu İnşa Et' : 'Yolu İnşa Et'}</button>
            )}
          </div>
        </div>
      )}
      <div className="camera-rotate" role="group" aria-label="Kamerayı döndür">
        <button type="button" onClick={() => useApp.getState().rotateCamera(-1)} title="Kamerayı sola döndür (Q)" aria-label="Kamerayı sola döndür"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M5 5H2V2M2.5 5A6 6 0 1 1 3 11.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <span aria-live="polite">{ROTATION_LABEL[rotation]}</span>
        <button type="button" onClick={() => useApp.getState().rotateCamera(1)} title="Kamerayı sağa döndür (E)" aria-label="Kamerayı sağa döndür"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M11 5h3V2m-.5 3A6 6 0 1 0 13 11.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </div>
      {error && (
        <div className="canvas-error" role="alert">
          <b>{t('ui.renderError')}</b>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}