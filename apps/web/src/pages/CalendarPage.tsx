import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock } from '../components/ui';
import { friendlyErrorMessage, listPlans } from '../services/api';
import type { ContentPlan } from '../types';

const GROUPS: Array<{ status: string; label: string }> = [
  { status: 'DRAFT', label: 'Draft plans' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'PUBLISHED', label: 'Published' },
];

export function CalendarPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPlans();
      setPlans(data.plans ?? []);
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
        <PageHead kicker="Content · Pipeline" title="Pipeline" sub="Sign in to see plans by status." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead kicker="Content · Pipeline" title="Pipeline" sub="Loading plans…" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead kicker="Content · Pipeline" title="Pipeline" sub="Plans grouped by status." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="stack">
        <PageHead kicker="Content · Pipeline" title="Pipeline" sub="Plans grouped by status." />
        <EmptyState
          title="No plans yet"
          what="No content plans exist in this workspace yet."
          why="Convert an opportunity into an idea, then generate a plan — it will appear here by status."
          nextStep="Time-based scheduling is not available, so nothing here carries a date."
          action={<Link to="/opportunities" className="btn btn-secondary btn-sm">Find opportunities</Link>}
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Content · Pipeline"
        title="Pipeline"
        sub={`${plans.length} plan${plans.length === 1 ? '' : 's'} by status. Time-based scheduling is not available — nothing here carries a date.`}
      />
      <div className="grid-3">
        {GROUPS.map((g) => {
          const items = plans.filter((p) => String(p.status ?? '').toUpperCase() === g.status);
          return (
            <SectionCard key={g.status} title={`${g.label} (${items.length})`}>
              {items.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>None.</p>
              ) : (
                <ul className="plain-list">
                  {items.slice(0, 8).map((p) => (
                    <li key={p.id} className="card-row">
                      <p style={{ fontWeight: 650, fontSize: '0.85rem' }}>{p.thesis || `Plan ${p.id.slice(0, 8)}`}</p>
                      {p.audience ? <p className="tiny" style={{ marginTop: '0.2rem' }}>{p.audience}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          );
        })}
      </div>
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Scheduling is not available: plans have no dates and nothing publishes from here.
          Publication is recorded manually under <Link to="/content">Content</Link> → draft → version history.
        </p>
      </div>
    </div>
  );
}
