import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './buildings';
import { CITIES } from './cities';
import { LANDMARK_IDS, LANDMARKS } from './landmarks';
import { MONUMENT_MODELS } from './monumentModels';
import { createMonument } from '../rendering/three/monumentGeometry';
import { Box3 } from 'three';

const addedLandmarks = {
  turkish: ['trabzon_ayasofya', 'ataturk_kosku', 'trabzon_kalesi', 'gulbahar_hatun', 'bedesten_trabzon', 'kizlar_manastiri', 'vazelon_manastiri', 'kostaki_konagi', 'ortahisar_fatih', 'alacahan_trabzon'],
  scottish: ['holyrood_palace', 'st_giles_cathedral', 'national_monument_calton', 'nelson_monument', 'craigmillar_castle', 'balmoral_clock', 'national_gallery_scotland', 'dugald_stewart', 'forth_bridge_tower', 'dean_village_mill'],
  japanese: ['kinkakuji', 'kiyomizu_dera', 'fushimi_inari', 'ginkakuji', 'toji_pagoda', 'nijo_castle', 'yasaka_pagoda', 'heian_shrine', 'byodoin_phoenix', 'ryoanji_garden'],
  medieval_european: ['prague_castle', 'st_vitus_cathedral', 'charles_bridge_tower', 'astronomical_clock', 'tyn_church', 'powder_tower', 'dancing_house', 'petrin_tower', 'vysehrad_basilica', 'national_theatre_prague'],
} as const;

describe('forty city landmarks', () => {
  it('adds ten buildable monuments for each culture', () => {
    for (const [culture, ids] of Object.entries(addedLandmarks)) {
      expect(ids).toHaveLength(10);
      for (const id of ids) {
        const def = LANDMARKS[id as keyof typeof LANDMARKS];
        expect(def, id).toBeDefined();
        expect(def.landmark?.culture).toBe(culture);
        expect(def.landmark?.stages).toHaveLength(3);
        expect(def.landmark?.attraction).toBeGreaterThan(0);
        expect(BUILDINGS[id as keyof typeof BUILDINGS].category).toBe('landmark');
      }
    }
    expect(LANDMARK_IDS).toHaveLength(47);
  });

  it('builds distinct finite 3D models for the 40 additions', () => {
    const ids = Object.values(addedLandmarks).flat();
    expect(Object.keys(MONUMENT_MODELS)).toHaveLength(ids.length);
    expect(new Set(ids.map(id => JSON.stringify(MONUMENT_MODELS[id]))).size).toBe(ids.length);
    for (const id of ids) {
      const model = createMonument(id);
      const bounds = new Box3().setFromObject(model);
      expect(model.children.length, id).toBeGreaterThan(2);
      expect([...bounds.min, ...bounds.max].every(Number.isFinite), id).toBe(true);
      expect(bounds.max.y - bounds.min.y, id).toBeGreaterThan(.5);
    }
  });

  it('preserves the seven existing monument IDs and save identifiers', () => {
    for (const id of ['edinburgh_castle', 'stirling_castle', 'scott_monument', 'sumela_monastery', 'galata_tower', 'selimiye_mosque', 'trabzon_stadium']) {
      expect(LANDMARK_IDS).toContain(id);
      expect(BUILDINGS[id as keyof typeof BUILDINGS].id).toBe(id);
    }
  });

  it('uses local landmarks for Kyoto and Prague without changing classic city identity', () => {
    expect(CITIES.kyoto.landmark).toBe('kinkakuji');
    expect(CITIES.prague.landmark).toBe('prague_castle');
    expect(CITIES.trabzon.landmark).toBe('sumela_monastery');
    expect(CITIES.edinburgh.landmark).toBe('scott_monument');
    for (const city of Object.values(CITIES)) expect(city.districts).toHaveLength(24);
  });
});
