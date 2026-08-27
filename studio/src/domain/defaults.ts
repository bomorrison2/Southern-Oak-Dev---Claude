/** Sensible starting values. Everything here is an ASSUMPTION until the user confirms it. */
import type { Brief, Project, Setbacks, Site } from './types';
import { SCHEMA_VERSION } from './types';
import { createId } from './ids';

export const DEFAULT_SETBACKS: Setbacks = { front: 6, rear: 10, side: 2 };

export const DEFAULT_BRIEF: Brief = {
  buildingType: 'detached',
  floorAreaSqm: 140,
  bedrooms: 4,
  storeys: 2,
  parkingSpaces: 2,
  style: 'contemporary',
  budgetBand: 'mid',
  outdoorSpaceSqm: 100,
  orientationPriority: 'garden-sun',
  requiredRooms: ['living', 'kitchen', 'dining', 'bedroom', 'bathroom', 'hall', 'utility'],
};

export function emptySite(): Site {
  return {
    boundary: { points: [], closed: false },
    northOffsetDeg: 0,
    setbacks: { ...DEFAULT_SETBACKS },
    constraints: [],
  };
}

export interface NewProjectInput {
  name: string;
  address: string;
  units: Project['meta']['units'];
  notes: string;
  northOffsetDeg: number;
  /** Optional quick-start rectangle, in metres. */
  plotWidthM?: number;
  plotDepthM?: number;
}

/** Build a project shell. A rectangular plot is seeded when dimensions are given. */
export function createProject(input: NewProjectInput): Project {
  const now = new Date().toISOString();
  const site = emptySite();
  site.northOffsetDeg = input.northOffsetDeg;

  if (input.plotWidthM && input.plotDepthM) {
    const hw = input.plotWidthM / 2;
    const hd = input.plotDepthM / 2;
    site.boundary = {
      points: [
        { x: -hw, y: -hd },
        { x: hw, y: -hd },
        { x: hw, y: hd },
        { x: -hw, y: hd },
      ],
      closed: true,
    };
  }

  return {
    id: createId('proj'),
    schema: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    meta: {
      name: input.name,
      address: input.address,
      units: input.units,
      notes: input.notes,
    },
    site,
    brief: { ...DEFAULT_BRIEF, requiredRooms: [...DEFAULT_BRIEF.requiredRooms] },
    concepts: [],
    selectedConceptId: null,
    versions: [],
  };
}
