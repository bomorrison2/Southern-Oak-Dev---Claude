/** Concepts inspector: generate, rank, select and edit layout concepts. */
import { useState } from 'react';
import type { Materials, Project } from '@/domain/types';
import type { CanvasTool } from '@/ui/canvas/PlanCanvas';
import { useStudio } from '@/persistence/store';
import { Alert, Button, EmptyState, ProvenanceBadge, SelectField, Spinner, TextField } from '@/ui/primitives';
import { generateConcepts } from '@/generation/generator';
import { scoreLabel } from '@/generation/scoring';
import { assessReadiness } from '@/domain/validation';
import { formatArea } from '@/domain/units';
import { CONCEPT_CAVEAT } from '@/domain/disclaimer';

export function ConceptsPanel({
  project,
  buildableSqm,
  onTool,
}: {
  project: Project;
  buildableSqm: number;
  onTool: (t: CanvasTool) => void;
}) {
  const setConcepts = useStudio((s) => s.setConcepts);
  const selectConcept = useStudio((s) => s.selectConcept);
  const updateConcept = useStudio((s) => s.updateConcept);
  const saveVersion = useStudio((s) => s.saveVersion);

  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [seed, setSeed] = useState(20240101);

  const readiness = assessReadiness(project);
  const selected = project.concepts.find((c) => c.id === project.selectedConceptId) ?? null;
  const units = project.meta.units;

  const run = (nextSeed: number) => {
    setBusy(true);
    setMessages([]);
    // Yield a frame so the busy state paints before the synchronous solve.
    window.setTimeout(() => {
      try {
        const result = generateConcepts(project, { count: 3, seed: nextSeed });
        setMessages(result.messages);
        if (result.concepts.length > 0) {
          if (project.concepts.length > 0) saveVersion('Before regenerate');
          setConcepts(result.concepts);
        }
      } catch (err) {
        setMessages([err instanceof Error ? err.message : 'Generation failed unexpectedly.']);
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <>
      <div className="section">
        <div className="section__title">Generate concepts</div>
        {!readiness.ready ? (
          <Alert kind="warning">
            <div style={{ marginBottom: 6 }}>Before generating:</div>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {readiness.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              {formatArea(buildableSqm, units)} developable after setbacks and exclusions.
            </p>
            <Button variant="primary" block onClick={() => run(seed)} disabled={busy}>
              {busy ? 'Working...' : project.concepts.length ? 'Regenerate' : 'Generate 3 concepts'}
            </Button>
            {project.concepts.length > 0 && !busy && (
              <Button
                block
                variant="ghost"
                onClick={() => {
                  const next = seed + 977;
                  setSeed(next);
                  run(next);
                }}
                style={{ marginTop: 6 }}
              >
                Try different options
              </Button>
            )}
          </>
        )}
        {busy && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            <Spinner label="Generating concepts" /> Testing placements against your constraints.
          </p>
        )}
        {messages.map((m) => (
          <div key={m} style={{ marginTop: 8 }}>
            <Alert kind="warning">{m}</Alert>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section__title">Concepts ({project.concepts.length})</div>
        {project.concepts.length === 0 ? (
          <EmptyState title="No concepts yet">
            <span style={{ fontSize: 12 }}>
              Generate options once the plot and brief are in place.
            </span>
          </EmptyState>
        ) : (
          project.concepts.map((c) => (
            <button
              key={c.id}
              className="conceptcard"
              aria-current={c.id === project.selectedConceptId}
              onClick={() => selectConcept(c.id)}
            >
              <div className="conceptcard__top">
                <span className="conceptcard__name">{c.name}</span>
                <span className="mono" style={{ fontSize: 13 }}>{c.scores.overall}</span>
              </div>
              <div className="faint" style={{ fontSize: 11 }}>
                {scoreLabel(c.scores.overall)} - {Math.round(Math.abs(c.footprint.w * c.footprint.d) * c.storeys)} m2 GIA
                {c.favourite ? ' - saved' : ''}
              </div>
              <div className="scorebar">
                <div className="scorebar__fill" style={{ width: `${c.scores.overall}%` }} />
              </div>
            </button>
          ))
        )}
      </div>

      {selected && (
        <>
          <div className="section">
            <div className="section__title">Scores</div>
            {(
              [
                ['Fit', selected.scores.fit],
                ['Daylight', selected.scores.daylight],
                ['Access', selected.scores.access],
                ['Amenity', selected.scores.amenity],
                ['Efficiency', selected.scores.efficiency],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="scorerow">
                <span className="muted">{label}</span>
                <span className="mono">{value}</span>
              </div>
            ))}
            <p className="faint" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
              Design heuristics for comparing options. They are not a compliance score.
            </p>
          </div>

          <div className="section">
            <div className="section__title">Edit concept</div>
            <div className="row">
              <TextField
                label="Width (m)"
                type="number"
                min={3}
                step={0.5}
                value={String(Math.round(selected.footprint.w * 10) / 10)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 3) {
                    updateConcept(selected.id, (c) => ({ ...c, footprint: { ...c.footprint, w: v } }));
                  }
                }}
              />
              <TextField
                label="Depth (m)"
                type="number"
                min={3}
                step={0.5}
                value={String(Math.round(selected.footprint.d * 10) / 10)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 3) {
                    updateConcept(selected.id, (c) => ({ ...c, footprint: { ...c.footprint, d: v } }));
                  }
                }}
              />
            </div>
            <TextField
              label="Rotation (degrees)"
              type="number"
              step={1}
              value={String(Math.round(selected.footprint.rotationDeg))}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) {
                  updateConcept(selected.id, (c) => ({
                    ...c,
                    footprint: { ...c.footprint, rotationDeg: v },
                  }));
                }
              }}
            />
            <Button block onClick={() => onTool('building')}>
              Move on plan
            </Button>

            <div style={{ height: 'var(--s4)' }} />
            <SelectField
              label="Walls"
              value={selected.materials.wall}
              onChange={(e) =>
                updateConcept(selected.id, (c) => ({
                  ...c,
                  materials: { ...c.materials, wall: e.target.value as Materials['wall'] },
                }))
              }
            >
              <option value="brick">Brick</option>
              <option value="render">Render</option>
              <option value="timber">Timber</option>
              <option value="stone">Stone</option>
            </SelectField>
            <SelectField
              label="Roof"
              value={selected.materials.roof}
              onChange={(e) =>
                updateConcept(selected.id, (c) => ({
                  ...c,
                  materials: { ...c.materials, roof: e.target.value as Materials['roof'] },
                }))
              }
            >
              <option value="slate">Slate</option>
              <option value="clay">Clay tile</option>
              <option value="metal">Standing seam metal</option>
            </SelectField>

            <Button
              block
              variant={selected.favourite ? 'primary' : 'default'}
              onClick={() => updateConcept(selected.id, (c) => ({ ...c, favourite: !c.favourite }))}
            >
              {selected.favourite ? 'Saved as preferred' : 'Save as preferred'}
            </Button>
          </div>

          <div className="section">
            <div className="section__title">Provenance</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selected.notes.map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <ProvenanceBadge provenance={n.provenance} />
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{n.text}</span>
                </div>
              ))}
            </div>
            <p className="faint" style={{ fontSize: 11, marginTop: 10, marginBottom: 0 }}>
              {CONCEPT_CAVEAT}
            </p>
          </div>
        </>
      )}
    </>
  );
}
