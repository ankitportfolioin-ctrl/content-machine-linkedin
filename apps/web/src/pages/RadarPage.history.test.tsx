import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RadarPage } from './RadarPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 't',
    workspaceId: 'ws-1',
    workspaces: [],
    loading: false,
    error: null,
    isAuthenticated: true,
    login: async () => undefined,
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => undefined,
  }),
}));

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: { listNextActions: vi.fn(), listRuns: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, listNextActions: apiMocks.listNextActions, listRuns: apiMocks.listRuns };
});

describe('RadarPage research history (Stage 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
  });

  it('shows the last recorded research check when one exists', async () => {
    apiMocks.listRuns.mockResolvedValue({
      runs: [{ id: 'run-9', runDate: new Date().toISOString(), status: 'COMPLETED', startedAt: new Date().toISOString() }],
    });
    render(
      <MemoryRouter initialEntries={['/radar']}>
        <Routes>
          <Route path="/radar" element={<RadarPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Last research check completed/)).toBeInTheDocument();
  });

  it('stays quiet about history when no runs were recorded', async () => {
    apiMocks.listRuns.mockResolvedValue({ runs: [] });
    render(
      <MemoryRouter initialEntries={['/radar']}>
        <Routes>
          <Route path="/radar" element={<RadarPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Radar is clear')).toBeInTheDocument();
    expect(screen.queryByText(/Last research check/)).not.toBeInTheDocument();
  });
});
