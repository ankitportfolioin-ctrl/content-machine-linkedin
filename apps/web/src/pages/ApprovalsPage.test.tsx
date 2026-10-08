import { describe, it, expect, vi } from 'vitest';
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

describe('ApprovalsPage', () => {
  it('approves a submitted draft from the queue', async () => {
    apiMocks.listReviews.mockResolvedValue({
      reviews: [{ id: 'rev-1', draftId: 'draft-1', status: 'SUBMITTED', note: 'Carousel draft', createdAt: new Date().toISOString() }],
    });
    apiMocks.decideReview.mockResolvedValue({ review: { id: 'rev-1', status: 'APPROVED' } });
    render(
      <MemoryRouter initialEntries={['/approvals']}>
        <Routes>
          <Route path="/approvals" element={<ApprovalsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('1 item awaiting your decision. Nothing publishes without approval.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /approve review/i }));
    expect(apiMocks.decideReview).toHaveBeenCalledWith('rev-1', 'approve');
    expect(await screen.findByText('Approved. It leaves the queue.')).toBeInTheDocument();
  });

  it('shows an empty queue honestly', async () => {
    apiMocks.listReviews.mockResolvedValue({ reviews: [] });
    render(
      <MemoryRouter initialEntries={['/approvals']}>
        <Routes>
          <Route path="/approvals" element={<ApprovalsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Queue is empty')).toBeInTheDocument();
  });
});
