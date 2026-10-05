import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrainPage } from './BrainPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 'test-token',
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

const cycleFixture = {
  cycleId: 'cycle-1',
  workspaceId: 'ws-1',
  status: 'COMPLETED',
  requestedAt: '2020-06-02T06:00:00.000Z',
  startedAt: '2020-06-02T06:00:01.000Z',
  completedAt: '2020-06-02T06:02:00.000Z',
  error: null,
  errorStage: null,
  correlationId: null,
  stages: [
    { stage: 'RESEARCH', status: 'SUCCEEDED', counts: { documentsNew: 2, opportunitiesCreated: 1 }, durationMs: 1200, error: null },
    { stage: 'DECISION', status: 'SUCCEEDED', counts: { rankedActions: 4, learningBoostedActions: 1 }, durationMs: 300, error: null },
    { stage: 'CONTENT', status: 'SUCCEEDED', counts: { ideasCreated: 1 }, durationMs: 200, error: null },
    { stage: 'SALES', status: 'SUCCEEDED', counts: { researched: 1, qualified: 1 }, durationMs: 200, error: null },
    { stage: 'APPROVAL', status: 'SUCCEEDED', counts: { pendingActions: 1 }, durationMs: 50, error: null },
    { stage: 'EXECUTION', status: 'SKIPPED', counts: { executedActions: 0 }, durationMs: 10, error: 'No authorized execution capability is currently available. Prepared items stay prepared.' },
    { stage: 'OBSERVE', status: 'SUCCEEDED', counts: { metricsAnalyzed: 0 }, durationMs: 40, error: null },
    { stage: 'LEARN', status: 'SUCCEEDED', counts: { proposalsCreated: 0 }, durationMs: 40, error: null },
  ],
  totals: {
    opportunities: 1, contentIdeas: 1, plans: 0, drafts: 0,
    salesSignals: 1, preparedActions: 0, observations: 0, learningSignals: 0,
  },
  blocked: [],
  skipped: ['EXECUTION: No authorized execution capability is currently available. Prepared items stay prepared.'],
  failures: [],
  approvalsRequired: ['APPROVAL: 1 actions pending'],
};

const actionFixture = {
  id: 'action-1',
  identityKey: 'content_opportunity:opp-1',
  kind: 'content_opportunity',
  subjectId: 'opp-1',
  title: 'Review opportunity: Checklist follow-ups',
  score: 77,
  reasons: [
    'Content opportunity scored 80 awaits review.',
    'Workspace-confirmed learning on evidence_strength supports this action.',
  ],
  evidenceLinks: [{ label: 'Opportunity', ref: 'contentOpportunity:opp-aaaabbbb' }],
  subjectMeta: { opportunityId: 'opp-1' },
  status: 'PENDING',
};

const explanationFixture = {
  explanation: {
    identityKey: 'content_opportunity:opp-1',
    kind: 'content_opportunity',
    title: 'Review opportunity: Checklist follow-ups',
    score: 77,
    status: 'PENDING',
    reasons: [
      'Content opportunity scored 80 awaits review.',
      'Workspace-confirmed learning on evidence_strength supports this action.',
    ],
    dimensions: [{ name: 'relevance', points: 20, maxPoints: 25, reason: 'High relevance score (80%).' }],
    evidenceLinks: [{ label: 'Opportunity', ref: 'contentOpportunity:opp-aaaabbbb' }],
    lifecycle: 'Pending operator decision',
    learningApplied: [
      { dimension: 'evidence_strength', adjustment: 0.08, reason: 'Measured uplift in fixture responses.', proposalId: 'prop-1' },
    ],
    subjectMeta: {},
    signalConfidence: 'HIGH',
    recommendationConfidence: 'MEDIUM',
    whyNot: ['No workspace objectives configured — ranked on signal strength alone'],
    nextAction: 'Review the opportunity and start a content idea.',
    requiredAuthorization: 'Human decision required — this item moves only on explicit approval, and approval never executes anything external.',
  },
};

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    listOperatorCycles: vi.fn(),
    getOperatorCycle: vi.fn(),
    triggerOperatorCycle: vi.fn(),
    listNextActions: vi.fn(),
    getExplanation: vi.fn(),
    listLearningProposals: vi.fn(),
    listPreparedActions: vi.fn(),
    getReadiness: vi.fn(),
    listOutcomes: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listOperatorCycles: apiMocks.listOperatorCycles,
    getOperatorCycle: apiMocks.getOperatorCycle,
    triggerOperatorCycle: apiMocks.triggerOperatorCycle,
    listNextActions: apiMocks.listNextActions,
    getExplanation: apiMocks.getExplanation,
    listLearningProposals: apiMocks.listLearningProposals,
    listPreparedActions: apiMocks.listPreparedActions,
    getReadiness: apiMocks.getReadiness,
    listOutcomes: apiMocks.listOutcomes,
  };
});

function mockConsoleBackend() {
  apiMocks.listOperatorCycles.mockResolvedValue({ cycles: [cycleFixture] });
  apiMocks.getOperatorCycle.mockResolvedValue({ cycle: cycleFixture });
  apiMocks.listNextActions.mockResolvedValue({ actions: [actionFixture], total: 1 });
  apiMocks.getExplanation.mockResolvedValue(explanationFixture);
  apiMocks.listLearningProposals.mockResolvedValue({ proposals: [] });
  apiMocks.listPreparedActions.mockResolvedValue({ preparedActions: [] });
  apiMocks.getReadiness.mockResolvedValue({ readiness: { platformExecution: [{ platform: 'LINKEDIN', displayName: 'LinkedIn', publishingReady: false }] } });
  apiMocks.listOutcomes.mockResolvedValue({ outcomeMetrics: [] });
}

async function openOperatorTab() {
  cleanup();
  render(
    <MemoryRouter initialEntries={['/brain']}>
      <BrainPage />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Operator' }));
}

async function panel(testId: string): Promise<HTMLElement> {
  return screen.findByTestId(testId);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockConsoleBackend();
});

describe('BrainPage Operator tab', () => {
  it('adds an Operator tab without removing existing tabs', async () => {
    cleanup();
    render(
      <MemoryRouter initialEntries={['/brain']}>
        <BrainPage />
      </MemoryRouter>
    );
    for (const label of ['Overview', 'Operator', 'Opportunities', 'Trends', 'Gaps', 'Learning']) {
      expect(await screen.findByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('renders the cycle summary with real totals and approvals', async () => {
    await openOperatorTab();
    const cycles = await panel('operator-section-cycles');
    expect(await within(cycles).findByText('Latest operator cycle')).toBeInTheDocument();
    expect(within(cycles).getByText('Opportunities')).toBeInTheDocument();
    expect(within(cycles).getByText('APPROVAL: 1 actions pending')).toBeInTheDocument();
  });

  it('renders the stage timeline with honest skip reasons and no fake progress', async () => {
    await openOperatorTab();
    const timeline = await panel('operator-cycle-timeline');
    expect(await within(timeline).findByText('Cycle timeline')).toBeInTheDocument();
    expect(within(timeline).getByText('Research')).toBeInTheDocument();
    expect(within(timeline).getByText('Execution boundary')).toBeInTheDocument();
    expect(within(timeline).getByText(/No authorized execution capability is currently available/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+%/);
  });

  it('shows an honest empty state when no cycles exist', async () => {
    apiMocks.listOperatorCycles.mockResolvedValue({ cycles: [] });
    await openOperatorTab();
    expect(await screen.findByText(/No operator cycles yet/)).toBeInTheDocument();
    expect(screen.getByText('Run operator cycle')).toBeInTheDocument();
  });

  it('Run operator cycle calls the idempotent trigger and reports status', async () => {
    apiMocks.triggerOperatorCycle.mockResolvedValue({ cycle: { ...cycleFixture, status: 'COMPLETED' } });
    await openOperatorTab();
    fireEvent.click(await screen.findByText('Run operator cycle'));
    expect(apiMocks.triggerOperatorCycle).toHaveBeenCalled();
    expect(await screen.findByText(/Cycle COMPLETED/)).toBeInTheDocument();
  });

  it('renders recommendation evidence with translated refs, distinct confidences, and learning objects', async () => {
    await openOperatorTab();
    expect(await screen.findByText('Top recommendations & evidence')).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Show evidence'));
    const recs = await panel('operator-recommendations');
    expect(await within(recs).findByText('Content opportunity (opp-aaaa…)')).toBeInTheDocument();
    expect(within(recs).getByText(/Evidence confidence:/)).toBeInTheDocument();
    expect(within(recs).getByText(/Recommendation confidence:/)).toBeInTheDocument();
    // Learning influence objects render as dimension + adjustment + reason — never [object Object].
    expect(within(recs).getByText(/evidence_strength \(\+0\.08\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('[object Object]');
    expect(within(recs).getByText(/Why not ranked higher/)).toBeInTheDocument();
    expect(within(recs).getByText(/Human decision required/)).toBeInTheDocument();
  });

  it('shows "No learning influence" when the explanation carries none', async () => {
    apiMocks.getExplanation.mockResolvedValue({
      explanation: { ...explanationFixture.explanation, learningApplied: [], whyNot: [] },
    });
    await openOperatorTab();
    fireEvent.click(await screen.findByText('Show evidence'));
    expect(await screen.findByText('No learning influence.')).toBeInTheDocument();
  });

  it('execution panel says Not executed and offers no Send button', async () => {
    await openOperatorTab();
    const exec = await panel('operator-section-execution');
    expect(await within(exec).findByText('Execution status')).toBeInTheDocument();
    expect(within(exec).getByText('Not executed.')).toBeInTheDocument();
    expect(screen.queryByText(/^Send$/)).toBeNull();
    expect(screen.queryByText(/Send message/)).toBeNull();
    expect(screen.queryByText(/Publish now/)).toBeNull();
  });

  it('observation panel says no live outcome when empty, renders rows when present', async () => {
    await openOperatorTab();
    const obs = await panel('operator-section-observations');
    expect(await within(obs).findByText('Observations')).toBeInTheDocument();
    expect(within(obs).getByText('No live outcome available.')).toBeInTheDocument();

    apiMocks.listOutcomes.mockResolvedValue({
      outcomeMetrics: [{ id: 'm-1', metricName: 'responses', metricValue: 11, unit: 'count', source: 'manual CRM entry', recordedAt: '2020-06-02T10:00:00.000Z' }],
    });
    cleanup();
    render(
      <MemoryRouter initialEntries={['/brain']}>
        <BrainPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Operator' }));
    const obs2 = await panel('operator-section-observations');
    // Name and value render in separate nodes (<strong> split: "responses" / ": 11 count").
    expect(await within(obs2).findByText('responses')).toBeInTheDocument();
    expect(within(obs2).getByText(': 11 count')).toBeInTheDocument();
    expect(within(obs2).getByText(/manual CRM entry/)).toBeInTheDocument();
  });

  it('learning panel distinguishes PROPOSED from CONFIRMED and states what changes next', async () => {
    apiMocks.listLearningProposals.mockResolvedValue({
      proposals: [
        {
          id: 'prop-9', dimension: 'relevance', observedPattern: 'Observed pattern fixture.',
          sampleSize: 2, proposedAdjustment: 0.05, reason: 'Fixture reason.',
          status: 'PROPOSED', maturity: 'HYPOTHESIS',
        },
      ],
    });
    await openOperatorTab();
    const learn = await panel('operator-section-learning');
    expect(await within(learn).findByText('Learning & what changes next')).toBeInTheDocument();
    expect(within(learn).getByText(/Human confirmation required/)).toBeInTheDocument();
    expect(within(learn).getByText('HYPOTHESIS')).toBeInTheDocument();
  });

  it('confirmed learning states its bounded future effect', async () => {
    apiMocks.listLearningProposals.mockResolvedValue({
      proposals: [
        {
          id: 'prop-1', dimension: 'evidence_strength', observedPattern: 'Measured uplift in fixture responses.',
          sampleSize: 6, proposedAdjustment: 0.08, reason: 'Fixture reason.',
          status: 'CONFIRMED', maturity: 'CONFIRMED', confirmedAt: '2020-06-02T09:00:00.000Z',
        },
      ],
    });
    await openOperatorTab();
    const learn = await panel('operator-section-learning');
    expect(await within(learn).findByText(/Future rankings touching “evidence_strength” may shift by \+0\.08/)).toBeInTheDocument();
    expect(within(learn).getAllByText('CONFIRMED')).toHaveLength(2);
  });

  it('cycle history lists persisted cycles and switches detail on select', async () => {
    const second = { ...cycleFixture, cycleId: 'cycle-0', status: 'PARTIAL', requestedAt: '2020-06-01T06:00:00.000Z' };
    apiMocks.listOperatorCycles.mockResolvedValue({ cycles: [cycleFixture, second] });
    apiMocks.getOperatorCycle.mockImplementation(async (id: string) => ({
      cycle: id === 'cycle-0' ? second : cycleFixture,
    }));
    await openOperatorTab();
    const history = await panel('operator-cycle-history');
    expect(await within(history).findByText('Cycle history')).toBeInTheDocument();
    fireEvent.click(within(history).getByText('2020-06-01 06:00'));
    expect(apiMocks.getOperatorCycle).toHaveBeenCalledWith('cycle-0');
    const summary = await panel('operator-cycle-summary');
    expect(await within(summary).findByText('PARTIAL')).toBeInTheDocument();
  });

  it('approval queue groups pending review work with deep links and no bypass buttons', async () => {
    apiMocks.listNextActions.mockResolvedValue({
      actions: [
        { ...actionFixture, id: 'a-review', kind: 'content_review', title: 'Review content draft for "Checklist post"' },
      ],
      total: 1,
    });
    apiMocks.listPreparedActions.mockResolvedValue({
      preparedActions: [{ id: 'pa-1', actionType: 'SEND_FIRST_MESSAGE', target: 'Fixture Lead', status: 'READY_FOR_AUTHORIZED_EXECUTION' }],
    });
    await openOperatorTab();
    const queue = await panel('operator-section-approvals');
    expect(await within(queue).findByText('Approval queue')).toBeInTheDocument();
    expect(within(queue).getByText(/Review content draft/)).toBeInTheDocument();
    expect(within(queue).getByText(/SEND_FIRST_MESSAGE/)).toBeInTheDocument();
    expect(within(queue).getByText(/READY_FOR_AUTHORIZED_EXECUTION/)).toBeInTheDocument();
    // Approval happens in workflow pages via links — the console approves nothing itself.
    expect(within(queue).getByText('Review')).toBeInTheDocument();
    expect(within(queue).queryByText('Approve')).toBeNull();
  });

  it('empty recommendations and empty learning render truthful empty states', async () => {
    apiMocks.listNextActions.mockResolvedValue({ actions: [], total: 0 });
    await openOperatorTab();
    expect(await screen.findByText('No recommendation passed the current eligibility rules.')).toBeInTheDocument();
    expect(await screen.findByText('Not enough evidence to produce a learning signal.')).toBeInTheDocument();
    expect(await screen.findByText('Nothing currently requires approval.')).toBeInTheDocument();
  });

  it('console layout stacks without fixed widths (mobile smoke test)', async () => {
    await openOperatorTab();
    const console_ = document.body;
    const fixedWidth = Array.from(console_.querySelectorAll('[style]')).filter((el) => {
      const style = (el as HTMLElement).style;
      return style.width !== '' && !style.width.includes('%') && style.width !== '100%';
    });
    expect(fixedWidth).toHaveLength(0);
    // Wrapping tab + action rows keep controls usable at narrow widths.
    expect(document.querySelector('[role="tablist"]')?.getAttribute('style')).toMatch(/flex-wrap/);
  });
});
