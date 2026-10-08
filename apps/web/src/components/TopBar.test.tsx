import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { OverviewPage } from '../pages/OverviewPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'op@example.com' },
    token: 't',
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
    listWorkspaces: vi.fn(),
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
    listWorkspaces: apiMocks.listWorkspaces,
  };
});

function renderShell() {
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
      workspaceIntelligenceReady: { ready: false, reason: 'x', details: {} },
      humanApprovalReady: { ready: true, reason: 'x', details: {} },
      platformExecution: [],
      overall: 'partial',
    },
  });
  apiMocks.listOpportunities.mockResolvedValue({ opportunities: [] });
  apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
  apiMocks.listReports.mockResolvedValue({ reports: [] });
  apiMocks.listRuns.mockResolvedValue({ runs: [] });
  apiMocks.getOnboarding.mockResolvedValue({ onboarding: { complete: true } });
  apiMocks.listWorkspaces.mockResolvedValue({ workspaces: [{ id: 'ws-1', name: 'WS' }] });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="radar" element={<div>Radar page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Command-center shell', () => {
  it('shows breadcrumb title and opens the palette to navigate', async () => {
    renderShell();
    expect(await screen.findByText('Home', { selector: '.topbar-title' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open command palette/i }));
    expect(await screen.findByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), { target: { value: 'dis' } });
    fireEvent.click(screen.getByRole('button', { name: /discover/i }));
    expect(await screen.findByText('Radar page')).toBeInTheDocument();
  });
});
