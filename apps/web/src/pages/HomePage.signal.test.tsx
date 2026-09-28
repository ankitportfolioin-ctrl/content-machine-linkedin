import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const signalAction = {
  id: 'action-sig-1',
  identityKey: 'sales_content_signal:signal-1',
  kind: 'sales_content_signal',
  subjectId: 'signal-1',
  title: 'Turn signal into content: "Playbook for shorter cycles"',
  score: 60,
  reasons: ['Recorded sales signal (problem_content) across 2 conversation(s).'],
  evidenceLinks: [],
  subjectMeta: { signalId: 'signal-1', signalType: 'problem_content' },
  status: 'PENDING',
};

const gapAction = {
  id: 'action-gap-1',
  identityKey: 'content_gap:gap-1',
  kind: 'content_gap',
  subjectId: 'gap-1',
  title: 'Fill content gap',
  score: 55,
  reasons: ['Recorded content gap.'],
  evidenceLinks: [],
  subjectMeta: {},
  status: 'PENDING',
};

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    listNextActions: vi.fn(),
    startIdeaFromAction: vi.fn(),
    checkHealth: vi.fn(),
    checkReady: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listNextActions: apiMocks.listNextActions,
    startIdeaFromAction: apiMocks.startIdeaFromAction,
    checkHealth: apiMocks.checkHealth,
    checkReady: apiMocks.checkReady,
  };
});

function ShowContent() {
  return <div>Content page</div>;
}

function renderHome(actions: unknown[]) {
  apiMocks.listNextActions.mockResolvedValue({ actions, total: actions.length });
  apiMocks.checkHealth.mockResolvedValue({ status: 'healthy' });
  apiMocks.checkReady.mockResolvedValue({ status: 'ready' });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/content" element={<ShowContent />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage sales-signal Start idea', () => {
  it('signal cards render Start idea and successful initiation navigates to Content', async () => {
    apiMocks.startIdeaFromAction.mockResolvedValue({
      idea: { id: 'idea-1', title: 'Address signal' },
      action: { id: 'action-sig-1' },
    });
    renderHome([signalAction]);

    await screen.findByText(/Playbook for shorter cycles/);
    fireEvent.click(screen.getByText('Show details'));
    fireEvent.click(await screen.findByText('Start idea'));

    expect(apiMocks.startIdeaFromAction).toHaveBeenCalledWith('action-sig-1');
    expect(await screen.findByText('Content page')).toBeInTheDocument();
  });

  it('unrelated kinds gain no Start idea button', async () => {
    renderHome([gapAction]);

    await screen.findByText(/Fill content gap/);
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.queryByText('Start idea')).toBeNull();
    expect(screen.queryByText('Research prospect')).toBeNull();
  });
});
