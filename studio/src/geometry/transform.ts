/** Rigid transforms and rectangle helpers, all in site-local metres. */
import type { Point, Rect } from '@/domain/types';
import { centroid } from './polygon';

export function translate(pts: readonly Point[], dx: number, dy: number): Point[] {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Rotate about an origin (default: the ring centroid). Degrees anticlockwise. */
export function rotate(pts: readonly Point[], deg: number, origin?: Point): Point[] {
  const o = origin ?? centroid(pts);
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return pts.map((p) => {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    return { x: o.x + dx * cos - dy * sin, y: o.y + dx * sin + dy * cos };
  });
}

/** Uniform scale about an origin (default: the ring centroid). */
export function scale(pts: readonly Point[], factor: number, origin?: Point): Point[] {
  const o = origin ?? centroid(pts);
  return pts.map((p) => ({
    x: o.x + (p.x - o.x) * factor,
    y: o.y + (p.y - o.y) * factor,
  }));
}

/** The four corners of a rotated rectangle, anticlockwise from front-left. */
export function rectCorners(r: Rect): Point[] {
  const rad = (r.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = r.w / 2;
  const hd = r.d / 2;
  const local: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([lx, ly]) => ({
    x: r.x + lx * cos - ly * sin,
    y: r.y + lx * sin + ly * cos,
  }));
}

export function rectArea(r: Rect): number {
  return Math.abs(r.w * r.d);
}

/** Unit vector along the rectangle local +Y axis (its front direction). */
export function rectForward(r: Rect): Point {
  const rad = (r.rotationDeg * Math.PI) / 180;
  return { x: -Math.sin(rad), y: Math.cos(rad) };
}
