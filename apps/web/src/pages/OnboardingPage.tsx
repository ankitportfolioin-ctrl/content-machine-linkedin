import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import { NavLink } from 'react-router-dom';
import {
  createFeed,
  createProfile,
  deleteFeed,
  friendlyErrorMessage,
  getBusinessProfile,
  getOnboarding,
  importLeads,
  listFeeds,
  refreshOnboarding,
  updateBusiness,
  updateFeed,
  updateKillSwitch,
  updatePolicy,
  updateSchedule,
  updateStrategy,
  updateVoiceProfile,
} from '../services/api';
import { AutonomyPolicy, FeedSource, OnboardingProgress, WorkspaceSettings } from '../types';

const STEP_META: Array<{ id: string; title: string; hint: string }> = [
  { id: 'profile', title: '1. Profile & voice', hint: 'Role, positioning, writing samples. Managed in Settings; progress is detected automatically.' },
  { id: 'audience', title: '2. Audience & ICP', hint: 'Target roles, industries, audience segments. Managed in Settings and the Dashboard.' },
  { id: 'pillars', title: '3. Pillars & objectives', hint: 'What the business talks about and what content must achieve.' },
  { id: 'offers', title: '4. Offers', hint: 'Products, services, guides — and what you are willing to talk about.' },
  { id: 'sources', title: '5. Signal sources', hint: 'Free, public, ToS-respecting feeds. No LinkedIn scraping — ever.' },
  { id: 'leads', title: '6. Lead import', hint: 'Your own CSV or LinkedIn’s official export of your data. Never scraped.' },
  { id: 'policy', title: '7. Autonomy policy', hint: 'Tier 0 is automatic. Tier 1 stays disabled until the LinkedIn integration exists.' },
  { id: 'schedule', title: '8. Schedule & controls', hint: 'Daily time, timezone, budget caps, pause and kill switch.' },
];

export function OnboardingPage() {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const hasWorkspace = workspaceId !== null;
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [policy, setPolicy] = useState<AutonomyPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOnboarding();
      setProgress(data.onboarding);
      setSettings(data.settings);
      setPolicy(data.policy);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await refreshOnboarding();
      setProgress(data.onboarding);
    } catch {
      // Badges stay stale; the next full load repairs them. Never fake done.
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated && hasWorkspace) void fetchAll();
    if (!authLoading && (!isAuthenticated || !hasWorkspace)) setLoading(false);
  }, [authLoading, isAuthenticated, workspaceId, fetchAll]);

  if (authLoading || loading) {
    return <div className="card"><div className="empty-state"><h2 className="empty-state-title">Loading onboarding...</h2></div></div>;
  }
  if (!isAuthenticated) {
    return <div className="stack"><div className="card"><h2 className="section-title">Onboarding</h2><p className="muted">Sign in to set up your workspace.</p></div><LoginForm /></div>;
  }
  if (!hasWorkspace) {
    return (
      <div className="stack">
        <div className="card row-between">
          <div>
            <p className="kicker">One-time setup</p>
            <h2 className="section-title" style={{ fontSize: '1.25rem' }}>Onboarding</h2>
            <p className="muted">Create a workspace first — onboarding progress is detected from its data.</p>
          </div>
          <WorkspaceSelector />
        </div>
      </div>
    );
  }
  if (error || !progress) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card row-between">
          <div>
            <p className="kicker">One-time setup</p>
            <h2 className="section-title" style={{ fontSize: '1.25rem' }}>Onboarding</h2>
            <p className="muted">Create a workspace first — onboarding progress is detected from its data.</p>
          </div>
          <WorkspaceSelector />
        </div>
        <div className="card"><div className="empty-state"><h2 className="empty-state-title">Something went wrong</h2><p className="empty-state-description">{error ?? 'No progress returned.'}</p><button className="btn btn-secondary" onClick={() => void fetchAll()} style={{ marginTop: '1rem' }}>Retry</button></div></div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card row-between">
        <div>
          <p className="kicker">One-time setup</p>
          <h2 className="section-title" style={{ fontSize: '1.25rem' }}>Onboarding</h2>
          <p className="muted">
            {progress.complete
              ? 'Setup complete. The daily loop can run from these settings.'
              : `Next: ${progress.currentStep ?? '—'}. Progress is detected from your real data, never ticked manually.`}
          </p>
        </div>
        <WorkspaceSelector />
      </div>

      {STEP_META.map((meta) => (
        <StepCard key={meta.id} meta={meta} done={!!progress.steps[meta.id]} current={progress.currentStep === meta.id}>
          {meta.id === 'profile' ? <ProfileStep counts={progress.counts} onSaved={() => void refresh()} /> : null}
          {meta.id === 'audience' ? <AudienceStep counts={progress.counts} /> : null}
          {meta.id === 'pillars' ? <PillarsStep onSaved={() => void refresh()} /> : null}
          {meta.id === 'offers' ? <OffersStep onSaved={() => void refresh()} /> : null}
          {meta.id === 'sources' ? <SourcesStep onChanged={() => void refresh()} /> : null}
          {meta.id === 'leads' ? <LeadsStep onChanged={() => void refresh()} /> : null}
          {meta.id === 'policy' ? <PolicyStep policy={policy} onSaved={(p) => { setPolicy(p); void refresh(); }} /> : null}
          {meta.id === 'schedule' ? <ScheduleStep settings={settings} onSaved={(s) => { setSettings(s); void refresh(); }} /> : null}
        </StepCard>
      ))}
    </div>
  );
}

function StepCard({ meta, done, current, children }: { meta: { id: string; title: string; hint: string }; done: boolean; current: boolean; children: React.ReactNode }) {
  return (
    <div className="card stack-sm">
      <div className="row-between">
        <h3 className="section-title">{meta.title}</h3>
        {done
          ? <span className="badge badge-success">done</span>
          : current
            ? <span className="badge badge-info">current</span>
            : <span className="badge badge-neutral">todo</span>}
      </div>
      <p className="muted">{meta.hint}</p>
      {children}
    </div>
  );
}

function ProfileStep({ counts, onSaved }: { counts: OnboardingProgress['counts']; onSaved: () => void }) {
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreateProfile() {
    setCreating(true);
    setMessage(null);
    try {
      await createProfile({
        headline: undefined,
        role: undefined,
        summary: undefined,
        professionalContext: undefined,
        industry: undefined,
        location: undefined,
        linkedinUrl: undefined,
      });
      setMessage('Profile created. Complete the fields in Settings to continue.');
      onSaved();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="actions">
      <span className="badge badge-neutral">writing samples: {counts.writingSamples}</span>
      <button className="btn btn-primary" onClick={handleCreateProfile} disabled={creating}>
        {creating ? 'Creating...' : 'Create profile'}
      </button>
      <NavLink to="/settings" className="btn btn-secondary">Open Settings</NavLink>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

function AudienceStep({ counts }: { counts: OnboardingProgress['counts'] }) {
  return (
    <div className="actions">
      <span className="badge badge-neutral">ICPs: {counts.icps}</span>
      <span className="badge badge-neutral">segments: {counts.audienceSegments}</span>
      <NavLink to="/settings" className="btn btn-secondary">Open Settings</NavLink>
      <NavLink to="/dashboard" className="btn btn-secondary">Seed segments</NavLink>
    </div>
  );
}

function PillarsStep({ onSaved }: { onSaved: () => void }) {
  const [pillars, setPillars] = useState('');
  const [objective, setObjective] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setMsg(null);
    try {
      const list = pillars.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        await updateVoiceProfile({ contentPillars: list });
      }
      if (objective.trim()) {
        const current = await getBusinessProfile() as { strategy?: { contentGoals?: Array<Record<string, unknown>> } | null };
        const existing = Array.isArray(current.strategy?.contentGoals) ? current.strategy!.contentGoals! : [];
        await updateStrategy({
          businessGoals: [],
          audienceGoals: [],
          contentGoals: [...existing, { goal: objective.trim() }],
          growthGoals: [],
          productGoals: [],
        });
      }
      setMsg('Saved. Badges refresh from your real data.');
      onSaved();
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="stack-sm">
      <input value={pillars} onChange={(e) => setPillars(e.target.value)} placeholder="Pillars, comma-separated (e.g. AI tutorials, developer tools)" className="field" />
      <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="One content objective (e.g. authority with beginner developers)" className="field" />
      <div><button type="submit" className="btn btn-primary" disabled={working}>{working ? 'Saving...' : 'Save pillars'}</button></div>
      {msg ? <p className="muted">{msg}</p> : null}
    </form>
  );
}

function OffersStep({ onSaved }: { onSaved: () => void }) {
  const [bizName, setBizName] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('guide');
  const [desc, setDesc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setMsg(null);
    try {
      const current = await getBusinessProfile() as {
        business?: {
          name?: string; description?: string | null; mission?: string | null;
          products?: Array<Record<string, unknown>>; services?: Array<Record<string, unknown>>;
          skills?: Array<Record<string, unknown>>; ebooks?: Array<Record<string, unknown>>;
          guides?: Array<Record<string, unknown>>; targetOutcomes?: Array<Record<string, unknown>>;
          monetizationGoals?: Array<Record<string, unknown>>;
        } | null;
      };
      const b = current.business ?? {};
      const arr = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v as Array<Record<string, unknown>> : []);
      await updateBusiness({
        name: bizName.trim() || (typeof b.name === 'string' && b.name) || 'My Business',
        description: b.description ?? undefined,
        mission: b.mission ?? undefined,
        products: arr(b.products),
        services: arr(b.services),
        skills: arr(b.skills),
        ebooks: arr(b.ebooks),
        guides: [...arr(b.guides), { title: name.trim(), description: desc.trim() || undefined, type: kind }],
        targetOutcomes: arr(b.targetOutcomes),
        monetizationGoals: arr(b.monetizationGoals),
      });
      setName('');
      setDesc('');
      setMsg('Offer saved. Add services/products the same way from Settings later.');
      onSaved();
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="stack-sm">
      <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Business name (required once)" className="field" />
      <div className="actions">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Offer title *" required className="field" style={{ flex: '2 1 200px' }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="field" style={{ flex: '1 1 140px' }} aria-label="Offer type">
          <option value="guide">guide</option>
          <option value="ebook">ebook</option>
          <option value="product">product</option>
          <option value="service">service</option>
        </select>
      </div>
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What outcome does it deliver?" className="field" />
      <div><button type="submit" className="btn btn-primary" disabled={working || !name.trim()}>{working ? 'Saving...' : 'Save offer'}</button></div>
      {msg ? <p className="muted">{msg}</p> : null}
    </form>
  );
}

function SourcesStep({ onChanged }: { onChanged: () => void }) {
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [url, setUrl] = useState('');
  const [type, setType] = useState('rss');
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listFeeds();
      setFeeds(data.feeds ?? []);
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setWorking(true);
    setMsg(null);
    try {
      await createFeed({ url: url.trim(), type });
      setUrl('');
      await load();
      onChanged();
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function toggle(feed: FeedSource) {
    try {
      await updateFeed(String(feed.id), { active: !feed.active });
      await load();
      onChanged();
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    }
  }

  async function remove(feed: FeedSource) {
    try {
      await deleteFeed(String(feed.id));
      await load();
      onChanged();
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    }
  }

  return (
    <div className="stack-sm">
      <p className="muted">
        Registry research sources (Reddit, Google Trends) are configured per workspace in the{' '}
        <NavLink to="/brain">Brain → Sources → Research catalogue</NavLink>. They count toward this step once enabled.
      </p>
      <form onSubmit={(e) => void handleAdd(e)} className="actions">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/feed" className="field" style={{ flex: '2 1 220px' }} />
        <select value={type} onChange={(e) => setType(e.target.value)} className="field" style={{ flex: '1 1 140px' }} aria-label="Source type">
          <option value="rss">RSS</option>
          <option value="atom">Atom</option>
          <option value="hackernews">Hacker News</option>
          <option value="github_releases">GitHub releases</option>
          <option value="blog">Blog</option>
          <option value="site">Site</option>
        </select>
        <button type="submit" className="btn btn-primary" disabled={working || !url.trim()}>{working ? 'Adding...' : 'Add'}</button>
      </form>
      {msg ? <p className="muted">{msg}</p> : null}
      {feeds.length === 0 ? <p className="muted">No feed sources yet.</p> : (
        <ul className="plain-list">
          {feeds.map((f) => (
            <li key={String(f.id)} className="card-row row-between">
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{String(f.name ?? f.url)}</p>
                <p className="tiny">{String(f.type)} · {f.active ? 'active' : 'paused'}{f.lastError ? ` · last error: ${String(f.lastError).slice(0, 120)}` : ''}</p>
              </div>
              <div className="actions">
                <button className="btn btn-secondary" onClick={() => void toggle(f)}>{f.active ? 'Pause' : 'Activate'}</button>
                <button className="btn btn-ghost" onClick={() => void remove(f)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadsStep({ onChanged }: { onChanged: () => void }) {
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState('');
  const [fileInfo, setFileInfo] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; deduped: boolean; skipped: Array<{ rowNumber: number; reason: string }>; status: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  function readFileText(file: File): Promise<string> {
    // FileReader works in every browser (and jsdom); File.text() does not.
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsText(file);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('read failed'));
      }
    });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setResult(null);
    // Client-side read only: the file never leaves the browser except as
    // text inside the existing JSON import request — no third-party upload.
    if (file.size > 500000) {
      setMsg('File is larger than 500 KB; the import API caps payloads at 500,000 characters.');
      return;
    }
    try {
      const text = await readFileText(file);
      setCsv(text);
      setFilename(file.name);
      const firstLine = (text.split(/\r?\n/)[0] ?? '').toLowerCase();
      const hasName = /(^|,)name(,|$)/.test(firstLine);
      setFileInfo(`${file.name} · ${(file.size / 1024).toFixed(1)} KB · ${hasName ? 'header looks valid (has name)' : 'warning: header row should include name'}`);
    } catch {
      setMsg('Could not read that file in this browser. Paste the CSV text instead.');
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csv.trim()) return;
    setWorking(true);
    setMsg(null);
    setResult(null);
    try {
      const res = await importLeads(csv, filename.trim() || undefined);
      setResult({ imported: res.imported, deduped: res.deduped, skipped: res.skipped ?? [], status: String((res.batch as { status?: string }).status ?? 'unknown') });
      setCsv('');
      setFileInfo(null);
      onChanged();
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="stack-sm">
      <p className="muted">Header row required: <span className="badge badge-neutral">name, linkedinUrl, headline, company, location</span> — only your own data.</p>
      <form onSubmit={(e) => void handleImport(e)} className="stack-sm">
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          Choose a CSV file (read locally, never uploaded anywhere)
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            aria-label="Choose a CSV file"
            onChange={(e) => void handleFile(e.target.files?.[0])}
            style={{ fontSize: '0.875rem' }}
          />
        </label>
        {fileInfo ? <p className="muted">{fileInfo}</p> : null}
        <input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="Filename label (optional)" className="field" />
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,linkedinUrl,headline,company\nJane Doe,https://linkedin.com/in/jane,CTO at Acme,Acme'} rows={5} className="field" />
        <div><button type="submit" className="btn btn-primary" disabled={working || !csv.trim()}>{working ? 'Importing...' : 'Import leads'}</button></div>
      </form>
      {msg ? <p className="alert-error">{msg}</p> : null}
      {result ? (
        <div className="stack-sm">
          <p style={{ fontSize: '0.875rem' }}>
            {result.deduped ? 'File already imported (deduplicated). ' : ''}Imported {result.imported} · status {result.status}.
          </p>
          {result.skipped.length > 0 ? (
            <ul className="bullet-list">
              {result.skipped.map((s, i) => <li key={i}>Row {s.rowNumber}: {s.reason}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PolicyStep({ policy, onSaved }: { policy: AutonomyPolicy | null; onSaved: (p: AutonomyPolicy) => void }) {
  const [tier1, setTier1] = useState(false);
  const [cap, setCap] = useState('1');
  const [approvedOnly, setApprovedOnly] = useState(true);
  const [ack, setAck] = useState(false);
  // Batch 2 (B): explicit, workspace-scoped auto-preparation policy.
  const [autoApproved, setAutoApproved] = useState(true);
  const [autoCold, setAutoCold] = useState(false);
  const [autoQuota, setAutoQuota] = useState('10');
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (policy) {
      setTier1(!!policy.tier1PostingEnabled);
      setCap(String(policy.tier1PostingDailyCap ?? 1));
      setApprovedOnly(policy.tier1RequireApprovedPost !== false);
      setAck(!!policy.tier2HumanApprovalAck);
      if (typeof policy.autoPrepareApprovedWork === 'boolean') setAutoApproved(policy.autoPrepareApprovedWork);
      if (typeof policy.autoPrepareColdWork === 'boolean') setAutoCold(policy.autoPrepareColdWork);
      if (typeof policy.dailyAutoPreparationQuota === 'number') setAutoQuota(String(policy.dailyAutoPreparationQuota));
    }
  }, [policy]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setMsg(null);
    try {
      const res = await updatePolicy({
        tier1PostingEnabled: tier1,
        tier1PostingDailyCap: Number.parseInt(cap, 10) || 0,
        tier1RequireApprovedPost: approvedOnly,
        tier2HumanApprovalAck: ack,
        autoPrepareApprovedWork: autoApproved,
        autoPrepareColdWork: autoCold,
        dailyAutoPreparationQuota: Math.max(0, Number.parseInt(autoQuota, 10) || 0),
      });
      onSaved(res.policy);
      setMsg(`${res.effectiveTier1Reason}`);
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="stack-sm">
      <ul className="bullet-list">
        <li>Tier 0 (automatic): research, scoring, drafting, analytics, learning, digest.</li>
        <li>Tier 1 (standing policy only): publishing your own posts — currently impossible, no integration exists.</li>
        <li>Tier 2 (human every time): DMs, connections, comments, anything contacting another person.</li>
        <li>Tier 3 (never): scraping, automation, mass messaging — not built, never will be.</li>
      </ul>
      <label className="muted"><input type="checkbox" checked={tier1} onChange={(e) => setTier1(e.target.checked)} /> Allow Tier-1 auto-posting when an integration exists (stored preference only)</label>
      <div className="actions">
        <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" aria-label="Tier-1 daily cap" className="field" style={{ flex: '0 1 120px' }} />
        <label className="muted"><input type="checkbox" checked={approvedOnly} onChange={(e) => setApprovedOnly(e.target.checked)} /> Only approved posts</label>
      </div>
      <label className="muted"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand Tier 2 always needs my approval (required to finish setup)</label>
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
        <p className="muted" style={{ fontWeight: 600 }}>Auto-preparation (internal drafts only — never sends or publishes)</p>
        <label className="muted"><input type="checkbox" checked={autoApproved} onChange={(e) => setAutoApproved(e.target.checked)} /> Auto-prepare work justified by prior human judgment (imported leads, triaged opportunities, approved strategies/plans)</label>
        <label className="muted"><input type="checkbox" checked={autoCold} onChange={(e) => setAutoCold(e.target.checked)} /> Also auto-prepare untouched opportunities/prospects (cold — off by default)</label>
        <div className="actions">
          <input value={autoQuota} onChange={(e) => setAutoQuota(e.target.value)} inputMode="numeric" aria-label="Daily auto-preparation quota" className="field" style={{ flex: '0 1 120px' }} />
          <span className="muted">max automatic preparations per day (quota exhaustion preserves backlog)</span>
        </div>
      </div>
      <div><button type="submit" className="btn btn-primary" disabled={working}>{working ? 'Saving...' : 'Save policy'}</button></div>
      {msg ? <p className="muted">{msg}</p> : null}
    </form>
  );
}

function ScheduleStep({ settings, onSaved }: { settings: WorkspaceSettings | null; onSaved: (s: WorkspaceSettings) => void }) {
  const [tz, setTz] = useState('UTC');
  const [time, setTime] = useState('06:00');
  const [llm, setLlm] = useState('50');
  const [fetch, setFetch] = useState('100');
  const [prep, setPrep] = useState('20');
  const [paused, setPaused] = useState(false);
  const [killed, setKilled] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (settings) {
      setTz(settings.timezone ?? 'UTC');
      setTime(settings.dailyRunTime ?? '06:00');
      setLlm(String(settings.dailyLlmCallCap ?? 50));
      setFetch(String(settings.dailyFetchCap ?? 100));
      setPrep(String(settings.dailyPreparationCap ?? 20));
      setPaused(!!settings.paused);
      setKilled(!!settings.killSwitch);
    }
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setMsg(null);
    try {
      const res = await updateSchedule({
        timezone: tz.trim() || 'UTC',
        dailyRunTime: time.trim(),
        dailyLlmCallCap: Number.parseInt(llm, 10) || 0,
        dailyFetchCap: Number.parseInt(fetch, 10) || 0,
        dailyPreparationCap: Number.parseInt(prep, 10) || 0,
        autonomyTier: 0,
      });
      onSaved(res.settings);
      setMsg('Schedule saved.');
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function handleKill(patch: { paused?: boolean; killSwitch?: boolean }) {
    setWorking(true);
    setMsg(null);
    try {
      const res = await updateKillSwitch(patch);
      onSaved(res.settings);
      setPaused(!!res.settings.paused);
      setKilled(!!res.settings.killSwitch);
      setMsg('Controls updated. Requires owner/admin — otherwise you would see an access error here.');
    } catch (err) {
      setMsg(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="stack-sm">
      <form onSubmit={(e) => void handleSave(e)} className="stack-sm">
        <div className="actions">
          <input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Timezone (e.g. UTC)" aria-label="Timezone" className="field" style={{ flex: '1 1 160px' }} />
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="06:00" aria-label="Daily run time" className="field" style={{ flex: '1 1 120px' }} />
        </div>
        <div className="actions">
          <input value={llm} onChange={(e) => setLlm(e.target.value)} inputMode="numeric" aria-label="LLM cap" className="field" style={{ flex: '1 1 120px' }} />
          <input value={fetch} onChange={(e) => setFetch(e.target.value)} inputMode="numeric" aria-label="Fetch cap" className="field" style={{ flex: '1 1 120px' }} />
          <input value={prep} onChange={(e) => setPrep(e.target.value)} inputMode="numeric" aria-label="Preparation cap" className="field" style={{ flex: '1 1 120px' }} />
          <button type="submit" className="btn btn-primary" disabled={working}>{working ? 'Saving...' : 'Save schedule'}</button>
        </div>
      </form>
      <div className="actions">
        <button className="btn btn-secondary" disabled={working} onClick={() => void handleKill({ paused: !paused })}>{paused ? 'Resume loop' : 'Pause loop'}</button>
        <button className="btn btn-secondary" disabled={working} onClick={() => void handleKill({ killSwitch: !killed })}>{killed ? 'Clear kill switch' : 'Kill switch'}</button>
        {killed ? <span className="badge badge-error">killed</span> : paused ? <span className="badge badge-warning">paused</span> : <span className="badge badge-success">running</span>}
      </div>
      {msg ? <p className="muted">{msg}</p> : null}
    </div>
  );
}
