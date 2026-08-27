import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewProjectScreen } from './NewProjectScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { loadAll } from '@/persistence/repository';
import { useStudio } from '@/persistence/store';

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
  useStudio.setState({ projects: [], project: null, saveState: 'idle', saveError: null });
});

describe('NewProjectScreen', () => {
  it('shows an actionable error when the name is missing', async () => {
    const user = userEvent.setup();
    render(<NewProjectScreen />);
    await user.click(screen.getByRole('button', { name: /create project/i }));
    expect(await screen.findByText(/give the project a name/i)).toBeInTheDocument();
    expect(screen.getByText(/needs attention before you can continue/i)).toBeInTheDocument();
  });

  it('rejects a width without a depth', async () => {
    const user = userEvent.setup();
    render(<NewProjectScreen />);
    await user.type(screen.getByLabelText(/project name/i), 'Garden build');
    await user.type(screen.getByLabelText(/width/i), '20');
    await user.click(screen.getByRole('button', { name: /create project/i }));
    expect(screen.getByText(/both width and depth/i)).toBeInTheDocument();
  });

  it('creates and persists a project from valid input', async () => {
    const user = userEvent.setup();
    render(<NewProjectScreen />);
    await user.type(screen.getByLabelText(/project name/i), 'Garden build');
    await user.type(screen.getByLabelText(/address/i), '2 Test Road');
    await user.type(screen.getByLabelText(/width/i), '30');
    await user.type(screen.getByLabelText(/depth/i), '20');
    await user.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      const saved = loadAll().projects;
      expect(saved).toHaveLength(1);
      expect(saved[0]!.meta.name).toBe('Garden build');
      expect(saved[0]!.site.boundary.points).toHaveLength(4);
    });
  });
});

describe('ProjectsScreen', () => {
  it('shows the empty state with both onboarding routes', () => {
    render(<ProjectsScreen />);
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore the sample/i })).toBeInTheDocument();
  });

  it('loads the sample project on request', async () => {
    const user = userEvent.setup();
    render(<ProjectsScreen />);
    await user.click(screen.getByRole('button', { name: /explore the sample/i }));
    await waitFor(() => {
      const saved = loadAll().projects;
      expect(saved).toHaveLength(1);
      expect(saved[0]!.site.constraints.length).toBeGreaterThan(0);
    });
  });

  it('carries the standing disclaimer', () => {
    render(<ProjectsScreen />);
    expect(screen.getByText(/conceptual studies only/i)).toBeInTheDocument();
  });
});
