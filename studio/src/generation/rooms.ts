/**
 * Room packing.
 *
 * Rooms are laid out inside the building footprint using a simple, explainable
 * slice-and-stack algorithm with adjacency preferences (living space toward the
 * sunny aspect, service rooms to the rear, circulation central). It is a
 * diagrammatic arrangement to test whether the brief plausibly fits, not a
 * measured architectural plan.
 */
import type { Rect, Room, RoomKind } from '@/domain/types';
import { createId } from '@/domain/ids';

/** Typical area share and minimum size per room type. */
interface RoomSpec {
  kind: RoomKind;
  label: string;
  /** Relative weight when dividing the available floor area. */
  weight: number;
  minSqm: number;
  /** Prefers the sunny aspect (true) or the rear/service side (false). */
  wantsSun: boolean;
}

const SPECS: Record<RoomKind, RoomSpec> = {
  living: { kind: 'living', label: 'Living', weight: 3.0, minSqm: 16, wantsSun: true },
  kitchen: { kind: 'kitchen', label: 'Kitchen', weight: 2.4, minSqm: 12, wantsSun: true },
  dining: { kind: 'dining', label: 'Dining', weight: 2.0, minSqm: 10, wantsSun: true },
  bedroom: { kind: 'bedroom', label: 'Bedroom', weight: 2.2, minSqm: 9, wantsSun: true },
  bathroom: { kind: 'bathroom', label: 'Bathroom', weight: 0.9, minSqm: 4, wantsSun: false },
  utility: { kind: 'utility', label: 'Utility', weight: 0.7, minSqm: 4, wantsSun: false },
  study: { kind: 'study', label: 'Study', weight: 1.2, minSqm: 7, wantsSun: false },
  hall: { kind: 'hall', label: 'Hall', weight: 1.1, minSqm: 6, wantsSun: false },
  garage: { kind: 'garage', label: 'Garage', weight: 2.0, minSqm: 15, wantsSun: false },
};

export function roomLabel(kind: RoomKind): string {
  return SPECS[kind].label;
}

/** Circulation overhead assumed on each floor (stairs, landings, corridors). */
export const CIRCULATION_FRACTION = 0.12;

/** Build the per-floor schedule of rooms implied by the brief. */
export function scheduleRooms(
  requiredRooms: readonly RoomKind[],
  bedrooms: number,
  storeys: number,
): RoomKind[][] {
  const ground: RoomKind[] = [];
  const upper: RoomKind[] = [];

  for (const kind of requiredRooms) {
    if (kind === 'bedroom') continue;
    if (kind === 'living' || kind === 'kitchen' || kind === 'dining' || kind === 'utility' || kind === 'garage') {
      ground.push(kind);
    } else if (kind === 'hall') {
      ground.push(kind);
    } else {
      (storeys > 1 ? upper : ground).push(kind);
    }
  }

  const beds = Math.max(0, Math.floor(bedrooms));
  for (let i = 0; i < beds; i++) {
    if (storeys > 1) upper.push('bedroom');
    else ground.push('bedroom');
  }
  // A single-storey home still needs a bathroom on the ground floor.
  if (storeys === 1 && !ground.includes('bathroom')) ground.push('bathroom');
  if (storeys > 1 && !upper.includes('bathroom')) upper.push('bathroom');

  const floors: RoomKind[][] = [ground];
  if (storeys > 1) {
    floors.push(upper);
    for (let f = 2; f < storeys; f++) floors.push([]);
  }
  return floors;
}

/**
 * Pack rooms into the footprint for one floor.
 * `sunDirection` is +1 when the sunny aspect is toward the footprint local +Y.
 */
export function packFloor(
  footprint: Rect,
  kinds: readonly RoomKind[],
  floor: number,
  sunDirection: 1 | -1,
): Room[] {
  if (kinds.length === 0) return [];

  const usableW = footprint.w;
  const usableD = footprint.d * (1 - CIRCULATION_FRACTION);
  const totalWeight = kinds.reduce((s, k) => s + SPECS[k].weight, 0) || 1;

  // Sunny rooms take the front band, service rooms the back band.
  const sunny = kinds.filter((k) => SPECS[k].wantsSun);
  const service = kinds.filter((k) => !SPECS[k].wantsSun);
  const sunnyWeight = sunny.reduce((s, k) => s + SPECS[k].weight, 0);
  const frontDepth = usableD * (sunnyWeight / totalWeight);
  const backDepth = usableD - frontDepth;

  const rooms: Room[] = [];
  const rad = (footprint.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  /** Local (lx, ly) offset from footprint centre to world point. */
  const toWorld = (lx: number, ly: number) => ({
    x: footprint.x + lx * cos - ly * sin,
    y: footprint.y + lx * sin + ly * cos,
  });

  const bands: Array<{ list: RoomKind[]; depth: number; centreY: number }> = [
    {
      list: sunny,
      depth: frontDepth,
      centreY: sunDirection * (usableD / 2 - frontDepth / 2),
    },
    {
      list: service,
      depth: backDepth,
      centreY: -sunDirection * (usableD / 2 - backDepth / 2),
    },
  ];

  for (const band of bands) {
    if (band.list.length === 0 || band.depth <= 0.5) continue;
    const bandWeight = band.list.reduce((s, k) => s + SPECS[k].weight, 0) || 1;
    let cursor = -usableW / 2;
    for (const kind of band.list) {
      const spec = SPECS[kind];
      const w = Math.max(2, (spec.weight / bandWeight) * usableW);
      const lx = cursor + w / 2;
      cursor += w;
      const centre = toWorld(lx, band.centreY);
      rooms.push({
        id: createId('room'),
        kind,
        name: spec.label,
        areaSqm: Math.round(w * band.depth * 10) / 10,
        rect: {
          x: centre.x,
          y: centre.y,
          w,
          d: band.depth,
          rotationDeg: footprint.rotationDeg,
        },
        floor,
      });
    }
  }

  return rooms;
}

/** Total scheduled area, used to sanity-check the brief against the footprint. */
export function minimumFloorArea(kinds: readonly RoomKind[]): number {
  return kinds.reduce((s, k) => s + SPECS[k].minSqm, 0);
}
