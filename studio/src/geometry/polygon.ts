/**
 * Polygon geometry in site-local metres.
 * Pure functions only, no DOM and no state. Ported and typed from the ArchForm
 * prototype's proven boundary maths.
 */
import type { Point } from '@/domain/types';

/** Signed area (positive when the ring winds anticlockwise). */
export function signedArea(pts: readonly Point[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const p = pts[i]!;
    const q = pts[j]!;
    // Shoelace cross-product form: positive for anticlockwise rings, and the
    // same convention centroid() uses, so the two never disagree.
    a += q.x * p.y - p.x * q.y;
  }
  return a / 2;
}

/** Absolute polygon area in square metres. Returns 0 for degenerate rings. */
export function area(pts: readonly Point[]): number {
  if (pts.length < 3) return 0;
  return Math.abs(signedArea(pts));
}

export function meanPoint(pts: readonly Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/** Area-weighted centroid; falls back to the vertex mean for tiny rings. */
export function centroid(pts: readonly Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length < 3) return meanPoint(pts);
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const p = pts[i]!;
    const q = pts[j]!;
    const f = q.x * p.y - p.x * q.y;
    a += f;
    cx += (q.x + p.x) * f;
    cy += (q.y + p.y) * f;
  }
  if (Math.abs(a) < 1e-9) return meanPoint(pts);
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Ray-cast point-in-polygon test. Points exactly on an edge may return either. */
export function pointInPolygon(pts: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!;
    const pj = pts[j]!;
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to a segment. */
export function distanceToSegment(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - a.x) * dx + (py - a.y) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** Shortest distance from a point to the ring edges (unsigned). */
export function distanceToEdges(pts: readonly Point[], x: number, y: number): number {
  if (pts.length < 2) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const d = distanceToSegment(x, y, a, b);
    if (d < best) best = d;
  }
  return best;
}

/** Nearest point lying on the ring edges. */
export function nearestPointOnEdges(pts: readonly Point[], x: number, y: number): Point {
  if (pts.length < 2) return { x, y };
  let best: Point = pts[0] ?? { x, y };
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1) : 0;
    const cand = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(x - cand.x, y - cand.y);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  return best;
}

export function perimeter(pts: readonly Point[]): number {
  if (pts.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Ensure anticlockwise winding so inward offsets behave predictably. */
export function ensureCCW(pts: readonly Point[]): Point[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : [...pts];
}
