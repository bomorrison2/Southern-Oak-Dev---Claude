/** Side-by-side concept comparison with metric deltas. */
import { useMemo, useState } from 'react';
import { useStudio } from '@/persistence/store';
import { navigate } from '@/app/router';
import { Button, EmptyState, Panel, SelectField } from '@/ui/primitives';
import { LazyMassingViewer as MassingViewer } from '@/ui/viewer/LazyMassingViewer';
import { formatArea } from '@/domain/units';
import { scoreLabel } from '@/generation/scoring';
import type { Concept, Project } from '@/domain/types';

function gia(c: Concept): number {
  return Math.abs(c.footprint.w * c.footprint.d) * c.storeys;
}

function Metric({ label, value, delta }: { label: string; value: string; delta?: number }) {
  const tone = delta === undefined || delta === 0 ? 'var(--text-faint)' : delta > 0 ? '#6fd6a0' : '#ff9d97';
  return (
    <div className="scorerow">
      <span className="muted">{label}</span>
      <span>
        <span className="mono">{value}</span>
        {delta !== undefined && delta !== 0 && (
          <span className="mono" style={{ color: tone, marginLeft: 8 }}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </span>
    </div>
  );
}

function ConceptColumn({
  project,
  concept,
  other,
  options,
  onChange,
}: {
  project: Project;
  concept: Concept;
  other: Concept | null;
  options: Concept[];
  onChange: (id: string) => void;
}) {
  const updateConcept = useStudio((s) => s.updateConcept);
  const units = project.meta.units;
  const d = (a: number, b: number | undefined) => (b === undefined ? undefined : Math.round(a - b));

  return (
    <Panel
      title={concept.name}
      actions={
        <Button
          small
          variant={concept.favourite ? 'primary' : 'ghost'}
          onClick={() => updateConcept(concept.id, (c) => ({ ...c, favourite: !c.favourite }))}
        >
          {concept.favourite ? 'Preferred' : 'Mark preferred'}
        </Button>
      }
    >
      <SelectField label="Showing" value={concept.id} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>

      <div style={{ height: 260, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        <MassingViewer project={project} concept={concept} />
      </div>

      <div style={{ marginTop: 'var(--s4)' }}>
        <Metric label="Overall" value={`${concept.scores.overall} (${scoreLabel(concept.scores.overall)})`} delta={d(concept.scores.overall, other?.scores.overall)} />
        <Metric label="Fit" value={String(concept.scores.fit)} delta={d(concept.scores.fit, other?.scores.fit)} />
        <Metric label="Daylight" value={String(concept.scores.daylight)} delta={d(concept.scores.daylight, other?.scores.daylight)} />
        <Metric label="Access" value={String(concept.scores.access)} delta={d(concept.scores.access, other?.scores.access)} />
        <Metric label="Amenity" value={String(concept.scores.amenity)} delta={d(concept.scores.amenity, other?.scores.amenity)} />
        <Metric label="Floor area" value={formatArea(gia(concept), units)} delta={d(gia(concept), other ? gia(other) : undefined)} />
        <Metric label="Garden" value={formatArea(concept.amenitySqm, units)} delta={d(concept.amenitySqm, other?.amenitySqm)} />
        <Metric label="Parking" value={`${concept.parking.length} space${concept.parking.length === 1 ? '' : 's'}`} />
      </div>
    </Panel>
  );
}

export function CompareScreen() {
  const project = useStudio((s) => s.project);
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const concepts = useMemo(() => project?.concepts ?? [], [project]);
  const left = concepts.find((c) => c.id === leftId) ?? concepts[0] ?? null;
  const right = concepts.find((c) => c.id === rightId) ?? concepts[1] ?? null;

  if (!project) return null;

  if (concepts.length < 2) {
    return (
      <div className="page">
        <EmptyState
          title="Need two concepts to compare"
          action={<Button onClick={() => navigate({ name: 'studio', projectId: project.id })}>Back to studio</Button>}
        >
          Generate concepts first, then return here to weigh them up.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1>Compare concepts</h1>
          <p className="page__sub">Differences are shown against the concept on the left.</p>
        </div>
        <Button onClick={() => navigate({ name: 'studio', projectId: project.id })}>Back to studio</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--s4)' }}>
        {left && (
          <ConceptColumn project={project} concept={left} other={null} options={concepts} onChange={setLeftId} />
        )}
        {right && (
          <ConceptColumn project={project} concept={right} other={left} options={concepts} onChange={setRightId} />
        )}
      </div>
    </div>
  );
}
