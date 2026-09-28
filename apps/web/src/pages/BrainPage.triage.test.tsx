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

const opportunity = { id: 'opp-1', title: 'Playbook opportunity', status: 'NEW' };

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    getIntelligenceOverview: vi.fn(),
    listOpportunities: vi.fn(),
    getOpportunity: vi.fn(),
    triageOpportunity: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getIntelligenceOverview: apiMocks.getIntelligenceOverview,
    listOpportunities: apiMocks.listOpportunities,
    getOpportunity: apiMocks.getOpportunity,
    triageOpportunity: apiMocks.triageOpportunity,
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

describe('BrainPage opportunity triage', () => {
  it('renders Review/Dismiss buttons and status filter defaulting to NEW', async () => {
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [opportunity], pagination: { total: 1 } });
    renderBrain();
    fireEvent.click(await screen.findByText('Opportunities'));

    const filter = await screen.findByLabelText('Filter by status');
    expect((filter as HTMLSelectElement).value).toBe('NEW');
    expect(await screen.findByText('Playbook opportunity')).toBeInTheDocument();
  });

  it('Mark reviewed calls the client and refreshes the visible status', async () => {
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [opportunity], pagination: { total: 1 } });
    apiMocks.getOpportunity.mockResolvedValue({ opportunity });
    apiMocks.triageOpportunity.mockImplementation(async (_id: string, status: string) => ({
      opportunity: { ...opportunity, status },
    }));
    await openDetail();

    expect(await screen.findByText('Mark reviewed')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Mark reviewed'));

    expect(apiMocks.triageOpportunity).toHaveBeenCalledWith('opp-1', 'REVIEWED');
    expect(await screen.findByText(/Marked as reviewed/)).toBeInTheDocument();
  });

  it('Dismiss calls the client with DISMISSED', async () => {
    apiMocks.listOpportunities.mockResolvedValue({ opportunities: [opportunity], pagination: { total: 1 } });
    apiMocks.getOpportunity.mockResolvedValue({ opportunity });
    apiMocks.triageOpportunity.mockImplementation(async (_id: string, status: string) => ({
      opportunity: { ...opportunity, status },
    }));
    await openDetail();

    fireEvent.click(await screen.findByText('Dismiss'));

    expect(apiMocks.triageOpportunity).toHaveBeenCalledWith('opp-1', 'DISMISSED');
    expect(await screen.findByText(/Dismissed\./)).toBeInTheDocument();
  });
});
