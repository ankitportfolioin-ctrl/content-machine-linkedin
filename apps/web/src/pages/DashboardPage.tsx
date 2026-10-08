import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import { friendlyErrorMessage, getTodayBrain, listAudienceSegments, seedDefaultAudiences } from '../services/api';
import { AudienceSegment, TodayBrain } from '../types';
import { NavLink } from 'react-router-dom';

function confClass(conf: string): string {
  const c = conf.toLowerCase().replace(' ', '-');
  return `conf conf-${c}`;
}

export function DashboardPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [brain, setBrain] = useState<TodayBrain | null>(null);
  const [segments, setSegments] = useState<AudienceSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [today, aud] = await Promise.all([getTodayBrain(), listAudienceSegments()]);
      setBrain(today.brain);
      setSegments(aud.segments ?? []);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) void fetchAll();
    if (!authLoading && !isAuthenticated) setLoading(false);
  }, [authLoading, isAuthenticated, fetchAll]);

  async function handleSeed() {
    setSeedMsg(null);
    try {
      const res = await seedDefaultAudiences();
      setSegments(res.segments ?? []);
      setSeedMsg(`Seeded ${res.segments.length} YFP audience segments.`);
    } catch (err) {
      setSeedMsg(friendlyErrorMessage(err));
    }
  }

  if (authLoading || loading) {
    return <div className="card"><div className="empty-state"><h2 className="empty-state-title">Loading today's brain...</h2></div></div>;
  }
  if (!isAuthenticated) {
    return <div className="stack"><div className="card"><h2 className="section-title">Today</h2><p className="muted">Sign in to see recommendations.</p></div><LoginForm /></div>;
  }
  if (error) {
    return <div className="card"><div className="empty-state"><h2 className="empty-state-title">Something went wrong</h2><p className="empty-state-description">{error}</p><button className="btn btn-secondary" onClick={() => void fetchAll()} style={{ marginTop: '1rem' }}>Retry</button></div></div>;
  }

  const cards = brain ? [
    { label: 'New research signals', value: brain.newSignals },
    { label: 'High-potential opportunities', value: brain.highPotentialOpportunities },
    { label: 'Content ready for approval', value: brain.readyForApproval },
    { label: 'Posts awaiting analytics', value: brain.awaitingAnalytics },
    { label: 'New audience signals', value: brain.newAudienceSignals },
    { label: 'Experiments running', value: brain.runningExperiments },
    { label: 'New learned patterns', value: brain.newLearnedPatterns },
  ] : [];

  return (
    <div className="stack">
      <div className="card row-between">
        <div>
          <p className="kicker">Start here</p>
          <h2 className="section-title" style={{ fontSize: '1.25rem' }}>Today</h2>
          <p className="muted">What to create, why, and what we are learning.</p>
        </div>
        <WorkspaceSelector />
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <p className="stat-card-label">{c.label}</p>
            <p className="stat-card-value">{String(c.value)}</p>
          </div>
        ))}
      </div>

      {brain?.recommendation ? (
        <div className="recommend">
          <p className="kicker">Today's recommendation</p>
          <p className="recommend-text">{brain.recommendation.text}</p>
          <ul className="recommend-why">
            {brain.recommendation.why.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <p className={confClass(brain.recommendation.confidence)}>
            <span className="conf-dot" aria-hidden="true" />
            Confidence: {brain.recommendation.confidence}
          </p>
          <div className="actions" style={{ marginTop: '0.9rem' }}>
            <NavLink to="/brain" className="btn btn-primary">Review opportunity</NavLink>
            <NavLink to="/content" className="btn btn-secondary">Open Content Studio</NavLink>
          </div>
        </div>
      ) : null}

      <div className="card stack">
        <div className="row-between">
          <h3 className="section-title">Audience brain ({segments.length})</h3>
          <button className="btn btn-secondary" onClick={() => void handleSeed()}>Seed YFP defaults</button>
        </div>
        {seedMsg ? <p className="muted">{seedMsg}</p> : null}
        {segments.length === 0 ? (
          <p className="muted">No audience segments yet. Seed the YFP defaults to enable who/why reasoning.</p>
        ) : (
          <ul className="plain-list">
            {segments.map((s) => (
              <li key={String(s.id)} className="card-row">
                <p style={{ fontWeight: 600 }}>{s.name} <span className="tiny">({s.type})</span></p>
                {s.description ? <p className="muted">{String(s.description)}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
