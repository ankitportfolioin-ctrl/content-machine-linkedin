import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock, TimeAgo } from '../components/ui';
import { decideReview, friendlyErrorMessage, listReviews } from '../services/api';
import type { ContentReview, ReviewDecision } from '../types';

export function ApprovalsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [reviews, setReviews] = useState<ContentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReviews();
      setReviews((data.reviews ?? []).filter((r) => (r.status ?? '').toUpperCase() === 'SUBMITTED'));
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

  async function decide(id: string, action: ReviewDecision) {
    setWorkingId(id);
    setMessage(null);
    try {
      await decideReview(id, action);
      setMessage(action === 'approve' ? 'Approved. It leaves the queue.' : action === 'reject' ? 'Rejected.' : 'Changes requested.');
      await fetchAll();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorkingId(null);
    }
  }

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Make posts" title="Review posts" sub="Sign in to review drafts." />
        <LoginForm />
      </div>
    );
  }
  // Same rule as opportunities: refreshes after a decision must not wipe
  // the confirmation message — skeleton only on first load.
  if (loading && reviews.length === 0) {
    return (
      <div className="stack">
        <PageHead kicker="Make posts" title="Review posts" sub="Loading items awaiting decision…" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }
  if (error && reviews.length === 0) {
    return (
      <div className="stack">
        <PageHead kicker="Make posts" title="Review posts" sub="Nothing publishes without you." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Make posts"
        title="Review posts"
        sub={reviews.length === 0 ? 'Queue is empty.' : `${reviews.length} item${reviews.length === 1 ? '' : 's'} awaiting your decision. Nothing publishes without approval.`}
      />
      {message ? (
        <div className="card" role="status" style={{ padding: '0.75rem 1rem' }}>
          <p className="muted" style={{ margin: 0 }}>{message}</p>
        </div>
      ) : null}
      {reviews.length === 0 ? (
        <EmptyState
          title="Queue is empty"
          what="No drafts are waiting for approval."
          why="When the studio submits a draft for review, it lands here with scores and evidence."
          action={<Link to="/content" className="btn btn-secondary btn-sm">Open Studio</Link>}
        />
      ) : (
        <SectionCard title={`Awaiting decision (${reviews.length})`}>
          <ul className="plain-list">
            {reviews.map((r) => (
              <li key={r.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>
                      Review {r.id.slice(0, 8)} · <span className="badge badge-warning">Submitted</span>
                    </p>
                    {r.note ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{r.note}</p> : null}
                    <p className="tiny" style={{ marginTop: '0.25rem' }}>
                      Draft {String(r.draftId).slice(0, 8)} · <TimeAgo value={r.createdAt} />
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={workingId === r.id}
                      onClick={() => void decide(r.id, 'approve')}
                      aria-label={`Approve review ${r.id.slice(0, 8)}`}
                    >
                      {workingId === r.id ? 'Saving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={workingId === r.id}
                      onClick={() => void decide(r.id, 'request_changes')}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={workingId === r.id}
                      onClick={() => void decide(r.id, 'reject')}
                    >
                      Reject
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
