/**
 * Concept generation.
 *
 * Deterministic for a given seed. The generator searches placements inside the
 * developable envelope, respecting setbacks, exclusions, access, parking and
 * amenity targets, then scores and ranks the results.
 */
import type { Brief, Concept, Materials, Note, Point, Project, Rect } from '@/domain/types';
import { createId, seededRandom } from '@/domain/ids';
import { CONCEPT_CAVEAT } from '@/domain/disclaimer';
import { bbox } from '@/geometry/bbox';
import { rectCorners } from '@/geometry/transform';
import { pointInPolygon, distanceToEdges } from '@/geometry/polygon';
import { computeBuildable, isDevelopable, type BuildableArea } from './buildable';
import { findAccess, layoutParking } from './access';
import { packFloor, scheduleRooms, CIRCULATION_FRACTION } from './rooms';
import { scoreConcept } from './scoring';

export interface GenerateOptions {
  /** How many concepts to return (ranked best first). */
  count?: number;
  /** Base seed; concept i uses seed + i. */
  seed?: number;
}

export interface GenerateResult {
  concepts: Concept[];
  buildable: BuildableArea;
  /** Non-fatal explanations when fewer concepts than requested were possible. */
  messages: string[];
}

const STRATEGY_NAMES: Record<string, string> = {
  balanced: 'Balanced',
  street: 'Street-facing',
  garden: 'Garden-led',
  corner: 'Corner-tucked',
};

const MATERIAL_SETS: Record<Brief['style'], Materials> = {
  contemporary: { wall: 'render', roof: 'metal', accent: 'anthracite' },
  traditional: { wall: 'brick', roof: 'clay', accent: 'white' },
  barn: { wall: 'timber', roof: 'metal', accent: 'anthracite' },
  cottage: { wall: 'stone', roof: 'slate', accent: 'oak' },
};

/** Footprint proportions tried, as depth-to-width ratios. */
const RATIOS = [0.62, 0.75, 0.9, 1.15];

export function generateConcepts(project: Project, opts: GenerateOptions = {}): GenerateResult {
  const count = opts.count ?? 3;
  const baseSeed = opts.seed ?? 20240101;
  const messages: string[] = [];
  const buildable = computeBuildable(project.site);

  if (buildable.empty || buildable.envelope.length < 3) {
    messages.push(
      'No developable area remains once setbacks and exclusions are applied. Reduce the setbacks or remove a no-build zone.',
    );
    return { concepts: [], buildable, messages };
  }

  const access = findAccess(project.site);
  const candidates: Concept[] = [];

  for (let i = 0; i < count * 3 && candidates.length < count * 3; i++) {
    const concept = buildCandidate(project, buildable, access?.point ?? null, baseSeed + i, i);
    if (concept) candidates.push(concept);
  }

  if (candidates.length === 0) {
    messages.push(
      'The requested floor area does not fit inside the developable envelope. Try a smaller footprint, more storeys, or smaller setbacks.',
    );
    return { concepts: [], buildable, messages };
  }

  candidates.sort((a, b) => b.scores.overall - a.scores.overall);
  const chosen = dedupe(candidates).slice(0, count);

  if (chosen.length < count) {
    messages.push(
      `Only ${chosen.length} distinct layout${chosen.length === 1 ? '' : 's'} fit this plot and brief.`,
    );
  }
  return { concepts: chosen, buildable, messages };
}

/** Drop concepts whose buildings sit almost on top of each other. */
function dedupe(list: readonly Concept[]): Concept[] {
  const out: Concept[] = [];
  for (const c of list) {
    const clash = out.some(
      (o) =>
        Math.hypot(o.footprint.x - c.footprint.x, o.footprint.y - c.footprint.y) < 3.5 &&
        Math.abs(o.footprint.rotationDeg - c.footprint.rotationDeg) < 8,
    );
    if (!clash) out.push(c);
  }
  return out;
}

function buildCandidate(
  project: Project,
  buildable: BuildableArea,
  access: Point | null,
  seed: number,
  index: number,
): Concept | null {
  const rng = seededRandom(seed);
  const { brief, site } = project;

  const storeys = Math.max(1, Math.round(brief.storeys));
  const targetFootprint = (brief.floorAreaSqm / storeys) * (1 + CIRCULATION_FRACTION * 0.5);
  const ratio = RATIOS[index % RATIOS.length] ?? 0.75;
  const width = Math.sqrt(targetFootprint / ratio);
  const depth = targetFootprint / width;

  // Face the building toward the sun unless the brief prioritises the street.
  const sunBearing = 180 - site.northOffsetDeg;
  const preferStreet = brief.orientationPriority === 'street-presence' && access;
  const baseRotation = preferStreet
    ? (Math.atan2(access.y, access.x) * 180) / Math.PI - 90
    : sunBearing - 90;
  const jitter = (rng() - 0.5) * 30;
  const rotationDeg = baseRotation + jitter;

  const strategy = STRATEGIES[index % STRATEGIES.length] ?? 'balanced';
  const placement = findPlacement(buildable, width, depth, rotationDeg, rng, strategy, access);
  if (!placement) return null;

  const footprint: Rect = { x: placement.x, y: placement.y, w: width, d: depth, rotationDeg };

  const parking = layoutParking(
    access ?? { x: placement.x, y: placement.y - 20 },
    footprint,
    brief.parkingSpaces,
    true,
  );
  const validBays = parking.bays.filter((b) =>
    rectCorners(b).every((c) => isDevelopable(buildable, c.x, c.y)),
  );

  const amenity = computeAmenity(buildable, footprint, validBays);
  const sunOffsetDeg = rotationDeg + 90 - sunBearing;

  const scores = scoreConcept({
    site,
    brief,
    buildable,
    footprint,
    amenitySqm: amenity.areaSqm,
    parkingProvided: validBays.length,
    access,
    sunOffsetDeg,
  });

  const floors = scheduleRooms(brief.requiredRooms, brief.bedrooms, storeys);
  const rooms = floors.flatMap((kinds, floor) => packFloor(footprint, kinds, floor, 1));

  const notes: Note[] = [{ id: createId('note'), provenance: 'suggestion', text: CONCEPT_CAVEAT }];
  if (validBays.length < brief.parkingSpaces) {
    notes.push({
      id: createId('note'),
      provenance: 'assumption',
      text: `Only ${validBays.length} of ${brief.parkingSpaces} parking spaces fit clear of constraints.`,
    });
  }
  if (amenity.areaSqm < brief.outdoorSpaceSqm) {
    notes.push({
      id: createId('note'),
      provenance: 'assumption',
      text: `Private outdoor space is ${Math.round(amenity.areaSqm)} m2 against a target of ${brief.outdoorSpaceSqm} m2.`,
    });
  }
  if (!access) {
    notes.push({
      id: createId('note'),
      provenance: 'assumption',
      text: 'No access point was marked, so the southern boundary was assumed.',
    });
  }

  return {
    id: createId('concept'),
    name: `${STRATEGY_NAMES[strategy]} ${String.fromCharCode(65 + index)}`,
    seed,
    createdAt: new Date().toISOString(),
    footprint,
    storeys,
    rooms,
    driveway: parking.driveway,
    parking: validBays,
    amenityPolygon: amenity.polygon,
    amenitySqm: amenity.areaSqm,
    materials: { ...MATERIAL_SETS[brief.style] },
    scores,
    notes,
    favourite: false,
  };
}

/**
 * Placement strategies.
 *
 * Each concept uses a different objective so the options are genuinely
 * different arrangements rather than near-identical positions:
 *  - balanced: sit centrally with the most room all round
 *  - street:   pull toward the access to leave a large private garden behind
 *  - garden:   push away from the access for a deeper, more private setting
 *  - corner:   tuck into the far corner to free one continuous area
 */
export type PlacementStrategy = 'balanced' | 'street' | 'garden' | 'corner';

const STRATEGIES: PlacementStrategy[] = ['balanced', 'street', 'garden', 'corner'];

/** Search the envelope for a placement whose corners are all developable. */
function findPlacement(
  buildable: BuildableArea,
  w: number,
  d: number,
  rotationDeg: number,
  rng: () => number,
  strategy: PlacementStrategy,
  access: Point | null,
): Point | null {
  const b = bbox(buildable.envelope);
  const clearance = Math.min(w, d) / 2;
  const tries = 420;
  let best: Point | null = null;
  let bestScore = -Infinity;

  const far = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) || 1;

  for (let i = 0; i < tries; i++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    if (!isDevelopable(buildable, x, y, clearance * 0.3)) continue;
    const corners = rectCorners({ x, y, w, d, rotationDeg });
    if (!corners.every((c) => isDevelopable(buildable, c.x, c.y))) continue;

    const room = Math.min(...corners.map((c) => distanceToEdges(buildable.envelope, c.x, c.y)));
    const toAccess = access ? Math.hypot(x - access.x, y - access.y) / far : 0.5;

    let score: number;
    switch (strategy) {
      case 'street':
        score = room * 0.35 + (1 - toAccess) * 12;
        break;
      case 'garden':
        score = room * 0.35 + toAccess * 12;
        break;
      case 'corner':
        score = room * 0.2 + (Math.abs(x - b.minX) + Math.abs(y - b.maxY)) / far * 8;
        break;
      default:
        score = room;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

/** Remaining developable land outside the building and parking, as amenity. */
function computeAmenity(
  buildable: BuildableArea,
  footprint: Rect,
  bays: readonly Rect[],
): { areaSqm: number; polygon: Point[] } {
  const env = buildable.envelope;
  if (env.length < 3) return { areaSqm: 0, polygon: [] };
  const b = bbox(env);
  const step = Math.max(0.5, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 55);

  const blockers = [footprint, ...bays].map((r) => rectCorners(r));
  let cells = 0;
  const kept: Point[] = [];
  for (let x = b.minX; x <= b.maxX; x += step) {
    for (let y = b.minY; y <= b.maxY; y += step) {
      if (!isDevelopable(buildable, x, y)) continue;
      if (blockers.some((poly) => pointInPolygon(poly, x, y))) continue;
      cells++;
      if (kept.length < 400) kept.push({ x, y });
    }
  }
  return { areaSqm: cells * step * step, polygon: kept };
}
