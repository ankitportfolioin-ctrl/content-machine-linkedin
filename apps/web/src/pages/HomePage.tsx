import { useCallback, useEffect, useState } from 'react';
import { useHealth } from '../hooks/useHealth';
import { HealthResponse, OperatorAction } from '../types';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import {
  ApiRequestError,
  acceptAction,
  completeAction,
  dismissAction,
  friendlyErrorMessage,
  getAutoPrepStatus,
  getReadiness,
  getRun,
  isAiUnavailable,
  listNextActions,
  listReports,
  listRuns,
  researchProspectFromAction,
  startIdeaFromAction,
  triggerRun,
} from '../services/api';
import { AutoPrepStatus, DailyRunSummary, IntelligenceReport, ReadinessState } from '../types';

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

function ReadinessDisplay({ readiness }: { readiness: ReadinessState }) {
  const getStatusIcon = (ready: boolean) => ready ? '✓' : '✗';
  const getStatusColor = (ready: boolean) => ready ? '#16a34a' : '#dc2626';
  
  const items = [
    { key: 'workspaceIntelligenceReady', label: 'Workspace Intelligence Ready' },
    { key: 'humanApprovalReady', label: 'Human Approval Ready' },
    { key: 'linkedInExecution', label: 'LinkedIn Execution' },
  ] as const;

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 className="health-card-title" style={{ marginBottom: '0.75rem' }}>System Readiness</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map(({ key, label }) => {
          const item = readiness[key];
          return (
            <div key={key} style={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: '0.75rem',
              padding: '0.5rem',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius)'
            }}>
              <span style={{ 
                fontSize: '1.25rem', 
                color: getStatusColor(item.ready),
                flexShrink: 0,
                marginTop: '0.125rem'
              }}>
                {getStatusIcon(item.ready)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>{label}</strong>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    padding: '0.125rem 0.375rem', 
                    borderRadius: '9999px',
                    backgroundColor: item.ready ? '#16a34a20' : '#dc262620',
                    color: getStatusColor(item.ready),
                    fontWeight: 600
                  }}>
                    {item.ready ? 'Ready' : 'Not Ready'}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', marginBottom: 0 }}>
                  {item.reason}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
          Overall: 
          <span style={{ 
            color: readiness.overall === 'ready' ? '#16a34a' : 
                   readiness.overall === 'partial' ? '#ca8a04' : '#dc2626',
            textTransform: 'capitalize'
          }}>
            {readiness.overall.replace('_', ' ')}
          </span>
        </p>
      </div>
    </div>
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
  if (normalized === 'sales_content_signal') return 'Sales signal';
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
  // Explicit before the substring fallbacks below: 'sales_content_signal'
  // contains 'content', but signals live in the Inbox workflow.
  if (normalized === 'sales_content_signal') return '/inbox';
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

function deepTarget(action: OperatorAction): string {
  const base = kindTarget(String(action.kind));
  const meta = (action.subjectMeta ?? {}) as Record<string, unknown>;
  const leadId = typeof meta.leadId === 'string' && meta.leadId ? meta.leadId : null;
  if (leadId && base === '/leads') {
    return `/leads?leadId=${encodeURIComponent(leadId)}`;
  }
  return base;
}

function stageBadge(status: string): string {
  const s = status.toUpperCase();
  if (s === 'SUCCEEDED' || s === 'COMPLETED') return 'badge badge-success';
  if (s === 'FAILED') return 'badge badge-error';
  if (s === 'SKIPPED' || s.startsWith('SKIPPED')) return 'badge badge-warning';
  if (s === 'RUNNING' || s === 'STARTED') return 'badge badge-info';
  return 'badge badge-neutral';
}

function workflowPhaseForStage(stage: string): string {
  const phaseMap: Record<string, string> = {
    'INTELLIGENCE': 'Discovery',
    'DECISION': 'Recommendation',
    'CONTENT_PLAN': 'Preparation',
    'CONTENT_COMPOSE': 'Preparation',
    'CONTENT_REVIEW': 'Human Decision',
    'SALES_RESEARCH': 'Preparation',
    'SALES_QUALIFY': 'Preparation',
    'SALES_BRIEF': 'Preparation',
    'SALES_DRAFT': 'Preparation',
    'SALES_REVIEW': 'Human Decision',
    'APPROVAL_SNAPSHOT': 'Human Decision',
    'EXECUTION': 'Execution',
    'OBSERVE': 'Outcome',
    'DIGEST': 'Learning',
  };
  return phaseMap[stage] ?? stage;
}

function stageDisplayName(stage: string): string {
  const nameMap: Record<string, string> = {
    'INTELLIGENCE': 'Intelligence (Discovery)',
    'DECISION': 'Decision (Recommendation)',
    'CONTENT_PLAN': 'Content Plan (Preparation)',
    'CONTENT_COMPOSE': 'Content Compose (Preparation)',
    'CONTENT_REVIEW': 'Content Review (Human Decision)',
    'SALES_RESEARCH': 'Sales Research (Preparation)',
    'SALES_QUALIFY': 'Sales Qualify (Preparation)',
    'SALES_BRIEF': 'Sales Brief (Preparation)',
    'SALES_DRAFT': 'Sales Draft (Preparation)',
    'SALES_REVIEW': 'Sales Review (Human Decision)',
    'APPROVAL_SNAPSHOT': 'Approval Snapshot (Human Decision)',
    'EXECUTION': 'Execution',
    'OBSERVE': 'Observe (Outcome)',
    'DIGEST': 'Digest (Learning)',
  };
  return nameMap[stage] ?? stage;
}

function TodayBatch() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [digest, setDigest] = useState<IntelligenceReport | null>(null);
  const [run, setRun] = useState<DailyRunSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reports, runs] = await Promise.all([
        listReports({ frequency: 'DAILY', limit: 1 }),
        listRuns({ take: 1 }),
      ]);
      setDigest(reports.reports?.[0] ?? null);
      const latest = runs.runs?.[0] ?? null;
      if (latest) {
        try {
          const full = await getRun(String(latest.id));
          setRun(full.run ?? latest);
        } catch {
          setRun(latest);
        }
      } else {
        setRun(null);
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
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

  async function handleTrigger() {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      const res = await triggerRun();
      setTriggerMsg(`Loop finished with status ${res.result.status}${res.result.resumed ? ' (resumed existing run)' : ''}.`);
      await fetchData();
    } catch (err) {
      setTriggerMsg(friendlyErrorMessage(err));
    } finally {
      setTriggering(false);
    }
  }

  if (authLoading || loading) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading today's batch...</p>;
  }

  if (!isAuthenticated) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
        Sign in to see today's batch.
      </p>
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

  const topics = digest?.emergingTopics ?? [];
  const strong = digest?.strongSignals ?? [];
  const weak = digest?.weakSignals ?? [];
  const patterns = digest?.learnedPatterns ?? [];
  const experiments = digest?.experiments ?? [];
  const recommended = digest?.recommendedTopics ?? [];
  const stages = run?.stages ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
          <h3 className="section-title">Daily digest</h3>
          {digest ? <span className="badge badge-info">{String(digest.frequency)}</span> : null}
        </div>
        {!digest ? (
          <p className="muted">No digest yet. Trigger the loop to generate today's batch.</p>
        ) : (
          <div className="stack-sm">
            <p className="tiny">
              Period {String(digest.periodStart).slice(0, 10)} → {String(digest.periodEnd).slice(0, 10)}
              {digest.confidenceLevel ? ` · confidence ${String(digest.confidenceLevel)}` : ''}
            </p>
            <ul className="bullet-list">
              <li>Emerging topics: {topics.length}{topics[0]?.title ? ` — ${String(topics[0].title)}` : ''}</li>
              <li>Strong signals: {strong.length} · weak signals: {weak.length}</li>
              <li>Learned patterns: {patterns.length} · experiments: {experiments.length}</li>
              <li>Recommended topics: {recommended.length}{recommended[0]?.title ? ` — ${String(recommended[0].title)}` : ''}</li>
            </ul>
            <div className="actions">
              <NavLink to="/brain" className="btn btn-secondary">Review opportunities</NavLink>
              <NavLink to="/learning" className="btn btn-secondary">Learning</NavLink>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
          <h3 className="section-title">Latest loop run</h3>
          {run ? <span className={stageBadge(String(run.status))}>{String(run.status)}</span> : null}
        </div>
        {!run ? (
          <p className="muted">No runs recorded yet.</p>
        ) : (
          <div className="stack-sm">
            <p className="tiny">
              {String(run.runDate).slice(0, 10)}
              {run.finishedAt ? ` · finished ${String(run.finishedAt).slice(11, 16)} UTC` : ' · still running'}
            </p>
            {stages.length > 0 ? (
              <div className="actions">
                {stages.map((s) => (
                  <span key={s.stage} className={stageBadge(String(s.status))} title={`${s.stage} (${workflowPhaseForStage(s.stage)}): ${s.status}`}>
                    {stageDisplayName(s.stage)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">Blocked before any stage ran (see status).</p>
            )}
          </div>
        )}
        <div className="actions" style={{ marginTop: '0.75rem' }}>
          <button className="btn btn-primary" disabled={triggering} onClick={() => void handleTrigger()}>
            {triggering ? 'Running...' : 'Run today’s loop now'}
          </button>
          <button className="btn btn-secondary" onClick={() => void fetchData()}>
            Refresh
          </button>
        </div>
        {triggerMsg ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {triggerMsg}
          </p>
        ) : null}
      </div>
    </div>
  );
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
  const [autoPrep, setAutoPrep] = useState<AutoPrepStatus | null>(null);
  // Hooks must all run before any early return below: adding navigate here fixes
  // a hooks-order crash (first render returned during loading, later renders
  // called one extra hook).
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const [data, prep] = await Promise.all([
        listNextActions({ status: 'pending' }),
        getAutoPrepStatus().catch(() => null),
      ]);
      setActions(data.actions ?? []);
      setTotal(typeof data.total === 'number' ? data.total : (data.actions ?? []).length);
      if (prep) setAutoPrep(prep.status);
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

  function leadsTargetFor(leadId: string | null | undefined): string {
    return leadId ? `/leads?leadId=${encodeURIComponent(leadId)}` : '/leads';
  }

  async function handleResearchProspect(id: string, leadId?: string | null) {
    setWorkingId(id);
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const result = await researchProspectFromAction(id);
      await fetchData();
      navigate(leadsTargetFor(result.research.leadId ?? leadId));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409 && err.code === 'CONFLICT') {
        await fetchData();
        navigate(leadsTargetFor(leadId));
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

  // Batch 2 (A): acceptance authorizes preparation of internal work — it is
  // not execution approval. The action leaves the pending queue; preparation
  // happens through the auto-preparation pass or the Start-idea/Research
  // buttons, and every approval gate stays enforced.
  async function handleAccept(id: string) {
    setWorkingId(id);
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      await acceptAction(id, { reason: 'Accepted for preparation from Home.' });
      await fetchData();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [id]: friendlyErrorMessage(err) }));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        {autoPrep ? (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
            Auto-preparation: {autoPrep.usedToday}/{autoPrep.policy.dailyAutoPreparationQuota} used today
            {autoPrep.quotaReached ? ' · quota reached (backlog preserved for tomorrow)' : ''}
            {!autoPrep.policy.autoPrepareApprovedWork ? ' · approved-work auto-prep off' : ''}
            {autoPrep.policy.autoPrepareColdWork ? ' · cold auto-prep on' : ''}
          </p>
        ) : <span />}
        <button className="btn btn-secondary" onClick={() => void fetchData()}>
          Refresh
        </button>
      </div>
      <ul className="plain-list">
        {actions.map((action, index) => {
          const expanded = expandedId === String(action.id);
          const topReason = Array.isArray(action.reasons) && action.reasons.length > 0
            ? String(action.reasons[0])
            : null;
          return (
            <li
              key={String(action.id)}
              className="card-row"
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                  {index + 1}. {action.title}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {kindLabel(String(action.kind))} · Score: {String(action.score)}
                  {String(action.status ?? 'PENDING').toUpperCase() === 'ACCEPTED' ? ' · Accepted for preparation' : ''}
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
                    <NavLink to={deepTarget(action)} className="btn btn-secondary">
                      Open
                    </NavLink>
                    {(String(action.kind) === 'objection_pattern' || String(action.kind) === 'prospect_relevance' || String(action.kind) === 'sales_content_signal') ? (
                      <button
                        className="btn btn-secondary"
                        disabled={workingId === String(action.id)}
                        onClick={() => void handleStartIdea(String(action.id))}
                      >
                        {workingId === String(action.id) ? 'Saving...' : 'Start idea'}
                      </button>
                    ) : null}
                    {String(action.kind) === 'prospect_relevance' ? (
                      <button
                        className="btn btn-secondary"
                        disabled={workingId === String(action.id)}
                        onClick={() => void handleResearchProspect(String(action.id), action.subjectId)}
                      >
                        {workingId === String(action.id) ? 'Saving...' : 'Research prospect'}
                      </button>
                    ) : null}
                    {String(action.status ?? 'PENDING').toUpperCase() === 'PENDING' ? (
                      <button
                        className="btn btn-secondary"
                        disabled={workingId === String(action.id)}
                        onClick={() => void handleAccept(String(action.id))}
                        title="Accept for preparation: authorizes internal prep work only. Nothing is sent or published."
                      >
                        {workingId === String(action.id) ? 'Saving...' : 'Accept for preparation'}
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
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || authLoading) return;
    // No session yet: skip the authenticated readiness call instead of
    // firing a request that can only 401.
    if (!isAuthenticated) {
      setReadinessLoading(false);
      return;
    }
    async function fetchReadiness() {
      setReadinessLoading(true);
      setReadinessError(null);
      try {
        const res = await getReadiness();
        setReadiness(res.readiness);
      } catch (err) {
        setReadinessError(friendlyErrorMessage(err));
      } finally {
        setReadinessLoading(false);
      }
    }
    void fetchReadiness();
  }, [loading, authLoading, isAuthenticated]);

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

  const showSignIn = !loading && !authLoading && !isAuthenticated;

  return (
    <div>
      {showSignIn ? (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Sign in to start</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            Register a local account, create a workspace, then work the onboarding checklist.
          </p>
          <LoginForm />
        </div>
      ) : null}
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

      {readiness && <ReadinessDisplay readiness={readiness} />}
      {readinessLoading && !readiness && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading readiness...</p>
        </div>
      )}
      {readinessError && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>Failed to load readiness: {readinessError}</p>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Today</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
          What the loop found, prepared, and needs from you — approve, edit, or dismiss below.
        </p>
        <TodayBatch />
        <h2 className="health-card-title" style={{ marginBottom: '0.5rem', marginTop: '1.5rem' }}>Recommended next steps</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
          Ranked suggestions based on your recent activity. Open one to work on it, or record your decision.
        </p>
        <RecommendedSteps />
        <h2 className="health-card-title" style={{ marginBottom: '1rem', marginTop: '1.5rem' }}>Sections</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <NavLink to="/dashboard" className="btn btn-secondary">Today's Brain</NavLink>
          <NavLink to="/content" className="btn btn-secondary">Content</NavLink>
          <NavLink to="/brain" className="btn btn-secondary">Brain / Intelligence</NavLink>
          <NavLink to="/learning" className="btn btn-secondary">Learning</NavLink>
          <NavLink to="/leads" className="btn btn-secondary">Leads</NavLink>
          <NavLink to="/inbox" className="btn btn-secondary">Inbox</NavLink>
          <NavLink to="/pipeline" className="btn btn-secondary">Pipeline</NavLink>
          <NavLink to="/analytics" className="btn btn-secondary">Analytics</NavLink>
          <NavLink to="/settings" className="btn btn-secondary">Settings</NavLink>
          <NavLink to="/onboarding" className="btn btn-secondary">Onboarding</NavLink>
        </div>
      </div>
    </div>
  );
}
