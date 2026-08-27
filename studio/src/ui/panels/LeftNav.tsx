/** Left-hand project navigation, live metrics and version history. */
import { useState } from 'react';
import type { Project } from '@/domain/types';
import { useStudio } from '@/persistence/store';
import { formatArea } from '@/domain/units';
import { assessReadiness } from '@/domain/validation';
import { Button, Modal } from '@/ui/primitives';

export type StudioTab = 'site' | 'constraints' | 'brief' | 'concepts';

const TABS: Array<{ id: StudioTab; label: string; hint: string }> = [
  { id: 'site', label: 'Site', hint: 'Boundary, upload and orientation' },
  { id: 'constraints', label: 'Constraints', hint: 'Roads, trees, easements' },
  { id: 'brief', label: 'Brief', hint: 'What you want to build' },
  { id: 'concepts', label: 'Concepts', hint: 'Generate and edit layouts' },
];

export function LeftNav({
  project,
  tab,
  onTab,
  plotSqm,
  buildableSqm,
}: {
  project: Project;
  tab: StudioTab;
  onTab: (t: StudioTab) => void;
  plotSqm: number;
  buildableSqm: number;
}) {
  const saveVersion = useStudio((s) => s.saveVersion);
  const restore = useStudio((s) => s.restore);
  const [showVersions, setShowVersions] = useState(false);
  const readiness = assessReadiness(project);
  const units = project.meta.units;

  return (
    <>
      <div className="section">
        <div className="section__title">Workspace</div>
        <div className="toollist" role="tablist" aria-orientation="vertical" aria-label="Workspace sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="toolbtn"
              role="tab"
              aria-pressed={tab === t.id}
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
            >
              <span>
                <div>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t.hint}</div>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__title">Site metrics</div>
        <div className="metrics">
          <div className="metric">
            <div className="metric__val">{plotSqm > 0 ? formatArea(plotSqm, units) : '--'}</div>
            <div className="metric__label">Plot area</div>
          </div>
          <div className="metric">
            <div className="metric__val">{buildableSqm > 0 ? formatArea(buildableSqm, units) : '--'}</div>
            <div className="metric__label">Developable</div>
          </div>
          <div className="metric">
            <div className="metric__val">{project.site.constraints.length}</div>
            <div className="metric__label">Constraints</div>
          </div>
          <div className="metric">
            <div className="metric__val">{project.concepts.length}</div>
            <div className="metric__label">Concepts</div>
          </div>
        </div>
        {plotSqm > 0 && buildableSqm > 0 && (
          <p className="faint" style={{ fontSize: 11, marginTop: 'var(--s2)', marginBottom: 0 }}>
            Developable area is the plot minus setbacks and exclusions. It is an estimate from your inputs.
          </p>
        )}
      </div>

      <div className="section">
        <div className="section__title">Readiness</div>
        {readiness.ready ? (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Ready to generate concepts.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#ffb9b4' }}>
            {readiness.blockers.slice(0, 3).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {readiness.warnings.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--text-faint)' }}>
            {readiness.warnings.slice(0, 2).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="section">
        <div className="section__title">Versions</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button small onClick={() => saveVersion('Manual save')}>Save version</Button>
          <Button small variant="ghost" onClick={() => setShowVersions(true)} disabled={project.versions.length === 0}>
            History ({project.versions.length})
          </Button>
        </div>
      </div>

      {showVersions && (
        <Modal title="Version history" onClose={() => setShowVersions(false)}>
          {project.versions.length === 0 ? (
            <p className="muted">No versions saved yet.</p>
          ) : (
            project.versions.map((v) => (
              <div
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div>
                  <div>{v.label}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {new Date(v.createdAt).toLocaleString('en-GB')} - {v.concepts.length} concept
                    {v.concepts.length === 1 ? '' : 's'}
                  </div>
                </div>
                <Button
                  small
                  onClick={() => {
                    restore(v.id);
                    setShowVersions(false);
                  }}
                >
                  Restore
                </Button>
              </div>
            ))
          )}
        </Modal>
      )}
    </>
  );
}
