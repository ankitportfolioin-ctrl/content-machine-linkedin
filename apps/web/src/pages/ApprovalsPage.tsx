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
  const [history, setHistory] = useState<ContentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReviews();
      const all = data.reviews ?? [];
      setReviews(all.filter((r) => (r.status ?? '').toUpperCase() === 'SUBMITTED'));
      setHistory(
        all
          .filter((r) => (r.status ?? '').toUpperCase() !== 'SUBMITTED')
          .slice(0, 10),
      );
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
      // Keep the original two-argument call when no reason was typed so the
      // recorded request shape never changes for reason-less decisions.
      const note = (notes[id] ?? '').trim() || undefined;
      if (note === undefined) {
        await decideReview(id, action);
      } else {
        await decideReview(id, action, note);
      }
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
        kicker="Content · Review"
        title="Needs your decision."
        sub={reviews.length === 0 ? 'Queue is empty. Approval never means it already happened.' : `${reviews.length} item${reviews.length === 1 ? '' : 's'} awaiting your decision. Approve, edit, or reject — nothing moves without you.`}
        nextStep="Review each item → Approve, Request changes, or Reject. An optional reason is recorded with your decision."
        helpHref="/help#approvals"
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
          why="When Content submits a draft for review, it lands here with scores and evidence."
          action={<Link to="/content" className="btn btn-secondary btn-sm">Open Content</Link>}
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
                  <div className="actions" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 200 }}>
                    <input
                      className="field"
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="Reason (optional, recorded)"
                      aria-label={`Decision reason for review ${r.id.slice(0, 8)}`}
                      disabled={workingId === r.id}
                    />
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
                        Request changes
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
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {history.length > 0 ? (
        <SectionCard title={`Decision history (${history.length})`}>
          <p className="muted" style={{ marginTop: 0 }}>
            Decided items stay here for the audit trail. Approval never meant the action already happened.
          </p>
          <ul className="plain-list">
            {history.map((r) => (
              <li key={r.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>
                      Review {r.id.slice(0, 8)} ·{' '}
                      <span className="badge badge-neutral">{String(r.decision ?? r.status ?? 'decided')}</span>
                    </p>
                    {r.note ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{r.note}</p> : null}
                    <p className="tiny" style={{ marginTop: '0.25rem' }}>
                      Draft {String(r.draftId).slice(0, 8)} · <TimeAgo value={r.createdAt} />
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
