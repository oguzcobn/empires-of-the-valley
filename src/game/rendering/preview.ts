import 'pixi.js/unsafe-eval';
import { Container, Graphics, autoDetectRenderer } from 'pixi.js';
import type { Renderer } from 'pixi.js';

/**
 * One shared offscreen renderer that turns procedural sprites into images (culture picker,
 * Architecture Atlas, workshop thumbnails). A single WebGL context, cached results.
 */
let rendererPromise: Promise<Renderer> | null = null;
const cache = new Map<string, Promise<string>>();

function renderer(): Promise<Renderer> {
  rendererPromise ??= autoDetectRenderer({
    width: 8,
    height: 8,
    backgroundAlpha: 0,
    antialias: true,
    preference: 'webgl',
    resolution: 2,
  });
  rendererPromise.catch(() => {
    rendererPromise = null;
  });
  return rendererPromise;
}

/** Renders `draw` (local sprite space) into a PNG data URL cropped to its bounds. Cached by key. */
export function renderToDataUrl(key: string, draw: (g: Graphics, root: Container) => void): Promise<string> {
  const hit = cache.get(key);
  if (hit) return hit;
  const job = (async () => {
    const r = await renderer();
    const root = new Container();
    const g = new Graphics();
    root.addChild(g);
    draw(g, root);
    const url = await r.extract.base64({
      target: root,
      frame: undefined,
      resolution: 2,
      clearColor: [0, 0, 0, 0],
    });
    root.destroy({ children: true });
    return url;
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}
