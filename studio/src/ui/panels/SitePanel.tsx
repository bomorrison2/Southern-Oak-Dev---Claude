/** Site inspector: upload a plan, trace the boundary, set setbacks and north. */
import { useRef, useState } from 'react';
import type { Project } from '@/domain/types';
import type { CanvasTool } from '@/ui/canvas/PlanCanvas';
import { useStudio } from '@/persistence/store';
import { Alert, Button, TextField } from '@/ui/primitives';
import { checkUpload, SUPPORTED_ACCEPT, SUPPORTED_SUMMARY } from '@/ingest/validate';
import { readImageFile } from '@/ingest/image';
import { readPdfFirstPage } from '@/ingest/pdf';
import { parseDxf, recentre } from '@/ingest/dxf';
import { area, perimeter } from '@/geometry/polygon';
import { formatArea, formatLength } from '@/domain/units';

export function SitePanel({
  project,
  tool,
  onTool,
}: {
  project: Project;
  tool: CanvasTool;
  onTool: (t: CanvasTool) => void;
}) {
  const updateSite = useStudio((s) => s.updateSite);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const boundary = project.site.boundary;
  const units = project.meta.units;
  const hasRing = boundary.points.length >= 3;

  const onFile = async (file: File) => {
    setError(null);
    setInfo(null);
    const check = checkUpload(file);
    if (!check.ok) {
      setError(check.error ?? 'That file could not be used.');
      return;
    }
    setBusy(true);
    try {
      if (check.kind === 'dxf') {
        const text = await file.text();
        const parsed = parseDxf(text);
        if (!parsed.ok || !parsed.polyline) {
          setError(parsed.error ?? 'No boundary found in that DXF.');
          return;
        }
        const { points } = recentre(parsed.polyline.vertices);
        updateSite((s) => ({ ...s, boundary: { points, closed: true } }));
        setInfo(`Imported ${points.length} boundary points from ${file.name}.`);
      } else {
        const raster =
          check.kind === 'pdf' ? await readPdfFirstPage(file) : await readImageFile(file);
        // Assume a 40 m wide plan until the user calibrates it.
        const widthM = 40;
        const heightM = (raster.height / raster.width) * widthM;
        updateSite((s) => ({
          ...s,
          underlay: {
            kind: check.kind === 'pdf' ? 'pdf' : 'image',
            dataUrl: raster.dataUrl,
            fileName: file.name,
            x: 0,
            y: 0,
            widthM,
            heightM,
            rotationDeg: 0,
            opacity: 0.55,
            calibrated: false,
          },
        }));
        setInfo('Plan loaded. Set its width below so the scale is right, then trace the boundary.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const underlay = project.site.underlay;

  return (
    <>
      <div className="section">
        <div className="section__title">Plot boundary</div>
        {hasRing ? (
          <div className="metrics" style={{ marginBottom: 'var(--s3)' }}>
            <div className="metric">
              <div className="metric__val">{formatArea(area(boundary.points), units)}</div>
              <div className="metric__label">Area</div>
            </div>
            <div className="metric">
              <div className="metric__val">{formatLength(perimeter(boundary.points), units, 0)}</div>
              <div className="metric__label">Perimeter</div>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            No boundary yet. Trace one on the canvas, or import a DXF below.
          </p>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button
            small
            aria-pressed={tool === 'boundary'}
            onClick={() => onTool(tool === 'boundary' ? 'select' : 'boundary')}
          >
            {boundary.closed ? 'Redraw boundary' : 'Trace boundary'}
          </Button>
          <Button small aria-pressed={tool === 'select'} onClick={() => onTool('select')}>
            Edit points
          </Button>
          {boundary.points.length > 0 && (
            <Button
              small
              variant="danger"
              onClick={() => updateSite((s) => ({ ...s, boundary: { points: [], closed: false } }))}
            >
              Clear
            </Button>
          )}
        </div>
        {tool === 'boundary' && !boundary.closed && (
          <p className="faint" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Click to add corners. Double-click to close the shape.
          </p>
        )}
      </div>

      <div className="section">
        <div className="section__title">Import a plan</div>
        <input
          ref={fileRef}
          type="file"
          accept={SUPPORTED_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <Button block onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Reading file...' : 'Choose file'}
        </Button>
        <p className="faint" style={{ fontSize: 11, marginTop: 8 }}>{SUPPORTED_SUMMARY}</p>
        {error && (
          <div style={{ marginTop: 8 }}>
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        {info && !error && (
          <div style={{ marginTop: 8 }}>
            <Alert kind="info">{info}</Alert>
          </div>
        )}

        {underlay && (
          <div style={{ marginTop: 'var(--s4)' }}>
            <p className="muted" style={{ fontSize: 12 }}>
              {underlay.fileName}
              {!underlay.calibrated && ' - not calibrated'}
            </p>
            <TextField
              label="Plan width on site (m)"
              type="number"
              min={1}
              value={String(Math.round(underlay.widthM * 10) / 10)}
              onChange={(e) => {
                const w = Number(e.target.value);
                if (!Number.isFinite(w) || w <= 0) return;
                updateSite((s) =>
                  s.underlay
                    ? {
                        ...s,
                        underlay: {
                          ...s.underlay,
                          heightM: (s.underlay.heightM / s.underlay.widthM) * w,
                          widthM: w,
                          calibrated: true,
                        },
                      }
                    : s,
                );
              }}
              hint="Measure a known distance on the plan and set the overall width to match."
            />
            <TextField
              label="Opacity (%)"
              type="number"
              min={5}
              max={100}
              value={String(Math.round(underlay.opacity * 100))}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                updateSite((s) =>
                  s.underlay
                    ? { ...s, underlay: { ...s.underlay, opacity: Math.min(1, Math.max(0.05, v / 100)) } }
                    : s,
                );
              }}
            />
            <Button
              small
              variant="danger"
              onClick={() =>
                updateSite((s) => {
                  const next = { ...s };
                  delete next.underlay;
                  return next;
                })
              }
            >
              Remove plan
            </Button>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section__title">Setbacks</div>
        <p className="faint" style={{ fontSize: 11, marginTop: 0 }}>
          Assumed values. Confirm the real requirements with your local planning authority.
        </p>
        {(['front', 'rear', 'side'] as const).map((key) => (
          <TextField
            key={key}
            label={`${key[0]!.toUpperCase()}${key.slice(1)} (m)`}
            type="number"
            min={0}
            step={0.5}
            value={String(project.site.setbacks[key])}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v < 0) return;
              updateSite((s) => ({ ...s, setbacks: { ...s.setbacks, [key]: v } }));
            }}
          />
        ))}
      </div>

      <div className="section">
        <div className="section__title">Orientation</div>
        <TextField
          label="North bearing (degrees)"
          type="number"
          min={0}
          max={359}
          value={String(project.site.northOffsetDeg)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v)) return;
            updateSite((s) => ({ ...s, northOffsetDeg: ((v % 360) + 360) % 360 }));
          }}
          hint="Affects which aspect the generator treats as sunny."
        />
      </div>
    </>
  );
}
