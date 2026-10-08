import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OverviewPage } from './OverviewPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'op@example.com' },
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
    checkHealth: vi.fn(),
    checkReady: vi.fn(),
    getTodayBrain: vi.fn(),
    getReadiness: vi.fn(),
    listOpportunities: vi.fn(),
    listNextActions: vi.fn(),
    listReports: vi.fn(),
    listRuns: vi.fn(),
    getOnboarding: vi.fn(),
    triggerRun: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    checkHealth: apiMocks.checkHealth,
    checkReady: apiMocks.checkReady,
    getTodayBrain: apiMocks.getTodayBrain,
    getReadiness: apiMocks.getReadiness,
    listOpportunities: apiMocks.listOpportunities,
    listNextActions: apiMocks.listNextActions,
    listReports: apiMocks.listReports,
    listRuns: apiMocks.listRuns,
    getOnboarding: apiMocks.getOnboarding,
    triggerRun: apiMocks.triggerRun,
  };
});

describe('OverviewPage activity stream', () => {
  it('streams real runs, digests, and decisions in recency order', async () => {
    apiMocks.checkHealth.mockResolvedValue({ status: 'healthy' });
    apiMocks.checkReady.mockResolvedValue({ status: 'ready' });
    apiMocks.getTodayBrain.mockResolvedValue({
      brain: {
        newSignals: 1,
        highPotentialOpportunities: 0,
        readyForApproval: 0,
        awaitingAnalytics: 0,
        newAudienceSignals: 0,
        runningExperiments: 0,
        newLearnedPatterns: 0,
        recommendation: null,
      },
    });
    apiMocks.getReadiness.mockResolvedValue({
      readiness: {
        workspaceIntelligenceReady: { ready: true, reason: 'ok', details: {} },
        humanApprovalReady: { ready: true, reason: 'ok', details: {} },
        platformExecution: [],
        overall: 'ready',
      },
    });
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [] });
    apiMocks.listNextActions.mockResolvedValue({
      actions: [
        {
          id: 'a-1',
          identityKey: 'k-1',
          kind: 'CREATE_DRAFT',
          subjectId: 's-1',
          title: 'Draft generated from confirmed pattern',
          score: 89,
          reasons: ['Confirmed pattern'],
          evidenceLinks: [],
          subjectMeta: {},
          status: 'COMPLETED',
          completedAt: new Date(Date.now() - 21 * 60000).toISOString(),
        },
      ],
      total: 1,
    });
    apiMocks.listReports.mockResolvedValue({
      reports: [{ id: 'r-1', frequency: 'DAILY', createdAt: new Date(Date.now() - 38 * 60000).toISOString() }],
    });
    apiMocks.listRuns.mockResolvedValue({
      runs: [{ id: 'run-9', runDate: new Date(Date.now() - 120 * 60000).toISOString(), status: 'COMPLETED' }],
    });
    apiMocks.getOnboarding.mockResolvedValue({ onboarding: { complete: true } });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Draft generated from confirmed pattern/)).toBeInTheDocument();
    expect(screen.getByText(/Intelligence run completed/)).toBeInTheDocument();
    expect(screen.getByText(/Daily digest/)).toBeInTheDocument();
  });

  it('shows an honest empty message when nothing has happened yet', async () => {
    apiMocks.checkHealth.mockResolvedValue({ status: 'healthy' });
    apiMocks.checkReady.mockResolvedValue({ status: 'ready' });
    apiMocks.getTodayBrain.mockResolvedValue({
      brain: {
        newSignals: 0,
        highPotentialOpportunities: 0,
        readyForApproval: 0,
        awaitingAnalytics: 0,
        newAudienceSignals: 0,
        runningExperiments: 0,
        newLearnedPatterns: 0,
        recommendation: null,
      },
    });
    apiMocks.getReadiness.mockResolvedValue({
      readiness: {
        workspaceIntelligenceReady: { ready: false, reason: 'no sources', details: {} },
        humanApprovalReady: { ready: true, reason: 'ok', details: {} },
        platformExecution: [],
        overall: 'partial',
      },
    });
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [] });
    apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
    apiMocks.listReports.mockResolvedValue({ reports: [] });
    apiMocks.listRuns.mockResolvedValue({ runs: [] });
    apiMocks.getOnboarding.mockResolvedValue({ onboarding: { complete: true } });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/No recorded activity yet/)).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });
});
