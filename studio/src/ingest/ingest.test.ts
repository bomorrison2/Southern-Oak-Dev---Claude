import { describe, expect, it } from 'vitest';
import { parseDxf, recentre, isImplicitlyClosed } from './dxf';
import { checkUpload, extensionOf, MAX_UPLOAD_BYTES } from './validate';

/** Minimal ASCII DXF containing one closed LWPOLYLINE. */
const LWPOLYLINE_DXF = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LWPOLYLINE', '90', '4', '70', '1',
  '10', '0.0', '20', '0.0',
  '10', '10.0', '20', '0.0',
  '10', '10.0', '20', '8.0',
  '10', '0.0', '20', '8.0',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n');

const LEGACY_DXF = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'POLYLINE', '70', '1',
  '0', 'VERTEX', '10', '0.0', '20', '0.0',
  '0', 'VERTEX', '10', '6.0', '20', '0.0',
  '0', 'VERTEX', '10', '6.0', '20', '6.0',
  '0', 'SEQEND',
  '0', 'ENDSEC', '0', 'EOF',
].join('\n');

function file(name: string, bytes: number, type = ''): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('DXF parsing', () => {
  it('reads a closed LWPOLYLINE', () => {
    const r = parseDxf(LWPOLYLINE_DXF);
    expect(r.ok).toBe(true);
    expect(r.polyline?.vertices).toHaveLength(4);
    expect(r.polyline?.closed).toBe(true);
    expect(r.polyline?.vertices[1]).toEqual({ x: 10, y: 0 });
  });

  it('reads a legacy POLYLINE with VERTEX entities', () => {
    const r = parseDxf(LEGACY_DXF);
    expect(r.ok).toBe(true);
    expect(r.polyline?.vertices).toHaveLength(3);
  });

  it('handles Windows line endings', () => {
    const r = parseDxf(LWPOLYLINE_DXF.replace(/\n/g, '\r\n'));
    expect(r.ok).toBe(true);
    expect(r.polyline?.vertices).toHaveLength(4);
  });

  it('reports a helpful error when there is no polyline', () => {
    const r = parseDxf('0\nSECTION\n0\nENDSEC\n0\nEOF');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/LWPOLYLINE|POLYLINE/);
  });

  it('rejects binary DXF with guidance', () => {
    const r = parseDxf('AutoCAD Binary DXF\u0000');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ASCII/i);
  });

  it('does not throw on random text', () => {
    expect(() => parseDxf('not a dxf at all')).not.toThrow();
    expect(parseDxf('not a dxf at all').ok).toBe(false);
  });

  it('detects an implicitly closed ring', () => {
    expect(isImplicitlyClosed([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }])).toBe(true);
    expect(isImplicitlyClosed([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }])).toBe(false);
  });

  it('recentres national-grid coordinates on their centroid', () => {
    const { points, origin } = recentre([
      { x: 558000, y: 106000 },
      { x: 558010, y: 106000 },
      { x: 558010, y: 106008 },
      { x: 558000, y: 106008 },
    ]);
    expect(origin.x).toBeCloseTo(558005, 6);
    const mean = points.reduce((s, p) => s + p.x, 0) / points.length;
    expect(mean).toBeCloseTo(0, 6);
  });
});

describe('upload validation', () => {
  it('accepts supported formats', () => {
    expect(checkUpload(file('plan.dxf', 100)).kind).toBe('dxf');
    expect(checkUpload(file('plan.pdf', 100, 'application/pdf')).kind).toBe('pdf');
    expect(checkUpload(file('plan.png', 100, 'image/png')).kind).toBe('image');
  });

  it('rejects empty files', () => {
    const r = checkUpload(file('plan.png', 0, 'image/png'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/empty/i);
  });

  it('rejects oversized files with the limit named', () => {
    const r = checkUpload(file('big.png', MAX_UPLOAD_BYTES + 1, 'image/png'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/20 MB/);
  });

  it('explains what to do with unsupported CAD formats', () => {
    expect(checkUpload(file('model.dwg', 100)).error).toMatch(/DXF|PDF/);
    expect(checkUpload(file('model.rvt', 100)).error).toMatch(/PDF/);
  });

  it('rejects unknown types', () => {
    const r = checkUpload(file('notes.txt', 100, 'text/plain'));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Unsupported/);
  });

  it('extracts extensions', () => {
    expect(extensionOf('a/b/plan.DXF')).toBe('dxf');
    expect(extensionOf('noextension')).toBe('');
  });
});
