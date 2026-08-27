/** The main workspace: navigation, canvas/3D stage, and contextual inspector. */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/persistence/store';
import { navigate } from '@/app/router';
import { computeBuildable, plotArea } from '@/generation/buildable';
import { PlanCanvas, type CanvasTool } from '@/ui/canvas/PlanCanvas';
import { LazyMassingViewer as MassingViewer } from '@/ui/viewer/LazyMassingViewer';
import { Alert, Button, EmptyState } from '@/ui/primitives';
import { SitePanel } from '@/ui/panels/SitePanel';
import { ConstraintsPanel } from '@/ui/panels/ConstraintsPanel';
import { BriefPanel } from '@/ui/panels/BriefPanel';
import { ConceptsPanel } from '@/ui/panels/ConceptsPanel';
import { LeftNav, type StudioTab } from '@/ui/panels/LeftNav';
import { exportCanvasPng } from '@/persistence/exporters';
import type { Constraint, Point } from '@/domain/types';
import './studio.css';

type Stage = 'plan' | '3d';

const CONSTRAINT_LABELS: Record<Constraint['kind'], string> = {
  road: 'Road',
  access: 'Access point',
  neighbour: 'Neighbouring building',
  tree: 'Tree',
  easement: 'Easement',
  noBuild: 'No-build zone',
  utility: 'Utility run',
  slope: 'Slope note',
};

function constraintTypeFor(kind: Constraint['kind']): Constraint['type'] {
  if (kind === 'tree' || kind === 'access' || kind === 'utility') return 'point';
  if (kind === 'neighbour' || kind === 'noBuild') return 'polygon';
  return 'line';
}

export function StudioScreen() {
  const project = useStudio((s) => s.project);
  const updateSite = useStudio((s) => s.updateSite);
  const updateConcept = useStudio((s) => s.updateConcept);
  const addConstraint = useStudio((s) => s.addConstraint);

  const [tab, setTab] = useState<StudioTab>('site');
  const [stage, setStage] = useState<Stage>('plan');
  const [tool, setTool] = useState<CanvasTool>('select');
  const [constraintKind, setConstraintKind] = useState<Constraint['kind']>('tree');
  const [selectedConstraintId, setSelectedConstraintId] = useState<string | null>(null);
  const [showRooms, setShowRooms] = useState(true);
  const planCanvas = useRef<HTMLCanvasElement | null>(null);
  const viewerCanvas = useRef<HTMLCanvasElement | null>(null);

  const buildable = useMemo(
    () => (project && project.site.boundary.closed ? computeBuildable(project.site) : null),
    [project],
  );

  const concept = useMemo(
    () => project?.concepts.find((c) => c.id === project.selectedConceptId) ?? null,
    [project],
  );

  const onBoundaryChange = useCallback(
    (points: Point[], closed: boolean) => {
      updateSite((s) => ({ ...s, boundary: { points, closed } }));
    },
    [updateSite],
  );

  const onConstraintDrawn = useCallback(
    (points: Point[]) => {
      const kind = constraintKind;
      addConstraint({
        id: `c_${Date.now().toString(36)}`,
        kind,
        label: CONSTRAINT_LABELS[kind],
        type: constraintTypeFor(kind),
        points,
        ...(kind === 'tree' ? { radius: 6 } : {}),
        ...(kind === 'easement' ? { buffer: 3 } : {}),
        ...(kind === 'utility' ? { buffer: 2 } : {}),
      });
      setTool('select');
    },
    [addConstraint, constraintKind],
  );

  const onMoveBuilding = useCallback(
    (centre: Point) => {
      if (!concept) return;
      updateConcept(concept.id, (c) => ({
        ...c,
        footprint: { ...c.footprint, x: centre.x, y: centre.y },
      }));
    },
    [concept, updateConcept],
  );

  const saveImage = () => {
    if (!project) return;
    const c = stage === 'plan' ? planCanvas.current : viewerCanvas.current;
    if (c) exportCanvasPng(c, `${project.meta.name}-${stage}`);
  };

  if (!project) {
    return (
      <div className="page">
        <EmptyState
          title="Project not found"
          action={<Button onClick={() => navigate({ name: 'projects' })}>Back to projects</Button>}
        >
          It may have been deleted, or this link came from a different browser.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="studio">
      <div className="studio__left">
        <LeftNav
          project={project}
          tab={tab}
          onTab={setTab}
          plotSqm={plotArea(project.site)}
          buildableSqm={buildable?.areaSqm ?? 0}
        />
      </div>

      <div className="studio__centre">
        <div className="studio__viewbar">
          <div className="tabs" role="tablist" aria-label="Stage view">
            <button className="tab" role="tab" aria-selected={stage === 'plan'} onClick={() => setStage('plan')}>
              2D plan
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={stage === '3d'}
              onClick={() => setStage('3d')}
              disabled={!concept}
            >
              3D massing
            </button>
          </div>
          <span style={{ flex: 1 }} />
          {stage === 'plan' && concept && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={showRooms} onChange={(e) => setShowRooms(e.target.checked)} />
              Room layout
            </label>
          )}
          <Button small onClick={saveImage}>Save image</Button>
          <Button
            small
            onClick={() => navigate({ name: 'compare', projectId: project.id })}
            disabled={project.concepts.length < 2}
          >
            Compare
          </Button>
          <Button small variant="primary" onClick={() => navigate({ name: 'export', projectId: project.id })}>
            Export pack
          </Button>
        </div>

        <div className="studio__stage">
          {stage === 'plan' ? (
            <PlanCanvas
              project={project}
              buildable={buildable}
              concept={concept}
              tool={tool}
              constraintKind={constraintKind}
              selectedConstraintId={selectedConstraintId}
              showRooms={showRooms}
              onBoundaryChange={onBoundaryChange}
              onConstraintDrawn={onConstraintDrawn}
              onSelectConstraint={setSelectedConstraintId}
              onMoveBuilding={onMoveBuilding}
              onCanvasReady={(c) => {
                planCanvas.current = c;
              }}
            />
          ) : concept ? (
            <MassingViewer
              project={project}
              concept={concept}
              onCanvasReady={(c) => {
                viewerCanvas.current = c;
              }}
            />
          ) : (
            <div style={{ padding: 'var(--s5)' }}>
              <Alert kind="info">Generate a concept to see the 3D massing.</Alert>
            </div>
          )}
        </div>
      </div>

      <div className="studio__right">
        {tab === 'site' && <SitePanel project={project} tool={tool} onTool={setTool} />}
        {tab === 'constraints' && (
          <ConstraintsPanel
            project={project}
            tool={tool}
            onTool={setTool}
            constraintKind={constraintKind}
            onConstraintKind={setConstraintKind}
            selectedId={selectedConstraintId}
            onSelect={setSelectedConstraintId}
          />
        )}
        {tab === 'brief' && <BriefPanel project={project} />}
        {tab === 'concepts' && (
          <ConceptsPanel project={project} buildableSqm={buildable?.areaSqm ?? 0} onTool={setTool} />
        )}
      </div>
    </div>
  );
}
