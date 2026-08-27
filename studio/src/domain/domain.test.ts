import { describe, expect, it } from 'vitest';
import {
  displayToMetres, displayToSqm, formatArea, formatLength, metresToDisplay, sqmToDisplay,
} from './units';
import { assessReadiness, validateBrief, validateNewProject, validateSetbacks } from './validation';
import { createProject, DEFAULT_BRIEF } from './defaults';
import { createSampleProject } from './sample';
import { seededRandom, createId } from './ids';

describe('units', () => {
  it('round-trips lengths', () => {
    expect(displayToMetres(metresToDisplay(12.5, 'ft'), 'ft')).toBeCloseTo(12.5, 9);
    expect(metresToDisplay(3, 'm')).toBe(3);
  });

  it('round-trips areas', () => {
    expect(displayToSqm(sqmToDisplay(140, 'ft'), 'ft')).toBeCloseTo(140, 6);
  });

  it('converts to known values', () => {
    expect(metresToDisplay(1, 'ft')).toBeCloseTo(3.28084, 4);
    expect(sqmToDisplay(1, 'ft')).toBeCloseTo(10.7639, 3);
  });

  it('formats with the right unit label', () => {
    expect(formatLength(5, 'm', 1)).toBe('5.0 m');
    expect(formatArea(140, 'm')).toContain('m2');
    expect(formatArea(140, 'ft')).toContain('sq ft');
  });
});

describe('new project validation', () => {
  const base = { name: 'Test', address: '', plotWidth: '', plotDepth: '', northOffsetDeg: '0' };

  it('accepts a minimal valid form', () => {
    expect(validateNewProject(base)).toHaveLength(0);
  });

  it('requires a name', () => {
    const issues = validateNewProject({ ...base, name: '   ' });
    expect(issues[0]?.field).toBe('name');
    expect(issues[0]?.message).toMatch(/name/i);
  });

  it('requires both plot dimensions or neither', () => {
    const issues = validateNewProject({ ...base, plotWidth: '20' });
    expect(issues.some((i) => i.field === 'plotDepth')).toBe(true);
  });

  it('rejects non-numeric and negative dimensions', () => {
    expect(validateNewProject({ ...base, plotWidth: 'abc', plotDepth: '10' }).some((i) => i.field === 'plotWidth')).toBe(true);
    expect(validateNewProject({ ...base, plotWidth: '-4', plotDepth: '10' }).some((i) => i.field === 'plotWidth')).toBe(true);
  });

  it('rejects an out-of-range bearing', () => {
    expect(validateNewProject({ ...base, northOffsetDeg: '400' }).some((i) => i.field === 'northOffsetDeg')).toBe(true);
  });
});

describe('brief and setback validation', () => {
  it('accepts the defaults', () => {
    expect(validateBrief(DEFAULT_BRIEF)).toHaveLength(0);
  });

  it('rejects a tiny floor area', () => {
    expect(validateBrief({ ...DEFAULT_BRIEF, floorAreaSqm: 5 })[0]?.message).toMatch(/20/);
  });

  it('rejects impossible storeys', () => {
    expect(validateBrief({ ...DEFAULT_BRIEF, storeys: 9 }).some((i) => i.field === 'storeys')).toBe(true);
  });

  it('flags bedrooms without a bedroom room type', () => {
    const issues = validateBrief({ ...DEFAULT_BRIEF, bedrooms: 3, requiredRooms: ['living'] });
    expect(issues.some((i) => i.field === 'requiredRooms')).toBe(true);
  });

  it('rejects negative setbacks', () => {
    expect(validateSetbacks({ front: -1, rear: 5, side: 2 })).toHaveLength(1);
  });
});

describe('readiness', () => {
  it('is ready for the sample project', () => {
    const r = assessReadiness(createSampleProject());
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('blocks when there is no boundary', () => {
    const p = createProject({ name: 'x', address: '', units: 'm', notes: '', northOffsetDeg: 0 });
    const r = assessReadiness(p);
    expect(r.ready).toBe(false);
    expect(r.blockers[0]).toMatch(/boundary/i);
  });

  it('warns when no access is marked', () => {
    const p = createProject({
      name: 'x', address: '', units: 'm', notes: '', northOffsetDeg: 0,
      plotWidthM: 30, plotDepthM: 30,
    });
    expect(assessReadiness(p).warnings.some((w) => /access/i.test(w))).toBe(true);
  });
});

describe('ids and deterministic random', () => {
  it('creates unique prefixed ids', () => {
    const a = createId('proj');
    expect(a.startsWith('proj_')).toBe(true);
    expect(a).not.toBe(createId('proj'));
  });

  it('is reproducible for a given seed', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('stays within 0..1', () => {
    const rng = seededRandom(1234);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('createProject', () => {
  it('seeds a rectangle when dimensions are given', () => {
    const p = createProject({
      name: 'Rect', address: '', units: 'm', notes: '', northOffsetDeg: 0,
      plotWidthM: 20, plotDepthM: 10,
    });
    expect(p.site.boundary.points).toHaveLength(4);
    expect(p.site.boundary.closed).toBe(true);
  });

  it('leaves the boundary empty without dimensions', () => {
    const p = createProject({ name: 'Empty', address: '', units: 'm', notes: '', northOffsetDeg: 0 });
    expect(p.site.boundary.points).toHaveLength(0);
  });
});
