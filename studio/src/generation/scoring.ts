/**
 * Concept scoring.
 *
 * Five explainable measures, each 0-100, combined into an overall figure. These
 * are DESIGN HEURISTICS for comparing options against each other - they are not
 * a compliance assessment and carry no regulatory meaning.
 */
import type { Brief, ConceptScores, Point, Rect, Site } from '@/domain/types';
import { clamp, distanceToEdges } from '@/geometry/polygon';
import { rectCorners } from '@/geometry/transform';
import type { BuildableArea } from './buildable';
import { isDevelopable } from './buildable';

export interface ScoreInput {
  site: Site;
  brief: Brief;
  buildable: BuildableArea;
  footprint: Rect;
  amenitySqm: number;
  parkingProvided: number;
  access: Point | null;
  /** Angle between the sunny aspect and the building front, degrees (0 = ideal). */
  sunOffsetDeg: number;
}

const WEIGHTS = {
  fit: 0.28,
  daylight: 0.2,
  access: 0.18,
  amenity: 0.2,
  efficiency: 0.14,
} as const;

export function scoreConcept(input: ScoreInput): ConceptScores {
  const fit = scoreFit(input);
  const daylight = scoreDaylight(input);
  const access = scoreAccess(input);
  const amenity = scoreAmenity(input);
  const efficiency = scoreEfficiency(input);

  const overall =
    fit * WEIGHTS.fit +
    daylight * WEIGHTS.daylight +
    access * WEIGHTS.access +
    amenity * WEIGHTS.amenity +
    efficiency * WEIGHTS.efficiency;

  return {
    fit: Math.round(fit),
    daylight: Math.round(daylight),
    access: Math.round(access),
    amenity: Math.round(amenity),
    efficiency: Math.round(efficiency),
    overall: Math.round(overall),
  };
}

/** How comfortably the footprint sits inside the developable envelope. */
function scoreFit(i: ScoreInput): number {
  const corners = rectCorners(i.footprint);
  const allInside = corners.every((c) => isDevelopable(i.buildable, c.x, c.y));
  if (!allInside) return 0;
  if (i.buildable.envelope.length < 3) return 0;

  // Reward breathing room around the building, saturating at 6 m.
  const clearances = corners.map((c) => distanceToEdges(i.buildable.envelope, c.x, c.y));
  const min = Math.min(...clearances);
  return clamp(45 + (min / 6) * 55, 0, 100);
}

/** Orientation of the main aspect relative to the sun. */
function scoreDaylight(i: ScoreInput): number {
  const off = Math.abs(((i.sunOffsetDeg % 360) + 540) % 360 - 180); // 0 = aligned
  const aligned = 180 - off; // 180 = perfectly aligned
  const base = clamp((aligned / 180) * 100, 0, 100);
  const bonus = i.brief.orientationPriority === 'privacy' ? -5 : 0;
  return clamp(base + bonus, 0, 100);
}

/** Was the requested parking provided, and is the access sensible? */
function scoreAccess(i: ScoreInput): number {
  if (!i.access) return 30;
  const wanted = i.brief.parkingSpaces;
  const ratio = wanted === 0 ? 1 : clamp(i.parkingProvided / wanted, 0, 1);
  const distance = Math.hypot(i.footprint.x - i.access.x, i.footprint.y - i.access.y);
  // Very long drives are costly; very short ones leave no frontage.
  const ideal = clamp(1 - Math.abs(distance - 18) / 45, 0, 1);
  return clamp(ratio * 70 + ideal * 30, 0, 100);
}

/** Private outdoor space against the brief target. */
function scoreAmenity(i: ScoreInput): number {
  const target = Math.max(1, i.brief.outdoorSpaceSqm);
  return clamp((i.amenitySqm / target) * 100, 0, 100);
}

/** Plot efficiency: enough floor area without overdeveloping the plot. */
function scoreEfficiency(i: ScoreInput): number {
  const footprintArea = Math.abs(i.footprint.w * i.footprint.d);
  const delivered = footprintArea * Math.max(1, i.brief.storeys);
  const target = Math.max(1, i.brief.floorAreaSqm);
  const ratio = delivered / target;
  // 1.0 is perfect; both under- and over-shooting lose points.
  return clamp(100 - Math.abs(1 - ratio) * 140, 0, 100);
}

export function scoreLabel(score: number): 'Strong' | 'Workable' | 'Compromised' {
  if (score >= 72) return 'Strong';
  if (score >= 48) return 'Workable';
  return 'Compromised';
}
