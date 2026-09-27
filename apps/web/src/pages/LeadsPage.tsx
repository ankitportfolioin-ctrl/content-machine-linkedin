import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  approveOutreachStrategy,
  createOutreachDraft,
  createOutreachDraftRevision,
  createOutreachStrategy,
  createPreparedAction,
  createProspectBrief,
  createSalesLead,
  decideOutreachReview,
  discoverProspect,
  friendlyErrorMessage,
  getOutreachDraft,
  getOutreachDraftGates,
  getProspectIntent,
  getProspectQualification,
  getProspectResearch,
  isAiUnavailable,
  listOutreachDrafts,
  listOutreachReviews,
  listOutreachStrategies,
  listPreparedActions,
  listProspectBriefs,
  listProspectSignals,
  listSalesLeads,
  markPreparedActionReady,
  qualifyProspect,
  recordProspectSignal,
  researchProspect,
  submitOutreachReview,
  synthesizeBrief,
  updateOutreachDraft,
  validateOutreachDraft,
} from '../services/api';
import {
  OutreachDraft,
  OutreachQualityGate,
  OutreachReview,
  OutreachStrategy,
  OutreachValidation,
  PreparedAction,
  ProspectBrief,
  ProspectCandidate,
  ProspectQualification,
  ProspectResearch,
  ProspectSignal,
  QualificationScore,
  SalesLead,
} from '../types';

export function LeadsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);

  if (authLoading) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Loading...</h2>
          <p className="empty-state-description">Checking your session</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card">
          <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
            Leads
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Sign in to manage leads, research, outreach drafts, and prepared follow-up actions.
          </p>
        </div>
        <LoginForm />
      </div>
    );
  }

  if (selectedLead) {
    return <LeadDetail lead={selectedLead} onBack={() => setSelectedLead(null)} />;
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
          <h2 className="health-card-title">Leads</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Track people, research them, and prepare reviewed outreach.
          </p>
        </div>
        <WorkspaceSelector />
      </div>
      <DiscoverSection />
      <LeadsListSection onSelect={setSelectedLead} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared blocks (match BrainPage patterns)
// ---------------------------------------------------------------------------

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{label}</h2>
        <p className="empty-state-description">Please wait while we fetch the latest data</p>
      </div>
    </div>
  );
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">{title}</h2>
        <p className="empty-state-description">{description}</p>
      </div>
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">Something went wrong</h2>
        <p className="empty-state-description">{message}</p>
        <button className="btn btn-secondary" onClick={onRetry} style={{ marginTop: '1rem' }}>
          Retry
        </button>
      </div>
    </div>
  );
}

function AiUnavailableBlock() {
  return (
    <div className="card">
      <div className="empty-state">
        <h2 className="empty-state-title">AI assistance unavailable</h2>
        <p className="empty-state-description">
          AI-powered work is temporarily unavailable. You can still browse saved items and try again
          later.
        </p>
      </div>
    </div>
  );
}

function EvidenceView({ value }: { value: unknown }) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>None noted</span>;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span style={{ fontSize: '0.875rem' }}>{String(value)}</span>;
  }
  let text = '';
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre
      style={{
        fontSize: '0.75rem',
        backgroundColor: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '0.5rem',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Discover + lead list + create
// ---------------------------------------------------------------------------

function DiscoverSection() {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [candidate, setCandidate] = useState<ProspectCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  async function handleDiscover(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setAiUnavailable(false);
    setCandidate(null);
    try {
      const result = await discoverProspect({
        name: name.trim() || undefined,
        title: title.trim() || undefined,
        company: company.trim() || undefined,
        location: location.trim() || undefined,
        publicSourceUrls: sourceUrl.trim() ? [sourceUrl.trim()] : undefined,
      });
      setCandidate(result.candidate);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Look up a person
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Enter details you already know. Results are suggestions only — confirm before saving.
      </p>
      <form
        onSubmit={(e) => void handleDiscover(e)}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        </div>
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="Public source URL (optional)"
          style={fieldStyle}
        />
        <button type="submit" className="btn btn-secondary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
          {loading ? 'Looking up...' : 'Look up'}
        </button>
      </form>
      {aiUnavailable ? (
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>AI assistance is temporarily unavailable. Please try again later.</p>
      ) : null}
      {message ? (
        <p role="alert" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-error)' }}>
          {message}
        </p>
      ) : null}
      {candidate ? (
        <div
          style={{
            marginTop: '0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '0.75rem',
          }}
        >
          <p style={{ fontWeight: 600 }}>{String(candidate.name ?? 'Suggested match')}</p>
          {candidate.title || candidate.company ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              {[candidate.title, candidate.company].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {typeof candidate.confidence !== 'undefined' ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Confidence: {String(candidate.confidence)}
            </p>
          ) : null}
          <div style={{ marginTop: '0.5rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Evidence</p>
            <EvidenceView value={candidate.evidence} />
          </div>
          {Array.isArray(candidate.unknownFields) && candidate.unknownFields.length > 0 ? (
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Still unknown: {candidate.unknownFields.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LeadsListSection({ onSelect }: { onSelect: (lead: SalesLead) => void }) {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSalesLeads();
      setLeads(data.leads ?? []);
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
    if (!linkedinUrl.trim() || !name.trim()) {
      setFormMessage('Profile URL and name are required.');
      return;
    }
    setSaving(true);
    setFormMessage(null);
    try {
      const result = await createSalesLead({
        linkedinUrl: linkedinUrl.trim(),
        name: name.trim(),
        company: company.trim() || undefined,
      });
      setLinkedinUrl('');
      setName('');
      setCompany('');
      setFormMessage('Lead added.');
      setLeads((prev) => [result.lead, ...prev]);
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Add a lead manually
        </h3>
        <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="Profile URL"
            style={{ ...fieldStyle, flex: '2 1 240px' }}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            style={{ ...fieldStyle, flex: '1 1 160px' }}
          />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company (optional)"
            style={{ ...fieldStyle, flex: '1 1 160px' }}
          />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Adding...' : 'Add lead'}
          </button>
        </form>
        {formMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {formMessage}
          </p>
        ) : null}
      </div>

      {loading ? <LoadingBlock label="Loading leads..." /> : null}
      {!loading && error ? <ErrorBlock message={error} onRetry={() => void fetchData()} /> : null}
      {!loading && !error && leads.length === 0 ? (
        <EmptyBlock title="No leads yet" description="Add your first lead above to start researching and preparing outreach." />
      ) : null}
      {!loading && !error && leads.length > 0 ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>
            Leads ({leads.length})
          </h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
            {leads.map((lead) => (
              <li
                key={String(lead.id)}
                style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{lead.name}</p>
                    {[lead.headline, lead.company, lead.location].filter(Boolean).length > 0 ? (
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        {[lead.headline, lead.company, lead.location].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    {lead.status ? <span className="badge badge-neutral">{String(lead.status)}</span> : null}
                  </div>
                  <button className="btn btn-secondary" onClick={() => onSelect(lead)}>
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

// ---------------------------------------------------------------------------
// Lead detail
// ---------------------------------------------------------------------------

function LeadDetail({ lead, onBack }: { lead: SalesLead; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Back to leads
      </button>
      <div
        className="card"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
      >
        <div>
          <h2 className="health-card-title">{lead.name}</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            {[lead.headline, lead.company, lead.location].filter(Boolean).join(' · ') || 'No extra details yet'}
          </p>
        </div>
        <WorkspaceSelector />
      </div>
      <ResearchSection leadId={String(lead.id)} />
      <SignalsSection leadId={String(lead.id)} />
      <QualificationSection leadId={String(lead.id)} />
      <BriefsSection leadId={String(lead.id)} />
      <StrategiesSection leadId={String(lead.id)} />
      <DraftsSection leadId={String(lead.id)} />
    </div>
  );
}

function ResearchSection({ leadId }: { leadId: string }) {
  const [research, setResearch] = useState<ProspectResearch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await getProspectResearch(leadId);
      setResearch(data.research ?? null);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        const msg = friendlyErrorMessage(err);
        if (/not found/i.test(msg)) {
          setResearch(null);
          setError(null);
        } else {
          setError(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleResearch() {
    setWorking(true);
    setMessage(null);
    try {
      const result = await researchProspect({
        leadId,
        title: title.trim() || undefined,
        company: company.trim() || undefined,
      });
      setResearch(result.research);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Background research
      </h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title (optional)" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        <button className="btn btn-primary" disabled={working} onClick={() => void handleResearch()}>
          {working ? 'Researching...' : 'Run research'}
        </button>
        <button className="btn btn-secondary" onClick={() => void fetchData()}>
          Refresh
        </button>
      </div>
      {message ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{message}</p>
      ) : null}
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading research...</p> : null}
      {!loading && aiUnavailable ? <p style={{ fontSize: '0.875rem' }}>AI assistance is temporarily unavailable. Please try again later.</p> : null}
      {!loading && !aiUnavailable && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !aiUnavailable && !error && !research ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          No research yet. Run research to gather public background notes.
        </p>
      ) : null}
      {!loading && research ? (
        <div>
          {research.summary ? <p style={{ fontSize: '0.875rem' }}>{String(research.summary)}</p> : null}
          <div style={{ marginTop: '0.5rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Evidence</p>
            <EvidenceView value={research.findings ?? research} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SignalsSection({ leadId }: { leadId: string }) {
  const [signals, setSignals] = useState<ProspectSignal[]>([]);
  const [intentStatus, setIntentStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signalType, setSignalType] = useState('');
  const [source, setSource] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listed, intent] = await Promise.all([
        listProspectSignals(leadId),
        getProspectIntent(leadId).catch(() => null),
      ]);
      setSignals(listed.signals ?? []);
      setIntentStatus(intent && intent.status ? String(intent.status) : null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!signalType.trim() || !source.trim()) {
      setMessage('Signal type and source are required.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await recordProspectSignal({
        leadId,
        signalType: signalType.trim(),
        source: source.trim(),
        confidence: 0.5,
        evidence: source.trim(),
        interpretation: interpretation.trim() || signalType.trim(),
      });
      setSignals((prev) => [result.signal, ...prev]);
      setSignalType('');
      setSource('');
      setInterpretation('');
      setMessage('Signal recorded.');
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Interest signals
      </h3>
      {intentStatus ? (
        <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Current interest: <span className="badge badge-neutral">{intentStatus}</span>
        </p>
      ) : (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
          No interest summary yet.
        </p>
      )}
      <form onSubmit={(e) => void handleRecord(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input value={signalType} onChange={(e) => setSignalType(e.target.value)} placeholder="Signal type (e.g. job change)" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source note" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        <input value={interpretation} onChange={(e) => setInterpretation(e.target.value)} placeholder="What this means (optional)" style={{ ...fieldStyle, flex: '2 1 220px' }} />
        <button type="submit" className="btn btn-secondary" disabled={saving}>
          {saving ? 'Recording...' : 'Record signal'}
        </button>
      </form>
      {message ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{message}</p>
      ) : null}
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading signals...</p> : null}
      {!loading && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !error && signals.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No signals recorded yet.</p>
      ) : null}
      {signals.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {signals.map((s, i) => (
            <li key={String(s.id ?? i)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{String(s.signalType ?? 'Signal')}</p>
              {s.interpretation ? <p style={{ fontSize: '0.875rem' }}>{String(s.interpretation)}</p> : null}
              <div style={{ marginTop: '0.25rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>Evidence</p>
                <EvidenceView value={s.evidence} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function QualificationSection({ leadId }: { leadId: string }) {
  const [qualification, setQualification] = useState<ProspectQualification | null>(null);
  const [score, setScore] = useState<QualificationScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await getProspectQualification(leadId);
      setQualification(data.qualification ?? null);
      setScore(data.score ?? null);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        const msg = friendlyErrorMessage(err);
        if (/not found/i.test(msg)) {
          setQualification(null);
          setScore(null);
          setError(null);
        } else {
          setError(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleQualify() {
    setWorking(true);
    setMessage(null);
    try {
      const result = await qualifyProspect(leadId);
      setQualification(result.qualification);
      await fetchData();
    } catch (err) {
      if (isAiUnavailable(err)) {
        setMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Fit assessment
      </h3>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button className="btn btn-primary" disabled={working} onClick={() => void handleQualify()}>
          {working ? 'Assessing...' : 'Run fit assessment'}
        </button>
        <button className="btn btn-secondary" onClick={() => void fetchData()}>
          Refresh
        </button>
      </div>
      {message ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading assessment...</p> : null}
      {!loading && aiUnavailable ? <p style={{ fontSize: '0.875rem' }}>AI assistance is temporarily unavailable. Please try again later.</p> : null}
      {!loading && !aiUnavailable && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !aiUnavailable && !error && !qualification ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          No fit assessment yet. Run one to see strengths, gaps, and missing information.
        </p>
      ) : null}
      {qualification ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {qualification.status ? (
            <p style={{ fontSize: '0.875rem' }}>
              Result: <span className="badge badge-neutral">{String(qualification.status)}</span>
            </p>
          ) : null}
          {score && typeof score.overallScore !== 'undefined' ? (
            <p style={{ fontSize: '0.875rem' }}>Overall score: {String(score.overallScore)}</p>
          ) : null}
          {score && score.insufficientData ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Not enough information yet — add more research or signals before deciding.
            </p>
          ) : null}
          {Array.isArray(qualification.dimensions) && qualification.dimensions.length > 0 ? (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
              {qualification.dimensions.map((d, i) => (
                <li key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {String(d.name ?? `Area ${i + 1}`)}
                    {typeof d.score !== 'undefined' ? ` — ${String(d.score)}` : ''}
                  </p>
                  {d.reason ? <p style={{ fontSize: '0.875rem' }}>{String(d.reason)}</p> : null}
                  {d.evidence ? (
                    <div style={{ marginTop: '0.25rem' }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>Evidence</p>
                      <EvidenceView value={d.evidence} />
                    </div>
                  ) : null}
                  {d.missing ? <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Missing: {String(d.missing)}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(qualification.missingData) && qualification.missingData.length > 0 ? (
            <p style={{ fontSize: '0.875rem' }}>Still needed: {qualification.missingData.join(', ')}</p>
          ) : null}
          {qualification.reasoning ? (
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Why this result</p>
              <p style={{ fontSize: '0.875rem' }}>{String(qualification.reasoning)}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BriefsSection({ leadId }: { leadId: string }) {
  const [briefs, setBriefs] = useState<ProspectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProspectBrief | null>(null);
  const [material, setMaterial] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesis, setSynthesis] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await listProspectBriefs(leadId);
      setBriefs(data.briefs ?? []);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleCreate() {
    setWorking(true);
    setMessage(null);
    try {
      const result = await createProspectBrief(leadId);
      setBriefs((prev) => [result.brief, ...prev]);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setWorking(false);
    }
  }

  async function handleSynthesize() {
    if (!selected) return;
    setSynthesizing(true);
    setSynthesis(null);
    try {
      const parts = material.split('\n').map((s) => s.trim()).filter(Boolean);
      const result = await synthesizeBrief(String(selected.id), parts.length > 0 ? parts : [material]);
      const syn = result.synthesis as Record<string, unknown> | null;
      setSynthesis(
        syn && typeof syn['summary'] === 'string'
          ? String(syn['summary'])
          : JSON.stringify(result.synthesis, null, 2),
      );
    } catch (err) {
      if (isAiUnavailable(err)) {
        setSynthesis('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setSynthesis(friendlyErrorMessage(err));
      }
    } finally {
      setSynthesizing(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Briefs
      </h3>
      <button className="btn btn-primary" disabled={working} onClick={() => void handleCreate()} style={{ marginBottom: '0.75rem' }}>
        {working ? 'Creating...' : 'Create brief'}
      </button>
      {message ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading briefs...</p> : null}
      {!loading && aiUnavailable ? <AiUnavailableBlock /> : null}
      {!loading && !aiUnavailable && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !error && briefs.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No briefs yet.</p>
      ) : null}
      {briefs.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {briefs.map((b) => (
            <li key={String(b.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{String(b.title ?? b.id)}</p>
              {b.summary ? <p style={{ fontSize: '0.875rem' }}>{String(b.summary)}</p> : null}
              <button className="btn btn-secondary" onClick={() => { setSelected(b); setSynthesis(null); }} style={{ marginTop: '0.5rem' }}>
                View + combine notes
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <div style={{ marginTop: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>Selected brief: {String(selected.title ?? selected.id)}</p>
          <EvidenceView value={selected.content ?? selected} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Notes to combine (one per line)
            <textarea value={material} onChange={(e) => setMaterial(e.target.value)} rows={3} style={fieldStyle} />
          </label>
          <button className="btn btn-secondary" disabled={synthesizing || !material.trim()} onClick={() => void handleSynthesize()} style={{ marginTop: '0.5rem' }}>
            {synthesizing ? 'Combining...' : 'Combine notes'}
          </button>
          {synthesis ? <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{synthesis}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function StrategiesSection({ leadId }: { leadId: string }) {
  const [strategies, setStrategies] = useState<OutreachStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [objective, setObjective] = useState('');
  const [audience, setAudience] = useState('');
  const [angle, setAngle] = useState('');
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const data = await listOutreachStrategies(leadId);
      setStrategies(data.strategies ?? []);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!objective.trim() || !audience.trim() || !angle.trim() || !reason.trim()) {
      setMessage('Goal, audience, angle, and reason for contact are required.');
      return;
    }
    setWorking(true);
    setMessage(null);
    try {
      const result = await createOutreachStrategy({
        leadId,
        objective: objective.trim(),
        audience: audience.trim(),
        angle: angle.trim(),
        reasonForContact: reason.trim(),
      });
      setStrategies((prev) => [result.strategy, ...prev]);
      setObjective('');
      setAudience('');
      setAngle('');
      setReason('');
    } catch (err) {
      if (isAiUnavailable(err)) {
        setMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setWorking(false);
    }
  }

  async function handleApprove(id: string) {
    setMessage(null);
    try {
      const result = await approveOutreachStrategy(id);
      setStrategies((prev) => prev.map((s) => (String(s.id) === id ? result.strategy : s)));
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Outreach plans
      </h3>
      <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Goal (e.g. intro call)" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audience" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Angle" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why contact now?" style={fieldStyle} />
        <button type="submit" className="btn btn-primary" disabled={working} style={{ alignSelf: 'flex-start' }}>
          {working ? 'Creating...' : 'Create outreach plan'}
        </button>
      </form>
      {message ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading outreach plans...</p> : null}
      {!loading && aiUnavailable ? <p style={{ fontSize: '0.875rem' }}>AI assistance is temporarily unavailable. Please try again later.</p> : null}
      {!loading && !aiUnavailable && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !error && strategies.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No outreach plans yet.</p>
      ) : null}
      {strategies.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {strategies.map((s) => (
            <li key={String(s.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{String(s.objective ?? s.id)}</p>
              {s.reasonForContact ? <p style={{ fontSize: '0.875rem' }}>{String(s.reasonForContact)}</p> : null}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                {s.status ? <span className="badge badge-neutral">{String(s.status)}</span> : null}
                {s.approved ? <span className="badge badge-neutral">Approved</span> : null}
              </div>
              {!s.approved && s.status !== 'approved' ? (
                <button className="btn btn-secondary" onClick={() => void handleApprove(String(s.id))} style={{ marginTop: '0.5rem' }}>
                  Approve plan
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DraftsSection({ leadId }: { leadId: string }) {
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState('');
  const [draftType, setDraftType] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOutreachDrafts({ leadId });
      setDrafts(data.drafts ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleCompose(event: React.FormEvent) {
    event.preventDefault();
    if (!strategyId.trim() || !draftType.trim()) {
      setMessage('Outreach plan ID and message type are required.');
      return;
    }
    setWorking(true);
    setMessage(null);
    try {
      const result = await createOutreachDraft(strategyId.trim(), draftType.trim());
      setDrafts((prev) => [result.draft, ...prev]);
      setStrategyId('');
      setDraftType('');
    } catch (err) {
      if (isAiUnavailable(err)) {
        setMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Message drafts
      </h3>
      <form onSubmit={(e) => void handleCompose(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input value={strategyId} onChange={(e) => setStrategyId(e.target.value)} placeholder="Outreach plan ID" style={{ ...fieldStyle, flex: '1 1 180px' }} />
        <input value={draftType} onChange={(e) => setDraftType(e.target.value)} placeholder="Message type (e.g. first note)" style={{ ...fieldStyle, flex: '1 1 180px' }} />
        <button type="submit" className="btn btn-primary" disabled={working}>
          {working ? 'Composing...' : 'Compose draft'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void fetchData()}>
          Refresh
        </button>
      </form>
      {message ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      {loading ? <p style={{ fontSize: '0.875rem' }}>Loading drafts...</p> : null}
      {!loading && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !error && drafts.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          No drafts yet. Approve an outreach plan, then compose a draft from it.
        </p>
      ) : null}
      {selectedId ? (
        <DraftDetail draftId={selectedId} onBack={() => setSelectedId(null)} onChanged={() => void fetchData()} />
      ) : drafts.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {drafts.map((d) => (
            <li key={String(d.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{String(d.draftType ?? d.id)}</p>
                  {d.status ? <span className="badge badge-neutral">{String(d.status)}</span> : null}
                </div>
                <button className="btn btn-secondary" onClick={() => setSelectedId(String(d.id))}>
                  Open draft
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DraftDetail({ draftId, onBack, onChanged }: { draftId: string; onBack: () => void; onChanged: () => void }) {
  const [draft, setDraft] = useState<OutreachDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validation, setValidation] = useState<OutreachValidation | null>(null);
  const [gates, setGates] = useState<OutreachQualityGate[]>([]);
  const [gateStatus, setGateStatus] = useState<string | null>(null);
  const [gateScore, setGateScore] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [reviews, setReviews] = useState<OutreachReview[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [prepared, setPrepared] = useState<PreparedAction[]>([]);
  const [actionType, setActionType] = useState('');
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, reviewList] = await Promise.all([
        getOutreachDraft(draftId),
        listOutreachReviews(draftId).catch(() => ({ reviews: [] as OutreachReview[] })),
      ]);
      setDraft(detail.draft);
      setBody(String(detail.draft.body ?? detail.draft.content ?? ''));
      setReviews(reviewList.reviews ?? []);
      try {
        const gateData = await getOutreachDraftGates(draftId);
        setGates(gateData.gates ?? []);
        setGateStatus(gateData.finalStatus ?? null);
        setGateScore(typeof gateData.overallScore === 'number' ? gateData.overallScore : null);
      } catch {
        setGates([]);
      }
      try {
        const all = await listPreparedActions();
        setPrepared(all.preparedActions.filter((p) => String(p.draftId ?? '') === draftId));
      } catch {
        setPrepared([]);
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateOutreachDraft(draftId, { body });
      setDraft(result.draft);
      setMessage('Draft updated.');
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRevision() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await createOutreachDraftRevision(draftId);
      setDraft(result.draft);
      setBody(String(result.draft.body ?? result.draft.content ?? ''));
      setMessage('New revision created.');
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    setChecking(true);
    setMessage(null);
    setAiUnavailable(false);
    try {
      const result = await validateOutreachDraft(draftId);
      setValidation(result.validation);
      try {
        const gateData = await getOutreachDraftGates(draftId);
        setGates(gateData.gates ?? []);
        setGateStatus(gateData.finalStatus ?? null);
        setGateScore(typeof gateData.overallScore === 'number' ? gateData.overallScore : null);
      } catch {
        // keep validation results even if gates fetch fails
      }
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmitReview() {
    setMessage(null);
    try {
      const result = await submitOutreachReview(draftId, reviewNote.trim() || undefined);
      setReviews((prev) => [result.review, ...prev]);
      setReviewNote('');
      setMessage('Sent for review.');
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    }
  }

  async function handleDecision(id: string, action: 'approve' | 'reject' | 'request_changes') {
    setMessage(null);
    try {
      const result = await decideOutreachReview(id, action);
      setReviews((prev) => prev.map((r) => (String(r.id) === id ? result.review : r)));
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    }
  }

  async function handlePrepare() {
    if (!actionType.trim()) {
      setMessage('Describe the prepared action type first.');
      return;
    }
    setMessage(null);
    try {
      const approvedReview = reviews.find(
        (r) => String(r.decision ?? r.status ?? '').toLowerCase() === 'approved',
      );
      const result = await createPreparedAction({
        actionType: actionType.trim(),
        draftId,
        approvalId: approvedReview ? String(approvedReview.id) : undefined,
      });
      setPrepared((prev) => [result.preparedAction, ...prev]);
      setActionType('');
      setMessage('Prepared action created. Nothing runs automatically.');
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    }
  }

  async function handleReady(id: string) {
    setMessage(null);
    try {
      const result = await markPreparedActionReady(id);
      setPrepared((prev) => prev.map((p) => (String(p.id) === id ? result.preparedAction : p)));
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    }
  }

  if (loading) return <p style={{ fontSize: '0.875rem' }}>Loading draft...</p>;
  if (error) {
    return (
      <div>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '0.5rem' }}>
          ← Back to drafts
        </button>
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      </div>
    );
  }
  if (!draft) return null;

  const approvedReview = reviews.find(
    (r) => String(r.decision ?? r.status ?? '').toLowerCase() === 'approved',
  );

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Back to drafts
      </button>
      {draft.status ? (
        <p style={{ fontSize: '0.875rem' }}>
          Status: <span className="badge badge-neutral">{String(draft.status)}</span>
        </p>
      ) : null}
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
        Draft text
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} style={fieldStyle} />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        <button className="btn btn-secondary" disabled={saving} onClick={() => void handleRevision()}>
          Create new revision
        </button>
        <button className="btn btn-primary" disabled={checking} onClick={() => void handleValidate()}>
          {checking ? 'Checking...' : 'Run quality checks'}
        </button>
      </div>
      {message ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      {aiUnavailable ? (
        <p style={{ fontSize: '0.875rem' }}>AI assistance is temporarily unavailable. Please try again later.</p>
      ) : null}

      <div>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.25rem' }}>Quality checks</h4>
        {gateStatus ? (
          <p style={{ fontSize: '0.875rem' }}>
            Overall: <span className="badge badge-neutral">{gateStatus}</span>
            {gateScore !== null ? ` · Score: ${gateScore}` : ''}
          </p>
        ) : (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No quality checks yet. Run quality checks to review this draft.
          </p>
        )}
        {validation && Array.isArray(validation.results) && validation.results.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
            {validation.results.map((r, i) => (
              <li key={i} style={{ fontSize: '0.875rem' }}>
                <span className="badge badge-neutral">{String(r.status ?? 'unknown')}</span>{' '}
                {String(r.message ?? r.gate ?? r.name ?? `Check ${i + 1}`)}
              </li>
            ))}
          </ul>
        ) : null}
        {gates.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
            {gates.map((g, i) => (
              <li key={String(g.id ?? i)} style={{ fontSize: '0.875rem' }}>
                <span className="badge badge-neutral">{String(g.status ?? 'unknown')}</span>{' '}
                {String(g.message ?? g.name ?? `Check ${i + 1}`)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.25rem' }}>Review</h4>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <input
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Note for reviewer (optional)"
            style={{ ...fieldStyle, flex: '1 1 200px' }}
          />
          <button className="btn btn-secondary" onClick={() => void handleSubmitReview()}>
            Ask for review
          </button>
        </div>
        {reviews.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No reviews yet. Ask for a review before preparing any follow-up.
          </p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
            {reviews.map((r) => (
              <li key={String(r.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.5rem' }}>
                <p style={{ fontSize: '0.875rem' }}>
                  <span className="badge badge-neutral">{String(r.decision ?? r.status ?? 'awaiting review')}</span>
                  {r.note ? ` — ${String(r.note)}` : ''}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => void handleDecision(String(r.id), 'approve')}>
                    Approve
                  </button>
                  <button className="btn btn-secondary" onClick={() => void handleDecision(String(r.id), 'request_changes')}>
                    Ask for changes
                  </button>
                  <button className="btn btn-secondary" onClick={() => void handleDecision(String(r.id), 'reject')}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.25rem' }}>Prepared follow-up</h4>
        {!approvedReview ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Needs an approved review before anything can be marked ready.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <input
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              placeholder="Action type (e.g. manual follow-up note)"
              style={{ ...fieldStyle, flex: '1 1 200px' }}
            />
            <button className="btn btn-secondary" onClick={() => void handlePrepare()}>
              Prepare action
            </button>
          </div>
        )}
        {prepared.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No prepared actions yet.</p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
            {prepared.map((p) => {
              const ready = String(p.status ?? '').toUpperCase() === 'READY_FOR_AUTHORIZED_EXECUTION';
              return (
                <li key={String(p.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.5rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{String(p.actionType ?? p.id)}</p>
                  {p.status ? (
                    <p style={{ fontSize: '0.875rem' }}>
                      Status: <span className="badge badge-neutral">{String(p.status)}</span>
                    </p>
                  ) : null}
                  {ready ? (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      Ready for authorized execution. No automatic execution will happen — a person
                      must carry this out.
                    </p>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => void handleReady(String(p.id))} style={{ marginTop: '0.5rem' }}>
                      Mark ready
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
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
