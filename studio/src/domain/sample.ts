/**
 * Bundled sample project.
 *
 * Realistic but fictitious: a corner plot with a road frontage, a protected oak,
 * a drainage easement along the rear and a neighbouring house to the east. It
 * exists so a first-time user can see a complete, working project immediately.
 */
import type { Constraint, Project } from './types';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_BRIEF } from './defaults';

const SAMPLE_ID = 'proj_sample_meadow_lane';

function constraint(
  id: string,
  kind: Constraint['kind'],
  label: string,
  type: Constraint['type'],
  points: Constraint['points'],
  extra: Partial<Constraint> = {},
): Constraint {
  return { id, kind, label, type, points, ...extra };
}

/** A 34 m x 26 m plot (about 0.088 ha) with the road to the south. */
export function createSampleProject(): Project {
  const now = new Date().toISOString();
  return {
    id: SAMPLE_ID,
    schema: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    meta: {
      name: 'Sample - 14 Meadow Lane',
      address: '14 Meadow Lane, Hailsham, East Sussex (sample data)',
      units: 'm',
      notes:
        'Bundled example project. The plot, constraints and brief are fictitious and are provided to demonstrate the workflow.',
    },
    site: {
      boundary: {
        points: [
          { x: -17, y: -13 },
          { x: 17, y: -13 },
          { x: 17, y: 9 },
          { x: 4, y: 13 },
          { x: -17, y: 13 },
        ],
        closed: true,
      },
      northOffsetDeg: 0,
      setbacks: { front: 5.5, rear: 9, side: 2 },
      constraints: [
        constraint('c_road', 'road', 'Meadow Lane', 'line', [
          { x: -22, y: -16 },
          { x: 22, y: -16 },
        ], { buffer: 3 }),
        constraint('c_access', 'access', 'Vehicle access', 'point', [{ x: -6, y: -13 }]),
        constraint('c_tree', 'tree', 'Mature oak (TPO)', 'point', [{ x: 11, y: 6 }], {
          radius: 7,
          notes: 'Assumed root protection area. Confirm with an arboricultural survey.',
        }),
        constraint('c_easement', 'easement', 'Foul drain easement', 'line', [
          { x: -17, y: 10.5 },
          { x: 3, y: 10.5 },
        ], { buffer: 2.5 }),
        constraint('c_neighbour', 'neighbour', 'No. 16 (two storey)', 'polygon', [
          { x: 19, y: -10 },
          { x: 30, y: -10 },
          { x: 30, y: 0 },
          { x: 19, y: 0 },
        ]),
      ],
    },
    brief: {
      ...DEFAULT_BRIEF,
      floorAreaSqm: 132,
      bedrooms: 4,
      storeys: 2,
      parkingSpaces: 2,
      style: 'contemporary',
      outdoorSpaceSqm: 90,
      orientationPriority: 'garden-sun',
    },
    concepts: [],
    selectedConceptId: null,
    versions: [],
  };
}

export const SAMPLE_PROJECT_ID = SAMPLE_ID;
