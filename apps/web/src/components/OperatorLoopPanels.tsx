import { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  friendlyErrorMessage,
  getExplanation,
  getReadiness,
  listLearningProposals,
  listNextActions,
  listOutcomes,
  listPreparedActions,
} from '../services/api';
import {
  LearningInfluenceItem,
  LearningProposal,
  OperatorAction,
  OutcomeMetric,
  PreparedAction,
  ReadinessState,
} from '../types';

// WP9 Phase 4 — operator loop panels.
//
// Each panel reads one existing backend surface and translates persisted
// states into operator language. Nothing here estimates, predicts, or
// executes: counts come from rows, sentences come from recorded reasons,
// and every unavailable value says so explicitly.

// ---------------------------------------------------------------------------
// Evidence reference translation (record ids, never invented descriptions)
// ---------------------------------------------------------------------------

const REF_LABELS: Record<string, string> = {
  contentOpportunity: 'Content opportunity',
  contentGap: 'Content gap',
  trendSignal: 'Trend signal',
  contentReview: 'Content review',
  contentDraft: 'Content draft',
  contentIdea: 'Content idea',
  contentVersion: 'Content version',
  outreachReview: 'Outreach review',
  outreachDraft: 'Outreach draft',
  preparedAction: 'Prepared action',
  operatorAction: 'Operator action',
  learningProposal: 'Learning proposal',
  attribution: 'Attribution link',
  comment: 'Comment',
  conversation: 'Conversation',
  lead: 'Lead',
  topic: 'Topic',
  source: 'Source',
  claim: 'Claim',
};

export function evidenceRefLabel(ref: string): string {
  const [prefix, ...rest] = String(ref ?? '').split(':');
  const label = REF_LABELS[prefix ?? ''] ?? 'Reference';
  const id = rest.join(':');
  return id ? `${label} (${id.slice(0, 8)}…)` : label;
}

function renderLearningItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const o = item as Partial<LearningInfluenceItem>;
    const dim = typeof o.dimension === 'string' ? o.dimension : 'a recorded dimension';
    const adj = typeof o.adjustment === 'number' ? ` (${o.adjustment > 0 ? '+' : ''}${o.adjustment})` : '';
    const reason = typeof o.reason === 'string' && o.reason ? ` — ${o.reason}` : '';
    return `${dim}${adj}${reason}`;
  }
  return 'Recorded learning influence';
}

function ConfidencePair({ signal, recommendation }: { signal?: string; recommendation?: string }) {
  if (!signal && !recommendation) return null;
  return (
    <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
      {signal ? (
        <span>
          <strong>Evidence confidence:</strong> {signal}
        </span>
      ) : null}
      {signal && recommendation ? <span> · </span> : null}
      {recommendation ? (
        <span>
          <strong>Recommendation confidence:</strong> {recommendation}
        </span>
      ) : null}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Recommendation evidence (top actions with full explanation chain)
// ---------------------------------------------------------------------------

interface ExplanationView {
  reasons?: string[];
  dimensions?: Array<{ name: string; points: number; maxPoints: number; reason: string }>;
  evidenceLinks?: Array<{ label?: string; ref?: string }>;
  lifecycle?: string | null;
  learningApplied?: unknown[];
  subjectMeta?: Record<string, unknown>;
  signalConfidence?: string;
  recommendationConfidence?: string;
  whyNot?: string[];
  nextAction?: string | null;
  requiredAuthorization?: string | null;
}

function EvidenceCard({ action }: { action: OperatorAction }) {
  const [explanation, setExplanation] = useState<ExplanationView | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (explanation) return;
    setLoading(true);
    try {
      const res = await getExplanation(String(action.id));
      setExplanation((res.explanation ?? null) as ExplanationView | null);
    } catch {
      setExplanation(null);
    } finally {
      setLoading(false);
    }
  }

  const reasons = Array.isArray(action.reasons) ? action.reasons : [];
  const links = Array.isArray(action.evidenceLinks) ? action.evidenceLinks : [];

  return (
    <li className="card-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0 }}>{String(action.title)}</p>
      <p className="tiny" style={{ margin: 0 }}>
        {String(action.kind)} · Score {String(action.score)}
      </p>
      {reasons[0] ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{String(reasons[0])}</p> : null}
      <div>
        <button className="btn btn-secondary" onClick={() => void toggle()}>
          {expanded ? 'Hide evidence' : 'Show evidence'}
        </button>
      </div>
      {expanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
          {loading ? <p className="muted">Loading explanation...</p> : null}
          {!loading && !explanation ? (
            <p className="muted">Explanation unavailable for this item right now.</p>
          ) : null}
          {explanation ? (
            <>
              <ConfidencePair signal={explanation.signalConfidence} recommendation={explanation.recommendationConfidence} />
              {explanation.reasons && explanation.reasons.length > 0 ? (
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Why this action</p>
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {explanation.reasons.map((r, i) => (
                      <li key={i}>{String(r)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {links.length > 0 || (explanation.evidenceLinks ?? []).length > 0 ? (
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Evidence chain</p>
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {(explanation.evidenceLinks && explanation.evidenceLinks.length > 0 ? explanation.evidenceLinks : links).map((l, i) => (
                      <li key={i} title={String((l as { ref?: string }).ref ?? '')}>
                        {evidenceRefLabel(String((l as { ref?: string }).ref ?? (l as { label?: string }).label ?? ''))}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="muted">No recorded evidence links for this item.</p>
              )}
              {explanation.learningApplied && explanation.learningApplied.length > 0 ? (
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Influenced by confirmed learning</p>
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {explanation.learningApplied.map((item, i) => (
                      <li key={i}>{renderLearningItem(item)}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="muted">No learning influence.</p>
              )}
              {explanation.whyNot && explanation.whyNot.length > 0 ? (
                <div style={{ padding: '0.5rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius)' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', color: '#dc2626' }}>Why not ranked higher</p>
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {explanation.whyNot.map((w, i) => (
                      <li key={i}>{String(w)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {explanation.nextAction ? (
                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                  <strong>Next step:</strong> {String(explanation.nextAction)}
                </p>
              ) : null}
              {explanation.requiredAuthorization ? (
                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                  <strong>Authorization:</strong> {String(explanation.requiredAuthorization)}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function TopRecommendations({ limit = 5 }: { limit?: number }) {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNextActions({ status: 'pending', limit });
      setActions(res.actions ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || workspaceId === null) {
      setLoading(false);
      return;
    }
    void fetchData();
  }, [authLoading, isAuthenticated, workspaceId, fetchData]);

  if (authLoading || loading) return <p className="muted">Loading recommendations...</p>;
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>
        <div>
          <button className="btn btn-secondary" onClick={() => void fetchData()}>Retry</button>
        </div>
      </div>
    );
  }
  if (actions.length === 0) {
    return <p className="muted">No recommendation passed the current eligibility rules.</p>;
  }
  return (
    <ul className="plain-list" data-testid="operator-recommendations">
      {actions.map((a) => (
        <EvidenceCard key={String(a.id)} action={a} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Approval queue (grouped pending work; approval itself happens in the
// workflow pages — this panel links there and never bypasses backend gates)
// ---------------------------------------------------------------------------

const REVIEW_KINDS = new Set(['content_review', 'outreach_review', 'prepared_action', 'follow_up']);

function queueTarget(kind: string): string {
  const k = String(kind);
  if (k.includes('content') || k === 'stale_draft') return '/content';
  if (k.includes('outreach') || k.includes('lead') || k.includes('prospect') || k.includes('follow') || k === 'prepared_action') return '/leads';
  if (k.includes('learning')) return '/learning';
  return '/brain';
}

export function ApprovalQueue() {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const [actions, setActions] = useState<OperatorAction[]>([]);
  const [prepared, setPrepared] = useState<PreparedAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queue, prep] = await Promise.all([listNextActions({ status: 'pending', limit: 50 }), listPreparedActions()]);
      setActions((queue.actions ?? []).filter((a) => REVIEW_KINDS.has(String(a.kind))));
      setPrepared(prep.preparedActions ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated || workspaceId === null) {
      setLoading(false);
      return;
    }
    void fetchData();
  }, [authLoading, isAuthenticated, workspaceId, fetchData]);

  if (authLoading || loading) return <p className="muted">Loading approval queue...</p>;
  if (error) return <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>;
  if (actions.length === 0 && prepared.length === 0) {
    return <p className="muted">Nothing currently requires approval.</p>;
  }
  return (
    <div data-testid="operator-approvals" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {actions.length > 0 ? (
        <ul className="plain-list">
          {actions.map((a) => (
            <li key={String(a.id)} className="card-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>{String(a.title)}</p>
                <p className="tiny" style={{ margin: 0 }}>{String(a.kind)} · Score {String(a.score)}</p>
              </div>
              <NavLink to={queueTarget(String(a.kind))} className="btn btn-secondary">
                Review
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
      {prepared.length > 0 ? (
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
            Prepared actions awaiting authorized execution ({prepared.length})
          </p>
          <ul className="plain-list">
            {prepared.slice(0, 10).map((p) => (
              <li key={String(p.id)} className="card-row">
                <p style={{ fontSize: '0.875rem', margin: 0 }}>
                  <strong>{String(p.actionType ?? 'Prepared action')}</strong>
                  {p.target ? ` — ${String(p.target)}` : ''}
                </p>
                <p className="tiny" style={{ margin: 0 }}>Status: {String(p.status ?? 'Unknown')}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution honesty (capability truth; never implies a send is possible)
// ---------------------------------------------------------------------------

export function ExecutionHonesty() {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [preparedCount, setPreparedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !isAuthenticated || workspaceId === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [r, p] = await Promise.all([getReadiness(), listPreparedActions()]);
        if (cancelled) return;
        setReadiness(r.readiness ?? null);
        setPreparedCount((p.preparedActions ?? []).length);
      } catch {
        if (!cancelled) {
          setReadiness(null);
          setPreparedCount(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, workspaceId]);

  if (authLoading || loading) return <p className="muted">Loading execution status...</p>;
  const platforms = readiness?.platformExecution ?? [];
  const anyReady = platforms.some((p) => p.publishingReady === true);
  if (readiness === null) {
    return <p className="muted">Execution status unavailable — readiness could not be loaded.</p>;
  }
  if (anyReady) {
    return (
      <p style={{ fontSize: '0.875rem', margin: 0 }}>
        A publishing capability reports ready — execution still requires explicit human authorization per action.
      </p>
    );
  }
  return (
    <div data-testid="operator-execution" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <p style={{ fontSize: '0.875rem', margin: 0 }}>
        <strong>Not executed.</strong> No authorized execution capability is currently available.
      </p>
      <p className="muted" style={{ margin: 0 }}>
        {preparedCount !== null && preparedCount > 0
          ? `${preparedCount} prepared action(s) remain ready for authorized execution — nothing has been sent.`
          : 'Nothing is waiting for execution.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Observation honesty (recorded rows only; unknown is not zero)
// ---------------------------------------------------------------------------

export function ObservationPanel() {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const [outcomes, setOutcomes] = useState<OutcomeMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOutcomes();
      setOutcomes((res.outcomeMetrics ?? []).slice(0, 10));
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated || workspaceId === null) {
      setLoading(false);
      return;
    }
    void fetchData();
  }, [authLoading, isAuthenticated, workspaceId, fetchData]);

  if (authLoading || loading) return <p className="muted">Loading observations...</p>;
  if (error) return <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>;
  if (outcomes.length === 0) {
    return <p className="muted">No live outcome available.</p>;
  }
  return (
    <ul className="plain-list" data-testid="operator-observations">
      {outcomes.map((o) => (
        <li key={String(o.id)} className="card-row">
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            <strong>{String(o.metricName)}</strong>: {String(o.metricValue)}
            {o.unit ? ` ${String(o.unit)}` : ''}
          </p>
          <p className="tiny" style={{ margin: 0 }}>
            Source: {String(o.source)}
            {o.recordedAt ? ` · recorded ${String(o.recordedAt).slice(0, 16).replace('T', ' ')}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Learning influence + "what changes next" (derived from backend state only)
// ---------------------------------------------------------------------------

export function nextChangeText(p: LearningProposal): string {
  const status = String(p.status ?? '').toUpperCase();
  if (status === 'CONFIRMED') {
    const adj = typeof p.proposedAdjustment === 'number' ? p.proposedAdjustment : null;
    const maturity = typeof p.maturity === 'string' && p.maturity ? ` at maturity ${p.maturity}` : '';
    const effect =
      adj === null
        ? 'Future rankings touching this dimension may shift (bounded).'
        : `Future rankings touching “${String(p.dimension)}” may shift by ${adj > 0 ? '+' : ''}${adj} (bounded ±0.2 per influence).`;
    return `Confirmed${maturity}. ${effect}`;
  }
  if (status === 'PROPOSED') {
    return 'Human confirmation required — this proposal influences nothing until confirmed.';
  }
  return `${status || 'Unknown state'} — influences nothing.`;
}

export function LearningWhatsNext() {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const [proposals, setProposals] = useState<LearningProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listLearningProposals({});
      setProposals((res.proposals ?? []).slice(0, 10));
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated || workspaceId === null) {
      setLoading(false);
      return;
    }
    void fetchData();
  }, [authLoading, isAuthenticated, workspaceId, fetchData]);

  if (authLoading || loading) return <p className="muted">Loading learning...</p>;
  if (error) return <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>;
  if (proposals.length === 0) {
    return <p className="muted">Not enough evidence to produce a learning signal.</p>;
  }
  return (
    <ul className="plain-list" data-testid="operator-learning">
      {proposals.map((p) => (
        <li key={String(p.id)} className="card-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.875rem' }}>{String(p.dimension)}</strong>
            <span className="badge badge-neutral">{String(p.status)}</span>
            {p.maturity ? <span className="badge badge-info">{String(p.maturity)}</span> : null}
          </div>
          {p.observedPattern ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>{String(p.observedPattern)}</p>
          ) : null}
          <p style={{ fontSize: '0.875rem', margin: 0 }}>
            <strong>What changes next:</strong> {nextChangeText(p)}
          </p>
        </li>
      ))}
    </ul>
  );
}
