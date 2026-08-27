/** Constraints inspector: draw and manage everything that limits the layout. */
import type { Constraint, Project } from '@/domain/types';
import type { CanvasTool } from '@/ui/canvas/PlanCanvas';
import { useStudio } from '@/persistence/store';
import { Button, EmptyState, TextField } from '@/ui/primitives';
import { constraintColour } from '@/ui/canvas/draw';

const KINDS: Array<{ id: Constraint['kind']; label: string; how: string }> = [
  { id: 'access', label: 'Access point', how: 'Click once where vehicles enter' },
  { id: 'road', label: 'Road', how: 'Click along the road, double-click to finish' },
  { id: 'tree', label: 'Tree', how: 'Click the trunk position' },
  { id: 'easement', label: 'Easement', how: 'Click along the run, double-click to finish' },
  { id: 'utility', label: 'Utility', how: 'Click the connection point' },
  { id: 'noBuild', label: 'No-build zone', how: 'Click corners, double-click to close' },
  { id: 'neighbour', label: 'Neighbour', how: 'Click corners, double-click to close' },
  { id: 'slope', label: 'Slope note', how: 'Click along the fall, double-click to finish' },
];

export function ConstraintsPanel({
  project,
  tool,
  onTool,
  constraintKind,
  onConstraintKind,
  selectedId,
  onSelect,
}: {
  project: Project;
  tool: CanvasTool;
  onTool: (t: CanvasTool) => void;
  constraintKind: Constraint['kind'];
  onConstraintKind: (k: Constraint['kind']) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const removeConstraint = useStudio((s) => s.removeConstraint);
  const updateSite = useStudio((s) => s.updateSite);
  const selected = project.site.constraints.find((c) => c.id === selectedId) ?? null;
  const active = KINDS.find((k) => k.id === constraintKind);

  const patch = (id: string, changes: Partial<Constraint>) =>
    updateSite((s) => ({
      ...s,
      constraints: s.constraints.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    }));

  return (
    <>
      <div className="section">
        <div className="section__title">Add a constraint</div>
        <div className="toollist">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className="toolbtn"
              aria-pressed={tool === 'constraint' && constraintKind === k.id}
              onClick={() => {
                onConstraintKind(k.id);
                onTool('constraint');
              }}
            >
              <span className="toolbtn__dot" style={{ background: constraintColour(k.id) }} />
              {k.label}
            </button>
          ))}
        </div>
        {tool === 'constraint' && active && (
          <p className="faint" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            {active.how}. Press Escape to cancel.
          </p>
        )}
      </div>

      <div className="section">
        <div className="section__title">On this site ({project.site.constraints.length})</div>
        {project.site.constraints.length === 0 ? (
          <EmptyState title="Nothing recorded">
            <span style={{ fontSize: 12 }}>
              Add the road, access and anything that limits where you can build.
            </span>
          </EmptyState>
        ) : (
          project.site.constraints.map((c) => (
            <div
              key={c.id}
              className="constraint-item"
              aria-current={c.id === selectedId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c.id === selectedId ? null : c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(c.id === selectedId ? null : c.id);
                }
              }}
            >
              <span className="toolbtn__dot" style={{ background: constraintColour(c.kind) }} />
              <span className="constraint-item__label">{c.label}</span>
              <Button
                small
                variant="ghost"
                aria-label={`Delete ${c.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeConstraint(c.id);
                  if (selectedId === c.id) onSelect(null);
                }}
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>

      {selected && (
        <div className="section">
          <div className="section__title">Selected constraint</div>
          <TextField
            label="Label"
            value={selected.label}
            onChange={(e) => patch(selected.id, { label: e.target.value })}
          />
          {(selected.kind === 'tree' || selected.kind === 'utility') && (
            <TextField
              label="Protection radius (m)"
              type="number"
              min={0}
              step={0.5}
              value={String(selected.radius ?? 6)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) patch(selected.id, { radius: v });
              }}
              hint="Assumed. An arboricultural survey gives the real figure."
            />
          )}
          {(selected.kind === 'easement' || selected.kind === 'road' || selected.kind === 'utility') && (
            <TextField
              label="Corridor half-width (m)"
              type="number"
              min={0}
              step={0.5}
              value={String(selected.buffer ?? 3)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) patch(selected.id, { buffer: v });
              }}
            />
          )}
        </div>
      )}
    </>
  );
}
