import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrainPage } from '../pages/BrainPage';

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

// Golden fixtures mirror the EXACT backend response shapes proven by the API
// integration suites (operatorCycle.test.ts, closedLoop.test.ts): the cycle
// result contract, the explanation contract (learningApplied as objects),
// the learning proposal contract, and the outcome metric contract. They are
// test doubles of real payloads — no backend state is invented here.

const goldenCycle = {
  cycleId: 'cycle-golden',
  workspaceId: 'ws-1',
  status: 'COMPLETED',
  requestedAt: '2020-06-02T06:00:00.000Z',
  startedAt: '2020-06-02T06:00:01.000Z',
  completedAt: '2020-06-02T06:02:00.000Z',
  error: null,
  errorStage: null,
  correlationId: 'corr-golden',
  stages: [
    { stage: 'RESEARCH', status: 'SUCCEEDED', counts: { documentsNew: 2, opportunitiesCreated: 1 }, durationMs: 1200, error: null },
    { stage: 'DECISION', status: 'SUCCEEDED', counts: { rankedActions: 4, learningBoostedActions: 1 }, durationMs: 300, error: null },
    { stage: 'CONTENT', status: 'SUCCEEDED', counts: { ideasCreated: 1, skippedNoAI: 1 }, durationMs: 200, error: 'AI unavailable: plans and drafts deferred (no prose invented).' },
    { stage: 'SALES', status: 'SUCCEEDED', counts: { researched: 1, qualified: 1 }, durationMs: 200, error: null },
    { stage: 'APPROVAL', status: 'SUCCEEDED', counts: { pendingActions: 0, submittedContentReviews: 1 }, durationMs: 50, error: null },
    { stage: 'EXECUTION', status: 'SKIPPED', counts: { executedActions: 0 }, durationMs: 10, error: 'No authorized execution capability is currently available. Prepared items stay prepared.' },
    { stage: 'OBSERVE', status: 'SUCCEEDED', counts: { metricsAnalyzed: 1 }, durationMs: 40, error: null },
    { stage: 'LEARN', status: 'SUCCEEDED', counts: { proposalsCreated: 1 }, durationMs: 40, error: null },
  ],
  totals: {
    opportunities: 1, contentIdeas: 1, plans: 0, drafts: 0,
    salesSignals: 1, preparedActions: 0, observations: 1, learningSignals: 1,
  },
  blocked: [],
  skipped: ['EXECUTION: No authorized execution capability is currently available.'],
  failures: [],
  approvalsRequired: ['APPROVAL: 1 content reviews pending'],
};

const goldenAction = {
  id: 'action-golden',
  identityKey: 'content_opportunity:opp-golden',
  kind: 'content_opportunity',
  subjectId: 'opp-golden',
  title: 'Review opportunity: Checklist follow-ups',
  score: 77,
  reasons: [
    'Content opportunity scored 80 awaits review.',
    'Workspace-confirmed learning on evidence_strength supports this action.',
  ],
  evidenceLinks: [
    { label: 'Opportunity', ref: 'contentOpportunity:opp-golden' },
    { label: 'Claim', ref: 'claim:claim-golden' },
  ],
  subjectMeta: { opportunityId: 'opp-golden' },
  status: 'PENDING',
};

const goldenExplanation = {
  explanation: {
    identityKey: 'content_opportunity:opp-golden',
    kind: 'content_opportunity',
    title: 'Review opportunity: Checklist follow-ups',
    score: 77,
    status: 'PENDING',
    reasons: [
      'Content opportunity scored 80 awaits review.',
      'Workspace-confirmed learning on evidence_strength supports this action.',
    ],
    dimensions: [{ name: 'relevance', points: 20, maxPoints: 25, reason: 'High relevance score (80%).' }],
    evidenceLinks: [
      { label: 'Opportunity', ref: 'contentOpportunity:opp-golden' },
      { label: 'Claim', ref: 'claim:claim-golden' },
    ],
    lifecycle: 'Pending operator decision',
    learningApplied: [
      { dimension: 'evidence_strength', adjustment: 0.08, reason: 'Measured uplift in fixture responses.', proposalId: 'prop-golden' },
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

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  apiMocks.listOperatorCycles.mockResolvedValue({ cycles: [goldenCycle] });
  apiMocks.getOperatorCycle.mockResolvedValue({ cycle: goldenCycle });
  apiMocks.listNextActions.mockResolvedValue({ actions: [goldenAction], total: 1 });
  apiMocks.getExplanation.mockResolvedValue(goldenExplanation);
  apiMocks.listLearningProposals.mockResolvedValue({
    proposals: [
      {
        id: 'prop-golden', dimension: 'evidence_strength',
        observedPattern: 'Observed pattern (not causal): fixture responses differ by segment.',
        sampleSize: 6, denominator: 6, proposedAdjustment: 0.08,
        reason: 'Fixture reason.', confidence: 0.5,
        status: 'CONFIRMED', maturity: 'CONFIRMED', confirmedAt: '2020-06-02T09:00:00.000Z',
      },
    ],
  });
  apiMocks.listPreparedActions.mockResolvedValue({ preparedActions: [] });
  apiMocks.getReadiness.mockResolvedValue({ readiness: { platformExecution: [{ platform: 'LINKEDIN', displayName: 'LinkedIn', publishingReady: false }] } });
  apiMocks.listOutcomes.mockResolvedValue({
    outcomeMetrics: [{ id: 'm-golden', metricName: 'responses', metricValue: 11, unit: 'count', source: 'manual CRM entry', recordedAt: '2020-06-02T10:00:00.000Z' }],
  });
});

describe('Operator console golden UX chain', () => {
  it('tells the whole finding-to-learning story from one surface without raw JSON', async () => {
    render(
      <MemoryRouter initialEntries={['/brain']}>
        <BrainPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Operator' }));

    // CYCLE: summary + timeline
    expect(await screen.findByText('Latest operator cycle')).toBeInTheDocument();
    expect(within(screen.getByTestId('operator-cycle-summary')).getByText('COMPLETED')).toBeInTheDocument();
    const timeline = await screen.findByTestId('operator-cycle-timeline');
    expect(within(timeline).getByText('Cycle timeline')).toBeInTheDocument();
    expect(within(timeline).getByText('Execution boundary')).toBeInTheDocument();
    expect(within(timeline).getByText(/No authorized execution capability is currently available/)).toBeInTheDocument();
    // AI-deferred plan work is an intentional state, not an error.
    expect(screen.getByText(/plans and drafts deferred \(no prose invented\)/)).toBeInTheDocument();

    // RECOMMENDATION + WHY + EVIDENCE + confidences + learning + why-not + auth
    expect(await screen.findByText('Top recommendations & evidence')).toBeInTheDocument();
    expect(screen.getByText('Review opportunity: Checklist follow-ups')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show evidence'));
    expect(await screen.findByText('Content opportunity (opp-gold…)')).toBeInTheDocument();
    expect(screen.getByText('Claim (claim-go…)')).toBeInTheDocument();
    expect(screen.getByText(/Evidence confidence:/)).toBeInTheDocument();
    expect(screen.getByText(/Recommendation confidence:/)).toBeInTheDocument();
    expect(screen.getByText(/evidence_strength \(\+0\.08\).*Measured uplift/)).toBeInTheDocument();
    expect(screen.getByText(/Why not ranked higher/)).toBeInTheDocument();
    expect(screen.getByText(/Human decision required/)).toBeInTheDocument();
    expect(screen.getByText(/Review the opportunity and start a content idea/)).toBeInTheDocument();

    // APPROVAL: grouped queue, deep links, no bypass buttons
    expect(await screen.findByText('Approval queue')).toBeInTheDocument();

    // EXECUTION: honest unavailable, no send affordance
    const execCard = await screen.findByTestId('operator-section-execution');
    expect(within(execCard).getByText('Execution status')).toBeInTheDocument();
    expect(within(execCard).getByText('Not executed.')).toBeInTheDocument();

    // OBSERVATION: the real recorded row (name and value are separate nodes)
    const obsCard = await screen.findByTestId('operator-section-observations');
    expect(within(obsCard).getByText('Observations')).toBeInTheDocument();
    expect(within(obsCard).getByText('responses')).toBeInTheDocument();
    expect(within(obsCard).getByText(': 11 count')).toBeInTheDocument();
    expect(within(obsCard).getByText(/manual CRM entry/)).toBeInTheDocument();

    // LEARNING + WHAT CHANGES NEXT from real backend state
    expect(screen.getByText('Learning & what changes next')).toBeInTheDocument();
    expect(screen.getByText(/Future rankings touching “evidence_strength” may shift by \+0\.08/)).toBeInTheDocument();

    // HISTORY: the persisted cycle is listed
    expect(screen.getByText('Cycle history')).toBeInTheDocument();

    // No fabricated numbers, no fake success language, no raw record dumps.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/published|Published|SENT|Delivered|viral|Viral/i);
    expect(text).not.toMatch(/impressions|followers|CTR|conversion rate/i);
    expect(text).not.toContain('[object Object]');
  });

  it('presents the chain sections in finding-to-learning order', async () => {
    render(
      <MemoryRouter initialEntries={['/brain']}>
        <BrainPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Operator' }));
    await screen.findByText('Latest operator cycle');
    // Section cards render in chain order (robust to repeated words like the
    // "Observations" totals label, which text search would match early).
    const sections = Array.from(document.querySelectorAll('[data-testid^="operator-section-"]'));
    expect(sections.map((el) => el.getAttribute('data-testid'))).toEqual([
      'operator-section-cycles',
      'operator-section-recommendations',
      'operator-section-approvals',
      'operator-section-execution',
      'operator-section-observations',
      'operator-section-learning',
    ]);
    // Timeline precedes history inside the cycles flow.
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Cycle timeline')).toBeLessThan(text.indexOf('Cycle history'));
  });
});
