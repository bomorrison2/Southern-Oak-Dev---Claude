/**
 * Vehicle and pedestrian access.
 *
 * Finds the access point (explicit if the user marked one, otherwise the plot
 * edge nearest a marked road, otherwise the southern edge), then lays a
 * driveway to a parking apron beside the building.
 */
import type { Constraint, Point, Rect, Site } from '@/domain/types';
import { bbox } from '@/geometry/bbox';
import { nearestPointOnEdges, distanceToSegment } from '@/geometry/polygon';

/** Standard UK-ish parking bay, metres. */
export const BAY_W = 2.6;
export const BAY_D = 5.0;
/** Minimum driveway width for a single vehicle, metres. */
export const DRIVE_W = 3.0;
/** Turning space depth required when reversing onto a road is undesirable. */
export const TURNING_DEPTH = 6.0;

export interface AccessResult {
  point: Point;
  /** How the access was determined, for the provenance panel. */
  source: 'user' | 'road' | 'assumed';
}

export function findAccess(site: Site): AccessResult | null {
  const ring = site.boundary.points;
  if (ring.length < 3) return null;

  const explicit = site.constraints.find((c) => c.kind === 'access' && c.points.length > 0);
  if (explicit) {
    const p = explicit.points[0]!;
    return { point: nearestPointOnEdges(ring, p.x, p.y), source: 'user' };
  }

  const road = site.constraints.find((c) => c.kind === 'road' && c.points.length > 0);
  if (road) {
    const target = nearestPointOnRoad(ring, road);
    if (target) return { point: target, source: 'road' };
  }

  // Fall back to the middle of the southernmost edge.
  const b = bbox(ring);
  return {
    point: nearestPointOnEdges(ring, (b.minX + b.maxX) / 2, b.minY),
    source: 'assumed',
  };
}

function nearestPointOnRoad(ring: readonly Point[], road: Constraint): Point | null {
  let best: Point | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const v of ring) {
    let d = Number.POSITIVE_INFINITY;
    if (road.points.length === 1) {
      const p = road.points[0]!;
      d = Math.hypot(v.x - p.x, v.y - p.y);
    } else {
      for (let i = 1; i < road.points.length; i++) {
        d = Math.min(d, distanceToSegment(v.x, v.y, road.points[i - 1]!, road.points[i]!));
      }
    }
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  if (!best) return null;
  return nearestPointOnEdges(ring, best.x, best.y);
}

export interface ParkingLayout {
  bays: Rect[];
  driveway: Point[];
  /** True when a turning area was requested and could be provided. */
  turningProvided: boolean;
}

/**
 * Lay parking bays between the access point and the building, with the
 * driveway running along the straight line between them.
 */
export function layoutParking(
  access: Point,
  building: Rect,
  spaces: number,
  wantTurning: boolean,
): ParkingLayout {
  if (spaces <= 0) {
    return { bays: [], driveway: [access, { x: building.x, y: building.y }], turningProvided: false };
  }

  const dx = building.x - access.x;
  const dy = building.y - access.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const headingDeg = (Math.atan2(uy, ux) * 180) / Math.PI - 90;

  // Apron sits just short of the building so bays never overlap the footprint.
  const standoff = Math.max(building.d / 2 + BAY_D / 2 + 1.5, 6);
  const apronCentre: Point = {
    x: building.x - ux * standoff,
    y: building.y - uy * standoff,
  };

  // Perpendicular direction for laying bays side by side.
  const px = -uy;
  const py = ux;
  const bays: Rect[] = [];
  const totalW = spaces * BAY_W;
  for (let i = 0; i < spaces; i++) {
    const offset = -totalW / 2 + BAY_W / 2 + i * BAY_W;
    bays.push({
      x: apronCentre.x + px * offset,
      y: apronCentre.y + py * offset,
      w: BAY_W,
      d: BAY_D,
      rotationDeg: headingDeg,
    });
  }

  const driveway: Point[] = [access, apronCentre];
  const turningProvided = wantTurning && len >= standoff + TURNING_DEPTH;
  return { bays, driveway, turningProvided };
}
