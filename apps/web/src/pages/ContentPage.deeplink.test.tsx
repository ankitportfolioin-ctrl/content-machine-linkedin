import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContentPage } from './ContentPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 't',
    workspaceId: 'ws-1',
    workspaces: [{ id: 'ws-1', name: 'WS' }],
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
  apiMocks: {
    listContentIdeas: vi.fn(),
    getContentIdea: vi.fn(),
    listPlans: vi.fn(),
    listWorkspaces: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listContentIdeas: apiMocks.listContentIdeas,
    getContentIdea: apiMocks.getContentIdea,
    listPlans: apiMocks.listPlans,
    listWorkspaces: apiMocks.listWorkspaces,
  };
});

function renderContent(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/content" element={<ContentPage />} />
        <Route path="/opportunities" element={<div>Opportunities page</div>} />
        <Route path="/settings" element={<div>Settings page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContentPage deep link (Stage 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listWorkspaces.mockResolvedValue({ workspaces: [{ id: 'ws-1', name: 'WS' }] });
    apiMocks.listPlans.mockResolvedValue({ plans: [] });
  });

  it('opens the exact idea from ?idea= with its opportunity provenance', async () => {
    apiMocks.getContentIdea.mockResolvedValue({
      contentIdea: { id: 'idea-7', title: 'Pricing pages', description: 'Notes', opportunityId: 'opp-9' },
    });
    renderContent('/content?idea=idea-7');
    expect(await screen.findByText('Pricing pages')).toBeInTheDocument();
    expect(apiMocks.getContentIdea).toHaveBeenCalledWith('idea-7');
    const backlink = await screen.findByRole('link', { name: 'view the evidence' });
    expect(backlink.getAttribute('href')).toBe('/opportunities?selected=opp-9');
  });

  it('selecting an idea sets ?idea= and Back clears it', async () => {
    apiMocks.listContentIdeas.mockResolvedValue({
      contentIdeas: [{ id: 'idea-7', title: 'Pricing pages' }],
    });
    apiMocks.getContentIdea.mockResolvedValue({
      contentIdea: { id: 'idea-7', title: 'Pricing pages' },
    });
    renderContent('/content');
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByText('Generate a content plan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to ideas/i }));
    expect(await screen.findByText('Pricing pages')).toBeInTheDocument();
  });
});
