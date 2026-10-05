import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import { SourcesTabSection } from '../components/SourcesTabSection';
import { OperatorConsole } from '../components/OperatorConsole';
import {
  ApprovalQueue,
  ExecutionHonesty,
  LearningWhatsNext,
  ObservationPanel,
  TopRecommendations,
} from '../components/OperatorLoopPanels';
import {
  confirmLearningProposal,
  convertOpportunity,
  deriveLearningProposalAuto,
  detailedErrorMessage,
  friendlyErrorMessage,
  getExplanation,
  getIntelligenceOverview,
  getOpportunity,
  getOpportunityScoring,
  isAiUnavailable,
  listAudienceProblems,
  listGaps,
  listLearningProposals,
  listNextActions,
  listOpportunities,
  listTrends,
  rejectLearningProposal,
  revokeLearningProposal,
  runPerformanceReview,
  runYFPQualityGates,
  scoreOpportunityYFP,
  submitOpportunityFeedback,
  triageOpportunity,
} from '../services/api';
import {
  ActionExplanation,
  AudienceProblemsResponse,
  ContentGap,
  IntelligenceOverview,
  LearningProposal,
  OperatorAction,
  Opportunity,
  OpportunityFeedbackKind,
  OpportunityFeedbackSummary,
  OpportunityScoring,
  OpportunityTriageStatus,
  PerformanceRecommendation,
  PerformanceReviewResult,
  TrendSignal,
  YFPQualityGateInput,
  YFPQualityGateResult,
  YFPScoreDimension,
  YFPScoreResult,
} from '../types';

type BrainTab = 'overview' | 'operator' | 'opportunities' | 'trends' | 'gaps' | 'sources' | 'audience-problems' | 'yfp-scoring' | 'content-studio' | 'performance' | 'learning';

const TABS: { id: BrainTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'operator', label: 'Operator' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'trends', label: 'Trends' },
  { id: 'gaps', label: 'Gaps' },
  { id: 'sources', label: 'Sources' },
  { id: 'audience-problems', label: 'Audience Problems' },
  { id: 'yfp-scoring', label: 'YFP Scoring' },
  { id: 'content-studio', label: 'Content Studio' },
  { id: 'performance', label: 'Performance' },
  { id: 'learning', label: 'Learning' },
];

const FEEDBACK_OPTIONS: { value: OpportunityFeedbackKind; label: string }[] = [
  { value: 'useful', label: 'Useful' },
  { value: 'not_useful', label: 'Not useful' },
  { value: 'already_covered', label: 'Already covered' },
  { value: 'wrong_audience', label: 'Wrong audience' },
  { value: 'weak_evidence', label: 'Weak evidence' },
  { value: 'not_timely', label: 'Not timely' },
];

export function BrainPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<BrainTab>('overview');

  if (authLoading) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Loading...</h2>
          <p className="empty-state-description">Checking your session</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card">
          <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
            Brain / Intelligence
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Sign in to explore content opportunities, trends, gaps, and sources.
          </p>
        </div>
        <LoginForm />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 className="health-card-title">Brain / Intelligence</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Opportunities, trends, gaps, and sources for your workspace.
          </p>
        </div>
        <WorkspaceSelector />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }} role="tablist" aria-label="Intelligence sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`btn ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewSection /> : null}
      {tab === 'operator' ? <OperatorSection /> : null}
      {tab === 'opportunities' ? <OpportunitiesSection /> : null}
      {tab === 'trends' ? <TrendsSection /> : null}
      {tab === 'gaps' ? <GapsSection /> : null}
      {tab === 'sources' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SocialCallbackBanner />
          <SourcesTabSection />
        </div>
      ) : null}
      {tab === 'audience-problems' ? <AudienceProblemsSection /> : null}
      {tab === 'yfp-scoring' ? <YFPScoringSection /> : null}
      {tab === 'content-studio' ? <ContentStudioSection /> : null}
      {tab === 'performance' ? <PerformanceSection /> : null}
      {tab === 'learning' ? <LearningSection /> : null}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{label}</h2>
        <p className="empty-state-description">Please wait while we fetch the latest data</p>
      </div>
    </div>
  );
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{description}</p>
      </div>
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">Something went wrong</h2>
        <p className="empty-state-description">{message}</p>
        <button className="btn btn-secondary" onClick={onRetry} style={{ marginTop: '1rem' }}>
          Retry
        </button>
      </div>
    </div>
  );
}

function AiUnavailableBlock() {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">AI assistance unavailable</h2>
        <p className="empty-state-description">
          AI-powered generation is temporarily unavailable. You can still browse saved items and try again later.
        </p>
      </div>
    </div>
  );
}

function OperatorSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Operator console</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
          What the unattended operator found, recommended, prepared, and learned — every value below
          comes from a persisted backend row. Open a workflow page to act; this console never executes anything.
        </p>
      </div>
      <div className="card" data-testid="operator-section-cycles">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Cycles</h3>
        <OperatorConsole />
      </div>
      <div className="card" data-testid="operator-section-recommendations">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Top recommendations &amp; evidence</h3>
        <TopRecommendations />
      </div>
      <div className="card" data-testid="operator-section-approvals">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Approval queue</h3>
        <ApprovalQueue />
      </div>
      <div className="card" data-testid="operator-section-execution">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Execution status</h3>
        <ExecutionHonesty />
      </div>
      <div className="card" data-testid="operator-section-observations">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Observations</h3>
        <ObservationPanel />
      </div>
      <div className="card" data-testid="operator-section-learning">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Learning &amp; what changes next</h3>
        <LearningWhatsNext />
      </div>
    </div>
  );
}

function OverviewSection() {
  const [data, setData] = useState<IntelligenceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const overview = await getIntelligenceOverview();
      setData(overview);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <LoadingBlock label="Loading overview..." />;
  if (aiUnavailable) return <AiUnavailableBlock />;
  if (error) return <ErrorBlock message={error} onRetry={() => void fetchData()} />;
  if (!data) return <EmptyBlock title="No overview yet" description="There is no intelligence data for this workspace yet." />;

  const counts: { label: string; value: unknown }[] = [
    { label: 'Sources', value: data.sources },
    { label: 'Topics', value: data.topics },
    { label: 'Trends', value: data.trends },
    { label: 'Opportunities', value: data.opportunities },
    { label: 'Gaps', value: data.gaps },
  ].filter((c) => typeof c.value !== 'undefined');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {counts.length > 0 ? (
        <div className="health-grid">
          {counts.map((c) => (
            <div key={c.label} className="health-card">
              <h3 className="health-card-title">{c.label}</h3>
              <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{String(c.value)}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyBlock title="No counts yet" description="Overview data exists but has no counts to show." />
      )}
      {Array.isArray(data.recentOpportunities) && data.recentOpportunities.length > 0 ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Recent opportunities</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1.25rem' }}>
            {data.recentOpportunities.slice(0, 5).map((o) => (
              <li key={String(o.id)} style={{ fontSize: '0.875rem' }}>{o.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StatusFilterSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
      Status
      <select aria-label="Filter by status" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="NEW">New</option>
        <option value="REVIEWED">Reviewed</option>
        <option value="DISMISSED">Dismissed</option>
        <option value="CONVERTED">Converted</option>
        <option value="">All</option>
      </select>
    </label>
  );
}

function OpportunitiesSection() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('NEW');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await listOpportunities({ status: statusFilter });
      setOpportunities(data.opportunities ?? []);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <LoadingBlock label="Loading opportunities..." />;
  if (aiUnavailable) return <AiUnavailableBlock />;
  if (error) return <ErrorBlock message={error} onRetry={() => void fetchData()} />;

  if (selectedId) {
    return (
      <OpportunityDetail
        opportunityId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  if (opportunities.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
        <EmptyBlock
          title="No opportunities yet"
          description={
            statusFilter === 'NEW'
              ? 'New content opportunities will appear here when they are detected.'
              : `No ${statusFilter.toLowerCase()} opportunities.`
          }
        />
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>
        Opportunities ({opportunities.length})
      </h3>
      <div style={{ marginBottom: '0.75rem' }}>
        <StatusFilterSelect value={statusFilter} onChange={setStatusFilter} />
      </div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
        {opportunities.map((opp) => (
          <li
            key={String(opp.id)}
            style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontWeight: 600 }}>{opp.title}</p>
                {opp.description ? (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{opp.description}</p>
                ) : null}
                {typeof opp.score !== 'undefined' ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Score: {String(opp.score)}</p>
                ) : null}
              </div>
              <button className="btn btn-secondary" onClick={() => setSelectedId(String(opp.id))}>
                View details
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpportunityDetail({ opportunityId, onBack }: { opportunityId: string; onBack: () => void }) {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackState, setFeedbackState] = useState<string | null>(null);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSummary, setFeedbackSummary] = useState<OpportunityFeedbackSummary | null>(null);
  const [convertTitle, setConvertTitle] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState<string | null>(null);
  const [triaging, setTriaging] = useState(false);
  const [triageMessage, setTriageMessage] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOpportunity(opportunityId);
      setOpportunity(data.opportunity);
      setFeedbackSummary(data.feedbackSummary ?? null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  async function handleFeedback(kind: OpportunityFeedbackKind) {
    setFeedbackSending(true);
    setFeedbackState(null);
    try {
      await submitOpportunityFeedback(opportunityId, kind, feedbackReason.trim() || undefined);
      await fetchDetail();
      setFeedbackState('Thanks — your feedback was recorded.');
    } catch (err) {
      setFeedbackState(friendlyErrorMessage(err));
    } finally {
      setFeedbackSending(false);
    }
  }

  async function handleConvert() {
    setConverting(true);
    setConvertMessage(null);
    try {
      const result = await convertOpportunity(opportunityId, convertTitle.trim() || undefined);
      setConvertMessage(
        `Created content idea “${result.contentIdea.title}”. Find it under Content → Ideas.`,
      );
    } catch (err) {
      if (isAiUnavailable(err)) {
        setConvertMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setConvertMessage(friendlyErrorMessage(err));
      }
    } finally {
      setConverting(false);
    }
  }

  async function handleTriage(status: OpportunityTriageStatus) {
    setTriaging(true);
    setTriageMessage(null);
    try {
      const result = await triageOpportunity(opportunityId, status);
      setOpportunity(result.opportunity);
      setTriageMessage(
        status === 'REVIEWED'
          ? 'Marked as reviewed. It stays here for history.'
          : 'Dismissed. It stays here for history.',
      );
    } catch (err) {
      setTriageMessage(friendlyErrorMessage(err));
    } finally {
      setTriaging(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading opportunity..." />;
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to opportunities
        </button>
        <ErrorBlock message={error} onRetry={() => void fetchDetail()} />
      </div>
    );
  }
  if (!opportunity) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to opportunities
        </button>
        <EmptyBlock title="Opportunity not found" description="This opportunity may have been removed." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Back to opportunities
      </button>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>{opportunity.title}</h3>
        {opportunity.description ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            {opportunity.description}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {opportunity.status ? <span className="badge badge-neutral">{String(opportunity.status)}</span> : null}
          {typeof opportunity.score !== 'undefined' ? (
            <span className="badge badge-neutral">Score: {String(opportunity.score)}</span>
          ) : null}
          {opportunity.topic ? <span className="badge badge-neutral">{String(opportunity.topic)}</span> : null}
        </div>
      </div>

      <WhyRecommended
        matchKeys={{
          opportunityId: String(opportunity.id ?? ''),
          topicId: typeof opportunity.topicId === 'string' ? opportunity.topicId : '',
        }}
      />

      <OpportunityScoringBreakdown opportunityId={String(opportunity.id ?? '')} />

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Was this helpful?</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {FEEDBACK_OPTIONS.map((option) => (
            <button
              key={option.value}
              className="btn btn-secondary"
              disabled={feedbackSending}
              onClick={() => void handleFeedback(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          value={feedbackReason}
          onChange={(e) => setFeedbackReason(e.target.value)}
          placeholder="Optional reason (e.g. why this fits or not)"
          style={fieldStyle}
        />
        {feedbackState ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {feedbackState}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Workspace feedback</h3>
        {!feedbackSummary || feedbackSummary.total === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            No feedback recorded yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.875rem' }}>Feedback: {feedbackSummary.total}</p>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              {FEEDBACK_OPTIONS.filter(
                (option) => (feedbackSummary.counts[option.value.toUpperCase()] ?? 0) > 0
              ).map((option) => (
                <li key={option.value}>
                  {feedbackSummary.counts[option.value.toUpperCase()]}× {option.label}
                </li>
              ))}
            </ul>
            {feedbackSummary.reasons.length > 0 ? (
              <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {feedbackSummary.reasons.map((entry, index) => {
                  const label =
                    FEEDBACK_OPTIONS.find((option) => option.value.toUpperCase() === entry.feedback)?.label ??
                    entry.feedback;
                  return (
                    <li key={`${entry.feedback}-${index}`}>
                      {entry.reason} <span style={{ color: 'var(--color-text-muted)' }}>({label})</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Convert to content idea</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Turn this opportunity into a draft idea you can develop under Content.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={convertTitle}
            onChange={(e) => setConvertTitle(e.target.value)}
            placeholder="Optional idea title"
            style={{ ...fieldStyle, flex: '1 1 220px' }}
          />
          <button className="btn btn-primary" disabled={converting} onClick={() => void handleConvert()}>
            {converting ? 'Converting...' : 'Convert to content idea'}
          </button>
        </div>
        {convertMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {convertMessage}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Triage</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Acknowledge this opportunity or dismiss it. Either way it stays here for history and
          leaves the active queue.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" disabled={triaging} onClick={() => void handleTriage('REVIEWED')}>
            {triaging ? 'Saving...' : 'Mark reviewed'}
          </button>
          <button className="btn btn-secondary" disabled={triaging} onClick={() => void handleTriage('DISMISSED')}>
            {triaging ? 'Saving...' : 'Dismiss'}
          </button>
        </div>
        {triageMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {triageMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TrendsSection() {
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTrends();
      setTrends(data.trends ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <LoadingBlock label="Loading trends..." />;
  if (error) return <ErrorBlock message={error} onRetry={() => void fetchData()} />;
  if (trends.length === 0) {
    return <EmptyBlock title="No trends yet" description="Trend signals will appear here when they are detected." />;
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>Trends ({trends.length})</h3>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
        {trends.map((trend) => (
          <li key={String(trend.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <p style={{ fontWeight: 600 }}>{String(trend.title ?? trend.id)}</p>
            {trend.description ? (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{String(trend.description)}</p>
            ) : null}
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ fontSize: '0.875rem', cursor: 'pointer' }}>Why recommended</summary>
              <div style={{ marginTop: '0.5rem' }}>
                <WhyRecommended matchKeys={{ trendId: String(trend.id ?? '') }} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GapsSection() {
  const [gaps, setGaps] = useState<ContentGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listGaps();
      setGaps(data.gaps ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <LoadingBlock label="Loading gaps..." />;
  if (error) return <ErrorBlock message={error} onRetry={() => void fetchData()} />;
  if (gaps.length === 0) {
    return <EmptyBlock title="No gaps yet" description="Content gaps will appear here when they are detected." />;
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>Gaps ({gaps.length})</h3>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
        {gaps.map((gap) => (
          <li key={String(gap.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
            <p style={{ fontWeight: 600 }}>{String(gap.title ?? gap.id)}</p>
            {gap.description ? (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{String(gap.description)}</p>
            ) : null}
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ fontSize: '0.875rem', cursor: 'pointer' }}>Why recommended</summary>
              <div style={{ marginTop: '0.5rem' }}>
                <WhyRecommended matchKeys={{ gapId: String(gap.id ?? '') }} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialCallbackBanner() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  if (params.get('social') !== 'connected' && params.get('social') !== 'error') return null;
  const ok = params.get('social') === 'connected';
  return (
    <div className="card" style={{ borderLeft: `3px solid ${ok ? 'var(--color-success)' : 'var(--color-error)'}` }}>
      <p style={{ fontSize: '0.875rem', margin: 0 }}>
        {ok
          ? `Connected to ${params.get('platform') ?? 'the platform'}. Pulls are manual — use Refresh below.`
          : `Connection failed: ${params.get('message') ?? 'unknown error'}`}
      </p>
    </div>
  );
}

// Sources-tab sections (platforms, research, feeds) live in
// ../components/SourcesTabSection.tsx (Connections & Sources redesign).

function LearningSection() {
  const [proposals, setProposals] = useState<LearningProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [metricName, setMetricName] = useState('');
  const [minSample, setMinSample] = useState('5');
  const [deriving, setDeriving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await listLearningProposals({
        status: statusFilter.trim() || undefined,
      });
      setProposals(data.proposals ?? []);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);

  async function handleDerive(event: React.FormEvent) {
    event.preventDefault();
    setDeriving(true);
    setFormMessage(null);
    try {
      const parsedMin = Number.parseInt(minSample.trim(), 10);
      const result = await deriveLearningProposalAuto({
        metricName: metricName.trim() || undefined,
        minSampleSize: Number.isFinite(parsedMin) && parsedMin > 0 ? parsedMin : undefined,
      });
      setFormMessage(`Proposed learning recorded (${result.proposal.id.slice(0, 8)}…). It is proposed, not active.`);
      setMetricName('');
      await fetchProposals();
    } catch (err) {
      setFormMessage(detailedErrorMessage(err));
    } finally {
      setDeriving(false);
    }
  }

  async function handleTransition(
    id: string,
    action: 'confirm' | 'reject' | 'revoke',
  ) {
    setWorkingId(id);
    setActionMessage(null);
    try {
      if (action === 'confirm') {
        await confirmLearningProposal(id);
        setActionMessage('Proposal confirmed. Confirmed influence is shown below.');
      } else if (action === 'reject') {
        await rejectLearningProposal(id);
        setActionMessage('Proposal rejected.');
      } else {
        await revokeLearningProposal(id);
        setActionMessage('Confirmed proposal revoked.');
      }
      await fetchProposals();
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Proposed learning</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Derived only from recorded measurements. Proposed items are not active until explicitly confirmed.
        </p>
        <form onSubmit={(e) => void handleDerive(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            placeholder="Metric name (e.g. replies)"
            style={{ ...fieldStyle, flex: '2 1 200px' }}
          />
          <input
            value={minSample}
            onChange={(e) => setMinSample(e.target.value)}
            placeholder="Min sample size (≥ 2)"
            inputMode="numeric"
            style={{ ...fieldStyle, flex: '1 1 140px' }}
          />
          <button type="submit" className="btn btn-primary" disabled={deriving}>
            {deriving ? 'Deriving...' : 'Derive proposal'}
          </button>
        </form>
        {formMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {formMessage}
          </p>
        ) : null}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h3 className="health-card-title">Proposals ({proposals.length})</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ ...fieldStyle, width: 'auto' }}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="PROPOSED">Proposed</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="REJECTED">Rejected</option>
              <option value="REVOKED">Revoked</option>
            </select>
            <button className="btn btn-secondary" onClick={() => void fetchProposals()}>
              Refresh
            </button>
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
          Confirming or revoking requires an owner or admin role. Other roles will see an access message.
        </p>
        {actionMessage ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
            {actionMessage}
          </p>
        ) : null}
        {loading ? <LoadingBlock label="Loading proposals..." /> : null}
        {!loading && aiUnavailable ? <AiUnavailableBlock /> : null}
        {!loading && !aiUnavailable && error ? (
          <ErrorBlock message={error} onRetry={() => void fetchProposals()} />
        ) : null}
        {!loading && !aiUnavailable && !error && proposals.length === 0 ? (
          <EmptyBlock title="No proposals yet" description="Insufficient data: derive a proposal from recorded measurements above, or adjust the status filter." />
        ) : null}
        {!loading && !aiUnavailable && !error && proposals.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
            {proposals.map((proposal) => {
              const status = String(proposal.status ?? 'PROPOSED').toUpperCase();
              const isConfirmed = status === 'CONFIRMED';
              return (
                <li
                  key={String(proposal.id)}
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem', fontSize: '0.875rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <p style={{ fontWeight: 600 }}>Dimension: {String(proposal.dimension)}</p>
                    <span className={`badge ${isConfirmed ? 'badge-success' : 'badge-neutral'}`}>
                      {status === 'PROPOSED' ? 'Proposed (not active)' : status.charAt(0) + status.slice(1).toLowerCase()}
                    </span>
                    <span className="badge badge-info" title="Evidence maturity: UNKNOWN → OBSERVED → REPEATED_SIGNAL → HYPOTHESIS → EXPERIMENT → SUPPORTED_PATTERN → CONFIRMED. Only human confirmation reaches CONFIRMED.">
                      Evidence: {String(proposal.maturity ?? (isConfirmed ? 'CONFIRMED' : 'HYPOTHESIS'))}
                    </span>
                  </div>
                  <p style={{ color: 'var(--color-text-secondary)' }}>
                    Observed pattern: {String(proposal.observedPattern)}
                  </p>
                  <p style={{ color: 'var(--color-text-secondary)' }}>
                    Sample size {String(proposal.sampleSize)}
                    {typeof proposal.denominator !== 'undefined' && proposal.denominator !== null
                      ? ` of ${String(proposal.denominator)}`
                      : ''}
                    {' · '}Source measurements: {(proposal.sourceMetricIds ?? []).length}
                  </p>
                  <p>Proposed adjustment: {String(proposal.proposedAdjustment)}</p>
                  <p style={{ color: 'var(--color-text-secondary)' }}>Reason: {String(proposal.reason)}</p>
                  {isConfirmed ? (
                    <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                      <p style={{ fontWeight: 600 }}>Confirmed influence</p>
                      <p>Dimension: {String(proposal.dimension)}</p>
                      <p>Adjustment: {String(proposal.proposedAdjustment)}</p>
                      <p style={{ color: 'var(--color-text-secondary)' }}>Reason: {String(proposal.reason)}</p>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                        Confirmed by {String(proposal.confirmedBy ?? 'unknown')}
                        {proposal.confirmedAt ? ` at ${String(proposal.confirmedAt)}` : ''}
                      </p>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <button
                      className="btn btn-secondary"
                      disabled={workingId === String(proposal.id)}
                      onClick={() => void handleTransition(String(proposal.id), 'confirm')}
                    >
                      Confirm
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={workingId === String(proposal.id)}
                      onClick={() => void handleTransition(String(proposal.id), 'reject')}
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={workingId === String(proposal.id)}
                      onClick={() => void handleTransition(String(proposal.id), 'revoke')}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function subjectMatches(meta: Record<string, unknown> | undefined, keys: Record<string, string>): boolean {
  if (!meta || typeof meta !== 'object') return false;
  return Object.entries(keys).some(([key, value]) => {
    if (!value) return false;
    const candidate = meta[key];
    return typeof candidate === 'string' && candidate === value;
  });
}

function OpportunityScoringBreakdown({ opportunityId }: { opportunityId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scoring, setScoring] = useState<OpportunityScoring | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOpportunityScoring(opportunityId);
      setScoring(data.scoring ?? null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Score breakdown</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Recomputing score...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Score breakdown</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => void fetchData()} style={{ marginTop: '0.5rem' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!scoring) return null;

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Score breakdown</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <span className="badge badge-neutral">Score: {scoring.overallScore.toFixed(2)}</span>
        <span className="badge badge-neutral">Base: {scoring.baseOverallScore.toFixed(2)}</span>
        {scoring.learning.applied.length > 0 ? (
          <span className="badge badge-neutral">{scoring.learning.applied.length} confirmed learning adjustment(s)</span>
        ) : (
          <span className="badge badge-neutral">No confirmed learning applied</span>
        )}
      </div>
      {scoring.criticalFailure ? (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Evidence failure: {scoring.failureReason ?? 'base score failed evidence checks; learning was not applied.'}
        </p>
      ) : null}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {scoring.dimensions.map((dim) => (
          <li key={dim.name} style={{ fontSize: '0.875rem' }}>
            <strong>{dim.name}</strong>: {dim.score.toFixed(2)}
            {dim.appliedAdjustment !== 0 ? ` (base ${dim.baseScore.toFixed(2)}, ${dim.appliedAdjustment > 0 ? '+' : ''}${dim.appliedAdjustment.toFixed(2)} from confirmed learning)` : null}
            <br />
            <span style={{ color: 'var(--color-text-secondary)' }}>{dim.explanation}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhyRecommended({ matchKeys }: { matchKeys: Record<string, string> }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<OperatorAction | null>(null);
  const [explanation, setExplanation] = useState<ActionExplanation | null>(null);
  const [found, setFound] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNextActions({ status: 'pending' });
      const list = data.actions ?? [];
      const hit = list.find((action) =>
        subjectMatches((action.subjectMeta ?? {}) as Record<string, unknown>, matchKeys),
      );
      if (!hit) {
        setFound(false);
        setMatched(null);
        setExplanation(null);
        return;
      }
      setFound(true);
      setMatched(hit);
      try {
        const detail = await getExplanation(String(hit.id));
        setExplanation(detail.explanation ?? null);
      } catch {
        // Fall back to the ranked item when the full breakdown is unavailable.
        setExplanation(null);
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [matchKeys.opportunityId, matchKeys.topicId, matchKeys.trendId, matchKeys.gapId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Why recommended</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Checking current ranking...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Why recommended</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => void fetchData()} style={{ marginTop: '0.5rem' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!found || !matched) {
    return (
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Why recommended</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          Not currently ranked. This item is saved but is not among the current suggestions.
        </p>
      </div>
    );
  }

  const reasons = explanation?.reasons ?? matched.reasons ?? [];
  const score = explanation?.score ?? matched.score;
  const dimensions = explanation?.dimensions ?? [];
  const lifecycle = explanation?.lifecycle ?? null;
  const learning = explanation?.learningApplied ?? [];
  const signalConfidence = explanation?.signalConfidence;
  const recommendationConfidence = explanation?.recommendationConfidence;
  const whyNot = explanation?.whyNot;
  const nextAction = explanation?.nextAction ?? null;
  const requiredAuthorization = explanation?.requiredAuthorization ?? null;

  const confidenceLabel = (c?: string) => {
    if (!c) return null;
    const colors: Record<string, string> = { HIGH: '#16a34a', MEDIUM: '#ca8a04', LOW: '#dc2626', UNKNOWN: '#6b7280' };
    return (
      <span style={{ 
        display: 'inline-block', 
        padding: '0.125rem 0.5rem', 
        borderRadius: '9999px', 
        fontSize: '0.75rem', 
        fontWeight: 600,
        backgroundColor: colors[c] + '20',
        color: colors[c],
        marginLeft: '0.5rem'
      }}>
        {c}
      </span>
    );
  };

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Why recommended</h3>
      <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Score: {String(score)}</p>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        {signalConfidence && (
          <span style={{ fontSize: '0.875rem' }}>
            <strong>Signal Confidence:</strong>
            {confidenceLabel(signalConfidence)}
          </span>
        )}
        {recommendationConfidence && (
          <span style={{ fontSize: '0.875rem' }}>
            <strong>Recommendation Confidence:</strong>
            {confidenceLabel(recommendationConfidence)}
          </span>
        )}
      </div>
      {reasons.length > 0 ? (
        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
          {reasons.map((reason, i) => (
            <li key={i}>{String(reason)}</li>
          ))}
        </ul>
      ) : null}
      {whyNot && whyNot.length > 0 ? (
        <div style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius)' }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', color: '#dc2626' }}>Why not ranked higher</p>
          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
            {whyNot.map((reason, i) => (
              <li key={i}>{String(reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {dimensions.length > 0 ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Score breakdown</p>
          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {dimensions.map((d, i) => (
              <li key={i}>
                {String(d.name)}: {String(d.points)} of {String(d.maxPoints)} — {String(d.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {lifecycle ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
          Status: {String(lifecycle)}
        </p>
      ) : null}
      {nextAction ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
          <strong>Next step:</strong> {String(nextAction)}
        </p>
      ) : null}
      {requiredAuthorization ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
          <strong>Authorization:</strong> {String(requiredAuthorization)}
        </p>
      ) : null}
      {learning.length > 0 ? (
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>What we have learned</p>
          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {learning.map((line, i) => (
              <li key={i}>{String(line)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text)',
  padding: '0.625rem 0.75rem',
  width: '100%',
};

function AudienceProblemsSection() {
  const [data, setData] = useState<AudienceProblemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAudienceProblems();
      setData(result);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) return <LoadingBlock label="Discovering audience problems..." />;
  if (error) return <ErrorBlock message={error} onRetry={() => void fetchData()} />;
  if (!data || data.groups.length === 0) {
    return (
      <EmptyBlock
        title="No audience problems yet"
        description={data?.errors?.join('; ') || 'Run research to discover recurring beginner problems. Problems are grouped only when 2+ sources mention them.'}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Audience Problems ({data.groups.length} groups from {data.totalSignalsAnalyzed} signals)
        </h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          Grouped: {data.groupedCount} · Ungrouped: {data.ungroupedCount}. Only recurring problems are shown — one-off posts are not treated as widespread.
        </p>
      </div>
      {data.groups.map((g) => (
        <div key={g.id} className="card">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <span className="badge badge-neutral">{g.yfpRelevance} relevance</span>
            <span className="badge badge-neutral">×{g.frequency} sources</span>
            <span className="badge badge-neutral">Confidence {(g.confidence * 100).toFixed(0)}%</span>
          </div>
          <h3 className="health-card-title" style={{ marginBottom: '0.25rem' }}>{g.problem}</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Audience: {g.audience}</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}><strong>YFP angle:</strong> {g.suggestedContent.angle}</p>
          <p style={{ fontSize: '0.875rem' }}><strong>Hook:</strong> {g.suggestedContent.hook}</p>
          <p style={{ fontSize: '0.875rem' }}>
            <strong>Format:</strong> {g.suggestedContent.format} · <strong>Educational value:</strong> {g.suggestedContent.educationalValue}
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Business: {g.businessAlignment}</p>
          <details style={{ marginTop: '0.5rem' }}>
            <summary style={{ fontSize: '0.875rem', cursor: 'pointer' }}>Supporting evidence ({g.evidence.length})</summary>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              {g.evidence.map((e) => (
                <li key={e.sourceId}>
                  [{e.sourceType}] {e.sourceTitle || '(untitled)'}{' '}
                  {e.sourceUrl ? <a href={e.sourceUrl} target="_blank" rel="noreferrer">source</a> : null}
                  <br />“{e.quote.slice(0, 200)}”
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}

function YFPScoringSection() {
  const [topicId, setTopicId] = useState('');
  const [result, setResult] = useState<YFPScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleScore(event: React.FormEvent) {
    event.preventDefault();
    if (!topicId.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const r = await scoreOpportunityYFP({
        topicId: topicId.trim(),
        sourceIds: [],
        claimIds: [],
        trendSignalIds: [],
        workspaceProfile: '',
        icp: '',
        contentGaps: [],
      });
      setResult(r);
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>YFP Opportunity Score (0–100)</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Audience relevance 0–25 · Trend momentum 0–25 · Educational value 0–20 · Timeliness 0–15 · Differentiation 0–15.
          Scores are explainable; missing signals lower the score transparently instead of inventing data.
        </p>
        <form onSubmit={(e) => void handleScore(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={topicId} onChange={(e) => setTopicId(e.target.value)} placeholder="Topic ID to score" style={{ ...fieldStyle, flex: '1 1 220px' }} />
          <button type="submit" className="btn btn-primary" disabled={loading || !topicId.trim()}>
            {loading ? 'Scoring...' : 'Score topic'}
          </button>
        </form>
        {message ? <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      </div>
      {result ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Score: {result.overallScore.toFixed(1)}/100</h3>
          {result.criticalFailure ? (
            <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Blocked: {result.failureReason}</p>
          ) : null}
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {result.dimensions.map((d: YFPScoreDimension) => (
              <li key={d.name} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
                <p style={{ fontWeight: 600 }}>{d.name}: {d.score.toFixed(1)}/{d.maxScore}</p>
                <p style={{ color: 'var(--color-text-secondary)' }}>{d.explanation}</p>
                <ul style={{ paddingLeft: '1.25rem', color: 'var(--color-text-secondary)' }}>
                  {d.evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ContentStudioSection() {
  const [body, setBody] = useState('');
  const [result, setResult] = useState<YFPQualityGateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCheck() {
    if (body.trim().length < 50) {
      setMessage('Paste at least 50 characters of draft content to check.');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const input: YFPQualityGateInput = { draftBody: body.trim() };
      const r = await runYFPQualityGates(input);
      setResult(r);
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Content Studio — YFP Quality Check</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Checks relevance, educational value, originality, accuracy, structure, and business alignment.
          YFP style: beginner-friendly, practical, evidence-first. No fake statistics or income promises.
        </p>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Paste draft content here..." style={fieldStyle} />
        <button className="btn btn-primary" disabled={loading} onClick={() => void handleCheck()} style={{ marginTop: '0.5rem' }}>
          {loading ? 'Checking...' : 'Run quality check'}
        </button>
        {message ? <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      </div>
      {result ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
            YFP score: {result.yfpOverallScore}/100 · Status: {result.finalStatus}
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {result.yfpDimensions.map((d) => (
              <li key={d.name} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
                <p style={{ fontWeight: 600 }}>{d.name}: {d.score}/{d.maxScore} — {d.status}</p>
                <ul style={{ paddingLeft: '1.25rem', color: 'var(--color-text-secondary)' }}>
                  {d.evidence.map((e: string, i: number) => <li key={i}>{e}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PerformanceSection() {
  const [result, setResult] = useState<PerformanceReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const r = await runPerformanceReview();
      setResult(r);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Performance Insights — 10-post review</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Reviews trigger after every {10} published posts. Patterns need 2+ posts per group; one success is never a formula.
          Actual metrics are distinguished from AI interpretations.
        </p>
        <button className="btn btn-primary" disabled={loading} onClick={() => void handleRun()}>
          {loading ? 'Analyzing...' : 'Run performance review'}
        </button>
        {error ? <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p> : null}
      </div>
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <h3 className="health-card-title">Review: {result.postsAnalyzed} posts — {result.reviewTriggered ? 'triggered' : 'not yet'}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{result.reason} · Confidence: {result.confidence}</p>
          </div>
          {result.patterns.length > 0 ? (
            <div className="card">
              <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Observed patterns ({result.patterns.length})</h3>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {result.patterns.map((p, i: number) => (
                  <li key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
                    <p style={{ fontWeight: 600 }}>[{p.type}] {p.pattern}</p>
                    <p style={{ color: 'var(--color-text-secondary)' }}>{p.evidence} · Confidence: {p.confidence}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.recommendations.length > 0 ? (
            <div className="card">
              <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Recommendations</h3>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {result.recommendations.map((r: PerformanceRecommendation, i: number) => (
                  <li key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
                    <p style={{ fontWeight: 600 }}>[{r.type}] {r.description}</p>
                    <p style={{ color: 'var(--color-text-secondary)' }}>{r.reasoning}</p>
                    <p>Suggested: {r.suggestedAction} · Confidence: {r.confidence}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
