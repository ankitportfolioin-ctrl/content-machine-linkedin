import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('OpportunitiesPage convert handoff (Stage 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listOpportunities.mockResolvedValue({
      opportunities: [{ id: 'opp-9', title: 'Bet', score: 80 }],
    });
    apiMocks.getOpportunity.mockResolvedValue({ opportunity: { id: 'opp-9', title: 'Bet', score: 80 } });
    apiMocks.getOpportunityScoring.mockResolvedValue({
      scoring: { overallScore: 8, baseOverallScore: 8, criticalFailure: false, learning: { applied: [], ignored: [] }, dimensions: [] },
    });
    apiMocks.convertOpportunity.mockResolvedValue({ contentIdea: { id: 'idea-7', title: 'Bet idea' } });
  });

  it('links the created idea directly in Content', async () => {
    render(
      <MemoryRouter initialEntries={['/opportunities?selected=opp-9']}>
        <Routes>
          <Route path="/opportunities" element={<OpportunitiesPage />} />
          <Route path="/content" element={<div>Content page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Generate Draft' }));
    const link = await screen.findByRole('link', { name: 'Open idea in Content' });
    expect(link.getAttribute('href')).toBe('/content?idea=idea-7');
  });
});
