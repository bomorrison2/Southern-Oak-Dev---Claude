/**
 * Input validation. Every message is written to be actionable: it says what is
 * wrong and what to do about it, never just "invalid".
 */
import type { Brief, Point, Project, Setbacks } from './types';
import { area } from '@/geometry/polygon';

export interface FieldIssue {
  field: string;
  message: string;
}

export type Issues = FieldIssue[];

export function isBlank(v: string): boolean {
  return v.trim().length === 0;
}

export interface NewProjectFields {
  name: string;
  address: string;
  plotWidth: string;
  plotDepth: string;
  northOffsetDeg: string;
}

/** Validate the new-project form. Plot dimensions are optional but must pair up. */
export function validateNewProject(f: NewProjectFields): Issues {
  const issues: Issues = [];

  if (isBlank(f.name)) {
    issues.push({ field: 'name', message: 'Give the project a name so you can find it later.' });
  } else if (f.name.trim().length > 80) {
    issues.push({ field: 'name', message: 'Keep the name under 80 characters.' });
  }

  if (f.address.trim().length > 160) {
    issues.push({ field: 'address', message: 'Keep the address under 160 characters.' });
  }

  const w = f.plotWidth.trim();
  const d = f.plotDepth.trim();
  const hasW = w.length > 0;
  const hasD = d.length > 0;

  if (hasW !== hasD) {
    issues.push({
      field: hasW ? 'plotDepth' : 'plotWidth',
      message: 'Enter both width and depth, or leave both blank and draw the plot instead.',
    });
  }

  for (const [field, raw] of [
    ['plotWidth', w],
    ['plotDepth', d],
  ] as const) {
    if (raw.length === 0) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      issues.push({ field, message: 'Enter a number, for example 24.' });
    } else if (n <= 0) {
      issues.push({ field, message: 'Must be greater than zero.' });
    } else if (n > 5000) {
      issues.push({ field, message: 'That is larger than 5,000 - check the units.' });
    }
  }

  const north = Number(f.northOffsetDeg);
  if (!Number.isFinite(north)) {
    issues.push({ field: 'northOffsetDeg', message: 'Enter a bearing between 0 and 359 degrees.' });
  } else if (north < 0 || north > 359) {
    issues.push({ field: 'northOffsetDeg', message: 'Bearing must be between 0 and 359 degrees.' });
  }

  return issues;
}

export function validateSetbacks(s: Setbacks): Issues {
  const issues: Issues = [];
  const entries: Array<[keyof Setbacks, string]> = [
    ['front', 'Front setback'],
    ['rear', 'Rear setback'],
    ['side', 'Side setback'],
  ];
  for (const [key, label] of entries) {
    const v = s[key];
    if (!Number.isFinite(v) || v < 0) {
      issues.push({ field: key, message: `${label} must be zero or more.` });
    } else if (v > 100) {
      issues.push({ field: key, message: `${label} of over 100 m is unlikely - check the value.` });
    }
  }
  return issues;
}

export function validateBrief(brief: Brief): Issues {
  const issues: Issues = [];

  if (!Number.isFinite(brief.floorAreaSqm) || brief.floorAreaSqm < 20) {
    issues.push({ field: 'floorAreaSqm', message: 'Floor area must be at least 20 m2.' });
  } else if (brief.floorAreaSqm > 2000) {
    issues.push({ field: 'floorAreaSqm', message: 'Floor area above 2,000 m2 is outside this tool.' });
  }

  if (brief.bedrooms < 0 || brief.bedrooms > 12) {
    issues.push({ field: 'bedrooms', message: 'Enter between 0 and 12 bedrooms.' });
  }
  if (brief.storeys < 1 || brief.storeys > 4) {
    issues.push({ field: 'storeys', message: 'This tool supports 1 to 4 storeys.' });
  }
  if (brief.parkingSpaces < 0 || brief.parkingSpaces > 10) {
    issues.push({ field: 'parkingSpaces', message: 'Enter between 0 and 10 parking spaces.' });
  }
  if (brief.outdoorSpaceSqm < 0) {
    issues.push({ field: 'outdoorSpaceSqm', message: 'Outdoor space cannot be negative.' });
  }
  if (brief.bedrooms > 0 && !brief.requiredRooms.includes('bedroom')) {
    issues.push({
      field: 'requiredRooms',
      message: 'You asked for bedrooms - keep "bedroom" in the required rooms.',
    });
  }
  return issues;
}

export interface Readiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

/** Can we generate concepts yet? Blockers stop generation; warnings do not. */
export function assessReadiness(project: Project): Readiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const pts: Point[] = project.site.boundary.points;

  if (pts.length < 3) {
    blockers.push('Draw or import a plot boundary with at least three points.');
  } else if (!project.site.boundary.closed) {
    blockers.push('Close the plot boundary before generating concepts.');
  } else if (area(pts) < 30) {
    blockers.push('The plot is under 30 m2 - check the boundary scale.');
  }

  const briefIssues = validateBrief(project.brief);
  for (const i of briefIssues) blockers.push(i.message);

  if (!project.site.constraints.some((c) => c.kind === 'access')) {
    warnings.push('No access point set - concepts will assume access from the nearest road edge.');
  }
  if (project.site.constraints.length === 0) {
    warnings.push('No site constraints recorded. Add trees, easements or neighbours for a better fit.');
  }
  if (project.brief.parkingSpaces > 0 && !project.site.constraints.some((c) => c.kind === 'road' || c.kind === 'access')) {
    warnings.push('Parking was requested but no road or access is marked.');
  }
  if (project.site.underlay && !project.site.underlay.calibrated) {
    warnings.push('The uploaded plan has not been calibrated, so traced dimensions may be inaccurate.');
  }

  return { ready: blockers.length === 0, blockers, warnings };
}
