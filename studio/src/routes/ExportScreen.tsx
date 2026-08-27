/**
 * Project pack: a print-ready summary of the site, brief, preferred concept and
 * the assumptions behind it, plus JSON export for handing to another tool.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/persistence/store';
import { navigate } from '@/app/router';
import { Alert, Button, EmptyState, Spinner } from '@/ui/primitives';
import { LazyMassingViewer as MassingViewer } from '@/ui/viewer/LazyMassingViewer';
import { exportProjectJson } from '@/persistence/exporters';
import { plotArea, computeBuildable } from '@/generation/buildable';
import { formatArea } from '@/domain/units';
import { FULL_DISCLAIMER } from '@/domain/disclaimer';
import { activeProvider } from '@/visualisation/provider';
import { scoreLabel } from '@/generation/scoring';
import { roomLabel } from '@/generation/rooms';
import '@/styles/print.css';

export function ExportScreen() {
  const project = useStudio((s) => s.project);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const viewerCanvas = useRef<HTMLCanvasElement | null>(null);
  const provider = activeProvider();

  const concept = useMemo(
    () =>
      project?.concepts.find((c) => c.favourite) ??
      project?.concepts.find((c) => c.id === project.selectedConceptId) ??
      project?.concepts[0] ??
      null,
    [project],
  );

  // Grab a still of the 3D view so the printed pack has an image.
  useEffect(() => {
    if (!concept) return;
    const t = window.setTimeout(() => {
      const c = viewerCanvas.current;
      if (c) {
        try {
          setSnapshot(c.toDataURL('image/png'));
        } catch {
          setSnapshot(null);
        }
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [concept]);

  if (!project) return null;

  if (!concept) {
    return (
      <div className="page">
        <EmptyState
          title="Nothing to export yet"
          action={<Button onClick={() => navigate({ name: 'studio', projectId: project.id })}>Back to studio</Button>}
        >
          Generate at least one concept, then return to build the pack.
        </EmptyState>
      </div>
    );
  }

  const units = project.meta.units;
  const plot = plotArea(project.site);
  const buildable = project.site.boundary.closed ? computeBuildable(project.site).areaSqm : 0;
  const giaSqm = Math.abs(concept.footprint.w * concept.footprint.d) * concept.storeys;
  const groundRooms = concept.rooms.filter((r) => r.floor === 0);

  return (
    <div className="page">
      <div className="page__head no-print">
        <div>
          <h1>Project pack</h1>
          <p className="page__sub">Review, then print to PDF or export the data.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s2)' }}>
          <Button onClick={() => navigate({ name: 'studio', projectId: project.id })}>Back to studio</Button>
          <Button onClick={() => exportProjectJson(project)}>Export JSON</Button>
          <Button variant="primary" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="pack">
        <section className="pack__section">
          <h1>{project.meta.name}</h1>
          <p className="muted">{project.meta.address || 'No address recorded'}</p>
          <p className="faint" style={{ fontSize: 12 }}>
            Prepared {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} with
            ArchForm Studio. Conceptual study - see limitations at the end.
          </p>
        </section>

        <section className="pack__section">
          <h2>Site</h2>
          <table className="pack__table">
            <tbody>
              <tr><th>Plot area</th><td>{plot > 0 ? formatArea(plot, units) : 'Not defined'}</td></tr>
              <tr><th>Developable area after setbacks and exclusions</th><td>{buildable > 0 ? formatArea(buildable, units) : 'Not calculated'}</td></tr>
              <tr><th>Setbacks (front / rear / side)</th><td>{project.site.setbacks.front} / {project.site.setbacks.rear} / {project.site.setbacks.side} m</td></tr>
              <tr><th>North bearing</th><td>{project.site.northOffsetDeg} degrees</td></tr>
              <tr><th>Constraints recorded</th><td>{project.site.constraints.length === 0 ? 'None' : project.site.constraints.map((c) => c.label).join(', ')}</td></tr>
            </tbody>
          </table>
          {project.meta.notes && <p className="muted" style={{ marginTop: 'var(--s3)' }}>{project.meta.notes}</p>}
        </section>

        <section className="pack__section">
          <h2>Brief</h2>
          <table className="pack__table">
            <tbody>
              <tr><th>Building type</th><td>{project.brief.buildingType}</td></tr>
              <tr><th>Target floor area</th><td>{formatArea(project.brief.floorAreaSqm, units)}</td></tr>
              <tr><th>Bedrooms / storeys</th><td>{project.brief.bedrooms} / {project.brief.storeys}</td></tr>
              <tr><th>Parking requested</th><td>{project.brief.parkingSpaces}</td></tr>
              <tr><th>Style / budget band</th><td>{project.brief.style} / {project.brief.budgetBand}</td></tr>
              <tr><th>Orientation priority</th><td>{project.brief.orientationPriority.replace('-', ' ')}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="pack__section">
          <h2>Preferred concept: {concept.name}</h2>
          <div className="pack__figure">
            {snapshot ? (
              <img src={snapshot} alt={`3D massing view of ${concept.name}`} />
            ) : (
              <div style={{ height: 300 }}>
                <MassingViewer
                  project={project}
                  concept={concept}
                  onCanvasReady={(c) => {
                    viewerCanvas.current = c;
                  }}
                />
              </div>
            )}
            <div className="pack__caption">
              {provider.id === 'local'
                ? 'Real-time 3D massing render produced in the browser. Not a photograph, and not a construction drawing.'
                : 'Generated by the configured rendering service. Conceptual only.'}
            </div>
          </div>

          <table className="pack__table" style={{ marginTop: 'var(--s4)' }}>
            <tbody>
              <tr><th>Gross internal area (indicative)</th><td>{formatArea(giaSqm, units)} over {concept.storeys} storey{concept.storeys === 1 ? '' : 's'}</td></tr>
              <tr><th>Footprint</th><td>{concept.footprint.w.toFixed(1)} m x {concept.footprint.d.toFixed(1)} m</td></tr>
              <tr><th>Private outdoor space</th><td>{formatArea(concept.amenitySqm, units)}</td></tr>
              <tr><th>Parking provided</th><td>{concept.parking.length} of {project.brief.parkingSpaces} requested</td></tr>
              <tr><th>Materials</th><td>{concept.materials.wall} walls, {concept.materials.roof} roof</td></tr>
              <tr><th>Overall score</th><td>{concept.scores.overall} - {scoreLabel(concept.scores.overall)}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="pack__section">
          <h2>Indicative ground floor</h2>
          {groundRooms.length === 0 ? (
            <p className="muted">No room layout was generated for this concept.</p>
          ) : (
            <table className="pack__table">
              <tbody>
                {groundRooms.map((r) => (
                  <tr key={r.id}>
                    <th>{roomLabel(r.kind)}</th>
                    <td>{formatArea(r.areaSqm, units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="faint" style={{ fontSize: 12, marginTop: 'var(--s3)' }}>
            A diagrammatic arrangement used to test whether the brief fits. It is not an
            architectural plan and no room has been checked against building regulations.
          </p>
        </section>

        <section className="pack__section">
          <h2>Assumptions to confirm</h2>
          <ul>
            {concept.notes.map((n) => (
              <li key={n.id} style={{ marginBottom: 6 }}>
                <strong>
                  {n.provenance === 'user' ? 'Your input' : n.provenance === 'suggestion' ? 'Suggestion' : 'Assumption'}:
                </strong>{' '}
                {n.text}
              </li>
            ))}
            <li>Setback distances are assumed, not confirmed against local planning policy.</li>
            <li>Boundary positions are as drawn or imported, and have not been verified by survey.</li>
            {project.site.underlay && !project.site.underlay.calibrated && (
              <li>The uploaded plan was never calibrated, so traced dimensions may be wrong.</li>
            )}
          </ul>
        </section>

        <section className="pack__section">
          <h2>Limitations and disclaimer</h2>
          {FULL_DISCLAIMER.map((line) => (
            <p key={line} className="muted" style={{ fontSize: 13 }}>
              {line}
            </p>
          ))}
        </section>
      </div>

      <div className="no-print" style={{ marginTop: 'var(--s5)' }}>
        <Alert kind="info">
          Printing uses your browser&apos;s print dialogue - choose &quot;Save as PDF&quot; as the destination.
          {!snapshot && (
            <>
              {' '}
              <Spinner label="Preparing image" /> Preparing the 3D image.
            </>
          )}
        </Alert>
      </div>
    </div>
  );
}
