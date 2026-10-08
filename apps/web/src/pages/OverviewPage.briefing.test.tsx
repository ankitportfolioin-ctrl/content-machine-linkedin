import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function mockBaseline() {
  apiMocks.checkHealth.mockResolvedValue({ status: 'healthy' });
  apiMocks.checkReady.mockResolvedValue({ status: 'ready' });
  apiMocks.getTodayBrain.mockResolvedValue({
    brain: {
      newSignals: 12,
      highPotentialOpportunities: 3,
      readyForApproval: 4,
      awaitingAnalytics: 1,
      newAudienceSignals: 2,
      runningExperiments: 0,
      newLearnedPatterns: 1,
      recommendation: {
        text: 'AI workflow automation content is accelerating among beginner developers.',
        why: ['12 independent sources mention it', 'Beginner threads repeat the same question'],
        confidence: 'HIGH',
      },
    },
  });
  apiMocks.getReadiness.mockResolvedValue({
    readiness: {
      workspaceIntelligenceReady: { ready: true, reason: 'ok', details: {} },
      humanApprovalReady: { ready: true, reason: 'ok', details: {} },
      platformExecution: [{ platform: 'linkedin', connected: true }],
      overall: 'ready',
    },
  });
  apiMocks.listOpportunities.mockResolvedValue({
    opportunities: [
      { id: 'opp-1', title: 'AI workflow automation for beginners', score: 92, topic: 'automation', audience: 'beginners' },
      { id: 'opp-2', title: 'Carousel teardowns of viral posts', score: 81, topic: 'formats' },
    ],
  });
  apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
  apiMocks.listReports.mockResolvedValue({ reports: [] });
  apiMocks.listRuns.mockResolvedValue({ runs: [] });
  apiMocks.getOnboarding.mockResolvedValue({ onboarding: { complete: true } });
  apiMocks.triggerRun.mockResolvedValue({
    result: { runId: 'run-1', status: 'COMPLETED', stages: [], resumed: false },
  });
}

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/observatory" element={<div>Observatory page</div>} />
        <Route path="/opportunities" element={<div>Opportunities page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OverviewPage briefing', () => {
  it('renders greeting, statuses, signal, and top opportunities', async () => {
    mockBaseline();
    renderOverview();

    expect(await screen.findByText(/Good (morning|afternoon|evening)/)).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.getByText('4 awaiting approval')).toBeInTheDocument();
    expect(
      screen.getByText('AI workflow automation content is accelerating among beginner developers.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Confidence HIGH')).toBeInTheDocument();
    expect(screen.getByText('AI workflow automation for beginners')).toBeInTheDocument();
    expect(screen.getAllByText('Create Draft').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText('Explore Signal'));
    expect(await screen.findByText('Observatory page')).toBeInTheDocument();
  });

  it('runs an intelligence scan and reports the result', async () => {
    mockBaseline();
    renderOverview();
    await screen.findByText('Run Intelligence Scan');

    fireEvent.click(screen.getAllByText('Run Intelligence Scan')[0]!);
    expect(apiMocks.triggerRun).toHaveBeenCalled();
    expect(await screen.findByText(/Scan completed/)).toBeInTheDocument();
  });

  it('shows honest empty states when the system found nothing yet', async () => {
    mockBaseline();
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
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [] });
    apiMocks.getOnboarding.mockResolvedValue({ onboarding: { complete: false } });
    renderOverview();

    expect(await screen.findByText('No signal yet')).toBeInTheDocument();
    expect(screen.getByText('No new opportunities yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue onboarding' })).toHaveAttribute('href', '/onboarding');
  });
});
