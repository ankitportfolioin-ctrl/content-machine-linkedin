import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock, ScoreBar } from '../components/ui';
import {
  convertOpportunity,
  friendlyErrorMessage,
  getOpportunity,
  getOpportunityScoring,
  listOpportunities,
  triageOpportunity,
} from '../services/api';
import type { Opportunity, OpportunityScoring } from '../types';

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function evidenceCount(o: Opportunity): number | null {
  if (Array.isArray(o.evidence)) return o.evidence.length;
  if (typeof o.evidence === 'number') return o.evidence;
  return null;
}

export function OpportunitiesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('selected');

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOpportunities({ status: 'NEW' });
      setOpportunities(data.opportunities ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void fetchAll();
    else setLoading(false);
  }, [isAuthenticated, fetchAll]);

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Start here" title="Post ideas" sub="Sign in to see scored opportunities." />
        <LoginForm />
      </div>
    );
  }
  // Background refreshes (after convert/triage) must not unmount the detail
  // view and wipe its confirmation message — skeleton only on first load.
  if (loading && opportunities.length === 0) {
    return (
      <div className="stack">
        <PageHead kicker="Start here" title="Post ideas" sub="Scoring the evidence…" />
        <SkeletonBlock lines={5} />
      </div>
    );
  }
  if (error && opportunities.length === 0) {
    return (
      <div className="stack">
        <PageHead kicker="Start here" title="Post ideas" sub="Scored content bets." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  if (selectedId) {
    return (
      <OpportunityDetail
        opportunityId={selectedId}
        onBack={() => setParams({})}
        onChanged={() => void fetchAll()}
      />
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Start here"
        title="Post ideas"
        sub={opportunities.length === 0 ? 'No scored opportunities yet.' : `${opportunities.length} scored content bet${opportunities.length === 1 ? '' : 's'} — highest impact first.`}
      />
      {opportunities.length === 0 ? (
        <EmptyState
          title="No opportunities yet"
          what="Opportunities are created when trends, audience problems, and content gaps align."
          why="Run an intelligence scan — scored bets with evidence will appear here."
          action={<Link to="/observatory" className="btn btn-secondary btn-sm">Inspect signals</Link>}
        />
      ) : (
        <div className="grid-2">
          {opportunities.map((o) => {
            const count = evidenceCount(o);
            return (
              <SectionCard
                key={o.id}
                title={o.title}
                action={
                  typeof o.score === 'number' ? (
                    <span className="badge badge-accent">{Math.round(o.score)}</span>
                  ) : (
                    <span className="badge badge-neutral">Unscored</span>
                  )
                }
              >
                {o.description ? <p className="muted" style={{ marginBottom: '0.6rem' }}>{o.description}</p> : null}
                <div className="actions" style={{ marginBottom: '0.75rem' }} aria-label="Opportunity facts">
                  {o.topic ? <span className="badge badge-neutral">{o.topic}</span> : null}
                  {o.audience ? <span className="badge badge-neutral">{o.audience}</span> : null}
                  {count !== null ? <span className="badge badge-info">{count} evidence</span> : null}
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setParams({ selected: o.id })}
                >
                  Open opportunity
                </button>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OpportunityDetail({
  opportunityId,
  onBack,
  onChanged,
}: {
  opportunityId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [scoring, setScoring] = useState<OpportunityScoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, score] = await Promise.all([
        getOpportunity(opportunityId),
        getOpportunityScoring(opportunityId).catch(() => null),
      ]);
      setOpportunity(detail.opportunity);
      setScoring(score?.scoring ?? null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  async function handleConvert() {
    setWorking(true);
    setMessage(null);
    try {
      const result = await convertOpportunity(opportunityId);
      setMessage(`Draft idea “${result.contentIdea.title}” created. Find it under Studio.`);
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function handleTriage(status: 'REVIEWED' | 'DISMISSED') {
    setWorking(true);
    setMessage(null);
    try {
      await triageOpportunity(opportunityId, status);
      setMessage(status === 'REVIEWED' ? 'Marked as reviewed.' : 'Dismissed.');
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <div className="stack">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to opportunities
        </button>
        <SkeletonBlock lines={6} />
      </div>
    );
  }
  if (error || !opportunity) {
    return (
      <div className="stack">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to opportunities
        </button>
        <ErrorState message={error ?? 'Opportunity not found.'} onRetry={() => void fetchDetail()} />
      </div>
    );
  }

  const count = evidenceCount(opportunity);
  const format = str(opportunity.format) ?? str(opportunity.contentFormat);
  const hook = str(opportunity.hook);
  const angle = str(opportunity.angle);
  const reasoning = str(opportunity.reasoning) ?? opportunity.description ?? null;
  const evidenceItems = Array.isArray(opportunity.evidence) ? opportunity.evidence.slice(0, 8) : [];

  return (
    <div className="stack">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Back to opportunities
      </button>
      <section className="recommend" aria-label="Opportunity score">
        <div className="kicker">Opportunity score</div>
        <div className="row-between" style={{ alignItems: 'flex-end' }}>
          <p style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {typeof opportunity.score === 'number' ? Math.round(opportunity.score) : '—'}
            <span className="tiny"> / 100</span>
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={working} onClick={() => void handleConvert()}>
              {working ? 'Working…' : 'Generate Draft'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={working} onClick={() => void handleTriage('REVIEWED')}>
              Mark reviewed
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={working} onClick={() => void handleTriage('DISMISSED')}>
              Dismiss
            </button>
          </div>
        </div>
        <p className="recommend-text" style={{ marginTop: '0.6rem' }}>{opportunity.title}</p>
        {message ? (
          <p className="muted" role="status" style={{ marginTop: '0.5rem' }}>
            {message} <Link to="/content">Open Studio</Link>
          </p>
        ) : null}
      </section>

      {scoring && scoring.dimensions.length > 0 ? (
        <SectionCard title="Score breakdown">
          <ul className="plain-list">
            {scoring.dimensions.map((d) => (
              <li key={d.name}>
                <div className="row-between" style={{ marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>
                    {d.name.replace(/_/g, ' ')}
                  </span>
                  <span className="tiny mono">{d.score.toFixed(1)}</span>
                </div>
                <ScoreBar value={d.score} max={10} />
                {d.explanation ? <p className="tiny" style={{ marginTop: '0.25rem' }}>{d.explanation}</p> : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid-2">
        <SectionCard title="Why this matters">
          {reasoning ? <p className="muted">{reasoning}</p> : <p className="muted">No reasoning recorded for this opportunity.</p>}
          <div className="actions" style={{ marginTop: '0.6rem' }}>
            {opportunity.topic ? <span className="badge badge-neutral">{opportunity.topic}</span> : null}
            {opportunity.audience ? <span className="badge badge-neutral">{opportunity.audience}</span> : null}
            {count !== null ? <span className="badge badge-info">{count} evidence</span> : null}
          </div>
        </SectionCard>

        <SectionCard title="Recommended content">
          {format ? <p style={{ fontSize: '0.87rem' }}><strong>Format:</strong> {format}</p> : null}
          {hook ? <p style={{ fontSize: '0.87rem', marginTop: '0.4rem' }}><strong>Hook:</strong> “{hook}”</p> : null}
          {angle ? <p style={{ fontSize: '0.87rem', marginTop: '0.4rem' }}><strong>Angle:</strong> {angle}</p> : null}
          {!format && !hook && !angle ? (
            <p className="muted" style={{ margin: 0 }}>No format recommendation recorded. Open the workbench for full analysis.</p>
          ) : null}
          {evidenceItems.length > 0 ? (
            <div style={{ marginTop: '0.6rem' }}>
              <p className="tiny">Evidence</p>
              <ul className="bullet-list">
                {evidenceItems.map((e, i) => (
                  <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e).slice(0, 160)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
