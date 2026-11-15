import { useEffect, useRef, useState } from 'react';
import type { ArchitectureStyle, BuildingId, BuildingLook } from '../game/core/types';
import { buildingArtSeed, drawStyledBuilding } from '../game/rendering/arch/buildings';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { renderToDataUrl } from '../game/rendering/preview';

interface Props {
  id: BuildingId;
  style: ArchitectureStyle;
  level?: number;
  look?: BuildingLook | null;
  condition?: number;
  instanceId?: string;
}

export function BuildingPreview({ id, style, level = 1, look = null, condition = 10000, instanceId }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; url: string }>();
  const seed = instanceId ? buildingArtSeed(instanceId) : 19;
  const key = `building|${id}|${style}|${level}|${Math.floor(condition / 2500)}|${JSON.stringify(look)}|${seed}`;

  useEffect(() => {
    const target = host.current;
    if (!target || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '64px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    renderToDataUrl(key, (g) => {
      drawStyledBuilding(g, { definitionId: id, style, look, level, condition }, SEASON_PALETTE.summer, 2, seed);
    }).then((url) => {
      if (live) setLoaded({ key, url });
    }).catch(() => {
      // The card remains usable if the browser runs out of graphics contexts.
    });
    return () => { live = false; };
  }, [key, visible, id, style, look, level, condition, seed]);

  return (
    <span ref={host} className="building-preview" aria-hidden="true">
      {loaded?.key === key ? <img src={loaded.url} alt="" /> : <span>⌂</span>}
    </span>
  );
}
