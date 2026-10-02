import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceSelector } from './WorkspaceSelector';

const mocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  selectWorkspace: vi.fn(),
  refreshWorkspaces: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  workspaces: [] as Array<{ id: string; name: string }>,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 't',
    workspaceId: authState.workspaces[0]?.id ?? null,
    workspaces: authState.workspaces,
    loading: false,
    error: null,
    isAuthenticated: true,
    login: async () => undefined,
    register: async () => undefined,
    logout: () => undefined,
    selectWorkspace: mocks.selectWorkspace,
    refreshWorkspaces: mocks.refreshWorkspaces,
  }),
}));

vi.mock('../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/api')>();
  return {
    ...original,
    createWorkspace: mocks.createWorkspace,
  };
});

describe('WorkspaceSelector regression (F3: second workspace creation)', () => {
  it('offers a New workspace creator alongside the switcher when workspaces exist', async () => {
    authState.workspaces = [{ id: 'ws-a', name: 'Workspace A' }];
    mocks.createWorkspace.mockResolvedValue({ workspace: { id: 'ws-b', name: 'Workspace B' } });
    mocks.refreshWorkspaces.mockResolvedValue(undefined);

    render(<WorkspaceSelector />);

    // Switcher still present
    expect(screen.getByRole('combobox', { name: 'Workspace' })).toBeInTheDocument();
    // Creator affordance present (F3 fix)
    fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
    fireEvent.change(screen.getByLabelText('New workspace name'), { target: { value: 'Workspace B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await screen.findByRole('combobox', { name: 'Workspace' });
    expect(mocks.createWorkspace).toHaveBeenCalledWith({ name: 'Workspace B' });
    expect(mocks.selectWorkspace).toHaveBeenCalledWith('ws-b');
  });

  it('keeps the zero-workspace first-run creator', () => {
    authState.workspaces = [];
    render(<WorkspaceSelector />);
    expect(screen.getByText(/No workspaces yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeInTheDocument();
  });
});
