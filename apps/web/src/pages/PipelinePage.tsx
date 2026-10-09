import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SkeletonBlock } from '../components/ui';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  createOutcome,
  createPipelineOpportunity,
  deletePipelineOpportunity,
  detailedErrorMessage,
  friendlyErrorMessage,
  getAttributionForTarget,
  listFollowUps,
  listOutcomes,
  listPipeline,
  updatePipelineOpportunity,
} from '../services/api';
import { FollowUpRecommendation, OutcomeMetric, PipelineOpportunity } from '../types';

// Server-enforced pipeline stages (mirrors pipelineStageUpdateSchema).
// Labels are human-readable; values are exact.
const STAGES = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'qualification', label: 'Qualification' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed won' },
  { value: 'closed_lost', label: 'Closed lost' },
];

export function PipelinePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (authLoading) {
    return (
      <div className="stack">
        <PageHead kicker="People · Pipeline" title="People Pipeline" sub="Checking your session…" />
        <SkeletonBlock lines={3} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="People · Pipeline" title="People Pipeline" sub="Sign in to track deal stages and next actions." />
        <LoginForm />
      </div>
    );
  }

  if (selectedId) {
    return <OpportunityDetail opportunityId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h2 className="health-card-title">People Pipeline</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Track open deals by stage. Stages only move forward through valid steps.
          </p>
        </div>
        <WorkspaceSelector />
      </div>
      <PipelineList onSelect={setSelectedId} />
    </div>
  );
}

function PipelineList({ onSelect }: { onSelect: (id: string) => void }) {
  const [opportunities, setOpportunities] = useState<PipelineOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState('');
  const [name, setName] = useState('');
  const [stage, setStage] = useState('prospecting');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPipeline();
      setOpportunities(data.opportunities ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!leadId.trim() || !name.trim()) {
      setMessage('Lead ID and deal name are required.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await createPipelineOpportunity({ leadId: leadId.trim(), name: name.trim(), stage: stage.trim() });
      setOpportunities((prev) => [result.opportunity, ...prev]);
      setLeadId('');
      setName('');
      setStage('prospecting');
      setMessage('Deal added.');
    } catch (err) {
      setMessage(detailedErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Add a deal
        </h3>
        <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="Lead ID" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Deal name" style={{ ...fieldStyle, flex: '2 1 220px' }} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)', flex: '1 1 140px' }}>
            Stage *
            <select value={stage} onChange={(e) => setStage(e.target.value)} required style={fieldStyle} aria-label="Stage">
              {STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Adding...' : 'Add deal'}
          </button>
        </form>
        {message ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {message}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Loading deals...</h2>
            <p className="empty-state-description">Please wait while we fetch the latest data</p>
          </div>
        </div>
      ) : null}
      {!loading && error ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Something went wrong</h2>
            <p className="empty-state-description">{error}</p>
            <button className="btn btn-secondary" onClick={() => void fetchData()} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {!loading && !error && opportunities.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">No deals yet</h2>
            <p className="empty-state-description">Add your first deal above to start tracking stages.</p>
          </div>
        </div>
      ) : null}
      {!loading && !error && opportunities.length > 0 ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>
            Deals ({opportunities.length})
          </h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
            {opportunities.map((o) => (
              <li
                key={String(o.id)}
                style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{String(o.name ?? o.title ?? o.id)}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      {o.stage ? <span className="badge badge-neutral">{String(o.stage)}</span> : null}
                      {typeof o.value !== 'undefined' && o.value !== null ? (
                        <span className="badge badge-neutral">Value: {String(o.value)}</span>
                      ) : null}
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => onSelect(String(o.id))}>
                    View details
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function OpportunityDetail({ opportunityId, onBack }: { opportunityId: string; onBack: () => void }) {
  const [opportunity, setOpportunity] = useState<PipelineOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [nextAction, setNextAction] = useState<FollowUpRecommendation | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPipeline();
      const found = (data.opportunities ?? []).find((o) => String(o.id) === opportunityId) ?? null;
      setOpportunity(found);
      if (found && found.stage) setStage(String(found.stage));
      if (found && found.leadId) {
        try {
          const all = await listFollowUps();
          const related = all.followUps.filter(
            (f) => String(f.leadId ?? '') === String(found.leadId),
          );
          setNextAction(related.length > 0 ? (related[related.length - 1] as FollowUpRecommendation) : null);
        } catch {
          setNextAction(null);
        }
      } else {
        setNextAction(null);
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleStageUpdate() {
    if (!stage.trim()) {
      setMessage('Choose a stage first.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await updatePipelineOpportunity(opportunityId, { stage: stage.trim() });
      setOpportunity(result.opportunity);
      setMessage('Stage updated.');
    } catch (err) {
      setMessage(detailedErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setMessage(null);
    try {
      await deletePipelineOpportunity(opportunityId);
      onBack();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to deals
        </button>
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Loading deal...</h2>
            <p className="empty-state-description">Please wait while we fetch the latest data</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to deals
        </button>
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Something went wrong</h2>
            <p className="empty-state-description">{error}</p>
            <button className="btn btn-secondary" onClick={() => void fetchData()} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
          ← Back to deals
        </button>
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Deal not found</h2>
            <p className="empty-state-description">This deal may have been removed.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Back to deals
      </button>
      <div className="card">
        <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          {String(opportunity.name ?? opportunity.title ?? opportunity.id)}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          {opportunity.stage ? <span className="badge badge-neutral">{String(opportunity.stage)}</span> : null}
          {typeof opportunity.value !== 'undefined' && opportunity.value !== null ? (
            <span className="badge badge-neutral">Value: {String(opportunity.value)}</span>
          ) : null}
          {typeof opportunity.probability !== 'undefined' && opportunity.probability !== null ? (
            <span className="badge badge-neutral">Likelihood: {String(opportunity.probability)}</span>
          ) : null}
        </div>
        {opportunity.leadId ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Source lead: {String(opportunity.leadId)}
          </p>
        ) : (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No source lead linked.
          </p>
        )}
        {opportunity.expectedCloseDate ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Expected close: {String(opportunity.expectedCloseDate)}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Next step
        </h3>
        {!nextAction ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No suggested next step yet. Check the Inbox for follow-up suggestions for this lead.
          </p>
        ) : (
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {String(nextAction.recommendation ?? nextAction.suggestedMessage ?? 'Follow up')}
            </p>
            {nextAction.suggestedMessage && nextAction.recommendation ? (
              <p style={{ fontSize: '0.875rem' }}>{String(nextAction.suggestedMessage)}</p>
            ) : null}
            {nextAction.reason ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {String(nextAction.reason)}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Change stage
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={{ ...fieldStyle, width: 'auto' }} aria-label="Change stage">
            <option value="">Select a stage</option>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={saving} onClick={() => void handleStageUpdate()}>
            {saving ? 'Updating...' : 'Update stage'}
          </button>
        </div>
        {message ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {message}
          </p>
        ) : null}
      </div>

      <PipelineOutcomeSection opportunityId={opportunityId} />

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Remove deal
        </h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Removing a deal is permanent.
        </p>
        <button className="btn btn-secondary" disabled={deleting} onClick={() => void handleDelete()}>
          {deleting ? 'Removing...' : 'Remove deal'}
        </button>
      </div>
    </div>
  );
}

function PipelineOutcomeSection({ opportunityId }: { opportunityId: string }) {
  const [outcomes, setOutcomes] = useState<OutcomeMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricName, setMetricName] = useState('');
  const [metricValue, setMetricValue] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fetchOutcomes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOutcomes();
      setOutcomes(
        (data.outcomeMetrics ?? []).filter(
          (m) => String(m.pipelineOpportunityId ?? '') === opportunityId,
        ),
      );
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    void fetchOutcomes();
  }, [fetchOutcomes]);

  async function handleRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!metricName.trim() || !metricValue.trim() || !source.trim()) {
      setFormMessage('Metric name, value, and source are required.');
      return;
    }
    const parsedValue = Number(metricValue.trim());
    if (!Number.isFinite(parsedValue)) {
      setFormMessage('Metric value must be a number.');
      return;
    }
    setSaving(true);
    setFormMessage(null);
    try {
      const result = await createOutcome({
        pipelineOpportunityId: opportunityId,
        metricName: metricName.trim(),
        metricValue: parsedValue,
        source: source.trim(),
      });
      setMetricName('');
      setMetricValue('');
      setSource('');
      setFormMessage(
        `Outcome recorded (user assertion, not verified).${result.notice ? ` ${result.notice}` : ''}`,
      );
      await fetchOutcomes();
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Recorded results ({outcomes.length})
      </h3>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        Recording only. Values are stored as recorded, never estimated or inferred.
      </p>
      <form onSubmit={(e) => void handleRecord(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          value={metricName}
          onChange={(e) => setMetricName(e.target.value)}
          placeholder="Metric name * (e.g. deal_value)"
          style={{ ...fieldStyle, flex: '1 1 150px' }}
        />
        <input
          value={metricValue}
          onChange={(e) => setMetricValue(e.target.value)}
          placeholder="Value * (number)"
          inputMode="decimal"
          style={{ ...fieldStyle, flex: '1 1 120px' }}
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source * (e.g. manual)"
          style={{ ...fieldStyle, flex: '1 1 140px' }}
        />
        <button type="submit" className="btn btn-secondary" disabled={saving}>
          {saving ? 'Recording...' : 'Record outcome'}
        </button>
      </form>
      {formMessage ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
          {formMessage}
        </p>
      ) : null}
      {loading ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading recorded results...</p>
      ) : null}
      {!loading && error ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !error && outcomes.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          No recorded results yet for this deal.
        </p>
      ) : null}
      {!loading && !error && outcomes.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {outcomes.map((metric) => (
            <li
              key={String(metric.id)}
              style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}
            >
              <p style={{ fontWeight: 600 }}>
                {String(metric.metricName)}: {String(metric.metricValue)}
                {metric.unit ? ` ${String(metric.unit)}` : ''}
              </p>
              <p style={{ color: 'var(--color-text-secondary)' }}>Source: {String(metric.source)}</p>
              <OutcomeAttribution metricId={String(metric.id)} />
              {metric.recordedAt ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                  Recorded at {String(metric.recordedAt)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Batch 2 (D): honest attribution display. UNKNOWN is shown as UNKNOWN —
// never a stronger label than the evidence supports.
function OutcomeAttribution({ metricId }: { metricId: string }) {
  const [strongest, setStrongest] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getAttributionForTarget('outcomeMetric', metricId)
      .then((res) => {
        if (cancelled) return;
        setStrongest(res.strongest);
        const withReason = (res.links ?? []).find((l) => l.reason);
        setReason(withReason?.reason ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [metricId]);
  if (!strongest) return null;
  return (
    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
      Attribution: {strongest}
      {reason ? ` — ${reason}` : strongest === 'UNKNOWN' ? ' — no defensible connection recorded' : ''}
    </p>
  );
}

const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text)',
  padding: '0.625rem 0.75rem',
  width: '100%',
};
