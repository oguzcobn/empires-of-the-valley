import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { URBAN_IDS, URBAN_MODELS } from '../game/data/urbanBuildingModels';
import { portSpectrum } from '../game/rendering/three/portSpectrum';
import { createUrbanBuilding } from '../game/rendering/three/urbanBuildingGeometry';

describe('urban architectural meshes', () => {
  it('generates a repeatable spectral port surface at the intended RMS', () => {
    const waves = portSpectrum();
    expect(waves.rms).toBeCloseTo(.04, 6);
    expect(waves.bytes.length).toBe(waves.size ** 2 * 4);
    expect(waves.bytes).toEqual(portSpectrum().bytes);
    expect(waves.bytes.some((b, i) => i % 4 === 0 && Math.abs(b - 128) > 3)).toBe(true);
  });

  it.each(URBAN_IDS)('%s builds finite, material-batched geometry', id => {
    const model = createUrbanBuilding(id);
    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    expect([...bounds.min, ...bounds.max].every(Number.isFinite)).toBe(true);
    expect(size.x).toBeLessThanOrEqual(URBAN_MODELS[id].width);
    expect(size.z).toBeLessThanOrEqual(URBAN_MODELS[id].depth);
    expect(size.y).toBeGreaterThan(3);
    expect(model.children.length).toBeGreaterThan(3);
    expect(model.children.length).toBeLessThan(23);
    for (const mesh of model.children) {
      if (!(mesh instanceof Mesh)) throw new Error('Unexpected non-mesh asset');
      expect(mesh.geometry.getAttribute('normal').count).toBe(mesh.geometry.getAttribute('position').count);
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(2);
    }
  });
});
