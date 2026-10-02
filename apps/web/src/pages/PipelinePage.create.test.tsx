import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PipelinePage } from './PipelinePage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'qa@example.com', name: 'QA' },
    token: 'test-token',
    workspaceId: 'ws-1',
    workspaces: [{ id: 'ws-1', name: 'WS' }],
    loading: false,
    error: null,
    isAuthenticated: true,
    login: async () => undefined,
    register: async () => undefined,
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => [],
  }),
}));

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    listPipeline: vi.fn(),
    createPipelineOpportunity: vi.fn(),
    listFollowUps: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listPipeline: apiMocks.listPipeline,
    createPipelineOpportunity: apiMocks.createPipelineOpportunity,
    updatePipelineOpportunity: vi.fn(),
    deletePipelineOpportunity: vi.fn(),
    listFollowUps: apiMocks.listFollowUps,
    listOutcomes: vi.fn(async () => ({ outcomeMetrics: [] })),
    createOutcome: vi.fn(),
    getAttributionForTarget: vi.fn(async () => ({})),
  };
});

describe('PipelinePage deal creation (S2 regression)', () => {
  it('sends a valid server stage instead of failing validation', async () => {
    apiMocks.listPipeline.mockResolvedValue({ opportunities: [] });
    apiMocks.listFollowUps.mockResolvedValue({ followUps: [] });
    apiMocks.createPipelineOpportunity.mockResolvedValue({
      opportunity: { id: 'opp-1', leadId: 'lead-1', name: 'Deal', stage: 'prospecting' },
    });

    render(
      <MemoryRouter initialEntries={['/pipeline']}>
        <PipelinePage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Lead ID'), { target: { value: 'lead-1' } });
    fireEvent.change(screen.getByPlaceholderText('Deal name'), { target: { value: 'Deal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add deal' }));

    await screen.findByText('Deal added.');
    expect(apiMocks.createPipelineOpportunity).toHaveBeenCalledWith({
      leadId: 'lead-1',
      name: 'Deal',
      stage: 'prospecting',
    });
  });
});
