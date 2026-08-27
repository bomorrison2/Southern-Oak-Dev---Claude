import { useEffect } from 'react';
import { useRoute, navigate, hrefFor } from './app/router';
import { useStudio } from './persistence/store';
import { ProjectsScreen } from './routes/ProjectsScreen';
import { NewProjectScreen } from './routes/NewProjectScreen';
import { StudioScreen } from './routes/StudioScreen';
import { CompareScreen } from './routes/CompareScreen';
import { ExportScreen } from './routes/ExportScreen';
import { Spinner } from './ui/primitives';
import './app/app.css';

function SaveChip() {
  const saveState = useStudio((s) => s.saveState);
  const saveError = useStudio((s) => s.saveError);
  if (saveState === 'idle') return <span className="savechip" />;
  if (saveState === 'saving') {
    return (
      <span className="savechip">
        <Spinner label="Saving" /> Saving
      </span>
    );
  }
  if (saveState === 'error') {
    return (
      <span className="savechip" style={{ color: '#ff9d97' }} role="alert">
        {saveError ?? 'Not saved'}
      </span>
    );
  }
  return <span className="savechip">All changes saved</span>;
}

export function App() {
  const route = useRoute();
  const project = useStudio((s) => s.project);
  const openProject = useStudio((s) => s.openProject);
  const closeProject = useStudio((s) => s.closeProject);
  const flush = useStudio((s) => s.flush);

  const routeProjectId = 'projectId' in route ? route.projectId : null;

  // Open the project the URL points at, and close it when we navigate away.
  useEffect(() => {
    if (!routeProjectId) {
      closeProject();
      return;
    }
    if (project?.id !== routeProjectId) {
      const found = openProject(routeProjectId);
      if (!found) navigate({ name: 'projects' });
    }
  }, [routeProjectId, project?.id, openProject, closeProject]);

  // Never lose work on unload.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('beforeunload', onHide);
    return () => window.removeEventListener('beforeunload', onHide);
  }, [flush]);

  return (
    <div className="shell">
      <a className="sr-only skip-link" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <a className="brand" href={hrefFor({ name: 'projects' })}>
          <span className="brand__mark" aria-hidden="true" />
          ArchForm Studio
        </a>
        {project && (
          <span className="muted" style={{ fontSize: 13 }}>
            / {project.meta.name}
          </span>
        )}
        <span className="topbar__spacer" />
        <SaveChip />
      </header>

      <main id="main" className={`main${route.name === 'studio' ? ' main--fixed' : ''}`}>
        {route.name === 'projects' && <ProjectsScreen />}
        {route.name === 'new' && <NewProjectScreen />}
        {route.name === 'studio' && <StudioScreen />}
        {route.name === 'compare' && <CompareScreen />}
        {route.name === 'export' && <ExportScreen />}
      </main>
    </div>
  );
}
