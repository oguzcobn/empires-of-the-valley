import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Graphics } from 'pixi.js';
import type { BuildingId } from '../game/core/types';
import type { PlayableStyle } from '../game/data/architecture';
import { drawStyledBuilding } from '../game/rendering/arch/buildings';
import { P, isoX, isoY } from '../game/rendering/iso';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { renderToDataUrl } from '../game/rendering/preview';
import { t } from '../i18n';

/** A small rendered street scene of a culture: the same sprites the game draws. */
const SCENE: [BuildingId, number, number, number][] = [
  ['town_center', 1, 0, 0],
  ['hut', 3, 2.3, 0.2],
  ['hut', 2, 2.3, 1.3],
  ['hut', 1, 0.2, 2.3],
  ['school', 1, 1.4, 2.4],
];

export function CulturePreview({ style }: { style: PlayableStyle }): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    renderToDataUrl(`culture|${style}`, (ground, root) => {
      const pal = SEASON_PALETTE.summer;
      ground.poly([P(-0.2, -0.2), P(3.6, -0.2), P(3.6, 4.6), P(-0.2, 4.6)].flat()).fill(pal.grass[0]!);
      const sorted = [...SCENE].sort((a, b) => a[2] + a[3] - (b[2] + b[3]));
      for (const [id, level, u, v] of sorted) {
        const g = new Graphics();
        drawStyledBuilding(g, { definitionId: id, style, look: null, level, condition: 10000 }, pal, 2, 11 + level);
        g.position.set(isoX(u, v), isoY(u, v));
        root.addChild(g);
      }
    })
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [style]);
  return url ? (
    <img src={url} alt={t(`style.${style}.long`)} className="culture-img" />
  ) : (
    <span className="culture-img placeholder" aria-hidden="true" />
  );
}
