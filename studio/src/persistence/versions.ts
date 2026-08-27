/** Saved snapshots the user can restore, kept to a sensible cap. */
import type { Project, VersionSnapshot } from '@/domain/types';
import { createId } from '@/domain/ids';

export const MAX_VERSIONS = 12;

export function snapshot(project: Project, label: string): VersionSnapshot {
  return {
    id: createId('ver'),
    label,
    createdAt: new Date().toISOString(),
    site: structuredClone(project.site),
    brief: structuredClone(project.brief),
    concepts: structuredClone(project.concepts),
  };
}

/** Add a snapshot, trimming the oldest beyond the cap. */
export function addVersion(project: Project, label: string): Project {
  const versions = [snapshot(project, label), ...project.versions].slice(0, MAX_VERSIONS);
  return { ...project, versions };
}

export function restoreVersion(project: Project, versionId: string): Project {
  const v = project.versions.find((x) => x.id === versionId);
  if (!v) return project;
  // Snapshot the current state first so a restore is itself undoable.
  const withBackup = addVersion(project, 'Before restore');
  return {
    ...withBackup,
    site: structuredClone(v.site),
    brief: structuredClone(v.brief),
    concepts: structuredClone(v.concepts),
    selectedConceptId: v.concepts[0]?.id ?? null,
    updatedAt: new Date().toISOString(),
  };
}
