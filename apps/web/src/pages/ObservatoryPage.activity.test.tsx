import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ObservatoryPage } from './ObservatoryPage';

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
  apiMocks: {
    listSources: vi.fn(),
    listTrends: vi.fn(),
    listGaps: vi.fn(),
    listOpportunities: vi.fn(),
    listRuns: vi.fn(),
    listReports: vi.fn(),
    getOpportunity: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listSources: apiMocks.listSources,
    listTrends: apiMocks.listTrends,
    listGaps: apiMocks.listGaps,
    listOpportunities: apiMocks.listOpportunities,
    listRuns: apiMocks.listRuns,
    listReports: apiMocks.listReports,
    getOpportunity: apiMocks.getOpportunity,
  };
});

function baseMocks() {
  apiMocks.listSources.mockResolvedValue({ sources: [] });
  apiMocks.listTrends.mockResolvedValue({ trends: [] });
  apiMocks.listGaps.mockResolvedValue({ gaps: [] });
  apiMocks.listOpportunities.mockResolvedValue({ opportunities: [] });
  apiMocks.listRuns.mockResolvedValue({ runs: [] });
  apiMocks.listReports.mockResolvedValue({ reports: [] });
}

function renderObservatory() {
  return render(
    <MemoryRouter initialEntries={['/observatory']}>
      <Routes>
        <Route path="/observatory" element={<ObservatoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ObservatoryPage research activity (Stage 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseMocks();
  });

  it('shows the last recorded run and latest digest', async () => {
    apiMocks.listRuns.mockResolvedValue({
      runs: [{ id: 'run-1', runDate: new Date().toISOString(), status: 'COMPLETED', startedAt: new Date().toISOString() }],
    });
    apiMocks.listReports.mockResolvedValue({
      reports: [{ id: 'rep-1', frequency: 'DAILY', generatedAt: new Date().toISOString(), emergingTopics: [{ id: 't1' }], strongSignals: [] }],
    });
    renderObservatory();
    expect(await screen.findByText('Research activity')).toBeInTheDocument();
    expect(await screen.findByText(/Last check completed/)).toBeInTheDocument();
    expect(screen.getByText('Latest daily digest')).toBeInTheDocument();
  });

  it('is honest when no runs or digests were recorded', async () => {
    renderObservatory();
    expect(await screen.findByText(/No research checks recorded yet/)).toBeInTheDocument();
  });

  it('is honest when history endpoints fail', async () => {
    apiMocks.listRuns.mockRejectedValue(new Error('db down'));
    apiMocks.listReports.mockRejectedValue(new Error('db down'));
    renderObservatory();
    expect(await screen.findByText(/Research history is unavailable right now/)).toBeInTheDocument();
  });

  it('renders opportunity evidence as readable content, not a JSON dump', async () => {
    apiMocks.listOpportunities.mockResolvedValue({
      opportunities: [{ id: 'o-1', title: 'AI pricing pages', status: 'NEW', score: 80 }],
    });
    apiMocks.getOpportunity.mockResolvedValue({
      opportunity: {
        id: 'o-1',
        title: 'AI pricing pages',
        description: 'Teams compare pricing pages.',
        evidence: { facts: [{ statement: 'Three sources mention usage-based pricing' }] },
      },
    });
    renderObservatory();
    fireEvent.click(await screen.findByRole('button', { name: 'Why it matters' }));
    expect(await screen.findByText('Three sources mention usage-based pricing')).toBeInTheDocument();
  });
});
