import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock, ScoreBar, TimeAgo } from '../components/ui';
import { friendlyErrorMessage, listTrends } from '../services/api';
import type { TrendSignal } from '../types';

export function TrendsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
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
    if (isAuthenticated) void fetchAll();
    else setLoading(false);
  }, [isAuthenticated, fetchAll]);

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Intelligence" title="Trends" sub="Sign in to see trend momentum." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead kicker="Intelligence" title="Trends" sub="Measuring momentum…" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead kicker="Intelligence" title="Trends" sub="Momentum across sources." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Intelligence"
        title="Trends"
        sub={trends.length === 0 ? 'No trends detected yet.' : `${trends.length} tracked trend${trends.length === 1 ? '' : 's'} by momentum.`}
      />
      {trends.length === 0 ? (
        <EmptyState
          title="No trends yet"
          what="Trends emerge when multiple independent sources discuss the same topic."
          why="Connect sources and run a scan — momentum will be measured here, never invented."
          action={<Link to="/connections" className="btn btn-secondary btn-sm">Manage connections</Link>}
        />
      ) : (
        <SectionCard title={`Momentum (${trends.length})`}>
          <ul className="plain-list">
            {trends.map((t) => (
              <li key={t.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>{t.title ?? 'Untitled trend'}</p>
                    {t.description ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{t.description}</p> : null}
                    <p className="tiny" style={{ marginTop: '0.25rem' }}>{String(t.status ?? 'recorded')}</p>
                  </div>
                  <div className="actions" style={{ alignItems: 'center' }}>
                    {typeof t.strength === 'number' ? (
                      <>
                        <ScoreBar value={t.strength} max={100} />
                        <span className="tiny mono">{Math.round(t.strength)}</span>
                      </>
                    ) : (
                      <span className="badge badge-neutral">Unscored</span>
                    )}
                    <TimeAgo value={typeof t.updatedAt === 'string' ? t.updatedAt : typeof t.createdAt === 'string' ? t.createdAt : null} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/opportunities')}>
                      Opportunities
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
