import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LearningPage } from './LearningPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'a@example.com', name: 'Ada' },
    token: 't',
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

const apiMocks = vi.hoisted(() => ({
  getLearningDashboard: vi.fn(),
  listExperiments: vi.fn(),
  listLearningProposals: vi.fn(),
  confirmLearningProposal: vi.fn(),
  rejectLearningProposal: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getLearningDashboard: apiMocks.getLearningDashboard,
    listExperiments: apiMocks.listExperiments,
    listLearningProposals: apiMocks.listLearningProposals,
    confirmLearningProposal: apiMocks.confirmLearningProposal,
    rejectLearningProposal: apiMocks.rejectLearningProposal,
  };
});

const PROPOSAL = {
  id: 'p-1',
  dimension: 'relevance',
  observedPattern: 'Checklist topics convert.',
  maturity: 'HYPOTHESIS',
  evidenceCount: 2,
  sampleSize: 5,
  proposedAdjustment: 0.08,
  reason: 'Seeded test learning.',
  status: 'PROPOSED',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LearningPage />
    </MemoryRouter>
  );
}

describe('LearningPage proposal confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getLearningDashboard.mockResolvedValue({
      whatWeKnow: [],
      whatWeThink: [],
      whatWeAreTesting: [],
      whatWeDontKnow: [],
    });
    apiMocks.listExperiments.mockResolvedValue({ experiments: [] });
    apiMocks.listLearningProposals.mockResolvedValue({ proposals: [PROPOSAL] });
  });

  it('shows what confirmation changes and confirms through the real API', async () => {
    apiMocks.confirmLearningProposal.mockResolvedValue({ proposal: { ...PROPOSAL, status: 'CONFIRMED' } });
    apiMocks.listLearningProposals
      .mockResolvedValueOnce({ proposals: [PROPOSAL] })
      .mockResolvedValue({ proposals: [] });
    renderPage();
    expect(await screen.findByText('Needs your confirmation')).toBeInTheDocument();
    expect(screen.getByText(/Checklist topics convert/)).toBeInTheDocument();
    expect(screen.getByText(/lets this learning adjust future recommendation ranking/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm learning' }));
    await waitFor(() => expect(apiMocks.confirmLearningProposal).toHaveBeenCalledWith('p-1'));
    await waitFor(() => expect(screen.getByText('Nothing awaiting confirmation.')).toBeInTheDocument());
  });

  it('rejects through the real API and surfaces failures honestly', async () => {
    apiMocks.rejectLearningProposal.mockResolvedValue({ proposal: { ...PROPOSAL, status: 'REJECTED' } });
    apiMocks.listLearningProposals
      .mockResolvedValueOnce({ proposals: [PROPOSAL] })
      .mockResolvedValue({ proposals: [] });
    renderPage();
    await screen.findByText('Needs your confirmation');
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(apiMocks.rejectLearningProposal).toHaveBeenCalledWith('p-1'));
  });

  it('shows INSUFFICIENT_DATA honesty when nothing is proposed', async () => {
    apiMocks.listLearningProposals.mockResolvedValue({ proposals: [] });
    renderPage();
    expect(await screen.findByText('Nothing awaiting confirmation.')).toBeInTheDocument();
    expect(screen.getByText('Insufficient data: no confirmed patterns yet.')).toBeInTheDocument();
  });
});
