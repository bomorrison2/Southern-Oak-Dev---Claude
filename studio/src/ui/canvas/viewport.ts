/**
 * Canvas viewport: converts between site metres and screen pixels.
 * Pure maths so it can be unit tested without a DOM.
 */
import type { Point } from '@/domain/types';
import type { BBox } from '@/geometry/bbox';

export interface Viewport {
  /** Pixels per metre at the current zoom. */
  scale: number;
  /** Screen position (px) of the world origin. */
  panX: number;
  panY: number;
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 40;

export function createViewport(): Viewport {
  return { scale: 4, panX: 0, panY: 0 };
}

/** World metres to screen pixels. Screen Y grows downward, world Y grows up. */
export function worldToScreen(v: Viewport, x: number, y: number): Point {
  return { x: x * v.scale + v.panX, y: -y * v.scale + v.panY };
}

export function screenToWorld(v: Viewport, px: number, py: number): Point {
  return { x: (px - v.panX) / v.scale, y: -(py - v.panY) / v.scale };
}

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** Zoom about a screen anchor so the point under the cursor stays put. */
export function zoomAt(v: Viewport, anchorX: number, anchorY: number, factor: number): Viewport {
  const scale = clampScale(v.scale * factor);
  const applied = scale / v.scale;
  return {
    scale,
    panX: anchorX - (anchorX - v.panX) * applied,
    panY: anchorY - (anchorY - v.panY) * applied,
  };
}

export function pan(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, panX: v.panX + dx, panY: v.panY + dy };
}

/** Fit a world bounding box into the canvas with padding (fraction of size). */
export function fitTo(b: BBox, widthPx: number, heightPx: number, padding = 0.12): Viewport {
  const w = Math.max(1e-6, b.maxX - b.minX);
  const h = Math.max(1e-6, b.maxY - b.minY);
  const usableW = widthPx * (1 - padding * 2);
  const usableH = heightPx * (1 - padding * 2);
  const scale = clampScale(Math.min(usableW / w, usableH / h));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    scale,
    panX: widthPx / 2 - cx * scale,
    panY: heightPx / 2 + cy * scale,
  };
}

/** A round scale-bar length (in metres) that renders 60-160 px wide. */
export function niceScaleBar(scale: number): number {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  for (const s of steps) {
    const px = s * scale;
    if (px >= 60 && px <= 160) return s;
  }
  return scale > 1 ? 1 : 500;
}
