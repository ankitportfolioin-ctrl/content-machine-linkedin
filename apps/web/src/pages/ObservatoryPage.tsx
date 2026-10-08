import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock, TimeAgo } from '../components/ui';
import { friendlyErrorMessage, listSources, listTrends, listGaps } from '../services/api';
import type { Source, TrendSignal, ContentGap } from '../types';

const FILTERS = ['All', 'Trends', 'Gaps', 'Sources'] as const;

export function ObservatoryPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [sources, setSources] = useState<Source[]>([]);
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [gaps, setGaps] = useState<ContentGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, g] = await Promise.all([
        listSources().catch(() => ({ sources: [] as Source[] })),
        listTrends().catch(() => ({ trends: [] as TrendSignal[] })),
        listGaps().catch(() => ({ gaps: [] as ContentGap[] })),
      ]);
      setSources(s.sources ?? []);
      setTrends(t.trends ?? []);
      setGaps(g.gaps ?? []);
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

  const counts = useMemo(
    () => ({ sources: sources.length, trends: trends.length, gaps: gaps.length }),
    [sources, trends, gaps],
  );

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Intelligence" title="Content Observatory" sub="Sign in to monitor sources." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead kicker="Intelligence" title="Content Observatory" sub="Loading the feed…" />
        <SkeletonBlock lines={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead kicker="Intelligence" title="Content Observatory" sub="Live research feed." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  const showTrends = filter === 'All' || filter === 'Trends';
  const showGaps = filter === 'All' || filter === 'Gaps';
  const showSources = filter === 'All' || filter === 'Sources';
  const empty =
    (!showTrends || trends.length === 0) &&
    (!showGaps || gaps.length === 0) &&
    (!showSources || sources.length === 0);

  return (
    <div className="stack">
      <PageHead
        kicker="Intelligence"
        title="Content Observatory"
        sub={`Monitoring ${counts.sources} source${counts.sources === 1 ? '' : 's'} · ${counts.trends} trends · ${counts.gaps} gaps`}
        actions={<Link to="/brain" className="btn btn-ghost btn-sm">Open full workbench</Link>}
      />
      <div className="tabs" role="tablist" aria-label="Signal filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`btn btn-sm ${filter === f ? 'btn-primary tab-active' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {empty ? (
        <EmptyState
          title="No signals under this filter"
          what="The system has not recorded matching research yet."
          why="Connect sources and run an intelligence scan — trends, gaps, and sources will stream in here."
          action={<Link to="/connections" className="btn btn-secondary btn-sm">Manage connections</Link>}
        />
      ) : (
        <>
          {showTrends && trends.length > 0 ? (
            <SectionCard title={`Trends (${trends.length})`}>
              <ul className="plain-list">
                {trends.map((t) => (
                  <li key={t.id} className="card-row">
                    <div className="row-between">
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>{t.title ?? 'Untitled trend'}</p>
                        {t.description ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{t.description}</p> : null}
                        <p className="tiny" style={{ marginTop: '0.25rem' }}>
                          {typeof t.strength === 'number' ? `Strength ${Math.round(t.strength)} · ` : ''}
                          {String(t.status ?? 'recorded')}
                        </p>
                      </div>
                      <div className="actions">
                        <TimeAgo value={typeof t.updatedAt === 'string' ? t.updatedAt : typeof t.createdAt === 'string' ? t.createdAt : null} />
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/opportunities')}>
                          Turn into Opportunity
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {showGaps && gaps.length > 0 ? (
            <SectionCard title={`Content gaps (${gaps.length})`}>
              <ul className="plain-list">
                {gaps.map((g) => (
                  <li key={g.id} className="card-row">
                    <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>{g.title ?? 'Untitled gap'}</p>
                    {g.description ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{g.description}</p> : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {showSources && sources.length > 0 ? (
            <SectionCard title={`Sources (${sources.length})`}>
              <ul className="plain-list">
                {sources.map((s) => (
                  <li key={s.id} className="card-row">
                    <div className="row-between">
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>{s.title ?? s.url ?? 'Untitled source'}</p>
                        {s.url ? <p className="tiny mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.url}</p> : null}
                      </div>
                      {s.status ? <span className="badge badge-neutral">{s.status}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
