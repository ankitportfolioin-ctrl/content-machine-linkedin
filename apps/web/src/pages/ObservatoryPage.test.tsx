import { describe, it, expect, vi } from 'vitest';
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
  apiMocks: { listSources: vi.fn(), listTrends: vi.fn(), listGaps: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listSources: apiMocks.listSources,
    listTrends: apiMocks.listTrends,
    listGaps: apiMocks.listGaps,
  };
});

function renderObservatory() {
  apiMocks.listSources.mockResolvedValue({
    sources: [{ id: 's-1', url: 'https://example.com/feed', title: 'Example feed', status: 'ACTIVE' }],
  });
  apiMocks.listTrends.mockResolvedValue({
    trends: [{ id: 't-1', title: 'AI agents accelerate', description: 'Rising fast', strength: 82, status: 'TRENDING' }],
  });
  apiMocks.listGaps.mockResolvedValue({ gaps: [] });
  return render(
    <MemoryRouter initialEntries={['/observatory']}>
      <Routes>
        <Route path="/observatory" element={<ObservatoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ObservatoryPage', () => {
  it('shows live counts and filters the feed', async () => {
    renderObservatory();
    expect(await screen.findByText(/Monitoring 1 source · 1 trends · 0 gaps/)).toBeInTheDocument();
    expect(screen.getByText('AI agents accelerate')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Gaps' }));
    expect(await screen.findByText('No signals under this filter')).toBeInTheDocument();
  });
});
