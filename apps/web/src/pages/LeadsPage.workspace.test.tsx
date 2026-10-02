import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LeadsPage } from './LeadsPage';

const authState = vi.hoisted(() => ({
  workspaceId: 'ws-a' as string | null,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'qa@example.com', name: 'QA' },
    token: 'test-token',
    workspaceId: authState.workspaceId,
    workspaces: [
      { id: 'ws-a', name: 'A' },
      { id: 'ws-b', name: 'B' },
    ],
    loading: false,
    error: null,
    isAuthenticated: true,
    login: async () => undefined,
    register: async () => undefined,
    logout: () => undefined,
    selectWorkspace: (id: string) => {
      authState.workspaceId = id;
    },
    refreshWorkspaces: async () => undefined,
  }),
}));

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    listSalesLeads: vi.fn(),
    discoverProspect: vi.fn(),
    createSalesLead: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listSalesLeads: apiMocks.listSalesLeads,
    discoverProspect: apiMocks.discoverProspect,
    createSalesLead: apiMocks.createSalesLead,
  };
});

function renderLeads() {
  return render(
    <MemoryRouter initialEntries={['/leads']}>
      <LeadsPage />
    </MemoryRouter>,
  );
}

describe('LeadsPage workspace-switch regression (F6)', () => {
  it('refetches the list when the workspace changes instead of showing stale leads', async () => {
    authState.workspaceId = 'ws-a';
    apiMocks.listSalesLeads.mockResolvedValue({
      leads: [{ id: 'lead-a', name: 'Rahul Sharma', headline: 'Founder', company: 'A-Corp', status: 'NEW' }],
    });
    const { rerender } = renderLeads();
    expect(await screen.findByText('Rahul Sharma')).toBeInTheDocument();
    expect(apiMocks.listSalesLeads).toHaveBeenCalledTimes(1);

    apiMocks.listSalesLeads.mockResolvedValue({
      leads: [{ id: 'lead-b', name: 'Priya Nair', headline: 'Growth', company: 'B-Corp', status: 'NEW' }],
    });
    authState.workspaceId = 'ws-b';
    await act(async () => {
      rerender(
        <MemoryRouter initialEntries={['/leads']}>
          <LeadsPage />
        </MemoryRouter>,
      );
    });

    expect(await screen.findByText('Priya Nair')).toBeInTheDocument();
    expect(screen.queryByText('Rahul Sharma')).not.toBeInTheDocument();
    expect(apiMocks.listSalesLeads).toHaveBeenCalledTimes(2);
  });

  it('does not fetch or show an error when no workspace is selected (R202610011556-D-002)', async () => {
    authState.workspaceId = null;
    apiMocks.listSalesLeads.mockClear();
    renderLeads();
    expect(await screen.findByText('No workspaces yet')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(apiMocks.listSalesLeads).not.toHaveBeenCalled();
    authState.workspaceId = 'ws-a';
  });
});
