import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TrendsPage } from './TrendsPage';

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
  apiMocks: { listTrends: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, listTrends: apiMocks.listTrends };
});

describe('TrendsPage', () => {
  it('renders momentum with scores', async () => {
    apiMocks.listTrends.mockResolvedValue({
      trends: [{ id: 't-1', title: 'Vibe coding tools', description: 'Sustained growth', strength: 76, status: 'RELEVANT' }],
    });
    render(
      <MemoryRouter initialEntries={['/trends']}>
        <Routes>
          <Route path="/trends" element={<TrendsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Vibe coding tools')).toBeInTheDocument();
    expect(screen.getByText('1 tracked trend by momentum.')).toBeInTheDocument();
  });

  it('refuses to invent trends when none were measured', async () => {
    apiMocks.listTrends.mockResolvedValue({ trends: [] });
    render(
      <MemoryRouter initialEntries={['/trends']}>
        <Routes>
          <Route path="/trends" element={<TrendsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('No trends yet')).toBeInTheDocument();
  });
});
