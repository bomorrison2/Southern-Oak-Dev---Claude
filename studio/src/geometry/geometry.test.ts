import { describe, expect, it } from 'vitest';
import {
  area,
  centroid,
  distanceToEdges,
  ensureCCW,
  nearestPointOnEdges,
  perimeter,
  pointInPolygon,
  signedArea,
} from './polygon';
import { bbox, bboxCentre } from './bbox';
import { rectCorners, rotate, scale, translate } from './transform';
import { isInsideBy, offsetInward } from './offset';
import type { Point } from '@/domain/types';

/** 20 x 10 rectangle centred on the origin. */
const RECT: Point[] = [
  { x: -10, y: -5 },
  { x: 10, y: -5 },
  { x: 10, y: 5 },
  { x: -10, y: 5 },
];

describe('polygon area', () => {
  it('computes the area of a rectangle', () => {
    expect(area(RECT)).toBeCloseTo(200, 6);
  });

  it('is unaffected by winding direction', () => {
    expect(area([...RECT].reverse())).toBeCloseTo(200, 6);
  });

  it('returns zero for degenerate rings', () => {
    expect(area([])).toBe(0);
    expect(area([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it('signs area by winding order', () => {
    expect(signedArea(RECT)).toBeGreaterThan(0);
    expect(signedArea([...RECT].reverse())).toBeLessThan(0);
  });

  it('is translation invariant', () => {
    expect(area(translate(RECT, 500000, 120000))).toBeCloseTo(200, 4);
  });
});

describe('centroid', () => {
  it('finds the centre of a rectangle', () => {
    const c = centroid(RECT);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(0, 6);
  });

  it('falls back to the vertex mean for a two-point ring', () => {
    const c = centroid([{ x: 0, y: 0 }, { x: 4, y: 0 }]);
    expect(c.x).toBeCloseTo(2, 6);
  });
});

describe('point in polygon', () => {
  it('detects inside and outside', () => {
    expect(pointInPolygon(RECT, 0, 0)).toBe(true);
    expect(pointInPolygon(RECT, 11, 0)).toBe(false);
    expect(pointInPolygon(RECT, 0, 6)).toBe(false);
  });

  it('handles an L-shaped concave ring', () => {
    const L: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(L, 2, 8)).toBe(true);
    expect(pointInPolygon(L, 8, 8)).toBe(false);
  });
});

describe('distances', () => {
  it('measures distance to the nearest edge', () => {
    expect(distanceToEdges(RECT, 0, 0)).toBeCloseTo(5, 6);
    expect(distanceToEdges(RECT, 9, 0)).toBeCloseTo(1, 6);
  });

  it('projects a point onto the boundary', () => {
    const p = nearestPointOnEdges(RECT, 20, 0);
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('computes perimeter', () => {
    expect(perimeter(RECT)).toBeCloseTo(60, 6);
  });
});

describe('transforms', () => {
  it('translates', () => {
    const t = translate(RECT, 5, -2);
    expect(t[0]).toEqual({ x: -5, y: -7 });
  });

  it('rotating by 360 degrees returns the original', () => {
    const r = rotate(RECT, 360);
    r.forEach((p, i) => {
      expect(p.x).toBeCloseTo(RECT[i]!.x, 6);
      expect(p.y).toBeCloseTo(RECT[i]!.y, 6);
    });
  });

  it('scales area by the square of the factor', () => {
    expect(area(scale(RECT, 2))).toBeCloseTo(800, 4);
  });

  it('gives four corners for a rotated rectangle', () => {
    const corners = rectCorners({ x: 0, y: 0, w: 4, d: 2, rotationDeg: 90 });
    expect(corners).toHaveLength(4);
    expect(area(corners)).toBeCloseTo(8, 4);
  });
});

describe('bbox', () => {
  it('bounds a ring and finds its centre', () => {
    const b = bbox(RECT);
    expect(b).toEqual({ minX: -10, minY: -5, maxX: 10, maxY: 5 });
    expect(bboxCentre(b)).toEqual({ x: 0, y: 0 });
  });
});

describe('inward offset', () => {
  it('keeps points that clear the edge by the given distance', () => {
    expect(isInsideBy(RECT, 0, 0, 4)).toBe(true);
    expect(isInsideBy(RECT, 0, 0, 6)).toBe(false);
    expect(isInsideBy(RECT, 20, 0, 0)).toBe(false);
  });

  it('produces a smaller ring than the original', () => {
    const inner = offsetInward(RECT, 2, { step: 0.5 });
    expect(inner.length).toBeGreaterThan(2);
    expect(area(inner)).toBeGreaterThan(0);
    expect(area(inner)).toBeLessThan(area(RECT));
  });

  it('returns nothing when the offset consumes the plot', () => {
    expect(offsetInward(RECT, 50)).toEqual([]);
  });

  it('returns the ring unchanged for a zero offset', () => {
    expect(offsetInward(RECT, 0)).toHaveLength(RECT.length);
  });
});

describe('winding', () => {
  it('normalises to anticlockwise', () => {
    expect(signedArea(ensureCCW([...RECT].reverse()))).toBeGreaterThan(0);
  });
});
