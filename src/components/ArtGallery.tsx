import 'pixi.js/unsafe-eval';
import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { BuildingId } from '../game/core/types';
import { BUILDINGS, BUILDING_IDS } from '../game/data/buildings';
import { PLAYABLE_STYLES } from '../game/data/architecture';
import { drawStyledBuilding, drawStyledConstruction } from '../game/rendering/arch/buildings';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { P } from '../game/rendering/iso';

/**
 * Debug-only sprite sheet (?gallery=1): every building of every culture and level, used for
 * visual review and screenshot checks of the procedural art. Not reachable from the game UI.
 */
export function ArtGallery(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const app = new Application();
    let dead = false;
    const params = new URLSearchParams(location.search);
    const season = (params.get('season') ?? 'summer') as keyof typeof SEASON_PALETTE;
    const detail = Number(params.get('detail') ?? 2) as 0 | 1 | 2;
    const only = params.get('only');
    const condition = Number(params.get('condition') ?? 10000);
    void app
      .init({ resizeTo: ref.current!, background: 0xcfe5d0, antialias: true, resolution: 2, autoDensity: true, preference: 'webgl' })
      .then(() => {
        if (dead) return app.destroy({ removeView: true });
        ref.current!.appendChild(app.canvas);
        const root = new Container();
        app.stage.addChild(root);
        root.scale.set(Number(params.get('zoom') ?? 1));
        root.x = -Number(params.get('x') ?? 0);
        const ids = (only ? only.split(',') : BUILDING_IDS) as BuildingId[];
        let y = 40;
        for (const style of PLAYABLE_STYLES) {
          const title = new Text({ text: style, style: { fontSize: 18, fontWeight: '700', fill: 0x223322 } });
          title.position.set(12, y - 30);
          root.addChild(title);
          let x = 90;
          let rowH = 0;
          for (const id of ids) {
            const def = BUILDINGS[id];
            for (let level = 1; level <= def.levels.length; level++) {
              const c = new Container();
              const tileG = new Graphics();
              const [w, h] = def.footprint;
              const d = [P(0, 0), P(w, 0), P(w, h), P(0, h)];
              tileG.poly(d.flat()).fill(SEASON_PALETTE[season].grass[0]!);
              const g = new Graphics();
              drawStyledBuilding(g, { definitionId: id, style, look: null, level, condition }, SEASON_PALETTE[season], detail, 12345 + level);
              c.addChild(tileG, g);
              c.position.set(x, y + 70);
              const label = new Text({ text: `${id} ${level}`, style: { fontSize: 11, fill: 0x223322 } });
              label.position.set(-30, 32 * Math.max(w, h) - 10 + 14);
              c.addChild(label);
              root.addChild(c);
              x += 64 * Math.max(w, h) + 40;
              rowH = Math.max(rowH, 32 * (w + h) + 90);
            }
          }
          const cg = new Graphics();
          drawStyledConstruction(cg, 2, 2, 0.6, style, detail, 1);
          cg.position.set(x, y + 70);
          root.addChild(cg);
          y += rowH + 30;
        }
      });
    return () => {
      dead = true;
      try {
        app.destroy({ removeView: true }, { children: true });
      } catch {
        /* not initialised */
      }
    };
  }, []);
  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} data-testid="gallery" />;
}
