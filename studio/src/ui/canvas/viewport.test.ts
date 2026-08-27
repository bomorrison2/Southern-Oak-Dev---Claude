import { describe, expect, it } from 'vitest';
import {
  clampScale, createViewport, fitTo, MAX_SCALE, MIN_SCALE, niceScaleBar,
  pan, screenToWorld, worldToScreen, zoomAt,
} from './viewport';

describe('viewport transforms', () => {
  it('round-trips world to screen and back', () => {
    const v = { scale: 6, panX: 120, panY: 340 };
    const s = worldToScreen(v, 12.5, -4.25);
    const w = screenToWorld(v, s.x, s.y);
    expect(w.x).toBeCloseTo(12.5, 9);
    expect(w.y).toBeCloseTo(-4.25, 9);
  });

  it('flips the Y axis so world north is screen up', () => {
    const v = createViewport();
    const origin = worldToScreen(v, 0, 0);
    const north = worldToScreen(v, 0, 10);
    expect(north.y).toBeLessThan(origin.y);
  });

  it('pans by whole pixels', () => {
    const v = pan(createViewport(), 25, -10);
    expect(v.panX).toBe(25);
    expect(v.panY).toBe(-10);
  });

  it('clamps the zoom range', () => {
    expect(clampScale(1e6)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
  });

  it('keeps the anchor point fixed while zooming', () => {
    const v = { scale: 4, panX: 100, panY: 100 };
    const before = screenToWorld(v, 250, 180);
    const after = screenToWorld(zoomAt(v, 250, 180, 1.5), 250, 180);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('fits a bounding box into the canvas', () => {
    const v = fitTo({ minX: -50, minY: -25, maxX: 50, maxY: 25 }, 800, 600);
    const tl = worldToScreen(v, -50, 25);
    const br = worldToScreen(v, 50, -25);
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(800);
    expect(tl.y).toBeGreaterThanOrEqual(0);
    expect(br.y).toBeLessThanOrEqual(600);
  });

  it('centres the fitted content', () => {
    const v = fitTo({ minX: 0, minY: 0, maxX: 40, maxY: 20 }, 800, 400);
    const c = worldToScreen(v, 20, 10);
    expect(c.x).toBeCloseTo(400, 3);
    expect(c.y).toBeCloseTo(200, 3);
  });

  it('picks a scale bar that renders at a readable width', () => {
    for (const scale of [0.5, 1, 2, 4, 8, 20]) {
      const metres = niceScaleBar(scale);
      expect(metres).toBeGreaterThan(0);
    }
    expect(niceScaleBar(4) * 4).toBeGreaterThanOrEqual(60);
  });
});
