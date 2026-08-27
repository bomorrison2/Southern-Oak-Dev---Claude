/**
 * Inward polygon offset, used for setbacks and exclusion buffers.
 *
 * Uses robust sampling rather than analytic mitring: a point is kept when it
 * lies inside the ring AND at least d metres from every edge. This degrades
 * gracefully on the concave, irregular rings that real title boundaries often
 * are, and never produces the inverted spikes that naive mitring can create.
 */
import type { Point } from '@/domain/types';
import { distanceToEdges, pointInPolygon } from './polygon';
import { bbox } from './bbox';

/** True when the point sits at least d metres inside the ring. */
export function isInsideBy(pts: readonly Point[], x: number, y: number, d: number): boolean {
  if (!pointInPolygon(pts, x, y)) return false;
  if (d <= 0) return true;
  return distanceToEdges(pts, x, y) >= d;
}

export interface OffsetOptions {
  /** Sampling resolution in metres. Smaller is smoother but slower. */
  step?: number;
}

/**
 * Approximate the inward offset of a ring as an ordered outline.
 * Returns an empty array when the offset consumes the whole plot.
 */
export function offsetInward(
  pts: readonly Point[],
  d: number,
  opts: OffsetOptions = {},
): Point[] {
  if (pts.length < 3) return [];
  if (d <= 0) return [...pts];
  const b = bbox(pts);
  const span = Math.min(b.maxX - b.minX, b.maxY - b.minY);
  const step = opts.step ?? Math.max(0.4, span / 120);

  // Marching outline: for each column record the inside span, then walk the top
  // edge left to right and the bottom edge right to left to close the ring.
  const top: Point[] = [];
  const bottom: Point[] = [];
  for (let x = b.minX; x <= b.maxX; x += step) {
    let lo: number | null = null;
    let hi: number | null = null;
    for (let y = b.minY; y <= b.maxY; y += step) {
      if (isInsideBy(pts, x, y, d)) {
        if (lo === null) lo = y;
        hi = y;
      }
    }
    if (lo !== null && hi !== null) {
      top.push({ x, y: hi });
      bottom.push({ x, y: lo });
    }
  }
  if (top.length < 2) return [];
  return [...top, ...bottom.reverse()];
}
