import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';

const authState = vi.hoisted(() => ({
  workspaces: [{ id: 'ws-1', name: 'WS' }] as Array<{ id: string; name: string }>,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 'test-token',
    workspaceId: authState.workspaces[0]?.id ?? null,
    workspaces: authState.workspaces,
    loading: false,
    error: null,
    isAuthenticated: true,
    login: async () => undefined,
    register: async () => undefined,
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => undefined,
  }),
}));

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    listNextActions: vi.fn(),
    checkHealth: vi.fn(),
    checkReady: vi.fn(),
    listReports: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
    getReadiness: vi.fn(),
    getAutoPrepStatus: vi.fn(),
    getOnboarding: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listNextActions: apiMocks.listNextActions,
    checkHealth: apiMocks.checkHealth,
    checkReady: apiMocks.checkReady,
    listReports: apiMocks.listReports,
    listRuns: apiMocks.listRuns,
    getRun: apiMocks.getRun,
    getReadiness: apiMocks.getReadiness,
    getAutoPrepStatus: apiMocks.getAutoPrepStatus,
    getOnboarding: apiMocks.getOnboarding,
  };
});

function baseMocks() {
  apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
  apiMocks.getAutoPrepStatus.mockRejectedValue(new Error('no'));
  apiMocks.checkHealth.mockResolvedValue({ status: 'healthy' });
  apiMocks.checkReady.mockResolvedValue({ status: 'ready' });
  apiMocks.listReports.mockResolvedValue({ reports: [] });
  apiMocks.listRuns.mockResolvedValue({ runs: [] });
  apiMocks.getReadiness.mockResolvedValue({
    readiness: {
      workspaceIntelligenceReady: { ready: false, reason: 'x', details: {} },
      humanApprovalReady: { ready: false, reason: 'x', details: {} },
      linkedInExecution: { ready: false, reason: 'Not connected' },
      overall: 'not_ready',
    },
  });
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage onboarding nudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.workspaces = [{ id: 'ws-1', name: 'WS' }];
    baseMocks();
  });

  it('shows a setup nudge with the real next step when onboarding is incomplete', async () => {
    apiMocks.getOnboarding.mockResolvedValue({
      onboarding: { complete: false, currentStep: 'profile', steps: {} },
    });
    renderHome();
    expect(await screen.findByText('Finish workspace setup')).toBeInTheDocument();
    expect(screen.getByText(/Profile & voice/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue onboarding' })).toHaveAttribute('href', '/onboarding');
  });

  it('hides the nudge once onboarding is complete', async () => {
    apiMocks.getOnboarding.mockResolvedValue({
      onboarding: { complete: true, currentStep: null, steps: {} },
    });
    renderHome();
    await screen.findByText('API Health');
    expect(screen.queryByText('Finish workspace setup')).not.toBeInTheDocument();
  });

  it('never blocks the page when the onboarding call fails', async () => {
    apiMocks.getOnboarding.mockRejectedValue(new Error('down'));
    renderHome();
    await screen.findByText('API Health');
    expect(screen.queryByText('Finish workspace setup')).not.toBeInTheDocument();
  });

  it('F1 regression: zero workspaces fires no workspace-scoped requests and shows the workspace setup card', async () => {
    authState.workspaces = [];
    renderHome();
    expect(await screen.findByText('Create your first workspace')).toBeInTheDocument();
    // Zero-workspace guidance renders in the setup card plus the Today /
    // recommendations sections — every instance must offer the creator.
    expect(screen.getAllByRole('button', { name: 'Create workspace' }).length).toBeGreaterThanOrEqual(1);
    // No workspace-scoped fetch may fire for a fresh account (previously a 403 storm)
    expect(apiMocks.getReadiness).not.toHaveBeenCalled();
    expect(apiMocks.getOnboarding).not.toHaveBeenCalled();
    expect(apiMocks.listReports).not.toHaveBeenCalled();
    expect(apiMocks.listRuns).not.toHaveBeenCalled();
    expect(apiMocks.listNextActions).not.toHaveBeenCalled();
    expect(apiMocks.getAutoPrepStatus).not.toHaveBeenCalled();
    expect(screen.queryByText(/You do not have access/)).not.toBeInTheDocument();
  });
});
