/**
 * Real-time 3D massing viewer.
 * Orbit with drag, zoom with the wheel. Falls back to a clear message when
 * WebGL is unavailable rather than showing a blank panel.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Concept, Project } from '@/domain/types';
import { buildScene } from './scene';
import { Alert } from '@/ui/primitives';
import './viewer.css';

export interface MassingViewerProps {
  project: Project;
  concept: Concept;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export function MassingViewer({ project, concept, onCanvasReady }: MassingViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest callback without making it an effect dependency, so an
  // inline arrow from the parent does not rebuild the renderer every render.
  const readyRef = useRef(onCanvasReady);
  readyRef.current = onCanvasReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError('3D view needs WebGL, which this browser or device has disabled.');
      return;
    }

    setError(null);
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    readyRef.current?.(renderer.domElement);

    let raf = 0;
    let disposed = false;
    const { scene, camera, dispose } = buildScene(project, concept);

    // Coalesced render-on-demand: many requests in one frame produce one render.
    const requestRender = () => {
      if (raf || disposed) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        renderer.render(scene, camera);
      });
    };

    // Orbit state derived from the camera's initial framing.
    const target = new THREE.Vector3(concept.footprint.x, 3, -concept.footprint.y);
    const offset = camera.position.clone().sub(target);
    let radius = offset.length();
    let theta = Math.atan2(offset.x, offset.z);
    let phi = Math.acos(Math.min(1, Math.max(-1, offset.y / radius)));

    const applyCamera = () => {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
      requestRender();
    };
    applyCamera();

    let dragging = false;
    let last = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      theta -= (e.clientX - last.x) * 0.006;
      phi = Math.min(Math.PI / 2.1, Math.max(0.15, phi - (e.clientY - last.y) * 0.006));
      last = { x: e.clientX, y: e.clientY };
      applyCamera();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      renderer.domElement.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.min(600, Math.max(14, radius + e.deltaY * 0.12));
      applyCamera();
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onContextLost = (e: Event) => {
      e.preventDefault();
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      setError('The 3D view lost its graphics context. Switch views and back to retry.');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);

    let lastW = 0;
    let lastH = 0;
    const resize = () => {
      const r = host.getBoundingClientRect();
      const w = Math.max(240, Math.round(r.width));
      const h = Math.max(200, Math.round(r.height));
      if (w === lastW && h === lastH) return; // ignore no-op observer callbacks
      lastW = w;
      lastH = h;
      // updateStyle=true keeps the canvas CSS size equal to the host, so it can
      // never overflow and grow an ancestor (which would loop the observer).
      renderer.setSize(w, h, true);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [project, concept]);

  if (error) {
    return (
      <div className="viewer viewer--error">
        <Alert kind="warning">{error}</Alert>
      </div>
    );
  }
  return <div className="viewer" ref={hostRef} aria-label="3D massing view" role="img" />;
}
