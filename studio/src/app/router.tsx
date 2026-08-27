/**
 * Tiny hash router.
 *
 * The app is a single-page tool with a handful of screens, so a dependency-free
 * hash router keeps deployment trivial (it works from any static host, and from
 * the file system) without pulling in a routing library.
 */
import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { name: 'projects' }
  | { name: 'new' }
  | { name: 'studio'; projectId: string }
  | { name: 'compare'; projectId: string }
  | { name: 'export'; projectId: string };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'projects' };
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'p' && parts[1]) {
    const id = parts[1];
    if (parts[2] === 'compare') return { name: 'compare', projectId: id };
    if (parts[2] === 'export') return { name: 'export', projectId: id };
    return { name: 'studio', projectId: id };
  }
  return { name: 'projects' };
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'projects':
      return '#/';
    case 'new':
      return '#/new';
    case 'studio':
      return `#/p/${route.projectId}`;
    case 'compare':
      return `#/p/${route.projectId}/compare`;
    case 'export':
      return `#/p/${route.projectId}/export`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const onChange = useCallback(() => setRoute(parseHash(window.location.hash)), []);
  useEffect(() => {
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [onChange]);
  return route;
}
