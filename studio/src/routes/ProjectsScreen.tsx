/** Projects dashboard: the landing screen, with onboarding for first-time users. */
import { useEffect, useState } from 'react';
import { useStudio } from '@/persistence/store';
import { navigate } from '@/app/router';
import { Alert, Button, EmptyState, Modal } from '@/ui/primitives';
import { createSampleProject } from '@/domain/sample';
import { area } from '@/geometry/polygon';
import { formatArea } from '@/domain/units';
import { FULL_DISCLAIMER } from '@/domain/disclaimer';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProjectsScreen() {
  const projects = useStudio((s) => s.projects);
  const refresh = useStudio((s) => s.refreshProjects);
  const create = useStudio((s) => s.createProject);
  const remove = useStudio((s) => s.deleteProject);
  const storageOk = useStudio((s) => s.storageOk);
  const skipped = useStudio((s) => s.skippedRecords);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadSample = () => {
    const sample = createSampleProject();
    create(sample);
    navigate({ name: 'studio', projectId: sample.id });
  };

  const pending = projects.find((p) => p.id === confirmId) ?? null;

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Projects</h1>
          <p className="page__sub">
            Define a plot, record its constraints, and generate layout concepts you can edit and export.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--s2)' }}>
          <Button onClick={loadSample}>Open sample project</Button>
          <Button variant="primary" onClick={() => navigate({ name: 'new' })}>
            New project
          </Button>
        </div>
      </div>

      {!storageOk && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Alert kind="warning">
            This browser is blocking local storage, so projects cannot be saved between visits.
            Export your work before closing the tab.
          </Alert>
        </div>
      )}
      {skipped > 0 && (
        <div style={{ marginBottom: 'var(--s4)' }}>
          <Alert kind="warning">
            {skipped} saved record{skipped === 1 ? '' : 's'} could not be read and {skipped === 1 ? 'was' : 'were'} skipped.
          </Alert>
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          action={
            <div style={{ display: 'flex', gap: 'var(--s2)' }}>
              <Button variant="primary" onClick={() => navigate({ name: 'new' })}>
                Create your first project
              </Button>
              <Button onClick={loadSample}>Explore the sample</Button>
            </div>
          }
        >
          Start from a plot you measure or upload, or open the worked example to see how the tool fits together.
        </EmptyState>
      ) : (
        <div className="grid">
          {projects.map((p) => {
            const plot = p.site.boundary.points.length >= 3 ? area(p.site.boundary.points) : 0;
            return (
              <div
                key={p.id}
                className="card"
                role="button"
                tabIndex={0}
                onClick={() => navigate({ name: 'studio', projectId: p.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate({ name: 'studio', projectId: p.id });
                  }
                }}
              >
                <div>
                  <div className="card__name">{p.meta.name}</div>
                  <div className="card__addr">{p.meta.address || 'No address recorded'}</div>
                </div>
                <div className="card__stats">
                  <div>
                    <div className="card__stat-val">{plot > 0 ? formatArea(plot, p.meta.units) : '--'}</div>
                    <div className="card__stat-label">Plot</div>
                  </div>
                  <div>
                    <div className="card__stat-val">{p.concepts.length}</div>
                    <div className="card__stat-label">Concepts</div>
                  </div>
                  <div>
                    <div className="card__stat-val">{p.site.constraints.length}</div>
                    <div className="card__stat-label">Constraints</div>
                  </div>
                </div>
                <div className="card__foot">
                  <span className="faint" style={{ fontSize: 12 }}>Updated {formatDate(p.updatedAt)}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Button
                      small
                      variant="danger"
                      onClick={() => setConfirmId(p.id)}
                      aria-label={`Delete ${p.meta.name}`}
                    >
                      Delete
                    </Button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="disclaimer">
        ArchForm Studio produces conceptual studies only.{' '}
        <button
          type="button"
          onClick={() => setShowTerms(true)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
        >
          Read the full limitations
        </button>
        .
      </p>

      {pending && (
        <Modal
          title="Delete project"
          onClose={() => setConfirmId(null)}
          footer={
            <>
              <Button onClick={() => setConfirmId(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  remove(pending.id);
                  setConfirmId(null);
                }}
              >
                Delete permanently
              </Button>
            </>
          }
        >
          <p>
            Delete <strong>{pending.meta.name}</strong> and all of its concepts? This cannot be undone.
          </p>
        </Modal>
      )}

      {showTerms && (
        <Modal title="Limitations and disclaimer" onClose={() => setShowTerms(false)}>
          {FULL_DISCLAIMER.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </Modal>
      )}
    </div>
  );
}
