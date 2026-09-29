import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  classifyConversation,
  createContentSignal,
  createSalesConversation,
  friendlyErrorMessage,
  isAiUnavailable,
  listClassifications,
  listCommentSalesSignals,
  listContentSignals,
  listFollowUps,
  listSalesConversations,
  listSalesMessages,
  recommendFollowUp,
  recordSalesMessage,
  reviewCommentSalesSignal,
} from '../services/api';
import {
  CommentSalesSignalItem,
  ContentSignalItem,
  ConversationClassification,
  FollowUpRecommendation,
  SalesConversation,
  SalesMessage,
} from '../types';

export function InboxPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
            Inbox
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Sign in to review conversations, record manual notes, and see suggested next steps.
          </p>
        </div>
        <LoginForm />
      </div>
    );
  }

  if (selectedId) {
    return <ConversationDetail conversationId={selectedId} onBack={() => setSelectedId(null)} />;
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
          <h2 className="health-card-title">Inbox</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Conversations, manual notes, and suggested next steps. Nothing is sent automatically.
          </p>
        </div>
        <WorkspaceSelector />
      </div>
      <ConversationsList onSelect={setSelectedId} />
      <ContentSignalsPanel />
      <CommentSalesSignalsPanel />
    </div>
  );
}

// Batch 2 (F): sales intelligence signals originating from comments. A
// LEAD_SIGNAL comment is not a confirmed lead: signals wait for human
// review here, and reviewing never creates a prospect automatically.
function CommentSalesSignalsPanel() {
  const [signals, setSignals] = useState<CommentSalesSignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCommentSalesSignals();
      setSignals(data.signals ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleReview(id: string, decision: 'REVIEWED' | 'DISMISSED') {
    setWorkingId(id);
    try {
      await reviewCommentSalesSignal(id, decision);
      await fetchData();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setWorkingId(null);
    }
  }

  const pending = signals.filter((s) => String(s.status) === 'PENDING_REVIEW');

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Comment sales signals ({pending.length} pending review)
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Buying-intent signals extracted from comment classifications. A signal is not a lead — review first, then create a prospect explicitly if warranted.
      </p>
      {loading ? <LoadingText label="Loading comment signals..." /> : null}
      {!loading && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !error && signals.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No comment sales signals yet.</p>
      ) : null}
      {signals.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
          {signals.slice(0, 20).map((s) => (
            <li key={String(s.id)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                {String(s.signalType)} · {String(s.status).replace(/_/g, ' ')}
              </p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{String(s.reason)}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>From comment {String(s.commentId).slice(0, 8)}…</p>
              {String(s.status) === 'PENDING_REVIEW' ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button className="btn btn-secondary" disabled={workingId === String(s.id)} onClick={() => void handleReview(String(s.id), 'REVIEWED')}>
                    Mark reviewed
                  </button>
                  <button className="btn btn-secondary" disabled={workingId === String(s.id)} onClick={() => void handleReview(String(s.id), 'DISMISSED')}>
                    Dismiss
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LoadingText({ label }: { label: string }) {
  return <p style={{ fontSize: '0.875rem' }}>{label}</p>;
}

function ConversationsList({ onSelect }: { onSelect: (id: string) => void }) {
  const [conversations, setConversations] = useState<SalesConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSalesConversations();
      setConversations(data.conversations ?? []);
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
    if (!leadId.trim()) {
      setMessage('Lead ID is required to start a conversation record.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await createSalesConversation({
        leadId: leadId.trim(),
        subject: subject.trim() || undefined,
      });
      setConversations((prev) => [result.conversation, ...prev]);
      setLeadId('');
      setSubject('');
      setMessage('Conversation record created.');
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Start a conversation record
        </h3>
        <form
          onSubmit={(e) => void handleCreate(e)}
          style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
        >
          <input
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="Lead ID"
            style={{ ...fieldStyle, flex: '1 1 180px' }}
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Topic (optional)"
            style={{ ...fieldStyle, flex: '2 1 220px' }}
          />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create record'}
          </button>
        </form>
        {message ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {message}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '1rem' }}>
          Conversations
        </h3>
        {loading ? <LoadingText label="Loading conversations..." /> : null}
        {!loading && error ? (
          <div>
            <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
            <button className="btn btn-secondary" onClick={() => void fetchData()} style={{ marginTop: '0.5rem' }}>
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !error && conversations.length === 0 ? (
          <div className="empty-state">
            <h2 className="empty-state-title">No conversations yet</h2>
            <p className="empty-state-description">
              Create a conversation record above when you start talking with a lead.
            </p>
          </div>
        ) : null}
        {conversations.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyle: 'none', padding: 0 }}>
            {conversations.map((c) => (
              <li
                key={String(c.id)}
                style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{String(c.subject ?? c.id)}</p>
                    {c.leadId ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Lead: {String(c.leadId)}</p>
                    ) : null}
                    {c.status ? <span className="badge badge-neutral">{String(c.status)}</span> : null}
                  </div>
                  <button className="btn btn-secondary" onClick={() => onSelect(String(c.id))}>
                    Open conversation
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function ConversationDetail({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<SalesMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [direction, setDirection] = useState('outbound');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [classifications, setClassifications] = useState<ConversationClassification[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpRecommendation[]>([]);
  const [recommending, setRecommending] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSalesMessages(conversationId);
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const fetchIntel = useCallback(async () => {
    try {
      const data = await listClassifications(conversationId);
      setClassifications(data.classifications ?? []);
    } catch {
      setClassifications([]);
    }
    try {
      const all = await listFollowUps();
      setFollowUps(all.followUps.filter((f) => String(f.conversationId ?? '') === conversationId));
    } catch {
      setFollowUps([]);
    }
  }, [conversationId]);

  useEffect(() => {
    void fetchMessages();
    void fetchIntel();
  }, [fetchMessages, fetchIntel]);

  async function handleRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) {
      setMessage('Write the note text first.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await recordSalesMessage({
        conversationId,
        body: body.trim(),
        direction: direction.trim() || 'outbound',
      });
      setMessages((prev) => [...prev, result.message]);
      setBody('');
      setMessage('Manual record saved. This does not send anything.');
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleClassify() {
    setClassifying(true);
    setMessage(null);
    try {
      const result = await classifyConversation(conversationId);
      setClassifications((prev) => [result.classification, ...prev]);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setClassifying(false);
    }
  }

  async function handleRecommend() {
    setRecommending(true);
    setMessage(null);
    try {
      const result = await recommendFollowUp({ conversationId });
      setFollowUps((prev) => [result.followUp, ...prev]);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setMessage('AI assistance is temporarily unavailable. Please try again later.');
      } else {
        setMessage(friendlyErrorMessage(err));
      }
    } finally {
      setRecommending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}>
        ← Back to conversations
      </button>
      <div
        className="card"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
      >
        <div>
          <h2 className="health-card-title">Conversation</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Notes here are manual records only. Nothing is sent automatically.
          </p>
        </div>
        <WorkspaceSelector />
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Notes
        </h3>
        {loading ? <LoadingText label="Loading notes..." /> : null}
        {!loading && error ? (
          <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
        ) : null}
        {!loading && !error && messages.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No notes yet. Record what was said below.
          </p>
        ) : null}
        {messages.length > 0 ? (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, marginBottom: '0.75rem' }}>
            {messages.map((m, i) => (
              <li key={String(m.id ?? i)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {String(m.direction ?? 'note')}
                  {m.createdAt ? ` · ${String(m.createdAt)}` : ''}
                </p>
                <p style={{ fontSize: '0.875rem' }}>{String(m.body ?? m.content ?? '')}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={(e) => void handleRecord(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Record what was said or agreed (manual note)"
            rows={3}
            style={fieldStyle}
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ ...fieldStyle, width: 'auto' }}>
              <option value="outbound">Note about our message</option>
              <option value="inbound">Note about their message</option>
            </select>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save as manual record'}
            </button>
          </div>
        </form>
        {message ? (
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {message}
          </p>
        ) : null}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          What kind of conversation is this?
        </h3>
        <button className="btn btn-secondary" disabled={classifying} onClick={() => void handleClassify()} style={{ marginBottom: '0.5rem' }}>
          {classifying ? 'Reviewing...' : 'Review conversation'}
        </button>
        {classifications.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No review yet. Reviewing suggests a category and confidence level.
          </p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
            {classifications.map((c, i) => (
              <li key={String(c.id ?? i)} style={{ fontSize: '0.875rem' }}>
                <span className="badge badge-neutral">
                  {String(c.label ?? c.category ?? 'reviewed')}
                </span>{' '}
                {typeof c.confidence !== 'undefined' ? `Confidence: ${String(c.confidence)} ` : ''}
                {c.reasoning ? `— ${String(c.reasoning)}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Next step
        </h3>
        <button className="btn btn-secondary" disabled={recommending} onClick={() => void handleRecommend()} style={{ marginBottom: '0.5rem' }}>
          {recommending ? 'Thinking...' : 'Suggest next step'}
        </button>
        {followUps.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            No suggested next step yet.
          </p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
            {followUps.map((f, i) => (
              <li key={String(f.id ?? i)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {String(f.recommendation ?? f.suggestedMessage ?? 'Follow up')}
                </p>
                {f.suggestedMessage && f.recommendation ? (
                  <p style={{ fontSize: '0.875rem' }}>{String(f.suggestedMessage)}</p>
                ) : null}
                {f.reason ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{String(f.reason)}</p>
                ) : null}
                {f.timing ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Timing: {String(f.timing)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ContentSignalsPanel() {
  const [signals, setSignals] = useState<ContentSignalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signalType, setSignalType] = useState('');
  const [conversationIds, setConversationIds] = useState('');
  const [evidence, setEvidence] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listContentSignals();
      setSignals(data.signals ?? []);
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
    if (!signalType.trim() || !conversationIds.trim() || !evidence.trim()) {
      setMessage('Signal type, conversation IDs, and evidence notes are required.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await createContentSignal({
        signalType: signalType.trim(),
        sourceConversationIds: conversationIds.split(',').map((s) => s.trim()).filter(Boolean),
        evidence: evidence.trim(),
      });
      setSignals((prev) => [result.signal, ...prev]);
      setSignalType('');
      setConversationIds('');
      setEvidence('');
      setMessage('Topic pattern saved.');
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
        Topic patterns from conversations
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
        Save themes you notice across conversations so content planning can use them later.
      </p>
      <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input value={signalType} onChange={(e) => setSignalType(e.target.value)} placeholder="Pattern type" style={{ ...fieldStyle, flex: '1 1 160px' }} />
        <input value={conversationIds} onChange={(e) => setConversationIds(e.target.value)} placeholder="Conversation IDs (comma separated)" style={{ ...fieldStyle, flex: '1 1 200px' }} />
        <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence notes" style={{ ...fieldStyle, flex: '2 1 220px' }} />
        <button type="submit" className="btn btn-secondary" disabled={saving}>
          {saving ? 'Saving...' : 'Save pattern'}
        </button>
      </form>
      {message ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{message}</p> : null}
      {loading ? <LoadingText label="Loading topic patterns..." /> : null}
      {!loading && error ? (
        <p role="alert" style={{ fontSize: '0.875rem', color: 'var(--color-error)' }}>{error}</p>
      ) : null}
      {!loading && !error && signals.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>No topic patterns saved yet.</p>
      ) : null}
      {signals.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
          {signals.map((s, i) => (
            <li key={String(s.id ?? i)} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.75rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{String(s.signalType ?? 'Pattern')}</p>
              {s.recommendedAngle ? <p style={{ fontSize: '0.875rem' }}>Suggested angle: {String(s.recommendedAngle)}</p> : null}
              {s.reasoning ? <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{String(s.reasoning)}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
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
