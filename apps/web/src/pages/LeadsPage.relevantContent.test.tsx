import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    listSalesLeads: vi.fn(),
    listOutreachStrategies: vi.fn(),
    listRelevantContent: vi.fn(),
    createOutreachStrategy: vi.fn(),
  },
}));

const lead = { id: 'lead-1', name: 'Dana Sellers', headline: 'VP Sales', company: 'SaaS company' };

const suggestion = {
  ideaId: 'idea-1',
  title: 'Playbook angles',
  topicId: 'topic-1',
  topicName: 'SaaS sales playbook',
  relevance: 0.82,
  reason: 'Recorded topic "SaaS sales playbook" fits Dana Sellers (relevance 82%).',
};

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listSalesLeads: apiMocks.listSalesLeads,
    listOutreachStrategies: apiMocks.listOutreachStrategies,
    listRelevantContent: apiMocks.listRelevantContent,
    createOutreachStrategy: apiMocks.createOutreachStrategy,
  };
});

function renderLeads() {
  return render(
    <MemoryRouter initialEntries={['/leads']}>
      <LeadsPage />
    </MemoryRouter>
  );
}

async function openLeadDetail() {
  renderLeads();
  await screen.findByText('Dana Sellers');
  fireEvent.click(screen.getAllByText('View details')[0]!);
}

describe('LeadsPage relevant-content suggestions', () => {
  it('renders suggestions and selection populates relevantContentId/contentReason', async () => {
    apiMocks.listSalesLeads.mockResolvedValue({ leads: [lead] });
    apiMocks.listOutreachStrategies.mockResolvedValue({ strategies: [] });
    apiMocks.listRelevantContent.mockResolvedValue({ suggestions: [suggestion] });
    apiMocks.createOutreachStrategy.mockImplementation(async (input: Record<string, unknown>) => ({
      strategy: {
        id: 'strategy-1',
        objective: input['objective'],
        status: 'DRAFT',
        relevantContentId: input['relevantContentId'] ?? null,
        contentReason: input['contentReason'] ?? null,
      },
    }));

    await openLeadDetail();

    await screen.findByText('Suggested content for this prospect');
    expect(screen.getByText('Playbook angles')).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.textContent === 'SaaS sales playbook · relevance 82%')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Select'));
    expect(await screen.findByText(/Selected content:/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Goal (e.g. intro call)'), { target: { value: 'Intro call' } });
    fireEvent.change(screen.getByPlaceholderText('Audience'), { target: { value: 'Sales leaders' } });
    fireEvent.change(screen.getByPlaceholderText('Angle'), { target: { value: 'Playbook fit' } });
    fireEvent.change(screen.getByPlaceholderText('Why contact now?'), { target: { value: 'Fit is timely.' } });
    fireEvent.click(screen.getByText('Create outreach plan'));

    expect(apiMocks.createOutreachStrategy).toHaveBeenCalledWith(
      expect.objectContaining({ relevantContentId: 'idea-1', contentReason: suggestion.reason })
    );
    // Strategy stays DRAFT: no auto-submit, no auto-approve.
    expect(await screen.findByText('DRAFT')).toBeInTheDocument();
  });

  it('renders an honest empty state and creates plans without content linkage', async () => {
    apiMocks.listSalesLeads.mockResolvedValue({ leads: [lead] });
    apiMocks.listOutreachStrategies.mockResolvedValue({ strategies: [] });
    apiMocks.listRelevantContent.mockResolvedValue({ suggestions: [] });
    apiMocks.createOutreachStrategy.mockImplementation(async (input: Record<string, unknown>) => ({
      strategy: { id: 'strategy-2', objective: input['objective'], status: 'DRAFT' },
    }));

    await openLeadDetail();

    await screen.findByText('No relevant content recorded for this prospect yet.');
    expect(screen.queryByText('Select')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Goal (e.g. intro call)'), { target: { value: 'Intro call' } });
    fireEvent.change(screen.getByPlaceholderText('Audience'), { target: { value: 'Sales leaders' } });
    fireEvent.change(screen.getByPlaceholderText('Angle'), { target: { value: 'Playbook fit' } });
    fireEvent.change(screen.getByPlaceholderText('Why contact now?'), { target: { value: 'Fit is timely.' } });
    fireEvent.click(screen.getByText('Create outreach plan'));

    const call = apiMocks.createOutreachStrategy.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call['relevantContentId']).toBeUndefined();
    expect(await screen.findByText('DRAFT')).toBeInTheDocument();
  });
});
