import type { RendererStats } from './ValleyRenderer';

/** What the app needs from a map view; implemented by the 2D (PixiJS) and 3D (Three.js) renderers. */
export interface ValleyView {
  destroy(): void;
  getStats(): RendererStats;
  resetCamera(): void;
  toggleHorizon?(): void;
  centerOnTile(x: number, y: number): void;
  /** Client (viewport) coordinates of a tile centre — used by automated browser tests. */
  tileToClient(x: number, y: number): { x: number; y: number };
  zoomBy(factor: number, sx?: number, sy?: number): void;
  panBy(dx: number, dy: number): void;
  /** Camera centre (true map tile coordinates) and zoom, kept when the camera is rotated. */
  getCamera(): { x: number; y: number; zoom: number };
}
