import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import { PageHead, Stepper } from '../components/ui';
import { NavLink, Link, useNavigate } from 'react-router-dom';
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

/* 6-step wizard (UX) mapped onto the 8 real backend steps.
   Backend remains source of truth — progress is detected from real data,
   never ticked manually. Mapping:
   1 Business → backend `offers`
   2 Audience → backend `audience`
   3 Topics → backend `pillars`
   4 Voice → backend `profile`
   5 Presence → backend `sources` (+ optional `leads`, + connections)
   6 How AI works → backend `policy` + `schedule` */
const WIZARD: Array<{
  id: string;
  title: string;
  question: string;
  hint: string;
  backendIds: string[];
}> = [
  {
    id: 'business',
    title: 'Your business',
    question: 'What is your business or personal brand called? What do you do and offer?',
    hint: 'Name, what you do, one offer, and what people should know you for. Website if you have one — we never fetch it without asking.',
    backendIds: ['offers'],
  },
  {
    id: 'audience',
    title: 'Your audience',
    question: 'Who do you want to reach — and who is not a fit?',
    hint: 'Roles, types of people, their problems. Add one audience; remove anytime (with confirmation if it has saved info).',
    backendIds: ['audience'],
  },
  {
    id: 'topics',
    title: 'Your content topics',
    question: 'What subjects do you want to talk about — and what should you avoid?',
    hint: 'Add, edit, reorder and remove topics. These become your content pillars in Settings.',
    backendIds: ['pillars'],
  },
  {
    id: 'voice',
    title: 'Your voice',
    question: 'How should AI sound when it drafts for you?',
    hint: 'Professional or conversational? Educational or opinionated? Short or detailed? Words to avoid, plus one optional writing sample. We never invent your experiences.',
    backendIds: ['profile'],
  },
  {
    id: 'presence',
    title: 'Where you want to build presence',
    question: 'Connect an account and choose 1–2 public sources to start.',
    hint: 'LinkedIn via official flow; research from RSS, blogs, Reddit, Google Trends. Each shows Connected / Not connected / Needs attention / Requires setup / Not available yet. Skip for now is always ok.',
    backendIds: ['sources', 'leads'],
  },
  {
    id: 'autonomy',
    title: 'How AI should work',
    question: 'AI researches and prepares. You review important actions before they happen.',
    hint: 'Default: AI can research and prepare recommendations. Tier 1 posting stays off until a real integration exists — stored preference only. Tier 2 (DMs, connections) always needs you.',
    backendIds: ['policy', 'schedule'],
  },
];

function wizardIndexForBackendStep(currentStep: string | null): number {
  if (!currentStep) return 0;
  const idx = WIZARD.findIndex((w) => w.backendIds.includes(currentStep));
  return idx === -1 ? 0 : idx;
}

/* Backend step ids (8) are mapped onto the 6 UX wizard steps above.
   Kept here for reference; progress Badges read progress.steps directly. */

export function OnboardingPage() {
  const { isAuthenticated, loading: authLoading, workspaceId } = useAuth();
  const navigate = useNavigate();
  const hasWorkspace = workspaceId !== null;
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [policy, setPolicy] = useState<AutonomyPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

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

  useEffect(() => {
    if (progress && !progress.complete) {
      setStepIndex((prev) => {
        const fromBackend = wizardIndexForBackendStep(progress.currentStep);
        // Keep user's manual navigation unless backend moved forward.
        return Math.max(prev, fromBackend);
      });
    }
  }, [progress]);

  if (authLoading || loading) {
    return <div className="card"><div className="empty-state"><h2 className="empty-state-title">Loading onboarding...</h2></div></div>;
  }
  if (!isAuthenticated) {
    return <div className="stack"><div className="card"><h2 className="section-title">Get set up</h2><p className="muted">Sign in to set up your workspace.</p></div><LoginForm /></div>;
  }
  if (!hasWorkspace) {
    return (
      <div className="stack">
        <div className="card row-between">
          <div>
            <p className="kicker">One-time setup</p>
            <h2 className="section-title" style={{ fontSize: '1.25rem' }}>Get set up</h2>
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
            <h2 className="section-title" style={{ fontSize: '1.25rem' }}>Get set up</h2>
            <p className="muted">Create a workspace first — onboarding progress is detected from its data.</p>
          </div>
          <WorkspaceSelector />
        </div>
        <div className="card"><div className="empty-state"><h2 className="empty-state-title">Something went wrong</h2><p className="empty-state-description">{error ?? 'No progress returned.'}</p><button className="btn btn-secondary" onClick={() => void fetchAll()} style={{ marginTop: '1rem' }}>Retry</button></div></div>
      </div>
    );
  }

  if (progress.complete) {
    return (
      <div className="stack">
        <PageHead
          kicker="Welcome — 6 quick steps"
          title="Your workspace is ready."
          sub="Setup complete. The daily loop can run from these settings."
          nextStep="Go to Home, review your business profile, or find your first opportunity."
          helpHref="/help#get-started"
          actions={<WorkspaceSelector />}
        />
        <Stepper steps={WIZARD.map((w) => w.title)} current={WIZARD.length} />
        <div className="card">
          <div className="actions">
            <Link to="/" className="btn btn-primary">Go to Home</Link>
            <Link to="/settings" className="btn btn-secondary">Review business profile</Link>
            <Link to="/observatory" className="btn btn-secondary">Find your first opportunity</Link>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Progress was detected from your real data — never ticked manually. No fake metrics were added.
          </p>
        </div>
      </div>
    );
  }

  const step = WIZARD[Math.min(stepIndex, WIZARD.length - 1)] ?? WIZARD[0]!;
  const backendDone = (ids: string[]) => ids.every((id) => !!progress.steps[id]);
  const isLast = stepIndex >= WIZARD.length - 1;
  const isFirst = stepIndex <= 0;

  function goNext() {
    void refresh();
    setStepIndex((i) => Math.min(i + 1, WIZARD.length - 1));
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function saveAndExit() {
    void refresh();
    navigate('/');
  }

  return (
    <div className="stack wizard-shell">
      <PageHead
        kicker={`Welcome — step ${stepIndex + 1} of ${WIZARD.length}`}
        title={step.title}
        sub={step.question}
        nextStep={step.hint}
        helpHref="/help#get-started"
        actions={<WorkspaceSelector />}
      />
      <Stepper steps={WIZARD.map((w) => w.title)} current={stepIndex} />

      <div className="card stack-sm">
        <div className="row-between">
          <h3 className="section-title">{step.question}</h3>
          {backendDone(step.backendIds) ? (
            <span className="badge badge-success">done</span>
          ) : (
            <span className="badge badge-info">current</span>
          )}
        </div>
        <p className="muted">{step.hint}</p>

        {step.id === 'business' ? <OffersStep onSaved={() => void refresh()} /> : null}
        {step.id === 'audience' ? <AudienceStep counts={progress.counts} /> : null}
        {step.id === 'topics' ? <PillarsStep onSaved={() => void refresh()} /> : null}
        {step.id === 'voice' ? <ProfileStep counts={progress.counts} onSaved={() => void refresh()} /> : null}
        {step.id === 'presence' ? (
          <div className="stack-sm">
            <p className="muted" style={{ fontWeight: 600 }}>1) Connect an account (official flow)</p>
            <div className="actions">
              <NavLink to="/connections" className="btn btn-secondary">Connect an account</NavLink>
              <NavLink to="/sources" className="btn btn-secondary">Open Research Sources</NavLink>
            </div>
            <p className="muted" style={{ fontWeight: 600 }}>2) Add 1–2 public sources</p>
            <SourcesStep onChanged={() => void refresh()} />
            <details>
              <summary className="muted" style={{ cursor: 'pointer' }}>Optional: import your own people (CSV)</summary>
              <div style={{ marginTop: '0.5rem' }}>
                <LeadsStep onChanged={() => void refresh()} />
              </div>
            </details>
            <p className="tiny">
              Each platform shows Connected / Not connected / Needs attention / Requires setup / Not available yet.
              Showing “Skip for now” is fine — continue without connecting.
            </p>
          </div>
        ) : null}
        {step.id === 'autonomy' ? (
          <div className="stack-sm">
            <div className="card-row">
              <p style={{ fontWeight: 700, margin: 0 }}>Default: AI researches and prepares. You review important actions before they happen.</p>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                Tier 0 automatic (research, scoring, drafting). Tier 1 posting stays off until a real integration exists.
                Tier 2 (messages to people) always needs you. Tier 3 (scraping, mass messaging) is never built.
              </p>
              <div className="actions" style={{ marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => alert('Tier 0: research, scoring, drafting, analytics, learning. Tier 1: your own posts only when an integration exists. Tier 2: anything contacting another person — always you. Tier 3: never built.')}>
                  Learn more
                </button>
              </div>
            </div>
            <PolicyStep policy={policy} onSaved={(p) => { setPolicy(p); void refresh(); }} />
            <details>
              <summary className="muted" style={{ cursor: 'pointer' }}>Schedule & limits (advanced, optional)</summary>
              <div style={{ marginTop: '0.5rem' }}>
                <ScheduleStep settings={settings} onSaved={(s) => { setSettings(s); void refresh(); }} />
              </div>
            </details>
          </div>
        ) : null}

        <div className="wizard-actions">
          {!isFirst ? <button type="button" className="btn btn-secondary" onClick={goBack}>Back</button> : null}
          <button type="button" className="btn btn-ghost" onClick={saveAndExit}>Save and exit</button>
          {!isLast ? (
            <button type="button" className="btn btn-primary" onClick={goNext}>Continue</button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void refresh();
                navigate('/');
              }}
            >
              Finish setup
            </button>
          )}
          {step.id === 'presence' ? (
            <button type="button" className="btn btn-secondary" onClick={goNext}>Skip for now</button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Progress saves automatically from your real data. Detailed technical settings stay in{' '}
          <NavLink to="/settings">Settings</NavLink> and <NavLink to="/brain">Deep dive</NavLink> — out of the way until you need them.
        </p>
      </div>
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
        <NavLink to="/brain">Brain → Sources → Research sources</NavLink>. They count toward this step once enabled.
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
