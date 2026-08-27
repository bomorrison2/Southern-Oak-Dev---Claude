import { describe, expect, it } from 'vitest';
import { scheduleRooms, packFloor, minimumFloorArea, roomLabel } from './rooms';
import { layoutParking, findAccess, BAY_W } from './access';
import { scoreConcept, scoreLabel } from './scoring';
import { computeBuildable } from './buildable';
import { createSampleProject } from '@/domain/sample';
import { createProject } from '@/domain/defaults';

describe('room scheduling', () => {
  it('puts bedrooms upstairs in a two-storey house', () => {
    const floors = scheduleRooms(['living', 'kitchen', 'bathroom', 'hall'], 3, 2);
    expect(floors).toHaveLength(2);
    expect(floors[1]!.filter((k) => k === 'bedroom')).toHaveLength(3);
    expect(floors[0]).toContain('living');
  });

  it('keeps everything on one floor for a bungalow', () => {
    const floors = scheduleRooms(['living', 'kitchen'], 2, 1);
    expect(floors).toHaveLength(1);
    expect(floors[0]!.filter((k) => k === 'bedroom')).toHaveLength(2);
    expect(floors[0]).toContain('bathroom');
  });

  it('packs every requested room with a positive area', () => {
    const rooms = packFloor({ x: 0, y: 0, w: 12, d: 9, rotationDeg: 0 }, ['living', 'kitchen', 'utility'], 0, 1);
    expect(rooms).toHaveLength(3);
    for (const r of rooms) expect(r.areaSqm).toBeGreaterThan(0);
  });

  it('returns nothing for an empty floor', () => {
    expect(packFloor({ x: 0, y: 0, w: 10, d: 8, rotationDeg: 0 }, [], 1, 1)).toEqual([]);
  });

  it('sums minimum areas and labels rooms', () => {
    expect(minimumFloorArea(['living', 'kitchen'])).toBe(28);
    expect(roomLabel('bedroom')).toBe('Bedroom');
  });
});

describe('access and parking', () => {
  it('uses the marked access point when present', () => {
    const access = findAccess(createSampleProject().site);
    expect(access?.source).toBe('user');
  });

  it('assumes an access when none is marked', () => {
    const p = createProject({
      name: 'x', address: '', units: 'm', notes: '', northOffsetDeg: 0,
      plotWidthM: 30, plotDepthM: 30,
    });
    expect(findAccess(p.site)?.source).toBe('assumed');
  });

  it('lays the requested number of bays', () => {
    const layout = layoutParking({ x: 0, y: -20 }, { x: 0, y: 0, w: 10, d: 8, rotationDeg: 0 }, 3, true);
    expect(layout.bays).toHaveLength(3);
    expect(layout.bays[0]!.w).toBeCloseTo(BAY_W, 6);
    expect(layout.driveway.length).toBeGreaterThanOrEqual(2);
  });

  it('produces no bays when none are requested', () => {
    expect(layoutParking({ x: 0, y: -20 }, { x: 0, y: 0, w: 8, d: 8, rotationDeg: 0 }, 0, false).bays).toHaveLength(0);
  });
});

describe('scoring', () => {
  const project = createSampleProject();
  const buildable = computeBuildable(project.site);

  it('keeps every measure between 0 and 100', () => {
    const scores = scoreConcept({
      site: project.site, brief: project.brief, buildable,
      footprint: { x: 0, y: 0, w: 10, d: 8, rotationDeg: 0 },
      amenitySqm: 80, parkingProvided: 2, access: { x: -6, y: -13 }, sunOffsetDeg: 0,
    });
    for (const value of Object.values(scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('gives no fit score to a building outside the envelope', () => {
    const scores = scoreConcept({
      site: project.site, brief: project.brief, buildable,
      footprint: { x: 500, y: 500, w: 10, d: 8, rotationDeg: 0 },
      amenitySqm: 0, parkingProvided: 0, access: null, sunOffsetDeg: 180,
    });
    expect(scores.fit).toBe(0);
  });

  it('labels scores in plain words', () => {
    expect(scoreLabel(80)).toBe('Strong');
    expect(scoreLabel(55)).toBe('Workable');
    expect(scoreLabel(20)).toBe('Compromised');
  });
});
