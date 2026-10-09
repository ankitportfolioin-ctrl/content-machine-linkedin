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

describe('CalendarPage honesty (Stage 3)', () => {
  it('frames plans as a status pipeline and discloses that scheduling is unavailable', async () => {
    apiMocks.listPlans.mockResolvedValue({
      plans: [{ id: 'p-1', thesis: 'Ship one project', status: 'DRAFT', contentIdeaId: 'idea-1' }],
    });
    render(
      <MemoryRouter initialEntries={['/calendar']}>
        <Routes>
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/content" element={<div>Content page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Content Pipeline', { selector: '.display-title' })).toBeInTheDocument();
    expect(screen.getByText('Ship one project')).toBeInTheDocument();
    expect(screen.getByText(/Scheduling is not available/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Content' })).toHaveAttribute('href', '/content?idea=idea-1');
  });

  it('is honest about scheduling in the empty state', async () => {
    apiMocks.listPlans.mockResolvedValue({ plans: [] });
    render(
      <MemoryRouter initialEntries={['/calendar']}>
        <Routes>
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/opportunities" element={<div>Opportunities page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('No plans yet')).toBeInTheDocument();
    expect(screen.getByText(/scheduling is not available/i)).toBeInTheDocument();
  });
});
