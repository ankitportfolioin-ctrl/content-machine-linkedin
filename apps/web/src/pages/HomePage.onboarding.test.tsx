import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 'test-token',
    workspaceId: 'ws-1',
    workspaces: [],
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
});
