/**
 * Interactive 2D plan canvas.
 *
 * Handles pan/zoom, boundary tracing and vertex editing, constraint drawing and
 * dragging the selected building. All interaction is pointer-based with
 * keyboard equivalents documented in the toolbar help.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Concept, Constraint, Point, Project } from '@/domain/types';
import type { BuildableArea } from '@/generation/buildable';
import { bbox } from '@/geometry/bbox';
import { createViewport, fitTo, pan, screenToWorld, worldToScreen, zoomAt, type Viewport } from './viewport';
import * as paint from './draw';
import './canvas.css';

export type CanvasTool = 'select' | 'boundary' | 'constraint' | 'building';

export interface PlanCanvasProps {
  project: Project;
  buildable: BuildableArea | null;
  concept: Concept | null;
  tool: CanvasTool;
  /** Constraint kind being drawn when tool === 'constraint'. */
  constraintKind: Constraint['kind'];
  selectedConstraintId: string | null;
  showRooms: boolean;
  onBoundaryChange: (points: Point[], closed: boolean) => void;
  onConstraintDrawn: (points: Point[]) => void;
  onSelectConstraint: (id: string | null) => void;
  onMoveBuilding: (centre: Point) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

const HIT_PX = 10;

export function PlanCanvas(props: PlanCanvasProps) {
  const {
    project,
    buildable,
    concept,
    tool,
    constraintKind,
    selectedConstraintId,
    showRooms,
    onBoundaryChange,
    onConstraintDrawn,
    onSelectConstraint,
    onMoveBuilding,
    onCanvasReady,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>(createViewport);
  const [size, setSize] = useState({ w: 800, h: 600 });
  // True once the element has been measured, so we never fit to the placeholder size.
  const [measured, setMeasured] = useState(false);
  // Once the user pans or zooms we stop auto-fitting and leave the view alone.
  const [userAdjusted, setUserAdjusted] = useState(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [pending, setPending] = useState<Point[]>([]);
  const [dragVertex, setDragVertex] = useState<number | null>(null);
  const [hoverVertex, setHoverVertex] = useState(-1);
  const [draggingBuilding, setDraggingBuilding] = useState(false);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const [underlayImg, setUnderlayImg] = useState<HTMLImageElement | null>(null);

  const boundary = project.site.boundary;

  // Load the underlay raster whenever it changes.
  useEffect(() => {
    const u = project.site.underlay;
    if (!u) {
      setUnderlayImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setUnderlayImg(img);
    img.src = u.dataUrl;
  }, [project.site.underlay]);

  // Track the element size for a crisp, correctly-scaled canvas.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ w: Math.max(320, r.width), h: Math.max(240, r.height) });
        setMeasured(true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitView = useCallback(() => {
    const pts = boundary.points;
    if (pts.length < 2) {
      setView(createViewport());
      return;
    }
    setView(fitTo(bbox(pts), size.w, size.h));
  }, [boundary.points, size.w, size.h]);

  // Keep the plot framed while the layout settles or the window resizes, and
  // stop as soon as the user takes control of the view.
  useEffect(() => {
    setUserAdjusted(false);
  }, [project.id]);
  useEffect(() => {
    if (userAdjusted || !measured || boundary.points.length < 3) return;
    fitView();
  }, [measured, size.w, size.h, boundary.points.length, project.id, userAdjusted, fitView]);

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return screenToWorld(view, e.clientX - rect.left, e.clientY - rect.top);
    },
    [view],
  );

  const vertexAt = useCallback(
    (w: Point): number => {
      for (let i = 0; i < boundary.points.length; i++) {
        const p = boundary.points[i]!;
        const s = worldToScreen(view, p.x, p.y);
        const c = worldToScreen(view, w.x, w.y);
        if (Math.hypot(s.x - c.x, s.y - c.y) <= HIT_PX) return i;
      }
      return -1;
    },
    [boundary.points, view],
  );

  /* ── Pointer handling ─────────────────────────────────────── */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = toWorld(e);
    canvasRef.current?.setPointerCapture(e.pointerId);

    // Middle button or space-drag pans in every mode.
    if (e.button === 1 || e.altKey) {
      panning.current = { x: e.clientX, y: e.clientY };
      setUserAdjusted(true);
      return;
    }

    if (tool === 'boundary') {
      if (boundary.closed) return;
      const hit = vertexAt(w);
      // Clicking the first vertex closes the ring.
      if (hit === 0 && boundary.points.length >= 3) {
        onBoundaryChange(boundary.points, true);
        return;
      }
      onBoundaryChange([...boundary.points, w], false);
      return;
    }

    if (tool === 'constraint') {
      const next = [...pending, w];
      setPending(next);
      // Points finish immediately; lines and polygons wait for a double click.
      if (constraintKind === 'tree' || constraintKind === 'access' || constraintKind === 'utility') {
        onConstraintDrawn(next);
        setPending([]);
      }
      return;
    }

    if (tool === 'building' && concept) {
      const c = worldToScreen(view, concept.footprint.x, concept.footprint.y);
      const s = worldToScreen(view, w.x, w.y);
      if (Math.hypot(c.x - s.x, c.y - s.y) < Math.max(18, concept.footprint.w * view.scale * 0.5)) {
        setDraggingBuilding(true);
        return;
      }
    }

    if (tool === 'select') {
      const hit = vertexAt(w);
      if (hit >= 0) {
        setDragVertex(hit);
        return;
      }
      // Select the nearest constraint within reach.
      let nearest: string | null = null;
      let best = HIT_PX * 2;
      for (const c of project.site.constraints) {
        for (const p of c.points) {
          const sp = worldToScreen(view, p.x, p.y);
          const sc = worldToScreen(view, w.x, w.y);
          const d = Math.hypot(sp.x - sc.x, sp.y - sc.y);
          if (d < best) {
            best = d;
            nearest = c.id;
          }
        }
      }
      onSelectConstraint(nearest);
      if (!nearest) {
        panning.current = { x: e.clientX, y: e.clientY };
        setUserAdjusted(true);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = toWorld(e);
    setCursor(w);

    if (panning.current) {
      setView((v) => pan(v, e.clientX - panning.current!.x, e.clientY - panning.current!.y));
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (dragVertex !== null) {
      const next = boundary.points.map((p, i) => (i === dragVertex ? w : p));
      onBoundaryChange(next, boundary.closed);
      return;
    }

    if (draggingBuilding) {
      onMoveBuilding(w);
      return;
    }

    setHoverVertex(tool === 'select' || tool === 'boundary' ? vertexAt(w) : -1);
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);
    panning.current = null;
    setDragVertex(null);
    setDraggingBuilding(false);
  };

  const onDoubleClick = () => {
    if (tool === 'boundary' && !boundary.closed && boundary.points.length >= 3) {
      onBoundaryChange(boundary.points, true);
      return;
    }
    if (tool === 'constraint' && pending.length >= 2) {
      onConstraintDrawn(pending);
      setPending([]);
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setUserAdjusted(true);
    setView((v) => zoomAt(v, e.clientX - rect.left, e.clientY - rect.top, factor));
  };

  // Escape cancels an in-progress drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Painting ─────────────────────────────────────────────── */

  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    paint.clear(ctx, size.w, size.h);
    paint.drawGrid(ctx, view, size.w, size.h);
    paint.drawUnderlay(ctx, view, project.site, underlayImg);
    if (buildable) paint.drawEnvelope(ctx, view, buildable.envelope);
    paint.drawBoundary(
      ctx,
      view,
      boundary.points,
      boundary.closed,
      project.meta.units,
      tool === 'select' || tool === 'boundary',
      hoverVertex,
    );
    paint.drawConstraints(ctx, view, project.site.constraints, selectedConstraintId);
    if (concept) paint.drawConcept(ctx, view, concept, showRooms, project.meta.units);
    if (pending.length > 0) {
      paint.drawPending(ctx, view, pending, cursor, paint.constraintColour(constraintKind));
    }
    if (tool === 'boundary' && !boundary.closed && boundary.points.length > 0) {
      paint.drawPending(ctx, view, boundary.points, cursor, paint.PALETTE.plotLine);
    }
    paint.drawChrome(ctx, view, size.w, size.h, project.site.northOffsetDeg, project.meta.units);
  }, [
    size, view, dpr, project, boundary, buildable, concept, showRooms, pending, cursor,
    hoverVertex, selectedConstraintId, tool, constraintKind, underlayImg,
  ]);

  useEffect(() => {
    if (canvasRef.current && onCanvasReady) onCanvasReady(canvasRef.current);
  }, [onCanvasReady]);

  const hint = useMemo(() => {
    if (tool === 'boundary') {
      return boundary.closed
        ? 'Boundary closed. Switch to Select to drag the corner points.'
        : 'Click to place corner points. Double-click, or click the first point, to close.';
    }
    if (tool === 'constraint') return 'Click to draw. Double-click to finish a line or area. Esc cancels.';
    if (tool === 'building') return 'Drag the building to reposition it inside the developable area.';
    return 'Drag a corner point to reshape. Scroll to zoom, Alt-drag to pan.';
  }, [tool, boundary.closed]);

  const cursorStyle =
    tool === 'boundary' || tool === 'constraint' ? 'crosshair' : draggingBuilding ? 'grabbing' : 'default';

  return (
    <div className="plan" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="plan__canvas"
        style={{ width: size.w, height: size.h, cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        role="application"
        aria-label="Site plan canvas"
      />
      <div className="plan__hint" role="status">{hint}</div>
      <div className="plan__zoom">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setUserAdjusted(true);
            setView((v) => zoomAt(v, size.w / 2, size.h / 2, 1.2));
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setUserAdjusted(true);
            setView((v) => zoomAt(v, size.w / 2, size.h / 2, 1 / 1.2));
          }}
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setUserAdjusted(false);
            fitView();
          }}
        >
          Fit
        </button>
      </div>
      {cursor && (
        <div className="plan__readout mono" aria-hidden="true">
          {cursor.x.toFixed(1)}, {cursor.y.toFixed(1)} m
        </div>
      )}
    </div>
  );
}
