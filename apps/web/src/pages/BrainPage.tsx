import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  convertOpportunity,
  createSource,
  friendlyErrorMessage,
  getIntelligenceOverview,
  getOpportunity,
  isAiUnavailable,
  listGaps,
  listOpportunities,
  listSources,
  listTrends,
  submitOpportunityFeedback,
} from '../services/api';
import {
  ContentGap,
  IntelligenceOverview,
  Opportunity,
  OpportunityFeedbackKind,
  Source,
  TrendSignal,
} from '../types';

type BrainTab = 'overview' | 'opportunities' | 'trends' | 'gaps' | 'sources';

const TABS: { id: BrainTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'trends', label: 'Trends' },
  { id: 'gaps', label: 'Gaps' },
  { id: 'sources', label: 'Sources' },
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
      {tab === 'sources' ? <SourcesSection /> : null}
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

function OpportunitiesSection() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await listOpportunities();
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
  }, []);

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
    return <EmptyBlock title="No opportunities yet" description="New content opportunities will appear here when they are detected." />;
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>
        Opportunities ({opportunities.length})
      </h3>
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
  const [convertTitle, setConvertTitle] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOpportunity(opportunityId);
      setOpportunity(data.opportunity);
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
          </li>
        ))}
      </ul>
    </div>
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

const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text)',
  padding: '0.625rem 0.75rem',
  width: '100%',
};
