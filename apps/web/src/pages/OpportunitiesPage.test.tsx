import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OpportunitiesPage } from './OpportunitiesPage';

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
    listOpportunities: vi.fn(),
    getOpportunity: vi.fn(),
    getOpportunityScoring: vi.fn(),
    convertOpportunity: vi.fn(),
    triageOpportunity: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listOpportunities: apiMocks.listOpportunities,
    getOpportunity: apiMocks.getOpportunity,
    getOpportunityScoring: apiMocks.getOpportunityScoring,
    convertOpportunity: apiMocks.convertOpportunity,
    triageOpportunity: apiMocks.triageOpportunity,
  };
});

function renderOpps() {
  return render(
    <MemoryRouter initialEntries={['/opportunities']}>
      <Routes>
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/content" element={<div>Studio page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OpportunitiesPage', () => {
  it('lists scored bets and opens the hero detail', async () => {
    apiMocks.listOpportunities.mockResolvedValue({
      opportunities: [{ id: 'opp-9', title: 'AI workflow automation for beginners', score: 92, topic: 'automation', audience: 'beginners' }],
    });
    apiMocks.getOpportunity.mockResolvedValue({
      opportunity: {
        id: 'opp-9',
        title: 'AI workflow automation for beginners',
        description: 'Beginners can generate code but cannot ship.',
        score: 92,
        topic: 'automation',
        audience: 'beginners',
        format: 'Educational carousel',
        hook: 'Most beginners automate the wrong thing.',
        angle: 'Ship one real project',
        reasoning: 'Rising search interest plus repeated beginner questions.',
      },
    });
    apiMocks.getOpportunityScoring.mockResolvedValue({
      scoring: {
        overallScore: 9.2,
        baseOverallScore: 9.0,
        criticalFailure: false,
        learning: { applied: [], ignored: [] },
        dimensions: [
          { name: 'audience_fit', score: 9.4, explanation: 'Beginners ask daily', evidence: [], baseScore: 9.4, appliedAdjustment: 0 },
          { name: 'trend_momentum', score: 8.9, explanation: 'Rising fast', evidence: [], baseScore: 8.9, appliedAdjustment: 0 },
        ],
      },
    });
    renderOpps();

    expect(await screen.findByText('AI workflow automation for beginners')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Open opportunity'));

    expect(await screen.findByText('Opportunity score')).toBeInTheDocument();
    expect(screen.getByText('Why this matters')).toBeInTheDocument();
    expect(screen.getByText('Recommended content')).toBeInTheDocument();
    expect(screen.getByText(/Most beginners automate the wrong thing/)).toBeInTheDocument();
  });

  it('converts an opportunity into a draft idea', async () => {
    apiMocks.listOpportunities.mockResolvedValue({
      opportunities: [{ id: 'opp-9', title: 'Bet', score: 80 }],
    });
    apiMocks.getOpportunity.mockResolvedValue({ opportunity: { id: 'opp-9', title: 'Bet', score: 80 } });
    apiMocks.getOpportunityScoring.mockResolvedValue({
      scoring: { overallScore: 8, baseOverallScore: 8, criticalFailure: false, learning: { applied: [], ignored: [] }, dimensions: [] },
    });
    apiMocks.convertOpportunity.mockResolvedValue({ contentIdea: { id: 'idea-1', title: 'Bet idea' } });
    apiMocks.triageOpportunity.mockResolvedValue({ opportunity: { id: 'opp-9', title: 'Bet' } });
    renderOpps();

    fireEvent.click(await screen.findByText('Open opportunity'));
    fireEvent.click(await screen.findByText('Generate Draft'));
    expect(apiMocks.convertOpportunity).toHaveBeenCalledWith('opp-9');
    expect(
      await screen.findByText((_, el) => (el?.textContent ?? '').startsWith('Draft idea “Bet idea” created.')),
    ).toBeInTheDocument();
  });
});
