/**
 * Code-split wrapper for the 3D viewer.
 * Three.js is only downloaded when a user actually opens a 3D view.
 */
import { Suspense, lazy } from 'react';
import type { MassingViewerProps } from './MassingViewer';
import { Spinner } from '@/ui/primitives';

const Viewer = lazy(() =>
  import('./MassingViewer').then((m) => ({ default: m.MassingViewer })),
);

export function LazyMassingViewer(props: MassingViewerProps) {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', minHeight: 220 }}>
          <span className="muted">
            <Spinner label="Loading 3D view" /> Loading 3D view...
          </span>
        </div>
      }
    >
      <Viewer {...props} />
    </Suspense>
  );
}
