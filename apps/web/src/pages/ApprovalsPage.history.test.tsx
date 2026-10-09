import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApprovalsPage } from './ApprovalsPage';

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
  apiMocks: { listReviews: vi.fn(), decideReview: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, listReviews: apiMocks.listReviews, decideReview: apiMocks.decideReview };
});

function renderApprovals() {
  return render(
    <MemoryRouter initialEntries={['/approvals']}>
      <Routes>
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/content" element={<div>Content page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ApprovalsPage history and reasons (Stage 4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.decideReview.mockResolvedValue({ review: { id: 'rev-1', status: 'APPROVED' } });
  });

  it('keeps decided items in a visible history with the recorded reason', async () => {
    apiMocks.listReviews.mockResolvedValue({
      reviews: [
        { id: 'rev-1', draftId: 'draft-1', status: 'SUBMITTED', createdAt: new Date().toISOString() },
        { id: 'rev-0', draftId: 'draft-0', status: 'APPROVED', decision: 'approve', note: 'Tone matches voice', createdAt: new Date().toISOString() },
      ],
    });
    renderApprovals();
    expect(await screen.findByText(/1 item awaiting your decision/)).toBeInTheDocument();
    expect(await screen.findByText('Decision history (1)')).toBeInTheDocument();
    expect(screen.getByText('Tone matches voice')).toBeInTheDocument();
  });

  it('records an optional reason with the decision', async () => {
    apiMocks.listReviews.mockResolvedValue({
      reviews: [{ id: 'rev-1', draftId: 'draft-1', status: 'SUBMITTED', createdAt: new Date().toISOString() }],
    });
    renderApprovals();
    fireEvent.change(
      await screen.findByLabelText('Decision reason for review rev-1'),
      { target: { value: 'Needs a stronger hook' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    expect(apiMocks.decideReview).toHaveBeenCalledWith('rev-1', 'request_changes', 'Needs a stronger hook');
  });

  it('hides history when nothing was decided yet', async () => {
    apiMocks.listReviews.mockResolvedValue({
      reviews: [{ id: 'rev-1', draftId: 'draft-1', status: 'SUBMITTED', createdAt: new Date().toISOString() }],
    });
    renderApprovals();
    expect(await screen.findByText(/1 item awaiting your decision/)).toBeInTheDocument();
    expect(screen.queryByText(/Decision history/)).not.toBeInTheDocument();
  });
});
