import type { Point } from '@/domain/types';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EMPTY_BBOX: BBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

export function bbox(pts: readonly Point[]): BBox {
  if (pts.length === 0) return { ...EMPTY_BBOX };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxWidth(b: BBox): number {
  return b.maxX - b.minX;
}

export function bboxHeight(b: BBox): number {
  return b.maxY - b.minY;
}

export function bboxCentre(b: BBox): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}
