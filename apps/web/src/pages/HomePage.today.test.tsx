import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 'test-token',
    workspaceId: 'ws-1',
    workspaces: [{ id: 'ws-1', name: 'WS' }],
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
  apiMocks: {
    listNextActions: vi.fn(),
    dismissAction: vi.fn(),
    completeAction: vi.fn(),
    startIdeaFromAction: vi.fn(),
    researchProspectFromAction: vi.fn(),
    checkHealth: vi.fn(),
    checkReady: vi.fn(),
    listReports: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
    triggerRun: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listNextActions: apiMocks.listNextActions,
    dismissAction: apiMocks.dismissAction,
    completeAction: apiMocks.completeAction,
    startIdeaFromAction: apiMocks.startIdeaFromAction,
    researchProspectFromAction: apiMocks.researchProspectFromAction,
    checkHealth: apiMocks.checkHealth,
    checkReady: apiMocks.checkReady,
    listReports: apiMocks.listReports,
    listRuns: apiMocks.listRuns,
    getRun: apiMocks.getRun,
    triggerRun: apiMocks.triggerRun,
  };
});

const digest = {
  id: 'report-1',
  frequency: 'DAILY',
  periodStart: '2026-09-28T00:00:00.000Z',
  periodEnd: '2026-09-28T23:59:59.999Z',
  emergingTopics: [{ id: 't1', title: 'AI coding agents', score: 8.5 }],
  strongSignals: [{ id: 's1', title: 'Strong post' }],
  weakSignals: [],
  learnedPatterns: [{ id: 'p1', dimension: 'actionability', pattern: 'Observed', status: 'PROPOSED' }],
  experiments: [],
  recommendedTopics: [{ id: 't1', title: 'AI coding agents' }],
  confidenceLevel: 'LOW',
  generatedAt: '2026-09-28T07:00:00.000Z',
};

const runDetail = {
  id: 'run-1',
  runDate: '2026-09-28T00:00:00.000Z',
  status: 'COMPLETED',
  startedAt: '2026-09-28T06:00:00.000Z',
  finishedAt: '2026-09-28T06:01:00.000Z',
  stages: [
    { stage: 'INTELLIGENCE', status: 'SUCCEEDED' },
    { stage: 'EXECUTION', status: 'SKIPPED' },
  ],
};

function renderHome() {
  apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
  apiMocks.checkHealth.mockResolvedValue({ status: 'healthy' });
  apiMocks.checkReady.mockResolvedValue({ status: 'ready' });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage Today batch', () => {
  it('renders digest summary, run stages, and triggers the loop', async () => {
    apiMocks.listReports.mockResolvedValue({ reports: [digest] });
    apiMocks.listRuns.mockResolvedValue({ runs: [{ ...runDetail, stages: undefined }] });
    apiMocks.getRun.mockResolvedValue({ run: runDetail });
    apiMocks.triggerRun.mockResolvedValue({
      result: { runId: 'run-1', status: 'COMPLETED', stages: [], resumed: true },
    });
    renderHome();

    await screen.findByText('Daily digest');
    expect(screen.getAllByText(/AI coding agents/).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('Latest loop run')).toBeInTheDocument();
    expect(screen.getByText('Intelligence (Discovery)')).toBeInTheDocument();
    expect(screen.getByText('Execution')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Run today’s loop now'));
    expect(await screen.findByText(/Loop finished with status COMPLETED/)).toBeInTheDocument();
    expect(apiMocks.triggerRun).toHaveBeenCalledWith();
  });

  it('shows honest empty states when nothing ran yet', async () => {
    apiMocks.listReports.mockResolvedValue({ reports: [] });
    apiMocks.listRuns.mockResolvedValue({ runs: [] });
    renderHome();

    await screen.findByText('Daily digest');
    expect(screen.getByText(/No digest yet/)).toBeInTheDocument();
    expect(screen.getByText(/No runs recorded yet/)).toBeInTheDocument();
  });
});
