/**
 * Project persistence (localStorage).
 *
 * Storage is deliberately defensive: a corrupt or partially-written record must
 * never take the whole app down, so every read is validated and bad records are
 * skipped rather than thrown.
 */
import type { Project } from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';
import { DEFAULT_BRIEF, emptySite } from '@/domain/defaults';

export const STORAGE_KEY = 'archform.studio.projects.v1';

export interface LoadReport {
  projects: Project[];
  /** Records that could not be read, surfaced to the user rather than hidden. */
  skipped: number;
}

/** Storage can be unavailable (private mode, disabled cookies). */
function storage(): Storage | null {
  try {
    const probe = '__archform_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storageAvailable(): boolean {
  return storage() !== null;
}

/** Coerce an unknown record into a valid Project, or null if unusable. */
export function reviveProject(raw: unknown): Project | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<Project>;
  if (typeof r.id !== 'string' || typeof r.createdAt !== 'string') return null;
  if (typeof r.meta !== 'object' || r.meta === null) return null;

  const site = r.site && typeof r.site === 'object' ? r.site : emptySite();
  const boundary = site.boundary ?? { points: [], closed: false };

  return {
    id: r.id,
    schema: typeof r.schema === 'number' ? r.schema : SCHEMA_VERSION,
    createdAt: r.createdAt,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : r.createdAt,
    meta: {
      name: String(r.meta.name ?? 'Untitled project'),
      address: String(r.meta.address ?? ''),
      units: r.meta.units === 'ft' ? 'ft' : 'm',
      notes: String(r.meta.notes ?? ''),
    },
    site: {
      boundary: {
        points: Array.isArray(boundary.points) ? boundary.points : [],
        closed: Boolean(boundary.closed),
      },
      northOffsetDeg: Number.isFinite(site.northOffsetDeg) ? site.northOffsetDeg : 0,
      setbacks: site.setbacks ?? { front: 6, rear: 10, side: 2 },
      constraints: Array.isArray(site.constraints) ? site.constraints : [],
      ...(site.underlay ? { underlay: site.underlay } : {}),
    },
    brief: { ...DEFAULT_BRIEF, ...(r.brief ?? {}) },
    concepts: Array.isArray(r.concepts) ? r.concepts : [],
    selectedConceptId: typeof r.selectedConceptId === 'string' ? r.selectedConceptId : null,
    versions: Array.isArray(r.versions) ? r.versions : [],
  };
}

export function loadAll(): LoadReport {
  const s = storage();
  if (!s) return { projects: [], skipped: 0 };
  const raw = s.getItem(STORAGE_KEY);
  if (!raw) return { projects: [], skipped: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { projects: [], skipped: 1 };
  }
  if (!Array.isArray(parsed)) return { projects: [], skipped: 1 };

  const projects: Project[] = [];
  let skipped = 0;
  for (const item of parsed) {
    const p = reviveProject(item);
    if (p) projects.push(p);
    else skipped++;
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { projects, skipped };
}

export class StorageFullError extends Error {
  constructor() {
    super('Browser storage is full. Delete an old project or export it before saving again.');
    this.name = 'StorageFullError';
  }
}

export function saveAll(projects: readonly Project[]): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    throw new StorageFullError();
  }
}

export function upsert(project: Project): Project[] {
  const { projects } = loadAll();
  const next = projects.filter((p) => p.id !== project.id);
  next.unshift(project);
  saveAll(next);
  return next;
}

export function remove(id: string): Project[] {
  const { projects } = loadAll();
  const next = projects.filter((p) => p.id !== id);
  saveAll(next);
  return next;
}

export function findById(id: string): Project | null {
  return loadAll().projects.find((p) => p.id === id) ?? null;
}
