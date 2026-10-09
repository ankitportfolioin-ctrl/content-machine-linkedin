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

function renderRadar() {
  return render(
    <MemoryRouter initialEntries={['/radar']}>
      <Routes>
        <Route path="/radar" element={<RadarPage />} />
        <Route path="/observatory" element={<div>Observatory page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RadarPage', () => {
  beforeEach(() => {
    apiMocks.listRuns.mockResolvedValue({ runs: [] });
  });

  it('lists ranked pending recommendations with scores', async () => {
    apiMocks.listNextActions.mockResolvedValue({
      actions: [
        {
          id: 'a-1', identityKey: 'k', kind: 'CREATE_DRAFT', subjectId: 's',
          title: 'Publish the ViewTransition guide', score: 91, reasons: ['Strong evidence'],
          evidenceLinks: [], subjectMeta: {}, status: 'PENDING',
        },
      ],
      total: 1,
    });
    renderRadar();
    expect(await screen.findByText('Publish the ViewTransition guide')).toBeInTheDocument();
    expect(screen.getByText(/1 pending recommendation/)).toBeInTheDocument();
  });

  it('shows an honest empty state when the queue is clear', async () => {
    apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
    renderRadar();
    expect(await screen.findByText('Radar is clear')).toBeInTheDocument();
  });
});
