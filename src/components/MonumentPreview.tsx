import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Graphics } from 'pixi.js';
import { CITIES } from '../game/data/cities';
import type { CityId } from '../game/data/cities';
import { drawStyledBuilding } from '../game/rendering/arch/buildings';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { renderToDataUrl } from '../game/rendering/preview';

/**
 * Animated 2.5D original procedural monument art. No external photographs or
 * hotlinked third-party assets are required for the title screen.
 */
export function MonumentPreview({ cityId }: { cityId: CityId }): ReactElement {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const city = CITIES[cityId];
    renderToDataUrl(`city-monument-${city.id}`, (_, root) => {
      const g = new Graphics();
      drawStyledBuilding(g, {
        definitionId: cityId === 'kyoto' || cityId === 'prague' ? 'town_center' : city.landmark,
        style: city.culture,
        look: null,
        level: 1,
        condition: 10000,
      }, SEASON_PALETTE.summer, 2, cityId === 'trabzon' ? 43 : 99);
      root.addChild(g);
    }).then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [cityId]);
  return src
    ? <img className="city-landmark" src={src} alt={`${city.name} 2,5D mimari önizlemesi`} />
    : <div className="city-landmark city-landmark-fallback" aria-hidden="true">◈</div>;
}
