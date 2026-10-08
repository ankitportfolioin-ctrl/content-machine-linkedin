import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CalendarPage } from './CalendarPage';

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
  apiMocks: { listPlans: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, listPlans: apiMocks.listPlans };
});

describe('CalendarPage', () => {
  it('groups plans by pipeline status', async () => {
    apiMocks.listPlans.mockResolvedValue({
      plans: [
        { id: 'p-1', thesis: 'Ship one project', status: 'DRAFT' },
        { id: 'p-2', thesis: 'Carousel teardown', status: 'APPROVED' },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/calendar']}>
        <Routes>
          <Route path="/calendar" element={<CalendarPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Ship one project')).toBeInTheDocument();
    expect(screen.getByText('Carousel teardown')).toBeInTheDocument();
    expect(screen.getByText('Draft plans (1)')).toBeInTheDocument();
    expect(screen.getByText('Approved (1)')).toBeInTheDocument();
  });
});
