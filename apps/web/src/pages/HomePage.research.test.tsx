import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './HomePage';

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

const relevanceAction = {
  id: 'action-rel-1',
  identityKey: 'prospect_relevance:topic-1:lead-9',
  kind: 'prospect_relevance',
  subjectId: 'lead-9',
  title: 'Review fit for Dana Sellers',
  score: 82,
  reasons: ['Recorded evidence indicates topic fit.'],
  evidenceLinks: [],
  subjectMeta: { topicId: 'topic-1', leadId: 'lead-9' },
  status: 'PENDING',
};

const objectionAction = {
  id: 'action-obj-1',
  identityKey: 'objection_pattern:abc123',
  kind: 'objection_pattern',
  subjectId: null,
  title: 'Address recurring objection across 2 conversations',
  score: 70,
  reasons: ['Recurring objection across 2 recorded conversation(s).'],
  evidenceLinks: [],
  subjectMeta: {},
  status: 'PENDING',
};

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    listNextActions: vi.fn(),
    researchProspectFromAction: vi.fn(),
    checkHealth: vi.fn(),
    checkReady: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listNextActions: apiMocks.listNextActions,
    researchProspectFromAction: apiMocks.researchProspectFromAction,
    checkHealth: apiMocks.checkHealth,
    checkReady: apiMocks.checkReady,
  };
});

function ShowSearch() {
  const { search } = useLocation();
  return <div data-testid="leads-search">{search}</div>;
}

function renderHome(actions: unknown[]) {
  apiMocks.listNextActions.mockResolvedValue({ actions, total: actions.length });
  apiMocks.checkHealth.mockResolvedValue({ status: 'healthy' });
  apiMocks.checkReady.mockResolvedValue({ status: 'ready' });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/leads" element={<ShowSearch />} />
        <Route path="/content" element={<div>Content page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage Research prospect navigation', () => {
  it('D. success navigates to /leads with the exact leadId from the response', async () => {
    apiMocks.researchProspectFromAction.mockResolvedValue({
      research: { id: 'research-1', leadId: 'lead-9' },
      action: { id: 'action-rel-1' },
    });
    renderHome([relevanceAction]);

    await screen.findByText(/Review fit for Dana Sellers/);
    fireEvent.click(screen.getByText('Show details'));
    fireEvent.click(await screen.findByText('Research prospect'));

    expect(apiMocks.researchProspectFromAction).toHaveBeenCalledWith('action-rel-1');
    const search = await screen.findByTestId('leads-search');
    expect(search.textContent).toBe('?leadId=lead-9');
  });

  it('E. objection-pattern cards keep Start idea and gain no Research prospect', async () => {
    renderHome([objectionAction]);

    await screen.findByText(/Address recurring objection across 2 conversations/);
    fireEvent.click(screen.getByText('Show details'));
    expect(await screen.findByText('Start idea')).toBeInTheDocument();
    expect(screen.queryByText('Research prospect')).toBeNull();
  });
});
