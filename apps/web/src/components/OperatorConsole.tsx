import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  friendlyErrorMessage,
  getOperatorCycle,
  listOperatorCycles,
  triggerOperatorCycle,
} from '../services/api';
import { OperatorCycle, OperatorCycleStageState } from '../types';

// WP9 Phase 4 — operator decision console shell.
//
// Read-only view over the persisted autonomous cycle the unattended
// orchestrator already produces. Every number and every sentence below comes
// from a backend row; nothing is estimated, no progress is faked, and no
// external action can be triggered from here (the only mutation is "run a
// cycle", which reuses the existing idempotent endpoint).

const STAGE_LABELS: Record<string, string> = {
  RESEARCH: 'Research',
  DECISION: 'Decision',
  CONTENT: 'Content preparation',
  SALES: 'Sales preparation',
  APPROVAL: 'Approval snapshot',
  EXECUTION: 'Execution boundary',
  OBSERVE: 'Observation',
  LEARN: 'Learning',
  FINALIZE: 'Finalize',
  // Daily-run stage names share this timeline when shown.
  INTELLIGENCE: 'Research',
  APPROVAL_SNAPSHOT: 'Approval snapshot',
  OBSERVE_LEARN: 'Observation',
  DIGEST: 'Learning',
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[String(stage).toUpperCase()] ?? String(stage);
}

function stageBadgeClass(status: string): string {
  const s = String(status).toUpperCase();
  if (s === 'SUCCEEDED' || s === 'COMPLETED') return 'badge badge-success';
  if (s === 'FAILED') return 'badge badge-error';
  if (s === 'SKIPPED' || s === 'PARTIAL') return 'badge badge-warning';
  if (s === 'RUNNING' || s === 'QUEUED' || s === 'PAUSED') return 'badge badge-info';
  return 'badge badge-neutral';
}

function formatCount(key: string, value: number): string {
  const label = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
  return `${label}: ${value}`;
}

function StageRow({ stage }: { stage: OperatorCycleStageState }) {
  const counts = stage.counts && typeof stage.counts === 'object' ? stage.counts : null;
  const note = typeof stage.error === 'string' && stage.error ? stage.error : null;
  return (
    <li className="card-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '0.875rem' }}>{stageLabel(stage.stage)}</strong>
        <span className={stageBadgeClass(stage.status)}>{String(stage.status)}</span>
        {typeof stage.durationMs === 'number' ? (
          <span className="tiny">{(stage.durationMs / 1000).toFixed(1)}s</span>
        ) : null}
      </div>
      {counts ? (
        <p className="tiny" style={{ margin: 0 }}>
          {Object.entries(counts)
            .filter(([, v]) => typeof v === 'number')
            .map(([k, v]) => formatCount(k, v as number))
            .join(' · ') || 'No counts recorded'}
        </p>
      ) : null}
      {note ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>{note}</p>
      ) : null}
    </li>
  );
}

export function CycleTimeline({ cycle }: { cycle: OperatorCycle }) {
  const stages = Array.isArray(cycle.stages) ? cycle.stages : [];
  if (stages.length === 0) {
    return <p className="muted">No stages recorded yet — the cycle has not started running.</p>;
  }
  return (
    <ul className="plain-list">
      {stages.map((s, i) => (
        <StageRow key={`${String(s.stage)}-${i}`} stage={s} />
      ))}
    </ul>
  );
}

const TOTAL_LABELS: Array<[string, string]> = [
  ['opportunities', 'Opportunities'],
  ['contentIdeas', 'Content ideas'],
  ['plans', 'Plans'],
  ['drafts', 'Drafts'],
  ['salesSignals', 'Sales signals'],
  ['preparedActions', 'Prepared actions'],
  ['observations', 'Observations'],
  ['learningSignals', 'Learning signals'],
];

export function CycleSummary({ cycle }: { cycle: OperatorCycle }) {
  const totals = cycle.totals ?? {};
  return (
    <div className="stat-grid">
      {TOTAL_LABELS.map(([key, label]) => (
        <div key={key} className="stat-card">
          <p className="stat-card-label">{label}</p>
          <p className="stat-card-value">{String((totals as Record<string, unknown>)[key] ?? 'Unavailable')}</p>
        </div>
      ))}
    </div>
  );
}

export function OperatorConsole() {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const hasWorkspace = workspaceId !== null;
  const [cycles, setCycles] = useState<OperatorCycle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OperatorCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOperatorCycles(10);
      const list = res.cycles ?? [];
      setCycles(list);
      if (list.length > 0) {
        const first = list[0]!;
        setSelectedId((prev) => prev ?? first.cycleId);
      } else {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    try {
      const res = await getOperatorCycle(id);
      setDetail(res.cycle ?? null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !hasWorkspace) {
      setLoading(false);
      return;
    }
    void fetchCycles();
  }, [authLoading, isAuthenticated, workspaceId, fetchCycles]);

  useEffect(() => {
    if (selectedId) void fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  async function handleRunCycle() {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await triggerOperatorCycle();
      const c = res.cycle;
      setRunMsg(`Cycle ${String(c.status)} (id ${String(c.cycleId).slice(0, 8)}…).`);
      await fetchCycles();
      setSelectedId(c.cycleId);
    } catch (err) {
      setRunMsg(friendlyErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  if (authLoading || loading) {
    return <p className="muted">Loading operator cycles...</p>;
  }
  if (!isAuthenticated) {
    return <p className="muted">Sign in to see operator cycles.</p>;
  }
  if (!hasWorkspace) {
    return <p className="muted">Create a workspace to run the operator loop — all data stays scoped to it.</p>;
  }
  if (error && cycles.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>
        <div>
          <button className="btn btn-secondary" onClick={() => void fetchCycles()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (cycles.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p className="muted" style={{ margin: 0 }}>
          No operator cycles yet. Run the first cycle to let the operator research, recommend, and prepare work for review.
        </p>
        <div>
          <button className="btn btn-primary" disabled={running} onClick={() => void handleRunCycle()}>
            {running ? 'Running...' : 'Run operator cycle'}
          </button>
        </div>
        {runMsg ? <p className="muted">{runMsg}</p> : null}
      </div>
    );
  }

  const selected = detail ?? cycles.find((c) => c.cycleId === selectedId) ?? cycles[0]!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" data-testid="operator-cycle-summary">
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
          <h3 className="section-title">Latest operator cycle</h3>
          <span className={stageBadgeClass(selected.status)}>{String(selected.status)}</span>
        </div>
        <p className="tiny" style={{ marginBottom: '0.75rem' }}>
          Requested {String(selected.requestedAt).slice(0, 16).replace('T', ' ')}
          {selected.completedAt ? ` · completed ${String(selected.completedAt).slice(0, 16).replace('T', ' ')}` : ' · still running'}
          {selected.error ? ` · ${String(selected.error)}` : ''}
        </p>
        <CycleSummary cycle={selected} />
        {(selected.failures ?? []).length > 0 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Failures</p>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-error)', margin: 0 }}>
              {(selected.failures ?? []).map((f, i) => (
                <li key={i}>{String(f)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {(selected.approvalsRequired ?? []).length > 0 ? (
          <p style={{ fontSize: '0.875rem', marginTop: '0.75rem', marginBottom: 0 }}>
            <strong>Approvals waiting:</strong> {(selected.approvalsRequired ?? []).join('; ')}
          </p>
        ) : (
          <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>Nothing currently requires approval.</p>
        )}
      </div>

      <div className="card" data-testid="operator-cycle-timeline">
        <h3 className="section-title" style={{ marginBottom: '0.5rem' }}>Cycle timeline</h3>
        <CycleTimeline cycle={selected} />
      </div>

      <div className="card" data-testid="operator-cycle-history">
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
          <h3 className="section-title">Cycle history</h3>
          <div className="actions">
            <button className="btn btn-primary" disabled={running} onClick={() => void handleRunCycle()}>
              {running ? 'Running...' : 'Run operator cycle'}
            </button>
            <button className="btn btn-secondary" onClick={() => void fetchCycles()}>
              Refresh
            </button>
          </div>
        </div>
        {runMsg ? <p className="muted">{runMsg}</p> : null}
        <ul className="plain-list">
          {cycles.map((c) => (
            <li key={c.cycleId} className="card-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                aria-pressed={c.cycleId === selected.cycleId}
                onClick={() => {
                  setSelectedId(c.cycleId);
                  void fetchDetail(c.cycleId);
                }}
              >
                {String(c.requestedAt).slice(0, 16).replace('T', ' ')}
              </button>
              <span className={stageBadgeClass(c.status)}>{String(c.status)}</span>
              <span className="tiny">
                {String((c.totals as Record<string, unknown>)?.opportunities ?? 0)} opportunities ·{' '}
                {String((c.totals as Record<string, unknown>)?.contentIdeas ?? 0)} ideas ·{' '}
                {String((c.totals as Record<string, unknown>)?.preparedActions ?? 0)} prepared
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
