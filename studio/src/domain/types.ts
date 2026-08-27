/**
 * ArchForm Studio — core domain model.
 *
 * Coordinate convention: all geometry is stored in SITE-LOCAL METRES with the
 * origin at the plot centroid, +x pointing East and +y pointing North. Display
 * units (m/ft) are a presentation concern only — see `domain/units.ts`.
 */

/** Display units. Storage is always metric. */
export type Units = 'm' | 'ft';

/**
 * Where a value came from. Surfaced in the UI so a user can always tell an
 * automated suggestion from something they told us, or something we assumed.
 */
export type Provenance = 'user' | 'suggestion' | 'assumption';

export interface Note {
  id: string;
  provenance: Provenance;
  text: string;
}

/** A point in site-local metres. */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned-then-rotated rectangle, centred on (x, y). */
export interface Rect {
  /** Centre X in site metres. */
  x: number;
  /** Centre Y in site metres. */
  y: number;
  /** Width (along the rectangle's local X axis) in metres. */
  w: number;
  /** Depth (along the rectangle's local Y axis) in metres. */
  d: number;
  /** Rotation of the local axes, degrees anticlockwise from East. */
  rotationDeg: number;
}

export interface Boundary {
  points: Point[];
  closed: boolean;
}

export type ConstraintKind =
  | 'road'
  | 'access'
  | 'neighbour'
  | 'tree'
  | 'easement'
  | 'noBuild'
  | 'utility'
  | 'slope';

export type GeometryType = 'point' | 'line' | 'polygon';

export interface Constraint {
  id: string;
  kind: ConstraintKind;
  label: string;
  type: GeometryType;
  points: Point[];
  /** Exclusion radius in metres (tree root protection, utility clearance). */
  radius?: number;
  /** Corridor half-width in metres for line constraints (easements, roads). */
  buffer?: number;
  /** Fall in metres across the site, for slope annotations. */
  fallM?: number;
  notes?: string;
}

export interface Setbacks {
  /** Distance from the road/access frontage, metres. */
  front: number;
  /** Distance from the rear boundary, metres. */
  rear: number;
  /** Distance from each side boundary, metres. */
  side: number;
}

export type UnderlayKind = 'image' | 'pdf';

export interface Underlay {
  kind: UnderlayKind;
  /** Rendered raster of the source document. */
  dataUrl: string;
  fileName: string;
  /** Placement in site metres (centre-based) so it can be moved and scaled. */
  x: number;
  y: number;
  widthM: number;
  heightM: number;
  rotationDeg: number;
  opacity: number;
  /** True once the user has set a real-world scale reference. */
  calibrated: boolean;
}

export interface Site {
  boundary: Boundary;
  /** Rotation of true north relative to +y, degrees clockwise. */
  northOffsetDeg: number;
  setbacks: Setbacks;
  constraints: Constraint[];
  underlay?: Underlay;
}

export type BuildingType =
  | 'detached'
  | 'semi-detached'
  | 'terrace'
  | 'bungalow'
  | 'annexe';

export type ArchStyle = 'contemporary' | 'traditional' | 'barn' | 'cottage';
export type BudgetBand = 'value' | 'mid' | 'premium';

export type OrientationPriority =
  | 'garden-sun'
  | 'living-sun'
  | 'street-presence'
  | 'privacy';

export type RoomKind =
  | 'living'
  | 'kitchen'
  | 'dining'
  | 'bedroom'
  | 'bathroom'
  | 'utility'
  | 'study'
  | 'hall'
  | 'garage';

export interface Brief {
  buildingType: BuildingType;
  /** Target gross internal area across all storeys, m². */
  floorAreaSqm: number;
  bedrooms: number;
  storeys: number;
  parkingSpaces: number;
  style: ArchStyle;
  budgetBand: BudgetBand;
  /** Minimum private outdoor amenity space, m². */
  outdoorSpaceSqm: number;
  orientationPriority: OrientationPriority;
  requiredRooms: RoomKind[];
}

export interface Room {
  id: string;
  kind: RoomKind;
  name: string;
  areaSqm: number;
  rect: Rect;
  /** 0 = ground floor. */
  floor: number;
}

export interface Materials {
  wall: 'brick' | 'render' | 'timber' | 'stone';
  roof: 'slate' | 'clay' | 'metal';
  accent: 'oak' | 'anthracite' | 'white';
}

export interface ConceptScores {
  /** 0–100 each. */
  fit: number;
  daylight: number;
  access: number;
  amenity: number;
  efficiency: number;
  overall: number;
}

export interface Concept {
  id: string;
  name: string;
  seed: number;
  createdAt: string;
  footprint: Rect;
  storeys: number;
  rooms: Room[];
  /** Driveway centreline from the access point to the parking area. */
  driveway: Point[];
  parking: Rect[];
  amenityPolygon: Point[];
  amenitySqm: number;
  materials: Materials;
  scores: ConceptScores;
  notes: Note[];
  favourite: boolean;
}

export interface ProjectMeta {
  name: string;
  address: string;
  units: Units;
  /** Free-text site notes from the user. */
  notes: string;
}

/** A saved snapshot the user can restore. */
export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  site: Site;
  brief: Brief;
  concepts: Concept[];
}

export interface Project {
  id: string;
  /** Schema version — guards against loading incompatible old data. */
  schema: number;
  createdAt: string;
  updatedAt: string;
  meta: ProjectMeta;
  site: Site;
  brief: Brief;
  concepts: Concept[];
  selectedConceptId: string | null;
  versions: VersionSnapshot[];
}

export const SCHEMA_VERSION = 1;
