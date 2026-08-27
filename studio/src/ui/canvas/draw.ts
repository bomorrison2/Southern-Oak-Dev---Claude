/** Canvas painting routines. Each takes a 2D context and world-space data. */
import type { Concept, Constraint, Point, Site, Units } from '@/domain/types';
import { rectCorners } from '@/geometry/transform';
import { formatLength } from '@/domain/units';
import { worldToScreen, niceScaleBar, type Viewport } from './viewport';

export interface Palette {
  plotLine: string;
  plotFill: string;
  envelope: string;
  exclusion: string;
  building: string;
  parking: string;
  amenity: string;
  text: string;
  faint: string;
  accent: string;
}

export const PALETTE: Palette = {
  plotLine: '#6fa8ff',
  plotFill: 'rgba(111,168,255,0.08)',
  envelope: 'rgba(47,191,118,0.55)',
  exclusion: 'rgba(228,87,79,0.30)',
  building: '#d8a05a',
  parking: '#8b93a1',
  amenity: 'rgba(47,191,118,0.15)',
  text: '#eef1f5',
  faint: 'rgba(238,241,245,0.42)',
  accent: '#4d8fff',
};

const CONSTRAINT_COLOURS: Record<Constraint['kind'], string> = {
  road: '#8b93a1',
  access: '#e0a03c',
  neighbour: '#a98cf0',
  tree: '#2fbf76',
  easement: '#e4574f',
  noBuild: '#e4574f',
  utility: '#4dd0e1',
  slope: '#c8b98a',
};

export function constraintColour(kind: Constraint['kind']): string {
  return CONSTRAINT_COLOURS[kind];
}

function path(ctx: CanvasRenderingContext2D, v: Viewport, pts: readonly Point[], close: boolean) {
  if (pts.length === 0) return;
  ctx.beginPath();
  const first = worldToScreen(v, pts[0]!.x, pts[0]!.y);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = worldToScreen(v, pts[i]!.x, pts[i]!.y);
    ctx.lineTo(p.x, p.y);
  }
  if (close) ctx.closePath();
}

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
}

/** Faint metric grid that adapts to zoom. */
export function drawGrid(ctx: CanvasRenderingContext2D, v: Viewport, w: number, h: number) {
  const spacing = niceScaleBar(v.scale);
  const px = spacing * v.scale;
  if (px < 8) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  const startX = v.panX % px;
  const startY = v.panY % px;
  ctx.beginPath();
  for (let x = startX; x <= w; x += px) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  for (let y = startY; y <= h; y += px) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawUnderlay(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  site: Site,
  img: HTMLImageElement | null,
) {
  const u = site.underlay;
  if (!u || !img || !img.complete) return;
  const tl = worldToScreen(v, u.x - u.widthM / 2, u.y + u.heightM / 2);
  ctx.save();
  ctx.globalAlpha = u.opacity;
  if (u.rotationDeg !== 0) {
    const c = worldToScreen(v, u.x, u.y);
    ctx.translate(c.x, c.y);
    ctx.rotate((-u.rotationDeg * Math.PI) / 180);
    ctx.translate(-c.x, -c.y);
  }
  ctx.drawImage(img, tl.x, tl.y, u.widthM * v.scale, u.heightM * v.scale);
  ctx.restore();
}

export function drawBoundary(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  pts: readonly Point[],
  closed: boolean,
  units: Units,
  showVertices: boolean,
  hoverIndex = -1,
) {
  if (pts.length === 0) return;
  ctx.save();
  path(ctx, v, pts, closed);
  if (closed) {
    ctx.fillStyle = PALETTE.plotFill;
    ctx.fill();
  }
  ctx.strokeStyle = PALETTE.plotLine;
  ctx.lineWidth = 2;
  ctx.setLineDash(closed ? [] : [7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (closed && v.scale > 1.6) {
    ctx.font = '11px "DM Mono", monospace';
    ctx.fillStyle = PALETTE.faint;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 3) continue;
      const mid = worldToScreen(v, (a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.fillText(formatLength(len, units, 1), mid.x, mid.y - 4);
    }
  }

  if (showVertices) {
    for (let i = 0; i < pts.length; i++) {
      const s = worldToScreen(v, pts[i]!.x, pts[i]!.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, i === hoverIndex ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = i === hoverIndex ? PALETTE.accent : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.plotLine;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawEnvelope(ctx: CanvasRenderingContext2D, v: Viewport, envelope: readonly Point[]) {
  if (envelope.length < 3) return;
  ctx.save();
  path(ctx, v, envelope, true);
  ctx.strokeStyle = PALETTE.envelope;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawConstraints(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  constraints: readonly Constraint[],
  selectedId: string | null,
) {
  ctx.save();
  for (const c of constraints) {
    if (c.points.length === 0) continue;
    const colour = constraintColour(c.kind);
    const selected = c.id === selectedId;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = colour;
    ctx.fillStyle = `${colour}33`;

    if (c.type === 'polygon' && c.points.length >= 3) {
      path(ctx, v, c.points, true);
      ctx.fill();
      ctx.stroke();
    } else if (c.type === 'line' && c.points.length >= 2) {
      path(ctx, v, c.points, false);
      ctx.stroke();
      if (c.buffer) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = Math.max(2, c.buffer * 2 * v.scale);
        ctx.lineCap = 'round';
        ctx.strokeStyle = colour;
        path(ctx, v, c.points, false);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      const p = c.points[0]!;
      const s = worldToScreen(v, p.x, p.y);
      if (c.radius) {
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(s.x, s.y, c.radius * v.scale, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(s.x, s.y, selected ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.strokeStyle = '#12151a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Label near the first point.
    const anchor = worldToScreen(v, c.points[0]!.x, c.points[0]!.y);
    ctx.font = '11px "DM Sans", sans-serif';
    ctx.fillStyle = colour;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.label, anchor.x + 10, anchor.y);
  }
  ctx.restore();
}

function fillRect(ctx: CanvasRenderingContext2D, v: Viewport, corners: Point[], fill: string, stroke: string, lw = 2) {
  path(ctx, v, corners, true);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
}

export function drawConcept(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  concept: Concept,
  showRooms: boolean,
  units: Units,
) {
  ctx.save();

  // Amenity sampling points as a soft wash.
  if (concept.amenityPolygon.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = PALETTE.amenity;
    const r = Math.max(2, v.scale * 0.8);
    for (const p of concept.amenityPolygon) {
      const s = worldToScreen(v, p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Driveway.
  if (concept.driveway.length >= 2) {
    ctx.save();
    ctx.strokeStyle = PALETTE.parking;
    ctx.lineWidth = Math.max(3, 3 * v.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    path(ctx, v, concept.driveway, false);
    ctx.stroke();
    ctx.restore();
  }

  for (const bay of concept.parking) {
    fillRect(ctx, v, rectCorners(bay), 'rgba(139,147,161,0.35)', PALETTE.parking, 1.5);
  }

  fillRect(ctx, v, rectCorners(concept.footprint), 'rgba(216,160,90,0.30)', PALETTE.building, 2.5);

  if (showRooms) {
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const room of concept.rooms.filter((r) => r.floor === 0)) {
      const corners = rectCorners(room.rect);
      path(ctx, v, corners, true);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (v.scale > 3) {
        const c = worldToScreen(v, room.rect.x, room.rect.y);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(room.name, c.x, c.y);
      }
    }
  }

  if (v.scale > 1.4 && !showRooms) {
    const c = worldToScreen(v, concept.footprint.x, concept.footprint.y);
    const gia = Math.abs(concept.footprint.w * concept.footprint.d) * concept.storeys;
    ctx.font = 'bold 12px "DM Mono", monospace';
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(gia)} m2 GIA`, c.x, c.y - 8);
    ctx.font = '11px "DM Mono", monospace';
    ctx.fillStyle = PALETTE.faint;
    ctx.fillText(
      `${formatLength(concept.footprint.w, units, 1)} x ${formatLength(concept.footprint.d, units, 1)}`,
      c.x,
      c.y + 8,
    );
  }
  ctx.restore();
}

/** North arrow and scale bar, drawn in screen space. */
export function drawChrome(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  w: number,
  h: number,
  northOffsetDeg: number,
  units: Units,
) {
  ctx.save();

  // Scale bar, bottom left.
  const metres = niceScaleBar(v.scale);
  const px = metres * v.scale;
  const x0 = 18;
  const y0 = h - 26;
  ctx.strokeStyle = PALETTE.text;
  ctx.fillStyle = PALETTE.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 5);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + px, y0);
  ctx.lineTo(x0 + px, y0 - 5);
  ctx.stroke();
  ctx.font = '11px "DM Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(formatLength(metres, units, 0), x0, y0 + 4);

  // North arrow, top right.
  const cx = w - 34;
  const cy = 34;
  const rad = (-northOffsetDeg * Math.PI) / 180;
  ctx.translate(cx, cy);
  ctx.rotate(rad);
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(6, 8);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fillStyle = PALETTE.accent;
  ctx.fill();
  ctx.rotate(-rad);
  ctx.font = 'bold 10px "DM Mono", monospace';
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', 0, 10);
  ctx.restore();
}

/** Rubber-band preview while drawing. */
export function drawPending(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  pts: readonly Point[],
  cursor: Point | null,
  colour: string,
) {
  if (pts.length === 0) return;
  ctx.save();
  const trail = cursor ? [...pts, cursor] : pts;
  path(ctx, v, trail, false);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of pts) {
    const s = worldToScreen(v, p.x, p.y);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  }
  ctx.restore();
}
