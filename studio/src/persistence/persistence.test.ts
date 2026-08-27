import { beforeEach, describe, expect, it } from 'vitest';
import { loadAll, reviveProject, remove, saveAll, upsert, findById, STORAGE_KEY } from './repository';
import { addVersion, restoreVersion, MAX_VERSIONS } from './versions';
import { safeFileName } from './exporters';
import { createSampleProject } from '@/domain/sample';
import { createProject } from '@/domain/defaults';

beforeEach(() => {
  window.localStorage.clear();
});

describe('repository', () => {
  it('round-trips a project through storage', () => {
    const p = createSampleProject();
    upsert(p);
    const loaded = findById(p.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.name).toBe(p.meta.name);
    expect(loaded!.site.boundary.points).toHaveLength(p.site.boundary.points.length);
    expect(loaded!.site.constraints).toHaveLength(p.site.constraints.length);
  });

  it('replaces rather than duplicates on upsert', () => {
    const p = createSampleProject();
    upsert(p);
    upsert({ ...p, meta: { ...p.meta, name: 'Renamed' } });
    const all = loadAll().projects;
    expect(all).toHaveLength(1);
    expect(all[0]!.meta.name).toBe('Renamed');
  });

  it('deletes a project', () => {
    const p = createSampleProject();
    upsert(p);
    remove(p.id);
    expect(findById(p.id)).toBeNull();
  });

  it('survives corrupt storage instead of throwing', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const report = loadAll();
    expect(report.projects).toHaveLength(0);
    expect(report.skipped).toBe(1);
  });

  it('skips unusable records but keeps good ones', () => {
    const good = createSampleProject();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([good, { rubbish: true }, null]));
    const report = loadAll();
    expect(report.projects).toHaveLength(1);
    expect(report.skipped).toBe(2);
  });

  it('fills in defaults for a partial record', () => {
    const revived = reviveProject({ id: 'p1', createdAt: '2024-01-01T00:00:00.000Z', meta: {} });
    expect(revived).not.toBeNull();
    expect(revived!.meta.name).toBe('Untitled project');
    expect(revived!.meta.units).toBe('m');
    expect(revived!.site.boundary.points).toEqual([]);
    expect(revived!.concepts).toEqual([]);
  });

  it('rejects records with no id', () => {
    expect(reviveProject({ meta: {} })).toBeNull();
    expect(reviveProject(null)).toBeNull();
    expect(reviveProject('nope')).toBeNull();
  });

  it('sorts most recently updated first', () => {
    const a = { ...createProject({ name: 'A', address: '', units: 'm', notes: '', northOffsetDeg: 0 }), updatedAt: '2024-01-01T00:00:00.000Z' };
    const b = { ...createProject({ name: 'B', address: '', units: 'm', notes: '', northOffsetDeg: 0 }), updatedAt: '2025-01-01T00:00:00.000Z' };
    saveAll([a, b]);
    expect(loadAll().projects[0]!.meta.name).toBe('B');
  });
});

describe('versions', () => {
  it('adds a snapshot', () => {
    const p = addVersion(createSampleProject(), 'First');
    expect(p.versions).toHaveLength(1);
    expect(p.versions[0]!.label).toBe('First');
  });

  it('caps the history', () => {
    let p = createSampleProject();
    for (let i = 0; i < MAX_VERSIONS + 5; i++) p = addVersion(p, `v${i}`);
    expect(p.versions).toHaveLength(MAX_VERSIONS);
  });

  it('restores an earlier brief and keeps a backup', () => {
    let p = createSampleProject();
    p = addVersion(p, 'Original');
    const versionId = p.versions[0]!.id;
    p = { ...p, brief: { ...p.brief, bedrooms: 9 } };
    const restored = restoreVersion(p, versionId);
    expect(restored.brief.bedrooms).toBe(4);
    expect(restored.versions.some((v) => v.label === 'Before restore')).toBe(true);
  });

  it('is a no-op for an unknown version', () => {
    const p = createSampleProject();
    expect(restoreVersion(p, 'missing')).toBe(p);
  });
});

describe('exporters', () => {
  it('makes safe file names', () => {
    expect(safeFileName('14 Meadow Lane!')).toBe('14-meadow-lane');
    expect(safeFileName('   ')).toBe('archform-project');
  });
});
