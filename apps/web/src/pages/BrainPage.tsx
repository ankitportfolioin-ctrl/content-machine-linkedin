import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  confirmLearningProposal,
  connectSocial,
  convertOpportunity,
  createSource,
  deriveLearningProposalAuto,
  detailedErrorMessage,
  disconnectSocial,
  friendlyErrorMessage,
  getExplanation,
  getIntelligenceOverview,
  getOpportunity,
  getOpportunityScoring,
  isAiUnavailable,
  listAudienceProblems,
  listGaps,
  listLearningProposals,
  listConnectors,
  listNextActions,
  listOpportunities,
  listSocialConnections,
  updateConnectorConfig,
  verifyConnector,
  listSocialPosts,
  listSources,
  listTrends,
  pauseSocial,
  refreshSocial,
  rejectLearningProposal,
  resumeSocial,
  revokeLearningProposal,
  runPerformanceReview,
  runYFPQualityGates,
  saveSocialIdea,
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
  SocialConnection,
  SocialPost,
  Source,
  WorkspaceConnectorEntry,
  TrendSignal,
  YFPQualityGateInput,
  YFPQualityGateResult,
  YFPScoreDimension,
  YFPScoreResult,
} from '../types';

type BrainTab = 'overview' | 'opportunities' | 'trends' | 'gaps' | 'sources' | 'audience-problems' | 'yfp-scoring' | 'content-studio' | 'performance' | 'learning';

const TABS: { id: BrainTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
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
      {tab === 'opportunities' ? <OpportunitiesSection /> : null}
      {tab === 'trends' ? <TrendsSection /> : null}
      {tab === 'gaps' ? <GapsSection /> : null}
      {tab === 'sources' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SocialCallbackBanner />
          <ResearchCatalogueSection />
          <ConnectorsSection />
          <SourcesSection />
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

function statusBadgeClass(status: string): string {
  if (status === 'CONNECTED') return 'badge badge-success';
  if (status === 'PAUSED') return 'badge badge-warning';
  if (status === 'ERROR' || status === 'EXPIRED') return 'badge badge-error';
  return 'badge badge-neutral';
}

function statusLabel(status: string): string {
  if (status === 'NOT_CONFIGURED') return 'Not configured';
  if (status === 'NOT_CONNECTED') return 'Not connected';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/**
 * Setup state for platforms whose server-side app credentials are missing.
 * Never a dead button: explains who must act, what is required, and where
 * the official provider setup lives. No internal paths, no secrets.
 */
function SetupRequirementsBlock({ conn }: { conn: SocialConnection }) {
  const [copied, setCopied] = useState(false);
  const server = conn.server;

  async function handleCopy() {
    if (!server?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(server.redirectUri);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 100%' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
        Account connection is not available yet — this integration must first be configured by the
        SaaS administrator.
      </p>
      <details>
        <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          View setup requirements
        </summary>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <p style={{ margin: 0 }}>Required application credentials:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
            <li>Client ID</li>
            <li>Client Secret</li>
          </ul>
          {server?.redirectUri ? (
            <p style={{ margin: 0 }}>
              Redirect URI to allow-list in the provider app: <code style={{ wordBreak: 'break-all' }}>{server.redirectUri}</code>{' '}
              <button className="btn btn-secondary" onClick={() => void handleCopy()}>
                {copied ? 'Copied' : 'Copy redirect URI'}
              </button>
            </p>
          ) : null}
          <details>
            <summary style={{ cursor: 'pointer' }}>Developer details</summary>
            <ul style={{ paddingLeft: '1.25rem', margin: '0.25rem 0 0' }}>
              {(server?.requiredEnvVars ?? []).map((v) => (
                <li key={v}><code>{v}</code></li>
              ))}
              {server?.redirectUriSource ? <li>Redirect source: <code>{server.redirectUriSource}</code></li> : null}
            </ul>
          </details>
          {server?.docsUrl ? (
            <p style={{ margin: 0 }}>
              <a href={server.docsUrl} target="_blank" rel="noreferrer">Official setup instructions</a>
              {server.docsLabel ? ` — ${server.docsLabel}` : null}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function ConnectorsSection() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [postsFor, setPostsFor] = useState<string | null>(null);
  const [savingIdea, setSavingIdea] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSocialConnections();
      setConnections(data.connections ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function runAction(key: string, fn: () => Promise<string | void>) {
    setWorking(key);
    setMessage(null);
    try {
      const result = await fn();
      if (result) setMessage(result);
      await fetchData();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(null);
    }
  }

  function handleConnect(platform: string) {
    void runAction(`connect:${platform}`, async () => {
      const res = await connectSocial(platform);
      window.location.href = res.authorizationUrl;
    });
  }

  function handleRefresh(platform: string) {
    void runAction(`refresh:${platform}`, async () => {
      const res = await refreshSocial(platform, 10);
      if (postsFor === platform) {
        const data = await listSocialPosts(platform, 20);
        setPosts(data.posts ?? []);
      }
      return `Pulled ${res.fetched} item(s) from ${platform}, stored ${res.stored}.`;
    });
  }

  function handlePause(platform: string, active: boolean) {
    void runAction(`pause:${platform}`, async () => {
      if (active) await pauseSocial(platform);
      else await resumeSocial(platform);
      return active ? `${platform} paused. Pulls are stopped.` : `${platform} resumed.`;
    });
  }

  function handleDisconnect(platform: string) {
    if (!window.confirm(`Disconnect ${platform}? Stored access is removed. Previously pulled items stay as attributed inspiration.`)) return;
    void runAction(`disconnect:${platform}`, async () => {
      const res = await disconnectSocial(platform);
      if (postsFor === platform) {
        const data = await listSocialPosts(platform, 20);
        setPosts(data.posts ?? []);
      }
      return res.note;
    });
  }

  async function handleShowPosts(platform: string) {
    if (postsFor === platform) {
      setPostsFor(null);
      setPosts([]);
      return;
    }
    setWorking(`posts:${platform}`);
    setMessage(null);
    try {
      const data = await listSocialPosts(platform, 20);
      setPosts(data.posts ?? []);
      setPostsFor(platform);
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleSaveIdea(post: SocialPost) {
    setSavingIdea(String(post.id));
    setMessage(null);
    try {
      const res = await saveSocialIdea(String(post.id));
      setMessage(`Saved “${String(res.contentIdea.title).slice(0, 80)}” as a DRAFT idea. Open Content to work it — nothing was approved or published.`);
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSavingIdea(null);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Connected platforms (optional)</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Optional inspiration for the Content Brain — read-only, per workspace. Everything works with zero
        connectors. Pulled items become content ideas only when you save them, always as DRAFT.
      </p>
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading platforms...</p> : null}
      {!loading && error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>
          <button className="btn btn-secondary" onClick={() => void fetchData()}>Retry</button>
        </div>
      ) : null}
      {!loading && !error ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0, margin: 0 }}>
          {connections.map((conn) => (
            <li key={conn.platform} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <p style={{ fontWeight: 600, margin: 0 }}>{conn.displayName}</p>
                <span className={statusBadgeClass(conn.status)}>{statusLabel(conn.status)}</span>
                {conn.accountLabel ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{conn.accountLabel}</span>
                ) : null}
                {conn.postCount > 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{conn.postCount} pulled item(s)</span>
                ) : null}
              </div>
              {conn.lastError ? (
                <p role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-error)', margin: '0.25rem 0 0' }}>{conn.lastError}</p>
              ) : null}
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                  What this connector can and cannot read
                </summary>
                <ul style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', paddingLeft: '1.25rem', margin: '0.25rem 0' }}>
                  {conn.provides.map((p, i) => (
                    <li key={`p-${i}`}>Reads: {p}</li>
                  ))}
                  {conn.limitations.map((l, i) => (
                    <li key={`l-${i}`}>Cannot: {l}</li>
                  ))}
                </ul>
              </details>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {conn.status === 'NOT_CONFIGURED' ? (
                  <SetupRequirementsBlock conn={conn} />
                ) : null}
                {(conn.status === 'NOT_CONNECTED' || conn.status === 'EXPIRED' || conn.status === 'ERROR') ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <button className="btn btn-primary" disabled={working === `connect:${conn.platform}`} onClick={() => handleConnect(conn.platform)}>
                      {working === `connect:${conn.platform}` ? 'Opening provider…' : conn.status === 'NOT_CONNECTED' ? `Connect ${conn.displayName}` : 'Reconnect'}
                    </button>
                    {conn.server?.redirectUri ? (
                      <p className="tiny" style={{ margin: 0 }}>
                        If the provider refuses, allow-list this redirect URI in the provider app:{' '}
                        <code style={{ wordBreak: 'break-all' }}>{conn.server.redirectUri}</code>
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {(conn.status === 'CONNECTED' || conn.status === 'PAUSED') ? (
                  <button className="btn btn-secondary" disabled={working === `refresh:${conn.platform}`} onClick={() => handleRefresh(conn.platform)}>
                    Refresh
                  </button>
                ) : null}
                {(conn.status === 'CONNECTED' || conn.status === 'PAUSED') ? (
                  <button className="btn btn-secondary" disabled={working === `pause:${conn.platform}`} onClick={() => handlePause(conn.platform, conn.active)}>
                    {conn.active ? 'Pause' : 'Resume'}
                  </button>
                ) : null}
                {conn.connected ? (
                  <button className="btn btn-secondary" disabled={working === `disconnect:${conn.platform}`} onClick={() => handleDisconnect(conn.platform)}>
                    Disconnect
                  </button>
                ) : null}
                {conn.postCount > 0 || postsFor === conn.platform ? (
                  <button className="btn btn-secondary" disabled={working === `posts:${conn.platform}`} onClick={() => void handleShowPosts(conn.platform)}>
                    {postsFor === conn.platform ? 'Hide items' : `Show pulled items (${conn.postCount})`}
                  </button>
                ) : null}
              </div>
              <dl style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', margin: '0.5rem 0 0', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <dt style={{ color: 'var(--color-text-muted)', minWidth: '7rem' }}>Research</dt>
                  <dd style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                    {conn.research?.wired ? 'Available through separate configuration' : 'Not currently available'}
                    {conn.research?.note ? ` — ${conn.research.note}` : null}
                  </dd>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <dt style={{ color: 'var(--color-text-muted)', minWidth: '7rem' }}>Publishing</dt>
                  <dd style={{ margin: 0, color: 'var(--color-text-secondary)' }}>Not configured</dd>
                </div>
                {conn.lastPulledAt ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <dt style={{ color: 'var(--color-text-muted)', minWidth: '7rem' }}>Last verified</dt>
                    <dd style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                      {new Date(conn.lastPulledAt).toLocaleString()}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {postsFor === conn.platform ? (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {posts.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                      No pulled items yet. Use Refresh to pull from {conn.displayName}.
                    </p>
                  ) : null}
                  {posts.map((post) => (
                    <div key={String(post.id)} style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
                        {String(post.title ?? post.text?.split('\n')[0] ?? '(untitled)').slice(0, 120)}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.125rem 0' }}>
                        {conn.displayName}
                        {post.author ? ` · ${String(post.author)}` : ''}
                        {post.publishedAt ? ` · ${String(post.publishedAt).slice(0, 10)}` : ''}
                        {post.url ? (
                          <>
                            {' · '}<a href={String(post.url)} target="_blank" rel="noreferrer">source</a>
                          </>
                        ) : null}
                        {!post.connectionId ? ' · from a disconnected connection (kept as inspiration)' : ''}
                      </p>
                      <button
                        className="btn btn-secondary"
                        disabled={savingIdea === String(post.id)}
                        onClick={() => void handleSaveIdea(post)}
                      >
                        {savingIdea === String(post.id) ? 'Saving...' : 'Save as content idea'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p>
      ) : null}
    </div>
  );
}

function probeBadgeClass(status: string): string {
  if (status === 'VERIFIED') return 'badge badge-success';
  if (status === 'FAILED' || status === 'BLOCKED' || status === 'UNAVAILABLE') return 'badge badge-error';
  return 'badge badge-neutral';
}

/**
 * Research catalogue: every registry-backed source the product supports,
 * driven by persisted per-workspace configuration. Feed-owned sources
 * (RSS/Atom/HN/GitHub/Blog/Site) are NOT configured here — the feed list
 * below stays their source of truth. OAuth account cards above stay the
 * account-connection surface; research cards here never imply that a
 * connected account enables research.
 */
function ResearchCatalogueSection() {
  const [entries, setEntries] = useState<WorkspaceConnectorEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listConnectors();
      setEntries(data.connectors ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleToggle(entry: WorkspaceConnectorEntry) {
    setWorking(`toggle:${entry.sourceType}`);
    setMessage(null);
    try {
      await updateConnectorConfig(entry.sourceType, { enabled: !entry.enabled, config: entry.config });
      await fetchData();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleVerify(entry: WorkspaceConnectorEntry) {
    setWorking(`verify:${entry.sourceType}`);
    setMessage(null);
    try {
      const res = await verifyConnector(entry.sourceType);
      setMessage(`${entry.displayName}: ${res.probe.status} — ${res.note ?? 'probe complete.'}`);
      await fetchData();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
      await fetchData();
    } finally {
      setWorking(null);
    }
  }

  const research = entries.filter((e) => e.group === 'RESEARCH');
  const platforms = entries.filter((e) => e.group === 'CONNECTED_PLATFORM');
  const unavailable = entries.filter((e) => e.group === 'UNAVAILABLE');

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Research catalogue</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        What the AI brain may read for this workspace. Only sources you enable here run — nothing is
        fetched silently. A passing check proves one probe request worked just now, never future data.
      </p>
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading catalogue...</p> : null}
      {!loading && error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>
          <button className="btn btn-secondary" onClick={() => void fetchData()}>Retry</button>
        </div>
      ) : null}
      {!loading && !error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <p className="kicker">Research sources</p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0, margin: 0 }}>
              {research.map((entry) => (
                <ResearchCard
                  key={entry.sourceType}
                  entry={entry}
                  working={working}
                  onToggle={() => void handleToggle(entry)}
                  onVerify={() => void handleVerify(entry)}
                  onSaved={() => void fetchData()}
                  onMessage={setMessage}
                />
              ))}
            </ul>
          </div>
          <div>
            <p className="kicker">Feed-managed sources</p>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              RSS, Atom, Hacker News, GitHub releases, Blog and Site are configured as feed sources —
              use “Add a source” below or Onboarding → Signal sources. They are not toggled here.
            </p>
          </div>
          <div>
            <p className="kicker">Connected platforms — research state</p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0, margin: 0 }}>
              {platforms.map((entry) => (
                <li key={entry.sourceType} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: 600, margin: 0 }}>{entry.displayName}</p>
                    <span className="badge badge-neutral">{entry.workerEligible ? (entry.workerWillRun ? 'Will run' : 'Eligible') : 'Research off'}</span>
                    {entry.accountState === 'CONNECTED' ? <span className="badge badge-success">Account connected</span> : null}
                  </div>
                  {entry.requiresAccountNote ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>{entry.requiresAccountNote}</p>
                  ) : null}
                  {entry.notWiredReason ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>{entry.notWiredReason}</p>
                  ) : null}
                  <details>
                    <summary className="tiny" style={{ cursor: 'pointer' }}>Developer details</summary>
                    <p className="tiny" style={{ margin: '0.25rem 0 0' }}>Capability: {entry.sourceOfTruth}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
          {unavailable.length > 0 ? (
            <div>
              <p className="kicker">Unavailable</p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0, margin: 0 }}>
                {unavailable.map((entry) => (
                  <li key={entry.sourceType} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: 600, margin: 0 }}>{entry.displayName}</p>
                      <span className="badge badge-error">Unavailable</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>{entry.description}</p>
                    <details>
                      <summary className="tiny" style={{ cursor: 'pointer' }}>Why unavailable</summary>
                      <p className="tiny" style={{ margin: '0.25rem 0 0' }}>Capability: {entry.sourceOfTruth}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p>
      ) : null}
    </div>
  );
}

function ResearchCard({
  entry,
  working,
  onToggle,
  onVerify,
  onSaved,
  onMessage,
}: {
  entry: WorkspaceConnectorEntry;
  working: string | null;
  onToggle: () => void;
  onVerify: () => void;
  onSaved: () => void;
  onMessage: (msg: string | null) => void;
}) {
  const [draft, setDraft] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('hot');
  const [timeFilter, setTimeFilter] = useState<string>('day');
  const [topics, setTopics] = useState<string>('');
  const [geo, setGeo] = useState<string>('US');
  const [timeRange, setTimeRange] = useState<string>('now 7-d');
  const [category, setCategory] = useState<string>('0');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    const cfg = (entry.config ?? {}) as Record<string, unknown>;
    if (entry.sourceType === 'REDDIT') {
      if (Array.isArray(cfg.subreddits)) setDraft((cfg.subreddits as unknown[]).map(String).join(', '));
      if (typeof cfg.sortBy === 'string') setSortBy(cfg.sortBy);
      if (typeof cfg.timeFilter === 'string') setTimeFilter(cfg.timeFilter);
    }
    if (entry.sourceType === 'GOOGLE_TRENDS') {
      if (Array.isArray(cfg.topics)) setTopics((cfg.topics as unknown[]).map(String).join(', '));
      if (typeof cfg.geo === 'string') setGeo(cfg.geo);
      if (typeof cfg.timeRange === 'string') setTimeRange(cfg.timeRange);
      if (typeof cfg.category !== 'undefined') setCategory(String(cfg.category));
    }
    setInitialized(true);
  }, [entry, initialized]);

  async function handleSave() {
    onMessage(null);
    try {
      if (entry.sourceType === 'REDDIT') {
        const subreddits = draft.split(',').map((s) => s.trim()).filter(Boolean);
        await updateConnectorConfig('REDDIT', { enabled: entry.enabled, config: { subreddits, sortBy, timeFilter } });
      } else if (entry.sourceType === 'GOOGLE_TRENDS') {
        const topicList = topics.split(',').map((s) => s.trim()).filter(Boolean);
        await updateConnectorConfig('GOOGLE_TRENDS', {
          enabled: entry.enabled,
          config: { topics: topicList, geo: geo.trim() || 'US', timeRange: timeRange.trim() || 'now 7-d', category: Number.parseInt(category, 10) || 0 },
        });
      } else {
        await updateConnectorConfig(entry.sourceType, { enabled: entry.enabled, config: entry.config });
      }
      onSaved();
    } catch (err) {
      onMessage(friendlyErrorMessage(err));
    }
  }

  return (
    <li style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ fontWeight: 600, margin: 0 }}>{entry.displayName}</p>
        <span className={entry.enabled ? 'badge badge-success' : 'badge badge-neutral'}>
          {entry.enabled ? 'Enabled' : 'Disabled'}
        </span>
        <span className={probeBadgeClass(entry.probe.status)}>{entry.probe.status.replace(/_/g, ' ')}</span>
        {entry.workerWillRun ? (
          <span className="badge badge-success">Will run</span>
        ) : (
          <span className="badge badge-neutral">Will not run</span>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>{entry.description}</p>
      <p className="tiny" style={{ margin: '0.25rem 0 0' }}>
        Auth: {entry.authKind === 'NONE' ? 'Public / no OAuth' : entry.authKind}
      </p>
      <details>
        <summary className="tiny" style={{ cursor: 'pointer' }}>Developer details</summary>
        <p className="tiny" style={{ margin: '0.25rem 0 0' }}>Capability: {entry.sourceOfTruth}</p>
      </details>
      {entry.probe.error ? (
        <p role="alert" style={{ fontSize: '0.75rem', color: 'var(--color-error)', margin: '0.25rem 0 0' }}>{entry.probe.error}</p>
      ) : null}
      {entry.sourceType === 'YOUTUBE' && !entry.serverCredsPresent ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 0' }}>
          Not configured by the administrator — no YouTube Data API key on this server. Enabling it without credentials will honestly skip every run.
        </p>
      ) : null}
      {(entry.sourceType === 'REDDIT' || entry.sourceType === 'GOOGLE_TRENDS') && entry.enabled ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {entry.sourceType === 'REDDIT' ? (
            <>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Subreddits, comma-separated (e.g. programming, artificial)"
                aria-label="Subreddits"
                style={{ ...fieldStyle, flex: '2 1 220px' }}
              />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort" style={fieldStyle}>
                <option value="hot">hot</option>
                <option value="new">new</option>
                <option value="top">top</option>
                <option value="rising">rising</option>
                <option value="controversial">controversial</option>
              </select>
              <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} aria-label="Time window" style={fieldStyle}>
                <option value="hour">hour</option>
                <option value="day">day</option>
                <option value="week">week</option>
                <option value="month">month</option>
                <option value="year">year</option>
                <option value="all">all</option>
              </select>
            </>
          ) : (
            <>
              <input
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="Topics, comma-separated (e.g. AI, vibe coding)"
                aria-label="Topics"
                style={{ ...fieldStyle, flex: '2 1 220px' }}
              />
              <input value={geo} onChange={(e) => setGeo(e.target.value)} placeholder="US" aria-label="Region" style={{ ...fieldStyle, flex: '0 1 90px' }} />
              <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} aria-label="Time range" style={fieldStyle}>
                <option value="now 1-d">now 1-d</option>
                <option value="now 7-d">now 7-d</option>
                <option value="today 1-m">today 1-m</option>
                <option value="today 3-m">today 3-m</option>
                <option value="today 12-m">today 12-m</option>
              </select>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="0" inputMode="numeric" aria-label="Category (0 = all)" style={{ ...fieldStyle, flex: '0 1 90px' }} />
            </>
          )}
          <button className="btn btn-secondary" onClick={() => void handleSave()}>
            Save
          </button>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        <button className="btn btn-secondary" disabled={working === `toggle:${entry.sourceType}`} onClick={onToggle}>
          {entry.enabled ? 'Disable' : 'Enable'}
        </button>
        <button className="btn btn-secondary" disabled={working === `verify:${entry.sourceType}`} onClick={onVerify}>
          Verify now
        </button>
      </div>
    </li>
  );
}

function SourcesSection() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSources();
      setSources(data.sources ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    setFormMessage(null);
    try {
      await createSource(url.trim());
      setUrl('');
      setFormMessage('Source added.');
      await fetchData();
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Add a source</h3>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/article"
            style={{ ...fieldStyle, flex: '1 1 260px' }}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !url.trim()}>
            {saving ? 'Adding...' : 'Add source'}
          </button>
        </form>
        {formMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {formMessage}
          </p>
        ) : null}
      </div>

      {loading ? <LoadingBlock label="Loading sources..." /> : null}
      {!loading && error ? <ErrorBlock message={error} onRetry={() => void fetchData()} /> : null}
      {!loading && !error && sources.length === 0 ? (
        <EmptyBlock title="No sources yet" description="Add your first source above to start building intelligence." />
      ) : null}
      {!loading && !error && sources.length > 0 ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>Sources ({sources.length})</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
            {sources.map((source) => (
              <li key={String(source.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                <p style={{ fontWeight: 600 }}>{String(source.title ?? source.url ?? source.id)}</p>
                {source.url ? (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', wordBreak: 'break-all' }}>
                    {String(source.url)}
                  </p>
                ) : null}
                {source.status ? <span className="badge badge-neutral">{String(source.status)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

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
