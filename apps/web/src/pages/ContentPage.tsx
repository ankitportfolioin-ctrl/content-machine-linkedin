import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  ApiRequestError,
  addDraftBindings,
  approvePlan,
  composeDraft,
  createContentIdea,
  createDraftRevision,
  createOutcome,
  createPlan,
  createPublishRecord,
  decideReview,
  deleteVersion,
  detailedErrorMessage,
  finalizeVersion,
  friendlyErrorMessage,
  generatePlan,
  getContentIdea,
  getDraft,
  getDraftGates,
  getDraftPreview,
  getVersion,
  isAiUnavailable,
  listContentIdeas,
  listDraftBindings,
  listOutcomes,
  listPlans,
  listPublishRecords,
  listReviews,
  listVersions,
  submitReview,
  updateDraftBody,
  validateDraft,
  validatePlan,
} from '../services/api';
import {
  ContentDraft,
  ContentIdea,
  ContentPlan,
  ContentReview,
  ContentVersion,
  DraftValidationResponse,
  EvidenceBinding,
  OutcomeMetric,
  PublishRecord,
  QualityGate,
} from '../types';

export function ContentPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  // Deep link (?idea=…) so an opportunity detail can open the exact idea it
  // created — the round trip Research → Content never loses context.
  const [params, setParams] = useSearchParams();
  const ideaParam = params.get('idea');
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedIdeaId(ideaParam && ideaParam.trim() ? ideaParam : null);
  }, [ideaParam]);

  function openIdea(id: string) {
    setParams({ idea: id });
  }

  function closeIdea() {
    setParams({});
  }

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
          <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Write a post</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Sign in to create ideas, build content plans, and review drafts.
          </p>
        </div>
        <LoginForm />
      </div>
    );
  }

  if (selectedIdeaId) {
    return <IdeaWorkspace ideaId={selectedIdeaId} onBack={closeIdea} />;
  }

  return <IdeasList onSelect={openIdea} />;
}

function IdeasList({ onSelect }: { onSelect: (id: string) => void }) {
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fetchIdeas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listContentIdeas();
      setIdeas(data.contentIdeas ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchIdeas();
  }, [fetchIdeas]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    setFormMessage(null);
    try {
      const result = await createContentIdea({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle('');
      setDescription('');
      setFormMessage(`Created “${result.contentIdea.title}”.`);
      await fetchIdeas();
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 className="health-card-title">Write a post</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Ideas, content plans, drafts, reviews, and finalized versions.
          </p>
        </div>
        <WorkspaceSelector />
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>New idea</h3>
        <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Idea title (e.g. Lessons from shipping weekly)"
            style={fieldStyle}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            style={fieldStyle}
          />
          <button type="submit" className="btn btn-primary" disabled={creating || !title.trim()} style={{ alignSelf: 'flex-start' }}>
            {creating ? 'Creating...' : 'Create idea'}
          </button>
        </form>
        {formMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{formMessage}</p>
        ) : null}
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Tip: ideas converted from Research → Opportunities also appear in the list below.
          Drafts follow your saved voice in <Link to="/settings">Settings</Link>.
        </p>
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Loading ideas...</h2>
            <p className="empty-state-description">Please wait while we fetch your ideas</p>
          </div>
        </div>
      ) : null}
      {!loading && error ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Something went wrong</h2>
            <p className="empty-state-description">{error}</p>
            <button className="btn btn-secondary" onClick={() => void fetchIdeas()} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {!loading && !error && ideas.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">No ideas yet</h2>
            <p className="empty-state-description">Create your first idea above or convert an opportunity from Research.</p>
          </div>
        </div>
      ) : null}
      {!loading && !error && ideas.length > 0 ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>Ideas ({ideas.length})</h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
            {ideas.map((idea) => (
              <li key={String(idea.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{idea.title}</p>
                    {idea.description ? (
                      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{String(idea.description)}</p>
                    ) : null}
                    {idea.status ? <span className="badge badge-neutral">{String(idea.status)}</span> : null}
                  </div>
                  <button className="btn btn-secondary" onClick={() => onSelect(String(idea.id))}>
                    Open
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

function IdeaWorkspace({ ideaId, onBack }: { ideaId: string; onBack: () => void }) {
  const [idea, setIdea] = useState<ContentIdea | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansAiUnavailable, setPlansAiUnavailable] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  // Generate-plan form
  const [genObjective, setGenObjective] = useState('');
  const [genAngle, setGenAngle] = useState('');
  const [genFormat, setGenFormat] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);

  // Manual create-plan form. Objective/angle/format/structure are strict
  // server enums: constrained selects keep human input valid; the API error
  // details are surfaced verbatim if the contract ever drifts.
  const [thesis, setThesis] = useState('');
  const [audience, setAudience] = useState('');
  const [objective, setObjective] = useState('build_authority');
  const [angle, setAngle] = useState('practical');
  const [format, setFormat] = useState('checklist');
  const [structure, setStructure] = useState('problem_why_solution');
  const [keyPoints, setKeyPoints] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const fetchIdea = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getContentIdea(ideaId);
      setIdea(data.contentIdea);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [ideaId]);

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    setPlansAiUnavailable(false);
    try {
      const data = await listPlans(ideaId);
      setPlans(data.plans ?? []);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setPlansAiUnavailable(true);
      } else {
        setPlansError(friendlyErrorMessage(err));
      }
    } finally {
      setPlansLoading(false);
    }
  }, [ideaId]);

  useEffect(() => {
    void fetchIdea();
    void fetchPlans();
  }, [fetchIdea, fetchPlans]);

  async function handleGenerate() {
    setGenerating(true);
    setGenMessage(null);
    try {
      const result = await generatePlan({
        contentIdeaId: ideaId,
        objective: genObjective.trim() || undefined,
        angle: genAngle.trim() || undefined,
        format: genFormat.trim() || undefined,
      });
      setGenMessage(`Generated a content plan (${result.plan.id.slice(0, 8)}…).`);
      await fetchPlans();
    } catch (err) {
      if (isAiUnavailable(err)) {
        setGenMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setGenMessage(friendlyErrorMessage(err));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreatePlan(event: React.FormEvent) {
    event.preventDefault();
    const points = keyPoints.split('\n').map((s) => s.trim()).filter(Boolean);
    if (points.length === 0) {
      setCreateMessage('Add at least one key point (one per line).');
      return;
    }
    setCreating(true);
    setCreateMessage(null);
    try {
      await createPlan({
        thesis: thesis.trim(),
        audience: audience.trim(),
        objective: objective.trim(),
        angle: angle.trim(),
        format: format.trim(),
        narrativeStructure: structure.trim(),
        keyPoints: points,
        contentIdeaId: ideaId,
      });
      setThesis('');
      setAudience('');
      setObjective('build_authority');
      setAngle('practical');
      setFormat('checklist');
      setStructure('problem_why_solution');
      setKeyPoints('');
      setCreateMessage('Content plan created.');
      await fetchPlans();
    } catch (err) {
      setCreateMessage(detailedErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Loading idea...</h2>
          <p className="empty-state-description">Please wait while we fetch the idea</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>← Back to ideas</button>
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Something went wrong</h2>
            <p className="empty-state-description">{error}</p>
            <button className="btn btn-secondary" onClick={() => void fetchIdea()} style={{ marginTop: '1rem' }}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>← Back to ideas</button>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 className="health-card-title">{idea?.title ?? 'Idea'}</h2>
          {idea?.description ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{String(idea.description)}</p>
          ) : null}
          {typeof idea?.opportunityId === 'string' && idea.opportunityId ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Created from an opportunity —{' '}
              <Link to={`/opportunities?selected=${encodeURIComponent(idea.opportunityId)}`}>
                view the evidence
              </Link>.
            </p>
          ) : null}
        </div>
        <WorkspaceSelector />
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Generate a content plan</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          Let AI draft a plan from this idea. All fields are optional.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input value={genObjective} onChange={(e) => setGenObjective(e.target.value)} placeholder="Objective" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={genAngle} onChange={(e) => setGenAngle(e.target.value)} placeholder="Angle" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <input value={genFormat} onChange={(e) => setGenFormat(e.target.value)} placeholder="Format" style={{ ...fieldStyle, flex: '1 1 160px' }} />
          <button className="btn btn-primary" disabled={generating} onClick={() => void handleGenerate()}>
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>
        {genMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{genMessage}</p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Create a content plan manually</h3>
        <form onSubmit={(e) => void handleCreatePlan(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
            <input value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Thesis *" required style={fieldStyle} />
            <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audience *" required style={fieldStyle} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Objective *
              <select value={objective} onChange={(e) => setObjective(e.target.value)} required style={fieldStyle} aria-label="Objective">
                {OBJECTIVE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Angle *
              <select value={angle} onChange={(e) => setAngle(e.target.value)} required style={fieldStyle} aria-label="Angle">
                {ANGLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Format *
              <select value={format} onChange={(e) => setFormat(e.target.value)} required style={fieldStyle} aria-label="Format">
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              Narrative structure *
              <select value={structure} onChange={(e) => setStructure(e.target.value)} required style={fieldStyle} aria-label="Narrative structure">
                {STRUCTURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <textarea value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} placeholder="Key points (one per line, at least one required)" rows={3} style={fieldStyle} />
          <button type="submit" className="btn btn-secondary" disabled={creating} style={{ alignSelf: 'flex-start' }}>
            {creating ? 'Creating...' : 'Create plan'}
          </button>
        </form>
        {createMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{createMessage}</p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>Content plans</h3>
        {plansLoading ? <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading content plans...</p> : null}
        {!plansLoading && plansAiUnavailable ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            AI assistance is temporarily unavailable. Saved plans will appear here when available.
          </p>
        ) : null}
        {!plansLoading && plansError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{plansError}</p>
            <button className="btn btn-secondary" onClick={() => void fetchPlans()}>Retry</button>
          </div>
        ) : null}
        {!plansLoading && !plansError && !plansAiUnavailable && plans.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            No content plans yet. Generate one or create one manually above.
          </p>
        ) : null}
        {!plansLoading && !plansError && plans.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
            {plans.map((plan) => (
              <PlanRow
                key={String(plan.id)}
                plan={plan}
                selected={selectedPlanId === String(plan.id)}
                onSelect={() => {
                  setSelectedPlanId(String(plan.id));
                  setSelectedDraftId(null);
                }}
                onChanged={() => void fetchPlans()}
                onComposed={(draftId) => setSelectedDraftId(draftId)}
              />
            ))}
          </ul>
        ) : null}
      </div>

      {selectedPlanId ? (
        <DraftComposer
          planId={selectedPlanId}
          selectedDraftId={selectedDraftId}
          onDraftSelected={(id) => setSelectedDraftId(id)}
        />
      ) : null}

      {selectedDraftId ? <DraftWorkspace draftId={selectedDraftId} /> : null}
    </div>
  );
}

function PlanRow({
  plan,
  selected,
  onSelect,
  onChanged,
  onComposed,
}: {
  plan: ContentPlan;
  selected: boolean;
  onSelect: () => void;
  onChanged: () => void;
  onComposed: (draftId: string) => void;
}) {
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [composing, setComposing] = useState(false);

  async function handleApprove() {
    setWorking(true);
    setActionMessage(null);
    try {
      await approvePlan(String(plan.id));
      setActionMessage('Content plan approved. You can now compose a draft.');
      onChanged();
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function handleValidate() {
    setWorking(true);
    setActionMessage(null);
    try {
      const result = await validatePlan(String(plan.id));
      const reasons = result.validation.reasons ?? [];
      setActionMessage(
        result.validation.ok
          ? 'This plan passes validation.'
          : `Needs review: ${reasons.length > 0 ? reasons.join('; ') : 'see details'}`,
      );
    } catch (err) {
      setActionMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function handleCompose() {
    setComposing(true);
    setActionMessage(null);
    try {
      const result = await composeDraft(String(plan.id));
      const draftId = result.draftId ?? result.contentDraft?.id;
      if (!draftId) {
        setActionMessage('Draft request succeeded but no draft was returned.');
      } else {
        setActionMessage('Draft composed.');
        onComposed(String(draftId));
      }
    } catch (err) {
      if (isAiUnavailable(err)) {
        setActionMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setActionMessage(friendlyErrorMessage(err));
      }
    } finally {
      setComposing(false);
    }
  }

  const status = String(plan.status ?? 'draft').toLowerCase();
  const statusBadge =
    status.includes('approv') ? 'badge-success' : status.includes('review') || status.includes('pending') ? 'badge-warning' : 'badge-neutral';

  return (
    <li
      style={{
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius)',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <p style={{ fontWeight: 600 }}>{String(plan.thesis ?? plan.id)}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <span className={`badge ${statusBadge}`}>{String(plan.status ?? 'draft')}</span>
            {plan.format ? <span className="badge badge-neutral">{String(plan.format)}</span> : null}
          </div>
          {plan.audience ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
              Audience: {String(plan.audience)}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onSelect}>
            {selected ? 'Selected' : 'Select'}
          </button>
          <button className="btn btn-secondary" disabled={working} onClick={() => void handleValidate()}>
            Validate
          </button>
          <button className="btn btn-secondary" disabled={working} onClick={() => void handleApprove()}>
            Approve
          </button>
          <button className="btn btn-primary" disabled={composing} onClick={() => void handleCompose()}>
            {composing ? 'Composing...' : 'Compose draft'}
          </button>
        </div>
      </div>
      {actionMessage ? (
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{actionMessage}</p>
      ) : null}
    </li>
  );
}

function DraftComposer({
  planId,
  selectedDraftId,
  onDraftSelected,
}: {
  planId: string;
  selectedDraftId: string | null;
  onDraftSelected: (id: string) => void;
}) {
  const [draftIdInput, setDraftIdInput] = useState('');

  useEffect(() => {
    if (selectedDraftId) {
      setDraftIdInput(selectedDraftId);
    }
  }, [selectedDraftId]);

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Drafts</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Compose a draft from the selected approved plan, or open an existing draft by ID.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          value={draftIdInput}
          onChange={(e) => setDraftIdInput(e.target.value)}
          placeholder="Paste a draft ID to open it"
          style={{ ...fieldStyle, flex: '1 1 220px' }}
        />
        <button
          className="btn btn-secondary"
          disabled={!draftIdInput.trim()}
          onClick={() => onDraftSelected(draftIdInput.trim())}
        >
          Open draft
        </button>
      </div>
      {selectedDraftId ? (
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Viewing draft {selectedDraftId} composed from plan {planId.slice(0, 8)}…
        </p>
      ) : (
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          No draft selected yet. Use “Compose draft” on an approved plan above.
        </p>
      )}
    </div>
  );
}

function DraftWorkspace({ draftId }: { draftId: string }) {
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDraft(draftId);
      setDraft(data.contentDraft);
      setEditedBody(String(data.contentDraft.body ?? ''));
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchDraft();
  }, [fetchDraft]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      await updateDraftBody(draftId, editedBody);
      setSaveMessage('Draft saved.');
      await fetchDraft();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setSaveMessage('This draft version is locked and cannot be edited. Create a new revision instead.');
      } else {
        setSaveMessage(friendlyErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Loading draft...</h2>
          <p className="empty-state-description">Please wait while we fetch the draft</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Something went wrong</h2>
          <p className="empty-state-description">{error}</p>
          <button className="btn btn-secondary" onClick={() => void fetchDraft()} style={{ marginTop: '1rem' }}>Retry</button>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">Draft not found</h2>
          <p className="empty-state-description">This draft may have been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h3 className="health-card-title">Draft</h3>
          {draft.status ? <span className="badge badge-neutral">{String(draft.status)}</span> : null}
        </div>
        <textarea value={editedBody} onChange={(e) => setEditedBody(e.target.value)} rows={8} style={fieldStyle} />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          <RevisionButton draftId={draftId} onRevised={() => void fetchDraft()} />
        </div>
        {saveMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{saveMessage}</p>
        ) : null}
      </div>

      <DraftValidationSection draftId={draftId} />
      <EvidenceSection draftId={draftId} />
      <QualityChecksSection draftId={draftId} />
      <PreviewSection draftId={draftId} />
      <ReviewsSection draftId={draftId} />
      <VersionsSection draftId={draftId} />
    </div>
  );
}

function RevisionButton({ draftId, onRevised }: { draftId: string; onRevised: () => void }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setWorking(true);
    setMessage(null);
    try {
      await createDraftRevision(draftId);
      setMessage('New revision created.');
      onRevised();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <button className="btn btn-secondary" disabled={working} onClick={() => void handleClick()}>
        {working ? 'Creating...' : 'Create new revision'}
      </button>
      {message ? <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</span> : null}
    </span>
  );
}

function DraftValidationSection({ draftId }: { draftId: string }) {
  const [result, setResult] = useState<DraftValidationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  async function handleValidate() {
    setLoading(true);
    setError(null);
    setBlocked(null);
    try {
      const data = await validateDraft(draftId);
      setResult(data);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 422) {
        setBlocked(`This draft is blocked by quality checks: ${err.message}`);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  const results = result?.validation?.results ?? result?.results ?? [];
  const finalStatus = result?.validation?.finalStatus ?? result?.finalStatus;
  const overallScore = result?.validation?.overallScore ?? result?.overallScore;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h3 className="health-card-title">Draft validation</h3>
        <button className="btn btn-secondary" disabled={loading} onClick={() => void handleValidate()}>
          {loading ? 'Validating...' : 'Validate draft'}
        </button>
      </div>
      {error ? <p style={{ color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</p> : null}
      {blocked ? <p style={{ color: 'var(--color-warning)', fontSize: '0.875rem' }}>{blocked}</p> : null}
      {!result && !error && !blocked ? (
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Not validated yet.</p>
      ) : null}
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {finalStatus ? <span className="badge badge-neutral">Status: {String(finalStatus)}</span> : null}
          {typeof overallScore !== 'undefined' ? (
            <p style={{ fontSize: '0.875rem' }}>Overall score: {String(overallScore)}</p>
          ) : null}
          {results.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No detailed results returned.</p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
              {results.map((r, index) => (
                <li key={index} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
                  <p style={{ fontWeight: 600 }}>{String(r.name ?? r.check ?? `Check ${index + 1}`)}</p>
                  <p style={{ color: 'var(--color-text-secondary)' }}>
                    {String(r.status ?? (r.passed ? 'passed' : 'needs review'))}
                    {typeof r.score !== 'undefined' ? ` · Score: ${String(r.score)}` : ''}
                  </p>
                  {r.message ? <p style={{ fontSize: '0.875rem' }}>{String(r.message)}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function EvidenceSection({ draftId }: { draftId: string }) {
  const [bindings, setBindings] = useState<EvidenceBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [span, setSpan] = useState('');
  const [claimId, setClaimId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fetchBindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDraftBindings(draftId);
      setBindings(data.bindings ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchBindings();
  }, [fetchBindings]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!span.trim()) return;
    setSaving(true);
    setFormMessage(null);
    try {
      await addDraftBindings(draftId, [
        { span: span.trim(), sourceClaimId: claimId.trim() || undefined },
      ]);
      setSpan('');
      setClaimId('');
      setFormMessage('Evidence added.');
      await fetchBindings();
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Evidence</h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Link draft passages to supporting sources.
      </p>
      <form onSubmit={(e) => void handleAdd(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input value={span} onChange={(e) => setSpan(e.target.value)} placeholder="Text passage *" required style={{ ...fieldStyle, flex: '2 1 200px' }} />
        <input value={claimId} onChange={(e) => setClaimId(e.target.value)} placeholder="Source claim ID (optional)" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        <button type="submit" className="btn btn-secondary" disabled={saving || !span.trim()}>
          {saving ? 'Adding...' : 'Add evidence'}
        </button>
      </form>
      {formMessage ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{formMessage}</p>
      ) : null}
      {loading ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading evidence...</p> : null}
      {!loading && error ? <p style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p> : null}
      {!loading && !error && bindings.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No evidence linked yet.</p>
      ) : null}
      {!loading && !error && bindings.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {bindings.map((b, index) => (
            <li key={String(b.id ?? index)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
              <p style={{ fontWeight: 600 }}>{String(b.span ?? `Evidence ${index + 1}`)}</p>
              {b.sourceClaimId ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>Claim: {String(b.sourceClaimId)}</p>
              ) : null}
              {typeof b.confidence !== 'undefined' ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>Confidence: {String(b.confidence)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function QualityChecksSection({ draftId }: { draftId: string }) {
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDraftGates(draftId);
      setGates(data.gates ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchGates();
  }, [fetchGates]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h3 className="health-card-title">Quality checks</h3>
        <button className="btn btn-secondary" onClick={() => void fetchGates()}>Refresh</button>
      </div>
      {loading ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading quality checks...</p> : null}
      {!loading && error ? <p style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p> : null}
      {!loading && !error && gates.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No quality checks yet.</p>
      ) : null}
      {!loading && !error && gates.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {gates.map((gate, index) => (
            <li key={String(gate.id ?? index)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
              <p style={{ fontWeight: 600 }}>{String(gate.name ?? `Check ${index + 1}`)}</p>
              <p style={{ color: 'var(--color-text-secondary)' }}>
                {String(gate.status ?? 'unknown')}
                {typeof gate.score !== 'undefined' ? ` · Score: ${String(gate.score)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PreviewSection({ draftId }: { draftId: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [markup, setMarkup] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDraftPreview(draftId);
      setPreview(String(data.preview ?? data.body ?? ''));
      setMarkup(Array.isArray(data.internalMarkupFound) ? data.internalMarkupFound.map(String) : []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchPreview();
  }, [fetchPreview]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h3 className="health-card-title">Preview</h3>
        <button className="btn btn-secondary" onClick={() => void fetchPreview()}>Refresh</button>
      </div>
      {loading ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading preview...</p> : null}
      {!loading && error ? <p style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p> : null}
      {!loading && !error && !preview ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No preview available yet.</p>
      ) : null}
      {!loading && !error && preview ? (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
          {preview}
        </div>
      ) : null}
      {markup.length > 0 ? (
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-warning)' }}>
          Internal markup found: {markup.join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function ReviewsSection({ draftId }: { draftId: string }) {
  const [reviews, setReviews] = useState<ContentReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReviews(draftId);
      setReviews(data.reviews ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  async function handleSubmit() {
    setSubmitting(true);
    setFormMessage(null);
    try {
      await submitReview(draftId, note.trim() || undefined);
      setNote('');
      setFormMessage('Sent for review.');
      await fetchReviews();
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Reviews</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for reviewer" style={{ ...fieldStyle, flex: '1 1 220px' }} />
        <button className="btn btn-secondary" disabled={submitting} onClick={() => void handleSubmit()}>
          {submitting ? 'Sending...' : 'Submit for review'}
        </button>
      </div>
      {formMessage ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{formMessage}</p>
      ) : null}
      {loading ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading reviews...</p> : null}
      {!loading && error ? <p style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p> : null}
      {!loading && !error && reviews.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No reviews yet.</p>
      ) : null}
      {!loading && !error && reviews.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {reviews.map((review) => (
            <ReviewRow key={String(review.id)} review={review} onChanged={() => void fetchReviews()} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReviewRow({ review, onChanged }: { review: ContentReview; onChanged: () => void }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDecision(action: 'approve' | 'reject' | 'request_changes') {
    setWorking(true);
    setMessage(null);
    try {
      await decideReview(String(review.id), action);
      setMessage(`Review ${action.replace('_', ' ')}.`);
      onChanged();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <li style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontWeight: 600 }}>Review {String(review.id).slice(0, 8)}…</p>
          {review.status || review.decision ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {String(review.decision ?? review.status)}
            </p>
          ) : null}
          {review.note ? <p>{String(review.note)}</p> : null}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" disabled={working} onClick={() => void handleDecision('approve')}>Approve</button>
          <button className="btn btn-secondary" disabled={working} onClick={() => void handleDecision('request_changes')}>Request changes</button>
          <button className="btn btn-secondary" disabled={working} onClick={() => void handleDecision('reject')}>Reject</button>
        </div>
      </div>
      {message ? (
        <p style={{ marginTop: '0.25rem', color: 'var(--color-text-secondary)' }}>{message}</p>
      ) : null}
    </li>
  );
}

function VersionsSection({ draftId }: { draftId: string }) {
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ContentVersion | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVersions(draftId);
      setVersions(data.versions ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void fetchVersions();
  }, [fetchVersions]);

  async function handleFinalize() {
    setFinalizing(true);
    setFormMessage(null);
    try {
      await finalizeVersion(draftId, changeSummary.trim() || undefined);
      setChangeSummary('');
      setFormMessage('Final version created.');
      await fetchVersions();
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    } finally {
      setFinalizing(false);
    }
  }

  async function handleViewVersion(id: string) {
    setFormMessage(null);
    try {
      const data = await getVersion(id);
      setSelectedVersion(data.contentVersion);
    } catch (err) {
      setFormMessage(friendlyErrorMessage(err));
    }
  }

  async function handleDelete(id: string) {
    setFormMessage(null);
    try {
      await deleteVersion(id);
      setFormMessage('Version deleted.');
      await fetchVersions();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 403) {
        setFormMessage('Final versions cannot be deleted.');
      } else {
        setFormMessage(friendlyErrorMessage(err));
      }
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>Versions</h3>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          value={changeSummary}
          onChange={(e) => setChangeSummary(e.target.value)}
          placeholder="What changed? (optional)"
          style={{ ...fieldStyle, flex: '1 1 220px' }}
        />
        <button className="btn btn-primary" disabled={finalizing} onClick={() => void handleFinalize()}>
          {finalizing ? 'Finalizing...' : 'Finalize version'}
        </button>
      </div>
      {formMessage ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{formMessage}</p>
      ) : null}
      {loading ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading versions...</p> : null}
      {!loading && error ? <p style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p> : null}
      {!loading && !error && versions.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No versions yet.</p>
      ) : null}
      {!loading && !error && versions.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
          {versions.map((version) => (
            <li key={String(version.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>Version {String(version.id).slice(0, 8)}…</p>
                  {version.changeSummary ? <p style={{ color: 'var(--color-text-secondary)' }}>{String(version.changeSummary)}</p> : null}
                  {version.isFinal || version.final ? <span className="badge badge-success">Final</span> : null}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" onClick={() => void handleViewVersion(String(version.id))}>View</button>
                  <button className="btn btn-ghost" onClick={() => void handleDelete(String(version.id))}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {selectedVersion ? (
        <div style={{ marginTop: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Version detail</p>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
            {String(selectedVersion.body ?? 'No body saved for this version.')}
          </div>
          <VersionRecordingPanel version={selectedVersion} />
        </div>
      ) : null}
    </div>
  );
}

function VersionRecordingPanel({ version }: { version: ContentVersion }) {
  const versionId = String(version.id);
  const isFinal = Boolean(version.isFinal || version.final);
  const [publishRecords, setPublishRecords] = useState<PublishRecord[]>([]);
  const [outcomes, setOutcomes] = useState<OutcomeMetric[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [linksError, setLinksError] = useState<string | null>(null);

  const [channel, setChannel] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [recordingPublish, setRecordingPublish] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const [metricName, setMetricName] = useState('');
  const [metricValue, setMetricValue] = useState('');
  const [unit, setUnit] = useState('');
  const [source, setSource] = useState('');
  const [recordingOutcome, setRecordingOutcome] = useState(false);
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoadingLinks(true);
    setLinksError(null);
    try {
      const [publishData, outcomeData] = await Promise.all([
        listPublishRecords(),
        listOutcomes(),
      ]);
      setPublishRecords(
        (publishData.publishRecords ?? []).filter(
          (r) => String(r.contentVersionId ?? '') === versionId,
        ),
      );
      setOutcomes(
        (outcomeData.outcomeMetrics ?? []).filter(
          (m) => String(m.contentVersionId ?? '') === versionId,
        ),
      );
    } catch (err) {
      setLinksError(friendlyErrorMessage(err));
    } finally {
      setLoadingLinks(false);
    }
  }, [versionId]);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  async function handleRecordPublish(event: React.FormEvent) {
    event.preventDefault();
    if (!channel.trim()) {
      setPublishMessage('Channel is required.');
      return;
    }
    setRecordingPublish(true);
    setPublishMessage(null);
    try {
      const result = await createPublishRecord({
        contentVersionId: versionId,
        channel: channel.trim(),
        externalRef: externalRef.trim() || undefined,
      });
      setChannel('');
      setExternalRef('');
      setPublishMessage(
        `Publication recorded (user assertion, not verified).${result.notice ? ` ${result.notice}` : ''}`,
      );
      await fetchLinks();
    } catch (err) {
      setPublishMessage(friendlyErrorMessage(err));
    } finally {
      setRecordingPublish(false);
    }
  }

  async function handleRecordOutcome(event: React.FormEvent) {
    event.preventDefault();
    if (!metricName.trim() || !metricValue.trim() || !source.trim()) {
      setOutcomeMessage('Metric name, value, and source are required.');
      return;
    }
    const parsedValue = Number(metricValue.trim());
    if (!Number.isFinite(parsedValue)) {
      setOutcomeMessage('Metric value must be a number.');
      return;
    }
    setRecordingOutcome(true);
    setOutcomeMessage(null);
    try {
      const result = await createOutcome({
        contentVersionId: versionId,
        metricName: metricName.trim(),
        metricValue: parsedValue,
        unit: unit.trim() || undefined,
        source: source.trim(),
      });
      setMetricName('');
      setMetricValue('');
      setUnit('');
      setSource('');
      setOutcomeMessage(
        `Outcome recorded (user assertion, not verified).${result.notice ? ` ${result.notice}` : ''}`,
      );
      await fetchLinks();
    } catch (err) {
      setOutcomeMessage(friendlyErrorMessage(err));
    } finally {
      setRecordingOutcome(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
      {isFinal ? (
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Record publication</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            Recording only. External publication is not verified by the system.
          </p>
          <form onSubmit={(e) => void handleRecordPublish(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="Channel (e.g. linkedin)"
              style={{ ...fieldStyle, flex: '1 1 160px' }}
            />
            <input
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="External ref (optional)"
              style={{ ...fieldStyle, flex: '1 1 160px' }}
            />
            <button type="submit" className="btn btn-secondary" disabled={recordingPublish || !channel.trim()}>
              {recordingPublish ? 'Recording...' : 'Record publication'}
            </button>
          </form>
          {publishMessage ? (
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              {publishMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
        <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Record outcome</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          Values are stored as recorded, never estimated or inferred.
        </p>
        <form onSubmit={(e) => void handleRecordOutcome(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            placeholder="Metric name * (e.g. views)"
            style={{ ...fieldStyle, flex: '1 1 140px' }}
          />
          <input
            value={metricValue}
            onChange={(e) => setMetricValue(e.target.value)}
            placeholder="Value * (number)"
            inputMode="decimal"
            style={{ ...fieldStyle, flex: '1 1 120px' }}
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Unit (optional)"
            style={{ ...fieldStyle, flex: '1 1 110px' }}
          />
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Source * (e.g. manual)"
            style={{ ...fieldStyle, flex: '1 1 140px' }}
          />
          <button type="submit" className="btn btn-secondary" disabled={recordingOutcome}>
            {recordingOutcome ? 'Recording...' : 'Record outcome'}
          </button>
        </form>
        {outcomeMessage ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {outcomeMessage}
          </p>
        ) : null}
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
        <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          Recorded results ({publishRecords.length} publication(s), {outcomes.length} outcome(s))
        </p>
        {loadingLinks ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Loading recorded results...</p>
        ) : null}
        {!loadingLinks && linksError ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{linksError}</p>
        ) : null}
        {!loadingLinks && !linksError && publishRecords.length === 0 && outcomes.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No recorded results yet for this version.
          </p>
        ) : null}
        {!loadingLinks && !linksError && publishRecords.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, marginBottom: '0.5rem' }}>
            {publishRecords.map((record) => (
              <li key={String(record.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
                <p style={{ fontWeight: 600 }}>Publication recorded (user assertion, not verified)</p>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  Channel: {String(record.channel ?? 'unknown')}
                  {record.externalRef ? ` · Ref: ${String(record.externalRef)}` : ''}
                </p>
                {record.recordedAt ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                    Recorded at {String(record.recordedAt)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {!loadingLinks && !linksError && outcomes.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
            {outcomes.map((metric) => (
              <li key={String(metric.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem', fontSize: '0.875rem' }}>
                <p style={{ fontWeight: 600 }}>
                  {String(metric.metricName)}: {String(metric.metricValue)}
                  {metric.unit ? ` ${String(metric.unit)}` : ''}
                </p>
                <p style={{ color: 'var(--color-text-secondary)' }}>Source: {String(metric.source)}</p>
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

// Server-enforced enums for manual content plans (mirrors
// contentObjectiveSchema / contentAngleSchema / contentFormatSchema /
// contentNarrativeSchema). Labels are human-readable; values are exact.
const OBJECTIVE_OPTIONS = [
  { value: 'educate', label: 'Educate' },
  { value: 'explain', label: 'Explain' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'build_authority', label: 'Build authority' },
  { value: 'share_framework', label: 'Share framework' },
  { value: 'start_discussion', label: 'Start discussion' },
  { value: 'teach_practical', label: 'Teach practical' },
  { value: 'analyze', label: 'Analyze' },
  { value: 'reframe', label: 'Reframe' },
];

const ANGLE_OPTIONS = [
  { value: 'educational', label: 'Educational' },
  { value: 'contrarian', label: 'Contrarian' },
  { value: 'practical', label: 'Practical' },
  { value: 'framework', label: 'Framework' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'observation', label: 'Observation' },
  { value: 'breakdown', label: 'Breakdown' },
];

const FORMAT_OPTIONS = [
  { value: 'post', label: 'Post' },
  { value: 'text_post', label: 'Text post' },
  { value: 'article', label: 'Article' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'video', label: 'Video' },
  { value: 'poll', label: 'Poll' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'framework', label: 'Framework' },
  { value: 'contrarian', label: 'Contrarian' },
];

const STRUCTURE_OPTIONS = [
  { value: 'problem_why_solution', label: 'Problem → why → solution' },
  { value: 'observation_analysis_implication', label: 'Observation → analysis → implication' },
  { value: 'hook_context_framework_application_takeaway', label: 'Hook → context → framework → takeaway' },
  { value: 'mistake_consequence_better_approach', label: 'Mistake → consequence → better approach' },
  { value: 'thesis_evidence_tradeoff_conclusion', label: 'Thesis → evidence → tradeoff → conclusion' },
];
