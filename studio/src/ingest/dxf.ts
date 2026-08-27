/**
 * Minimal ASCII DXF reader for site boundaries.
 *
 * Supports LWPOLYLINE (modern) and legacy POLYLINE/VERTEX, which is what site
 * plans exported from CAD almost always contain. Binary DXF, DWG and RVT are
 * NOT supported - see `ingest/validate.ts` for the user-facing message.
 * Ported and typed from the ArchForm prototype parser.
 */
import type { Point } from '@/domain/types';

export interface DxfPolyline {
  vertices: Point[];
  closed: boolean;
}

export interface DxfParseResult {
  ok: boolean;
  polyline?: DxfPolyline;
  error?: string;
}

/** Last vertex coincides with the first (within 10 mm). */
export function isImplicitlyClosed(v: readonly Point[]): boolean {
  if (v.length < 3) return false;
  const a = v[0]!;
  const b = v[v.length - 1]!;
  return Math.hypot(b.x - a.x, b.y - a.y) < 0.01;
}

function toPairs(text: string): Array<[string, string]> {
  const lines = text.replace(/\r/g, '').split('\n');
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push([(lines[i] ?? '').trim(), (lines[i + 1] ?? '').trim()]);
  }
  return pairs;
}

export function parseDxf(text: string): DxfParseResult {
  if (text.includes('AutoCAD Binary DXF')) {
    return { ok: false, error: 'This is a binary DXF. Re-export it as ASCII DXF and try again.' };
  }
  const pairs = toPairs(text);

  const lw = readLwPolyline(pairs);
  if (lw) return { ok: true, polyline: lw };

  const legacy = readLegacyPolyline(pairs);
  if (legacy) return { ok: true, polyline: legacy };

  return {
    ok: false,
    error: 'No closed boundary found. The file needs an LWPOLYLINE or POLYLINE with three or more points.',
  };
}

function readLwPolyline(pairs: ReadonlyArray<[string, string]>): DxfPolyline | null {
  for (let i = 0; i < pairs.length; i++) {
    const entry = pairs[i]!;
    if (entry[0] !== '0' || entry[1] !== 'LWPOLYLINE') continue;
    const vertices: Point[] = [];
    let closed = false;
    let x: number | null = null;
    for (let j = i + 1; j < pairs.length; j++) {
      const [code, value] = pairs[j]!;
      if (code === '0') break;
      if (code === '70') closed = (parseInt(value, 10) & 1) === 1;
      if (code === '10') x = parseFloat(value);
      if (code === '20' && x !== null) {
        vertices.push({ x, y: parseFloat(value) });
        x = null;
      }
    }
    if (vertices.length >= 3) return { vertices, closed: closed || isImplicitlyClosed(vertices) };
  }
  return null;
}

function readLegacyPolyline(pairs: ReadonlyArray<[string, string]>): DxfPolyline | null {
  for (let i = 0; i < pairs.length; i++) {
    const entry = pairs[i]!;
    if (entry[0] !== '0' || entry[1] !== 'POLYLINE') continue;

    let closed = false;
    for (let j = i + 1; j < pairs.length; j++) {
      const [code, value] = pairs[j]!;
      if (code === '0') break;
      if (code === '70') {
        closed = (parseInt(value, 10) & 1) === 1;
        break;
      }
    }

    const vertices: Point[] = [];
    for (let j = i + 1; j < pairs.length; j++) {
      const [code, value] = pairs[j]!;
      if (code === '0' && value === 'SEQEND') break;
      if (code === '0' && value === 'VERTEX') {
        let vx: number | null = null;
        let vy: number | null = null;
        for (let k = j + 1; k < pairs.length; k++) {
          const [vc, vv] = pairs[k]!;
          if (vc === '0') break;
          if (vc === '10') vx = parseFloat(vv);
          if (vc === '20') vy = parseFloat(vv);
        }
        if (vx !== null && vy !== null) vertices.push({ x: vx, y: vy });
      }
    }
    if (vertices.length >= 3) return { vertices, closed: closed || isImplicitlyClosed(vertices) };
  }
  return null;
}

/**
 * Recentre CAD coordinates (often national grid, in the hundreds of thousands)
 * on their centroid so they map into a workable local frame.
 * Areas and edge lengths are translation-invariant, so metrics are unaffected.
 */
export function recentre(vertices: readonly Point[]): { points: Point[]; origin: Point } {
  if (vertices.length === 0) return { points: [], origin: { x: 0, y: 0 } };
  let sx = 0;
  let sy = 0;
  for (const v of vertices) {
    sx += v.x;
    sy += v.y;
  }
  const origin = { x: sx / vertices.length, y: sy / vertices.length };
  return {
    points: vertices.map((v) => ({ x: v.x - origin.x, y: v.y - origin.y })),
    origin,
  };
}
