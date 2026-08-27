/**
 * Application store.
 *
 * Holds the open project and persists it with a debounced autosave so no work
 * is lost, while keeping writes off the interaction path.
 */
import { create } from 'zustand';
import type { Brief, Concept, Constraint, Project, Site } from '@/domain/types';
import * as repo from './repository';
import { addVersion, restoreVersion } from './versions';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface StudioState {
  projects: Project[];
  project: Project | null;
  saveState: SaveState;
  saveError: string | null;
  storageOk: boolean;
  skippedRecords: number;

  refreshProjects: () => void;
  openProject: (id: string) => Project | null;
  closeProject: () => void;
  createProject: (project: Project) => void;
  deleteProject: (id: string) => void;

  updateProject: (fn: (p: Project) => Project) => void;
  updateSite: (fn: (s: Site) => Site) => void;
  updateBrief: (fn: (b: Brief) => Brief) => void;
  setConcepts: (concepts: Concept[]) => void;
  updateConcept: (id: string, fn: (c: Concept) => Concept) => void;
  selectConcept: (id: string | null) => void;
  addConstraint: (c: Constraint) => void;
  removeConstraint: (id: string) => void;
  saveVersion: (label: string) => void;
  restore: (versionId: string) => void;
  flush: () => void;
}

const AUTOSAVE_MS = 700;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useStudio = create<StudioState>((set, get) => {
  /** Debounced persist of the currently open project. */
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    set({ saveState: 'saving', saveError: null });
    timer = setTimeout(() => {
      const p = get().project;
      if (!p) return;
      try {
        const projects = repo.upsert(p);
        set({ projects, saveState: 'saved', saveError: null });
      } catch (err) {
        set({
          saveState: 'error',
          saveError: err instanceof Error ? err.message : 'Could not save this project.',
        });
      }
    }, AUTOSAVE_MS);
  };

  const mutate = (fn: (p: Project) => Project) => {
    const current = get().project;
    if (!current) return;
    const next = { ...fn(current), updatedAt: new Date().toISOString() };
    set({ project: next });
    scheduleSave();
  };

  return {
    projects: [],
    project: null,
    saveState: 'idle',
    saveError: null,
    storageOk: true,
    skippedRecords: 0,

    refreshProjects: () => {
      const { projects, skipped } = repo.loadAll();
      set({ projects, skippedRecords: skipped, storageOk: repo.storageAvailable() });
    },

    openProject: (id) => {
      const p = repo.findById(id);
      set({ project: p, saveState: 'idle', saveError: null });
      return p;
    },

    closeProject: () => {
      if (timer) clearTimeout(timer);
      set({ project: null, saveState: 'idle' });
    },

    createProject: (project) => {
      const projects = repo.upsert(project);
      set({ projects, project, saveState: 'saved' });
    },

    deleteProject: (id) => {
      const projects = repo.remove(id);
      const open = get().project;
      set({ projects, project: open?.id === id ? null : open });
    },

    updateProject: mutate,
    updateSite: (fn) => mutate((p) => ({ ...p, site: fn(p.site) })),
    updateBrief: (fn) => mutate((p) => ({ ...p, brief: fn(p.brief) })),

    setConcepts: (concepts) =>
      mutate((p) => ({ ...p, concepts, selectedConceptId: concepts[0]?.id ?? null })),

    updateConcept: (id, fn) =>
      mutate((p) => ({
        ...p,
        concepts: p.concepts.map((c) => (c.id === id ? fn(c) : c)),
      })),

    selectConcept: (id) => mutate((p) => ({ ...p, selectedConceptId: id })),

    addConstraint: (c) =>
      mutate((p) => ({ ...p, site: { ...p.site, constraints: [...p.site.constraints, c] } })),

    removeConstraint: (id) =>
      mutate((p) => ({
        ...p,
        site: { ...p.site, constraints: p.site.constraints.filter((c) => c.id !== id) },
      })),

    saveVersion: (label) => mutate((p) => addVersion(p, label)),
    restore: (versionId) => mutate((p) => restoreVersion(p, versionId)),

    flush: () => {
      if (timer) clearTimeout(timer);
      const p = get().project;
      if (!p) return;
      try {
        const projects = repo.upsert(p);
        set({ projects, saveState: 'saved' });
      } catch (err) {
        set({
          saveState: 'error',
          saveError: err instanceof Error ? err.message : 'Could not save this project.',
        });
      }
    },
  };
});
