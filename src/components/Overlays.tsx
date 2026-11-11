import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../app/store';
import { calendar } from '../game/core/time';
import type { GameState } from '../game/core/types';
import { ROAD_COST_WOOD } from '../game/data/balance';
import { BUILDINGS } from '../game/data/buildings';
import { computeAlerts } from '../game/systems/alerts';
import { validatePlacement } from '../game/systems/commands';
import { depositInRange, homeProvince, totalPopulation } from '../game/systems/economy';
import { buildingById, tileAt } from '../game/systems/grid';
import { checkRoadSite } from '../game/systems/placement';
import { fmtAmount, fmtInt, t, tm } from '../i18n';
import { Modal } from './common';
import { getRenderer } from './ValleyCanvas';

const SEVERITY_MARK = { danger: '▲', warning: '◆', info: '●' } as const;

export function AlertsList({ game }: { game: GameState }): ReactElement | null {
  const alerts = useMemo(() => computeAlerts(game), [game]);
  const { focusOn, select } = useApp.getState();
  if (alerts.length === 0) return null;
  const p = homeProvince(game);
  return (
    <ul className="alerts" aria-label={t('alerts.title')} data-testid="alerts">
      {alerts.slice(0, 5).map((a) => (
        <li key={a.id}>
          <button
            className={`alert ${a.severity}`}
            disabled={!a.at}
            onClick={() => {
              if (!a.at) return;
              focusOn(a.at.x, a.at.y);
              select(tileAt(p, a.at.x, a.at.y)?.buildingId ?? null);
            }}
            title={a.at ? t('alerts.jump') : undefined}
          >
            <span aria-hidden="true">{SEVERITY_MARK[a.severity]}</span>
            {t(a.key, a.params)}
            {a.at && (
              <span className="jump" aria-hidden="true">
                ↗
              </span>
            )}
          </button>
        </li>
      ))}
      {alerts.length > 5 && <li className="muted more">{t('alerts.more', { n: alerts.length - 5 })}</li>}
    </ul>
  );
}

export function Toasts(): ReactElement {
  const toasts = useApp((s) => s.toasts);
  const { dismissToast, focusOn } = useApp.getState();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <button
          key={x.id}
          className={`toast ${x.kind}`}
          onClick={() => {
            if (x.at) focusOn(x.at.x, x.at.y);
            dismissToast(x.id);
          }}
        >
          <span aria-hidden="true">
            {x.kind === 'error' || x.kind === 'danger'
              ? '▲'
              : x.kind === 'warning'
                ? '◆'
                : x.kind === 'quest'
                  ? '★'
                  : '✔'}
          </span>
          {x.text}
        </button>
      ))}
    </div>
  );
}

/** Bottom-left strip: what is under the cursor and, in build mode, why a site is (in)valid. */
export function InfoStrip({ game }: { game: GameState }): ReactElement {
  const hover = useApp((s) => s.hover);
  const tool = useApp((s) => s.tool);
  const p = homeProvince(game);
  let toolText = t('info.select');
  if (tool.kind === 'build') toolText = t('info.build', { building: `@building.${tool.buildingId}.name` });
  else if (tool.kind === 'road') toolText = t('info.road', { n: fmtAmount(ROAD_COST_WOOD) });
  else if (tool.kind === 'demolish') toolText = t('info.demolish');

  let tileText = '';
  let verdict: { ok: boolean; text: string } | null = null;
  const tile = hover ? tileAt(p, hover.x, hover.y) : undefined;
  if (hover && tile) {
    const b = tile.buildingId ? buildingById(p, tile.buildingId) : undefined;
    tileText = b
      ? t(`building.${b.definitionId}.name`)
      : tile.road
        ? t('terrain.road')
        : t(`terrain.${tile.terrain}`);
    if (!b && tile.terrain === 'forest') tileText += ` · ${t('info.woodLeft', { n: fmtInt(tile.deposit) })}`;
    if (!b && tile.terrain === 'stone') tileText += ` · ${t('info.stoneLeft', { n: fmtInt(tile.deposit) })}`;
    if (tool.kind === 'build') {
      const error = validatePlacement(game, tool.buildingId, hover.x, hover.y);
      verdict = error ? { ok: false, text: tm(error) } : { ok: true, text: t('info.canBuild') };
      const harvests = BUILDINGS[tool.buildingId].harvests;
      if (harvests) {
        const left = depositInRange(p, { definitionId: tool.buildingId, x: hover.x, y: hover.y });
        tileText += ` · ${t(harvests.terrain === 'forest' ? 'why.forestLeft' : 'why.stoneLeft', { n: fmtInt(left), r: harvests.radius })}`;
      }
    } else if (tool.kind === 'road') {
      const error = checkRoadSite(p, hover.x, hover.y);
      verdict = error ? { ok: false, text: tm(error) } : { ok: true, text: t('info.canBuild') };
    }
  }
  return (
    <div className="info-strip" data-testid="info-strip">
      <span className="info-tool">{toolText}</span>
      {hover && tile && (
        <span className="info-tile">
          ({hover.x}, {hover.y}) {tileText}
        </span>
      )}
      {verdict && (
        <span className={`info-verdict ${verdict.ok ? 'ok' : 'bad'}`}>
          {verdict.ok ? '✔' : '✖'} {verdict.text}
        </span>
      )}
      {tool.kind === 'build' && !hover && (
        <span className="muted">{t(`building.${BUILDINGS[tool.buildingId].id}.rule`)}</span>
      )}
    </div>
  );
}

export function ConfirmDialog(): ReactElement | null {
  const confirm = useApp((s) => s.confirm);
  const ask = useApp((s) => s.ask);
  if (!confirm) return null;
  return (
    <Modal title={confirm.title} onClose={() => ask(null)}>
      <p>{confirm.body}</p>
      <div className="actions">
        <button className="btn" onClick={() => ask(null)}>
          {t('ui.cancel')}
        </button>
        <button
          className={`btn ${confirm.danger ? 'danger' : 'primary'}`}
          onClick={() => {
            ask(null);
            confirm.onConfirm();
          }}
          data-testid="confirm-ok"
        >
          {confirm.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function IntroDialog({ game }: { game: GameState }): ReactElement | null {
  const open = useApp((s) => s.introOpen);
  const closeIntro = useApp((s) => s.closeIntro);
  if (!open) return null;
  const campaign = game.mode === 'campaign';
  return (
    <Modal title={campaign ? t('intro.title') : t('intro.sandboxTitle')} onClose={closeIntro}>
      {campaign ? (
        <>
          <p className="story">{t('intro.story')}</p>
          <div className="mira">
            <span className="mira-face" aria-hidden="true">
              M
            </span>
            <p>
              <b>Mira:</b> {t('intro.mira')}
            </p>
          </div>
        </>
      ) : (
        <p className="story">{t('intro.sandbox', { seed: game.seed })}</p>
      )}
      <ul className="tips">
        <li>{t('intro.tip1')}</li>
        <li>{t('intro.tip2')}</li>
        <li>{t('intro.tip3')}</li>
      </ul>
      <div className="actions">
        <button className="btn primary" onClick={closeIntro} data-testid="intro-start" autoFocus>
          {t('intro.start')}
        </button>
      </div>
    </Modal>
  );
}

export function ChapterDialog({ game }: { game: GameState }): ReactElement | null {
  const open = useApp((s) => s.chapterDialog);
  const close = useApp((s) => s.closeChapterDialog);
  if (!open) return null;
  const p = homeProvince(game);
  const cal = calendar(game.tick);
  return (
    <Modal title={t('chapterEnd.title')} onClose={close}>
      <p className="story">{t('chapterEnd.story')}</p>
      <ul className="tips">
        <li>{t('chapterEnd.stat.days', { n: cal.day })}</li>
        <li>{t('chapterEnd.stat.pop', { n: totalPopulation(p) })}</li>
        <li>{t('chapterEnd.stat.buildings', { n: p.buildings.length })}</li>
        <li>{t('chapterEnd.stat.tech', { n: game.researchedTechIds.length })}</li>
      </ul>
      <h4>{t('chapterEnd.nextTitle')}</h4>
      <p>{t('chapterEnd.next')}</p>
      <p className="hint">{t('chapterEnd.note')}</p>
      <div className="actions">
        <button className="btn primary" onClick={close} data-testid="chapter-continue">
          {t('chapterEnd.continue')}
        </button>
      </div>
    </Modal>
  );
}

/** Developer overlay (F3 or Settings): FPS, simulation cost and entity counts. */
export function PerfOverlay(): ReactElement | null {
  const show = useApp((s) => s.settings.showPerf);
  const tickMs = useApp((s) => s.tickMs);
  const [, force] = useState(0);
  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [show]);
  if (!show) return null;
  const stats = getRenderer()?.getStats();
  return (
    <pre className="perf" data-testid="perf">
      {`FPS ${stats?.fps ?? '-'}\ntick ${tickMs.toFixed(2)} ms\n${t('perf.buildings')} ${stats?.buildings ?? 0}\n${t('perf.props')} ${stats?.props ?? 0}\n${t('perf.walkers')} ${stats?.walkers ?? 0}\n${t('perf.particles')} ${stats?.particles ?? 0}`}
    </pre>
  );
}
