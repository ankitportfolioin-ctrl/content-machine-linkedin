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
    listReviews: vi.fn(),
    listContentIdeas: vi.fn(),
    listPublishRecords: vi.fn(),
    listLearningProposals: vi.fn(),
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
    listReviews: apiMocks.listReviews,
    listContentIdeas: apiMocks.listContentIdeas,
    listPublishRecords: apiMocks.listPublishRecords,
    listLearningProposals: apiMocks.listLearningProposals,
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
  apiMocks.listReviews.mockResolvedValue({
    reviews: [
      { id: 'r1', status: 'SUBMITTED' },
      { id: 'r2', status: 'SUBMITTED' },
      { id: 'r3', status: 'SUBMITTED' },
      { id: 'r4', status: 'SUBMITTED' },
    ],
  });
  apiMocks.listContentIdeas.mockResolvedValue({ contentIdeas: [{ id: 'i1' }] });
  apiMocks.listPublishRecords.mockResolvedValue({ publishRecords: [] });
  apiMocks.listLearningProposals.mockResolvedValue({ proposals: [{ id: 'p1' }] });
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
  it('renders brand-today header, real counts, signal, and priorities', async () => {
    mockBaseline();
    renderOverview();

    expect(await screen.findByText('Your brand, today.')).toBeInTheDocument();
    // Single obvious next action: decisions pending → "Review now" is primary
    // (header + section both link to approvals).
    const reviewLinks = screen.getAllByRole('link', { name: 'Review now' });
    expect(reviewLinks.length).toBeGreaterThanOrEqual(1);
    reviewLinks.forEach((l) => expect(l).toHaveAttribute('href', '/approvals'));
    // LinkedIn state lives in System status now; connected workspaces see "All good".
    expect(screen.getByText(/All good/)).toBeInTheDocument();
    // Needs-your-decision count comes from real review rows (4 SUBMITTED).
    expect(screen.getByText(/4.*wait.*review/i)).toBeInTheDocument();
    expect(
      screen.getByText('AI workflow automation content is accelerating among beginner developers.'),
    ).toBeInTheDocument();
    // Confidence is shown in plain words (HIGH → "Strong evidence").
    expect(screen.getByText(/Strong evidence/)).toBeInTheDocument();
    // The same real opportunity appears in Today's priorities and in
    // New in research — both must render from the same record.
    expect(screen.getAllByText('AI workflow automation for beginners').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Create content').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getAllByText('Explore')[0]!);
    expect(await screen.findByText('Observatory page')).toBeInTheDocument();
  });

  it('checks for new ideas and reports the result', async () => {
    mockBaseline();
    // No pending decisions → the research check is the primary header action.
    apiMocks.listReviews.mockResolvedValue({ reviews: [] });
    renderOverview();
    await screen.findByText('Check for new ideas');

    fireEvent.click(screen.getAllByText('Check for new ideas')[0]!);
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
    apiMocks.listReviews.mockResolvedValue({ reviews: [] });
    apiMocks.listLearningProposals.mockResolvedValue({ proposals: [] });
    apiMocks.getOnboarding.mockResolvedValue({ onboarding: { complete: false, currentStep: 'offers' } });
    renderOverview();

    expect(await screen.findByText('Nothing urgent today')).toBeInTheDocument();
    expect(screen.getByText(/No new source items yet/)).toBeInTheDocument();
    const setupLinks = screen.getAllByRole('link', { name: 'Continue setup' });
    expect(setupLinks.length).toBeGreaterThanOrEqual(1);
    setupLinks.forEach((l) => expect(l).toHaveAttribute('href', '/onboarding'));
  });
});
