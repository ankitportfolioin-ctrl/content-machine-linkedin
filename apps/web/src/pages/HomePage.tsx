import { useCallback, useEffect, useState } from 'react';
import { useHealth } from '../hooks/useHealth';
import { HealthResponse, OperatorAction } from '../types';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ApiRequestError,
  completeAction,
  dismissAction,
  friendlyErrorMessage,
  isAiUnavailable,
  listNextActions,
  startIdeaFromAction,
} from '../services/api';

interface StatusBadgeProps {
  status: HealthResponse['status'];
  label: string;
}

function StatusBadge({ status, label }: StatusBadgeProps) {
  const statusClass = status === 'healthy' || status === 'ready'
    ? 'status-healthy'
    : status === 'not ready'
    ? 'status-unhealthy'
    : 'status-checking';

  return (
    <span className={`status-indicator ${statusClass}`}>
      <span className="status-dot" aria-hidden="true"></span>
      {label}: {status}
    </span>
  );
}

function kindLabel(kind: string): string {
  const normalized = (kind ?? '').toLowerCase();
  if (normalized === 'content_opportunity') return 'Content opportunity';
  if (normalized === 'content_gap') return 'Content gap';
  if (normalized === 'trend_signal') return 'Trend';
  if (normalized === 'stale_draft') return 'Draft needing attention';
  if (normalized === 'prepared_action') return 'Prepared next step';
  if (normalized === 'follow_up' || normalized === 'followup') return 'Follow-up';
  if (normalized === 'learning_proposal') return 'Suggested improvement';
  if (normalized === 'objection_pattern') return 'Recurring objection';
  if (normalized === 'prospect_relevance') return 'Prospect fit';
  if (normalized.includes('review')) return 'Review';
  if (normalized.includes('pipeline') || normalized.includes('deal')) return 'Pipeline';
  if (normalized.includes('lead') || normalized.includes('prospect') || normalized.includes('outreach'))
    return 'Lead';
  if (normalized.includes('inbox') || normalized.includes('conversation') || normalized.includes('message'))
    return 'Message';
  if (normalized.includes('content') || normalized.includes('draft') || normalized.includes('opportunity'))
    return 'Content';
  if (normalized.includes('gap') || normalized.includes('trend') || normalized.includes('learning'))
    return 'Research';
  if (!normalized) return 'Suggestion';
  return normalized
    .split('_')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function kindTarget(kind: string): string {
  const normalized = (kind ?? '').toLowerCase();
  if (normalized === 'objection_pattern') return '/content';
  if (
    normalized.includes('content') ||
    normalized.includes('review') ||
    normalized.includes('draft') ||
    normalized.includes('opportunity')
  ) {
    return '/content';
  }
  if (
    normalized.includes('gap') ||
    normalized.includes('trend') ||
    normalized.includes('learning') ||
    normalized.includes('brain') ||
    normalized.includes('intelligence')
  ) {
    return '/brain';
  }
  if (
    normalized.includes('lead') ||
    normalized.includes('prospect') ||
    normalized.includes('outreach') ||
    normalized.includes('prepared')
  ) {
    return '/leads';
  }
  if (
    normalized.includes('follow') ||
    normalized.includes('inbox') ||
    normalized.includes('conversation') ||
    normalized.includes('message')
  ) {
    return '/inbox';
  }
  if (normalized.includes('pipeline') || normalized.includes('deal')) {
    return '/pipeline';
  }
  if (normalized.includes('setting')) {
    return '/settings';
  }
  return '/brain';
}

function RecommendedSteps() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await listNextActions({ status: 'pending' });
      setActions(data.actions ?? []);
      setTotal(typeof data.total === 'number' ? data.total : (data.actions ?? []).length);
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
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void fetchData();
  }, [authLoading, isAuthenticated, fetchData]);

  if (authLoading || loading) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading suggestions...</p>;
  }

  if (!isAuthenticated) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
        Sign in to see your recommended next steps.
      </p>
    );
  }

  if (aiUnavailable) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          AI assistance is temporarily unavailable. Please try again later.
        </p>
        <div>
          <button className="btn btn-secondary" onClick={() => void fetchData()}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
          {error}
        </p>
        <div>
          <button className="btn btn-secondary" onClick={() => void fetchData()}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (actions.length === 0 || total === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          No pending actions. You are all caught up — new suggestions will appear here when available.
        </p>
        <div>
          <button className="btn btn-secondary" onClick={() => void fetchData()}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const navigate = useNavigate();

  async function handleStartIdea(id: string) {
    setWorkingId(id);
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await startIdeaFromAction(id);
      await fetchData();
      navigate('/content');
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && err.code === 'CONFLICT') {
        await fetchData();
        navigate('/content');
        return;
      }
      setRowError((prev) => ({ ...prev, [id]: friendlyErrorMessage(err) }));
    } finally {
      setWorkingId(null);
    }
  }

  async function handleDecision(id: string, decision: 'dismiss' | 'complete') {
    setWorkingId(id);
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      if (decision === 'dismiss') {
        await dismissAction(id);
      } else {
        await completeAction(id);
      }
      await fetchData();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [id]: friendlyErrorMessage(err) }));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={() => void fetchData()}>
          Refresh
        </button>
      </div>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
        {actions.map((action, index) => {
          const expanded = expandedId === String(action.id);
          const topReason = Array.isArray(action.reasons) && action.reasons.length > 0
            ? String(action.reasons[0])
            : null;
          return (
            <li
              key={String(action.id)}
              style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                  {index + 1}. {action.title}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {kindLabel(String(action.kind))} · Score: {String(action.score)}
                </p>
                {topReason ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{topReason}</p>
                ) : null}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setExpandedId(expanded ? null : String(action.id))}
                  >
                    {expanded ? 'Hide details' : 'Show details'}
                  </button>
                </div>
              </div>
              {expanded ? (
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {Array.isArray(action.reasons) && action.reasons.length > 0 ? (
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Why this matters</p>
                      <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        {action.reasons.map((reason, i) => (
                          <li key={i}>{String(reason)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {Array.isArray(action.evidenceLinks) && action.evidenceLinks.length > 0 ? (
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Supporting references</p>
                      <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        {action.evidenceLinks.map((link, i) => (
                          <li key={i}>
                            {String(link.label ?? 'Reference')}: {String(link.ref ?? '')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <NavLink to={kindTarget(String(action.kind))} className="btn btn-secondary">
                      Open
                    </NavLink>
                    {String(action.kind) === 'objection_pattern' ? (
                      <button
                        className="btn btn-secondary"
                        disabled={workingId === String(action.id)}
                        onClick={() => void handleStartIdea(String(action.id))}
                      >
                        {workingId === String(action.id) ? 'Saving...' : 'Start idea'}
                      </button>
                    ) : null}
                    <button
                      className="btn btn-secondary"
                      disabled={workingId === String(action.id)}
                      onClick={() => void handleDecision(String(action.id), 'dismiss')}
                    >
                      {workingId === String(action.id) ? 'Saving...' : 'Dismiss'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={workingId === String(action.id)}
                      onClick={() => void handleDecision(String(action.id), 'complete')}
                    >
                      {workingId === String(action.id) ? 'Saving...' : 'Mark done'}
                    </button>
                  </div>
                  {rowError[String(action.id)] ? (
                    <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>
                      {rowError[String(action.id)]}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HomePage() {
  const { health, ready, loading, error, refetch } = useHealth();

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <h2 className="empty-state-title">Checking connection...</h2>
        <p className="empty-state-description">Verifying API connectivity</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2 className="empty-state-title">Connection Failed</h2>
          <p className="empty-state-description">{error}</p>
          <button className="btn btn-primary" onClick={refetch} style={{ marginTop: '1rem' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="health-grid">
        <div className="health-card">
          <div className="health-card-header">
            <h2 className="health-card-title">API Health</h2>
            <StatusBadge status={health?.status ?? 'unknown'} label="Status" />
          </div>
          <div className="health-card-details">
            <div className="health-card-detail">
              <span className="health-card-detail-label">Service</span>
              <span className="health-card-detail-value">{health?.service ?? 'Unknown'}</span>
            </div>
            <div className="health-card-detail">
              <span className="health-card-detail-label">Version</span>
              <span className="health-card-detail-value">{health?.version ?? 'Unknown'}</span>
            </div>
            <div className="health-card-detail">
              <span className="health-card-detail-label">Timestamp</span>
              <span className="health-card-detail-value">{health?.timestamp ?? 'Unknown'}</span>
            </div>
          </div>
        </div>

        <div className="health-card">
          <div className="health-card-header">
            <h2 className="health-card-title">API Readiness</h2>
            <StatusBadge status={ready?.status ?? 'unknown'} label="Status" />
          </div>
          <div className="health-card-details">
            <div className="health-card-detail">
              <span className="health-card-detail-label">Database</span>
              <span className="health-card-detail-value">
                {ready?.dependencies?.database ?? 'Unknown'}
              </span>
            </div>
            <div className="health-card-detail">
              <span className="health-card-detail-label">Timestamp</span>
              <span className="health-card-detail-value">{ready?.timestamp ?? 'Unknown'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Recommended next steps</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
          Ranked suggestions based on your recent activity. Open one to work on it, or record your decision.
        </p>
        <RecommendedSteps />
        <h2 className="health-card-title" style={{ marginBottom: '1rem', marginTop: '1.5rem' }}>Sections</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <NavLink to="/content" className="btn btn-secondary">Content</NavLink>
          <NavLink to="/brain" className="btn btn-secondary">Brain / Intelligence</NavLink>
          <NavLink to="/leads" className="btn btn-secondary">Leads</NavLink>
          <NavLink to="/inbox" className="btn btn-secondary">Inbox</NavLink>
          <NavLink to="/pipeline" className="btn btn-secondary">Pipeline</NavLink>
          <NavLink to="/analytics" className="btn btn-secondary">Analytics</NavLink>
          <NavLink to="/settings" className="btn btn-secondary">Settings</NavLink>
        </div>
      </div>
    </div>
  );
}
