import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  ApiRequestError,
  createIcp,
  createProfile,
  createReceipt,
  createSample,
  deleteReceipt,
  deleteSample,
  friendlyErrorMessage,
  getMyProfile,
  getVoiceProfile,
  listIcps,
  listReceipts,
  listSamples,
  updateIcp,
  updateProfile,
  updateVoiceProfile,
} from '../services/api';
import { CreateProfileInput, Icp, UserProfile, VoiceProfile, VoiceReceipt, VoiceSample } from '../types';

export function SettingsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();

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
          <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Settings</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Sign in to manage your profile, audiences, and voice.
          </p>
        </div>
        <LoginForm />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 className="health-card-title">Settings</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Profile, ideal audiences, voice, proof points, and writing samples.
          </p>
        </div>
        <WorkspaceSelector />
      </div>
      <ProfileSection />
      <IcpSection />
      <VoiceProfileSection />
      <ReceiptsSection />
      <SamplesSection />
      <IntegrationsSection />
    </div>
  );
}

function ProfileSection() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // 404 from GET /profiles/me means "no profile yet" → create mode.
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headline, setHeadline] = useState('');
  const [role, setRole] = useState('');
  const [summary, setSummary] = useState('');
  const [professionalContext, setProfessionalContext] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fillForm = useCallback((p: UserProfile) => {
    setHeadline(String(p.headline ?? ''));
    setRole(String(p.role ?? ''));
    setSummary(String(p.summary ?? ''));
    setProfessionalContext(String(p.professionalContext ?? ''));
    setIndustry(String(p.industry ?? ''));
    setLocation(String(p.location ?? ''));
    setLinkedinUrl(String(p.linkedinUrl ?? ''));
  }, []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyProfile();
      setProfile(data.profile);
      setMissing(false);
      fillForm(data.profile);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setProfile(null);
        setMissing(true);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [fillForm]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  function collectInput(): CreateProfileInput {
    const clean = (v: string): string | undefined => {
      const t = v.trim();
      return t.length > 0 ? t : undefined;
    };
    return {
      headline: clean(headline),
      role: clean(role),
      summary: clean(summary),
      professionalContext: clean(professionalContext),
      industry: clean(industry),
      location: clean(location),
      linkedinUrl: clean(linkedinUrl),
    };
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (!profile) {
        const data = await createProfile(collectInput());
        setProfile(data.profile);
        setMissing(false);
        fillForm(data.profile);
        setMessage('Profile created.');
      } else {
        const data = await updateProfile(String(profile.id), collectInput());
        setProfile(data.profile);
        fillForm(data.profile);
        setMessage('Profile saved.');
      }
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Profile</h3>
      {user?.email ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Signed in as {user.email} — the fields below are your workspace profile facts.
        </p>
      ) : null}
      {loading ? <p style={mutedStyle}>Loading profile...</p> : null}
      {!loading && error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p>
          <button className="btn btn-secondary" onClick={() => void fetchProfile()}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && (profile || missing) ? (
        <form onSubmit={(e) => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {missing ? (
            <p style={mutedStyle}>No profile in this workspace yet — describe yourself to begin onboarding.</p>
          ) : null}
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (e.g. Founder at Acme)" aria-label="Headline" style={fieldStyle} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Founder)" aria-label="Role" style={fieldStyle} />
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" aria-label="Summary" rows={3} style={fieldStyle} />
          <textarea value={professionalContext} onChange={(e) => setProfessionalContext(e.target.value)} placeholder="Professional context" aria-label="Professional context" rows={2} style={fieldStyle} />
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry" aria-label="Industry" style={fieldStyle} />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" aria-label="Location" style={fieldStyle} />
          <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="LinkedIn URL (optional)" aria-label="LinkedIn URL" inputMode="url" style={fieldStyle} />
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Saving...' : missing ? 'Create profile' : 'Save profile'}
          </button>
          {message ? <p style={mutedStyle}>{message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function splitList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function joinList(value: string[] | undefined): string {
  return (value ?? []).join(', ');
}

function IcpSection() {
  const [icps, setIcps] = useState<Icp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetRoles, setTargetRoles] = useState('');
  const [industries, setIndustries] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [problems, setProblems] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ name: '', description: '', targetRoles: '', industries: '', companySize: '', problems: '', exclusions: '' });
  const [editSaving, setEditSaving] = useState(false);

  const fetchIcps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listIcps();
      setIcps(data.icps ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIcps();
  }, [fetchIcps]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setMessage(null);
    try {
      await createIcp({
        name: name.trim(),
        description: description.trim() || undefined,
        targetRoles: splitList(targetRoles),
        industries: splitList(industries),
        companySize: companySize.trim() || undefined,
        problems: problems.trim() || undefined,
        exclusions: exclusions.trim() || undefined,
      });
      setName('');
      setDescription('');
      setTargetRoles('');
      setIndustries('');
      setCompanySize('');
      setProblems('');
      setExclusions('');
      setMessage('Audience added.');
      await fetchIcps();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  function startEditing(icp: Icp) {
    setEditingId(String(icp.id));
    setEditFields({
      name: String(icp.name ?? ''),
      description: String(icp.description ?? ''),
      targetRoles: joinList(icp.targetRoles),
      industries: joinList(icp.industries),
      companySize: String(icp.companySize ?? ''),
      problems: String(icp.problems ?? ''),
      exclusions: String(icp.exclusions ?? ''),
    });
  }

  async function handleUpdate() {
    if (!editingId) return;
    setEditSaving(true);
    setMessage(null);
    try {
      await updateIcp(editingId, {
        name: editFields.name.trim() || undefined,
        description: editFields.description.trim() || undefined,
        targetRoles: splitList(editFields.targetRoles),
        industries: splitList(editFields.industries),
        companySize: editFields.companySize.trim() || undefined,
        problems: editFields.problems.trim() || undefined,
        exclusions: editFields.exclusions.trim() || undefined,
      });
      setEditingId(null);
      setMessage('Audience updated.');
      await fetchIcps();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Ideal audiences</h3>
      <p style={{ ...mutedStyle, marginBottom: '0.75rem' }}>Define who your content is for.</p>
      <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" required style={fieldStyle} />
          <input value={targetRoles} onChange={(e) => setTargetRoles(e.target.value)} placeholder="Target roles (comma-separated)" style={fieldStyle} />
          <input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Industries (comma-separated)" style={fieldStyle} />
          <input value={companySize} onChange={(e) => setCompanySize(e.target.value)} placeholder="Company size" style={fieldStyle} />
        </div>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={2} style={fieldStyle} />
        <textarea value={problems} onChange={(e) => setProblems(e.target.value)} placeholder="Problems they face" rows={2} style={fieldStyle} />
        <textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="Who this is not for" rows={2} style={fieldStyle} />
        <button type="submit" className="btn btn-primary" disabled={creating || !name.trim()} style={{ alignSelf: 'flex-start' }}>
          {creating ? 'Adding...' : 'Add audience'}
        </button>
      </form>
      {message ? <p style={{ ...mutedStyle, marginBottom: '0.5rem' }}>{message}</p> : null}
      {loading ? <p style={mutedStyle}>Loading audiences...</p> : null}
      {!loading && error ? <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p> : null}
      {!loading && !error && icps.length === 0 ? <p style={mutedStyle}>No audiences yet.</p> : null}
      {!loading && !error && icps.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
          {icps.map((icp) => (
            <li key={String(icp.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
              {editingId === String(icp.id) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input value={editFields.name} onChange={(e) => setEditFields({ ...editFields, name: e.target.value })} placeholder="Name" style={fieldStyle} />
                  <input value={editFields.targetRoles} onChange={(e) => setEditFields({ ...editFields, targetRoles: e.target.value })} placeholder="Target roles (comma-separated)" style={fieldStyle} />
                  <input value={editFields.industries} onChange={(e) => setEditFields({ ...editFields, industries: e.target.value })} placeholder="Industries (comma-separated)" style={fieldStyle} />
                  <input value={editFields.companySize} onChange={(e) => setEditFields({ ...editFields, companySize: e.target.value })} placeholder="Company size" style={fieldStyle} />
                  <textarea value={editFields.description} onChange={(e) => setEditFields({ ...editFields, description: e.target.value })} placeholder="Description" rows={2} style={fieldStyle} />
                  <textarea value={editFields.problems} onChange={(e) => setEditFields({ ...editFields, problems: e.target.value })} placeholder="Problems" rows={2} style={fieldStyle} />
                  <textarea value={editFields.exclusions} onChange={(e) => setEditFields({ ...editFields, exclusions: e.target.value })} placeholder="Exclusions" rows={2} style={fieldStyle} />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" disabled={editSaving} onClick={() => void handleUpdate()}>
                      {editSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{icp.name}</p>
                    {icp.description ? <p style={mutedStyle}>{String(icp.description)}</p> : null}
                    {(icp.targetRoles ?? []).length > 0 ? <p style={mutedStyle}>Roles: {(icp.targetRoles ?? []).join(', ')}</p> : null}
                    {(icp.industries ?? []).length > 0 ? <p style={mutedStyle}>Industries: {(icp.industries ?? []).join(', ')}</p> : null}
                    {icp.companySize ? <p style={mutedStyle}>Company size: {String(icp.companySize)}</p> : null}
                  </div>
                  <button className="btn btn-secondary" onClick={() => startEditing(icp)}>Edit</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function VoiceProfileSection() {
  const [voice, setVoice] = useState<VoiceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [headline, setHeadline] = useState('');
  const [context, setContext] = useState('');
  const [tone, setTone] = useState('');
  const [writingStyle, setWritingStyle] = useState('');
  const [bannedWords, setBannedWords] = useState('');
  const [vocabulary, setVocabulary] = useState('');
  const [pillars, setPillars] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchVoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVoiceProfile();
      setVoice(data.voiceProfile);
      const v = data.voiceProfile;
      if (v) {
        setRole(String(v.role ?? ''));
        setHeadline(String(v.headline ?? ''));
        setContext(String(v.professionalContext ?? ''));
        setTone(String(v.tone ?? ''));
        setWritingStyle(String(v.writingStyle ?? ''));
        setBannedWords(joinList(v.bannedWords));
        setVocabulary(joinList(v.preferredVocabulary));
        setPillars(joinList(v.contentPillars));
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVoice();
  }, [fetchVoice]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const data = await updateVoiceProfile({
        role: role.trim() || undefined,
        headline: headline.trim() || undefined,
        professionalContext: context.trim() || undefined,
        tone: tone.trim() || undefined,
        writingStyle: writingStyle.trim() || undefined,
        bannedWords: splitList(bannedWords),
        preferredVocabulary: splitList(vocabulary),
        contentPillars: splitList(pillars),
      });
      setVoice(data.voiceProfile);
      setMessage('Voice saved.');
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Your voice</h3>
      {loading ? <p style={mutedStyle}>Loading voice...</p> : null}
      {!loading && error ? <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p> : null}
      {!loading && !error && !voice ? <p style={{ ...mutedStyle, marginBottom: '0.75rem' }}>No voice saved yet. Fill in the form to create one.</p> : null}
      {!loading && !error ? (
        <form onSubmit={(e) => void handleSave(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" style={fieldStyle} />
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline" style={fieldStyle} />
            <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Tone (e.g. direct, warm)" style={fieldStyle} />
            <input value={writingStyle} onChange={(e) => setWritingStyle(e.target.value)} placeholder="Writing style" style={fieldStyle} />
          </div>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Professional context" rows={2} style={fieldStyle} />
          <input value={bannedWords} onChange={(e) => setBannedWords(e.target.value)} placeholder="Words to avoid (comma-separated)" style={fieldStyle} />
          <input value={vocabulary} onChange={(e) => setVocabulary(e.target.value)} placeholder="Preferred words (comma-separated)" style={fieldStyle} />
          <input value={pillars} onChange={(e) => setPillars(e.target.value)} placeholder="Content pillars (comma-separated)" style={fieldStyle} />
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Saving...' : 'Save voice'}
          </button>
          {message ? <p style={mutedStyle}>{message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function ReceiptsSection() {
  const [receipts, setReceipts] = useState<VoiceReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fact, setFact] = useState('');
  const [context, setContext] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReceipts();
      setReceipts(data.receipts ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReceipts();
  }, [fetchReceipts]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!fact.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await createReceipt(fact.trim(), context.trim() || undefined);
      setFact('');
      setContext('');
      setMessage('Proof point added.');
      await fetchReceipts();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setMessage(null);
    try {
      await deleteReceipt(id);
      setMessage('Proof point removed.');
      await fetchReceipts();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Proof points</h3>
      <p style={{ ...mutedStyle, marginBottom: '0.75rem' }}>Facts and results your content can reference.</p>
      <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input value={fact} onChange={(e) => setFact(e.target.value)} placeholder="Fact or result *" required style={{ ...fieldStyle, flex: '2 1 200px' }} />
        <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Context (optional)" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        <button type="submit" className="btn btn-primary" disabled={saving || !fact.trim()}>
          {saving ? 'Adding...' : 'Add'}
        </button>
      </form>
      {message ? <p style={{ ...mutedStyle, marginBottom: '0.5rem' }}>{message}</p> : null}
      {loading ? <p style={mutedStyle}>Loading proof points...</p> : null}
      {!loading && error ? <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p> : null}
      {!loading && !error && receipts.length === 0 ? <p style={mutedStyle}>No proof points yet.</p> : null}
      {!loading && !error && receipts.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {receipts.map((receipt) => (
            <li key={String(receipt.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{String(receipt.fact ?? receipt.id)}</p>
                  {receipt.context ? <p style={mutedStyle}>{String(receipt.context)}</p> : null}
                </div>
                <button className="btn btn-ghost" onClick={() => void handleDelete(String(receipt.id))}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SamplesSection() {
  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchSamples = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSamples();
      setSamples(data.samples ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSamples();
  }, [fetchSamples]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await createSample(title.trim(), content.trim());
      setTitle('');
      setContent('');
      setMessage('Sample added.');
      await fetchSamples();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setMessage(null);
    try {
      await deleteSample(id);
      setMessage('Sample removed.');
      await fetchSamples();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Writing samples</h3>
      <p style={{ ...mutedStyle, marginBottom: '0.75rem' }}>Examples that show your style.</p>
      <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" style={fieldStyle} />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste a writing sample *" required rows={3} style={fieldStyle} />
        <button type="submit" className="btn btn-primary" disabled={saving || !content.trim()} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Adding...' : 'Add sample'}
        </button>
      </form>
      {message ? <p style={{ ...mutedStyle, marginBottom: '0.5rem' }}>{message}</p> : null}
      {loading ? <p style={mutedStyle}>Loading samples...</p> : null}
      {!loading && error ? <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p> : null}
      {!loading && !error && samples.length === 0 ? <p style={mutedStyle}>No samples yet.</p> : null}
      {!loading && !error && samples.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {samples.map((sample) => (
            <li key={String(sample.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  {sample.title ? <p style={{ fontWeight: 600 }}>{String(sample.title)}</p> : null}
                  <p style={{ whiteSpace: 'pre-wrap' }}>{String(sample.content ?? '').slice(0, 300)}</p>
                </div>
                <button className="btn btn-ghost" onClick={() => void handleDelete(String(sample.id))}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function IntegrationsSection() {
  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Connected platforms & research sources</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        All connectors live in one place: Brain &rarr; Sources &amp; Connections.
        Connect accounts, configure Reddit and Google Trends, and review health there � per workspace, with honest states.
      </p>
      <a href="/brain" className="btn btn-primary">Open connector center</a>
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

const mutedStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  fontSize: '0.875rem',
};

