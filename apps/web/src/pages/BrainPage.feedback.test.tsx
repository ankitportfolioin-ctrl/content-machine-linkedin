import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrainPage } from './BrainPage';

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
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => undefined,
  }),
}));

const opportunity = { id: 'opp-1', title: 'Playbook opportunity' };

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    getIntelligenceOverview: vi.fn(),
    listOpportunities: vi.fn(),
    getOpportunity: vi.fn(),
    submitOpportunityFeedback: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getIntelligenceOverview: apiMocks.getIntelligenceOverview,
    listOpportunities: apiMocks.listOpportunities,
    getOpportunity: apiMocks.getOpportunity,
    submitOpportunityFeedback: apiMocks.submitOpportunityFeedback,
  };
});

function renderBrain() {
  apiMocks.getIntelligenceOverview.mockResolvedValue({ overview: {} });
  return render(
    <MemoryRouter initialEntries={['/brain']}>
      <BrainPage />
    </MemoryRouter>
  );
}

async function openDetail() {
  renderBrain();
  fireEvent.click(await screen.findByText('Opportunities'));
  await screen.findByText('Playbook opportunity');
  fireEvent.click(screen.getByText('View details'));
}

describe('BrainPage opportunity feedback', () => {
  it('renders counts, types, and reasons', async () => {
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [opportunity], pagination: { total: 1 } });
    apiMocks.getOpportunity.mockResolvedValue({
      opportunity,
      feedbackSummary: {
        total: 3,
        counts: { USEFUL: 1, NOT_USEFUL: 0, ALREADY_COVERED: 0, WRONG_AUDIENCE: 2, WEAK_EVIDENCE: 0, NOT_TIMELY: 0 },
        reasons: [{ feedback: 'WRONG_AUDIENCE', reason: 'Too generic.', createdAt: '2026-09-20T00:00:00.000Z' }],
      },
    });
    await openDetail();

    expect(await screen.findByText('Workspace feedback')).toBeInTheDocument();
    expect(screen.getByText('Feedback: 3')).toBeInTheDocument();
    expect(screen.getByText('1× Useful')).toBeInTheDocument();
    expect(screen.getByText('2× Wrong audience')).toBeInTheDocument();
    expect(screen.getByText('Too generic.')).toBeInTheDocument();
  });

  it('renders an honest empty state with zero feedback', async () => {
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [opportunity], pagination: { total: 1 } });
    apiMocks.getOpportunity.mockResolvedValue({
      opportunity,
      feedbackSummary: {
        total: 0,
        counts: { USEFUL: 0, NOT_USEFUL: 0, ALREADY_COVERED: 0, WRONG_AUDIENCE: 0, WEAK_EVIDENCE: 0, NOT_TIMELY: 0 },
        reasons: [],
      },
    });
    await openDetail();

    expect(await screen.findByText('No feedback recorded yet.')).toBeInTheDocument();
    expect(screen.queryByText(/× Useful/)).toBeNull();
  });

  it('refreshes the summary after a vote', async () => {
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [opportunity], pagination: { total: 1 } });
    const empty = {
      opportunity,
      feedbackSummary: {
        total: 0,
        counts: { USEFUL: 0, NOT_USEFUL: 0, ALREADY_COVERED: 0, WRONG_AUDIENCE: 0, WEAK_EVIDENCE: 0, NOT_TIMELY: 0 },
        reasons: [],
      },
    };
    const voted = {
      opportunity,
      feedbackSummary: {
        total: 1,
        counts: { USEFUL: 1, NOT_USEFUL: 0, ALREADY_COVERED: 0, WRONG_AUDIENCE: 0, WEAK_EVIDENCE: 0, NOT_TIMELY: 0 },
        reasons: [],
      },
    };
    apiMocks.getOpportunity.mockResolvedValueOnce(empty).mockResolvedValueOnce(voted);
    apiMocks.submitOpportunityFeedback.mockResolvedValue({ feedback: { id: 'fb-1' } });
    await openDetail();

    expect(await screen.findByText('No feedback recorded yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Useful'));

    expect(apiMocks.submitOpportunityFeedback).toHaveBeenCalledWith('opp-1', 'useful', undefined);
    expect(await screen.findByText('Feedback: 1')).toBeInTheDocument();
    expect(screen.queryByText('No feedback recorded yet.')).toBeNull();
  });
});
