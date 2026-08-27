import { describe, expect, it } from 'vitest';
import { generateConcepts } from './generator';
import { computeBuildable, isDevelopable, plotArea } from './buildable';
import { rectCorners } from '@/geometry/transform';
import { createSampleProject } from '@/domain/sample';
import { createProject } from '@/domain/defaults';
import type { Project } from '@/domain/types';

export function squarePlot(halfSize: number): Project {
  return createProject({
    name: 'Test plot',
    address: '',
    units: 'm',
    notes: '',
    northOffsetDeg: 0,
    plotWidthM: halfSize * 2,
    plotDepthM: halfSize * 2,
  });
}

describe('buildable area', () => {
  it('shrinks the plot by the setbacks', () => {
    const p = squarePlot(20);
    const ba = computeBuildable(p.site);
    expect(ba.empty).toBe(false);
    expect(ba.areaSqm).toBeGreaterThan(0);
    expect(ba.areaSqm).toBeLessThan(plotArea(p.site));
  });

  it('is empty when setbacks swallow the plot', () => {
    const p = squarePlot(5);
    p.site.setbacks = { front: 30, rear: 30, side: 30 };
    expect(computeBuildable(p.site).empty).toBe(true);
  });

  it('excludes tree root protection areas', () => {
    const p = squarePlot(20);
    p.site.constraints.push({
      id: 't1',
      kind: 'tree',
      label: 'Oak',
      type: 'point',
      points: [{ x: 0, y: 0 }],
      radius: 8,
    });
    expect(isDevelopable(computeBuildable(p.site), 0, 0)).toBe(false);
  });

  it('excludes no-build zones', () => {
    const p = squarePlot(20);
    p.site.constraints.push({
      id: 'nb',
      kind: 'noBuild',
      label: 'Zone',
      type: 'polygon',
      points: [
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: -5, y: 5 },
      ],
    });
    expect(isDevelopable(computeBuildable(p.site), 0, 0)).toBe(false);
  });
});

describe('generateConcepts', () => {
  it('produces ranked concepts for the sample project', () => {
    const result = generateConcepts(createSampleProject(), { count: 3, seed: 42 });
    expect(result.concepts.length).toBeGreaterThan(0);
    for (let i = 1; i < result.concepts.length; i++) {
      expect(result.concepts[i - 1]!.scores.overall).toBeGreaterThanOrEqual(
        result.concepts[i]!.scores.overall,
      );
    }
  });

  it('never places a building outside the developable envelope', () => {
    const project = createSampleProject();
    const result = generateConcepts(project, { count: 3, seed: 7 });
    const ba = computeBuildable(project.site);
    expect(result.concepts.length).toBeGreaterThan(0);
    for (const c of result.concepts) {
      for (const corner of rectCorners(c.footprint)) {
        expect(isDevelopable(ba, corner.x, corner.y)).toBe(true);
      }
    }
  });

  it('keeps parking bays clear of constraints', () => {
    const project = createSampleProject();
    const ba = computeBuildable(project.site);
    for (const c of generateConcepts(project, { count: 3, seed: 11 }).concepts) {
      for (const bay of c.parking) {
        for (const corner of rectCorners(bay)) {
          expect(isDevelopable(ba, corner.x, corner.y)).toBe(true);
        }
      }
      expect(c.parking.length).toBeLessThanOrEqual(project.brief.parkingSpaces);
    }
  });

  it('is deterministic for the same seed', () => {
    const project = createSampleProject();
    const a = generateConcepts(project, { count: 3, seed: 99 }).concepts;
    const b = generateConcepts(project, { count: 3, seed: 99 }).concepts;
    expect(a.map((c) => [c.footprint.x, c.footprint.y, c.scores.overall])).toEqual(
      b.map((c) => [c.footprint.x, c.footprint.y, c.scores.overall]),
    );
  });

  it('explains itself instead of throwing when nothing fits', () => {
    const project = squarePlot(6);
    project.brief.floorAreaSqm = 900;
    const result = generateConcepts(project, { count: 3, seed: 3 });
    expect(result.concepts).toHaveLength(0);
    expect(result.messages.join(' ')).toMatch(/setback|fit|developable/i);
  });
});

describe('concept diversity', () => {
  it('returns three visibly different concepts for the sample plot', () => {
    const result = generateConcepts(createSampleProject(), { count: 3, seed: 21 });
    expect(result.concepts).toHaveLength(3);
    const names = new Set(result.concepts.map((c) => c.name));
    expect(names.size).toBe(3);
    // At least one pair should be meaningfully apart on the plot.
    const spread = Math.max(
      ...result.concepts.map((a) =>
        Math.max(...result.concepts.map((b) => Math.hypot(a.footprint.x - b.footprint.x, a.footprint.y - b.footprint.y))),
      ),
    );
    expect(spread).toBeGreaterThan(3);
  });
});
