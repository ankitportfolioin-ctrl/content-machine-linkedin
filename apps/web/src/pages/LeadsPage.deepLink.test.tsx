import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LeadsPage } from './LeadsPage';

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

const { mockLeads } = vi.hoisted(() => ({
  mockLeads: [
    { id: 'lead-1', name: 'Dana Sellers', headline: 'VP Sales', company: 'SaaS company' },
    { id: 'lead-2', name: 'Evan Prospect' },
  ],
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listSalesLeads: vi.fn().mockResolvedValue({ leads: mockLeads }),
  };
});

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LeadsPage />
    </MemoryRouter>
  );
}

describe('LeadsPage deep-link (?leadId=)', () => {
  it('A. without leadId behaves exactly as before (list view, manual selection)', async () => {
    renderAt('/leads');
    await screen.findByText('Dana Sellers');
    expect(screen.getByText('Evan Prospect')).toBeInTheDocument();
    expect(screen.queryByText('← Back to leads')).toBeNull();
    expect(screen.getAllByText('View details').length).toBeGreaterThan(0);
  });

  it('B. ?leadId=<existing id> automatically opens that exact lead', async () => {
    renderAt('/leads?leadId=lead-1');
    await screen.findByText('← Back to leads');
    expect(screen.getByRole('heading', { name: 'Dana Sellers' })).toBeInTheDocument();
    // List view unmounts once the detail opens: no per-lead View details buttons.
    expect(screen.queryByText('View details')).toBeNull();
    // The other lead must not be selected or shown.
    expect(screen.queryByRole('heading', { name: 'Evan Prospect' })).toBeNull();
  });

  it('C. ?leadId=<unknown id> opens no other lead (normal list view)', async () => {
    renderAt('/leads?leadId=does-not-exist');
    await screen.findByText('Dana Sellers');
    expect(screen.queryByText('← Back to leads')).toBeNull();
    expect(screen.getAllByText('View details').length).toBeGreaterThan(0);
  });
});
