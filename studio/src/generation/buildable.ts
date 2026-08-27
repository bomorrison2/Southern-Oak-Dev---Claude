/**
 * Buildable-area analysis.
 *
 * The developable envelope is the plot boundary reduced by the setbacks and by
 * every exclusion the user has recorded (no-build zones, easement corridors,
 * tree root-protection areas, utility clearances). Concept generation may only
 * place a building inside this envelope.
 */
import type { Constraint, Point, Site } from '@/domain/types';
import { distanceToSegment, pointInPolygon, area, distanceToEdges } from '@/geometry/polygon';
import { bbox } from '@/geometry/bbox';
import { offsetInward } from '@/geometry/offset';

/** Exclusions expressed as a test, so both discs and corridors work uniformly. */
export interface Exclusion {
  constraintId: string;
  label: string;
  contains: (x: number, y: number) => boolean;
}

/** Root protection area radius used when a tree has no explicit radius. */
export const DEFAULT_TREE_RPA_M = 6;
/** Clearance either side of a utility run when none is given. */
export const DEFAULT_UTILITY_BUFFER_M = 2;
/** Corridor half-width for an easement when none is given. */
export const DEFAULT_EASEMENT_BUFFER_M = 3;

export function buildExclusions(constraints: readonly Constraint[]): Exclusion[] {
  const out: Exclusion[] = [];
  for (const c of constraints) {
    if (c.points.length === 0) continue;

    if (c.kind === 'noBuild' && c.type === 'polygon' && c.points.length >= 3) {
      const ring = c.points;
      out.push({
        constraintId: c.id,
        label: c.label,
        contains: (x, y) => pointInPolygon(ring, x, y),
      });
      continue;
    }

    if (c.kind === 'tree') {
      const r = c.radius ?? DEFAULT_TREE_RPA_M;
      const p = c.points[0]!;
      out.push({
        constraintId: c.id,
        label: c.label,
        contains: (x, y) => Math.hypot(x - p.x, y - p.y) <= r,
      });
      continue;
    }

    if (c.kind === 'easement' || c.kind === 'utility') {
      const half =
        c.buffer ?? (c.kind === 'easement' ? DEFAULT_EASEMENT_BUFFER_M : DEFAULT_UTILITY_BUFFER_M);
      const pts = c.points;
      if (pts.length === 1) {
        const p = pts[0]!;
        out.push({
          constraintId: c.id,
          label: c.label,
          contains: (x, y) => Math.hypot(x - p.x, y - p.y) <= half,
        });
      } else {
        out.push({
          constraintId: c.id,
          label: c.label,
          contains: (x, y) => {
            for (let i = 1; i < pts.length; i++) {
              if (distanceToSegment(x, y, pts[i - 1]!, pts[i]!) <= half) return true;
            }
            return false;
          },
        });
      }
    }
  }
  return out;
}

export interface BuildableArea {
  /** Outline of the setback envelope (before point exclusions). */
  envelope: Point[];
  exclusions: Exclusion[];
  /** Approximate developable area in m2, after exclusions. */
  areaSqm: number;
  /** True when nothing can be built. */
  empty: boolean;
}

/**
 * The single setback used for the envelope. Front/rear/side differ, but the
 * envelope is conservative: it uses the smallest so the generator can still
 * consider the full area, then per-edge setbacks are enforced during placement.
 */
export function minSetback(site: Site): number {
  const { front, rear, side } = site.setbacks;
  return Math.max(0, Math.min(front, rear, side));
}

export function computeBuildable(site: Site): BuildableArea {
  const ring = site.boundary.points;
  const exclusions = buildExclusions(site.constraints);
  if (ring.length < 3 || !site.boundary.closed) {
    return { envelope: [], exclusions, areaSqm: 0, empty: true };
  }

  const envelope = offsetInward(ring, minSetback(site));
  if (envelope.length < 3) {
    return { envelope: [], exclusions, areaSqm: 0, empty: true };
  }

  // Monte-Carlo-free area estimate: regular grid sampling over the envelope.
  const b = bbox(envelope);
  const step = Math.max(0.5, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 60);
  let cells = 0;
  for (let x = b.minX; x <= b.maxX; x += step) {
    for (let y = b.minY; y <= b.maxY; y += step) {
      if (!pointInPolygon(envelope, x, y)) continue;
      if (exclusions.some((e) => e.contains(x, y))) continue;
      cells++;
    }
  }
  const areaSqm = cells * step * step;
  return { envelope, exclusions, areaSqm, empty: areaSqm < 10 };
}

/** True when a candidate point is developable. */
export function isDevelopable(ba: BuildableArea, x: number, y: number, clearance = 0): boolean {
  if (ba.envelope.length < 3) return false;
  if (!pointInPolygon(ba.envelope, x, y)) return false;
  if (clearance > 0 && distanceToEdges(ba.envelope, x, y) < clearance) return false;
  return !ba.exclusions.some((e) => e.contains(x, y));
}

/** Plot area in m2 (0 when the boundary is not usable). */
export function plotArea(site: Site): number {
  if (site.boundary.points.length < 3) return 0;
  return area(site.boundary.points);
}
