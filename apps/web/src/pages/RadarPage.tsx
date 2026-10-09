import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock, ScoreBar, TimeAgo } from '../components/ui';
import { friendlyErrorMessage, listNextActions, listRuns } from '../services/api';
import type { DailyRunSummary, OperatorAction } from '../types';

export function RadarPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [total, setTotal] = useState(0);
  const [lastRun, setLastRun] = useState<DailyRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, runs] = await Promise.all([
        listNextActions({ status: 'pending' }),
        listRuns({ take: 3 }).catch(() => ({ runs: [] as DailyRunSummary[] })),
      ]);
      setActions(pending.actions ?? []);
      setTotal(pending.total ?? (pending.actions ?? []).length);
      setLastRun(runs.runs?.[0] ?? null);
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
        <PageHead kicker="Start here" title="Discover" sub="Sign in to see ranked recommendations." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead kicker="Start here" title="Discover" sub="Ranked recommendations, live." />
        <SkeletonBlock lines={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead kicker="Start here" title="Discover" sub="Ranked recommendations, live." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Research · Older view"
        title="Discover"
        sub={total === 0 ? 'Nothing pending — the system is quiet. This older list now lives inside Research.' : `${total} pending recommendation${total === 1 ? '' : 's'}, ranked by expected impact. For daily work, use Research.`}
        nextStep="Go to Research for the simpler view with evidence."
        helpHref="/help#research"
        actions={<Link to="/observatory" className="btn btn-primary btn-sm">Open Research</Link>}
      />
      {lastRun ? (
        <p className="muted" style={{ margin: 0 }}>
          Last research check {String(lastRun.status).toLowerCase().replace(/_/g, ' ')}{' '}
          <TimeAgo value={lastRun.runDate ?? lastRun.finishedAt ?? lastRun.startedAt ?? null} />.
        </p>
      ) : null}
      {actions.length === 0 ? (
        <EmptyState
          title="Radar is clear"
          what="No pending recommendations right now."
          why="New suggestions appear here when the system completes a run or detects fresh signals."
          nextStep="Open Research to browse with “Why it matters” on each item."
          action={<Link to="/observatory" className="btn btn-secondary btn-sm">Open Research</Link>}
        />
      ) : (
        <SectionCard title={`Live queue (${actions.length} shown)`}>
          <ul className="plain-list">
            {actions.map((a) => (
              <li key={a.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                    <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>
                      <span className="badge badge-neutral" style={{ marginRight: '0.5rem' }}>{a.kind}</span>
                      {a.title}
                    </p>
                    {a.reasons.length > 0 ? (
                      <p className="muted" style={{ margin: '0.3rem 0 0' }}>{a.reasons[0]}</p>
                    ) : null}
                  </div>
                  <div className="actions" style={{ alignItems: 'center' }}>
                    <ScoreBar value={a.score} max={100} />
                    <span className="tiny mono">{Math.round(a.score)}</span>
                    <TimeAgo value={a.decidedAt ?? a.acceptedAt ?? a.completedAt} />
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
