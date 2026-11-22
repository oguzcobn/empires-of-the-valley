import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { LANDMARK_IDS, LANDMARKS } from '../game/data/landmarks';
import { URBAN_IDS } from '../game/data/urbanBuildingModels';
import type { UrbanId } from '../game/data/urbanBuildingModels';
import { MONUMENT_MODELS } from '../game/data/monumentModels';
import type { ArchitectureStyle, LandmarkId } from '../game/core/types';
import type { MonumentLighting, mountMonumentScene } from '../game/rendering/three/monumentScene';
import { t } from '../i18n';

const groups = [
  ['turkish', 'Trabzon'], ['scottish', 'Edinburgh'],
  ['japanese', 'Kyoto'], ['medieval_european', 'Prag'],
] as const;

export function MonumentViewer({ urban = false, style, initialBuilding }: { urban?: boolean; style?: ArchitectureStyle; initialBuilding?: UrbanId } = {}): ReactElement {
  const [id, setId] = useState<LandmarkId | UrbanId>(initialBuilding ?? (urban ? 'skyscraper' : 'trabzon_ayasofya'));
  const [lighting, setLighting] = useState<MonumentLighting>('day');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof mountMonumentScene> | null>(null);
  useEffect(() => {
    const target = host.current!;
    let mounted = true;
    setStatus('loading');
    setLighting('day');
    void import('../game/rendering/three/monumentScene')
      .then(({ mountMonumentScene }) => {
        if (!mounted) return;
        renderer.current = mountMonumentScene(target, id, style);
        setStatus('ready');
      })
      .catch(() => { if (mounted) setStatus('error'); });
    return () => {
      mounted = false;
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [id, style]);
  return (
    <section className="monument-viewer" data-testid="monument-viewer">
      <div className="monument-selectors">
        <label>{urban ? 'Bina' : 'Anıt'}
          <select value={id} onChange={event => setId(event.target.value as LandmarkId | UrbanId)}>
            {urban ? URBAN_IDS.map(key => <option key={key} value={key}>{t(`building.${key}.name`)}</option>) :
            groups.map(([culture, city]) => (
              <optgroup label={city} key={culture}>
                {LANDMARK_IDS.filter(key => MONUMENT_MODELS[key] && LANDMARKS[key].landmark?.culture === culture)
                  .map(key => <option value={key} key={key}>{t(`building.${key}.name`)}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>Işık
          <select value={lighting} disabled={status !== 'ready'} onChange={event => {
            const next = event.target.value as MonumentLighting;
            try {
              renderer.current?.setLighting(next);
              setLighting(next);
            } catch {
              setStatus('error');
            }
          }}>
            <option value="day">Gündüz</option>
            <option value="evening">Gün batımı</option>
            <option value="overcast">Kapalı hava</option>
          </select>
        </label>
      </div>
      <div className="monument-stage" hidden={status === 'error'} aria-label={t(`building.${id}.name`)} ref={host} />
      {status === 'loading' && <p role="status">3B model yükleniyor…</p>}
      {status === 'error' && <p role="alert">3B görünüm bu cihazda açılamadı. Haritadaki çizimler kullanılabilir.</p>}
      {status === 'ready' && <p className="hint">Döndürmek için sürükle. Yakınlaştırmak için iki parmağını veya fare tekerleğini kullan.</p>}
    </section>
  );
}
