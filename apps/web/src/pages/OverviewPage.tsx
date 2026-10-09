import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHealth } from '../hooks/useHealth';
import { LoginForm } from '../components/LoginForm';
import {
  PageHead,
  SectionCard,
  EmptyState,
  ErrorState,
  SkeletonBlock,
  GuideCard,
  HonestValue,
} from '../components/ui';
import {
  friendlyErrorMessage,
  getOnboarding,
  getReadiness,
  getTodayBrain,
  isAiUnavailable,
  listContentIdeas,
  listLearningProposals,
  listNextActions,
  listOpportunities,
  listPublishRecords,
  listReviews,
  triggerRun,
} from '../services/api';
import type {
  OnboardingProgress,
  OperatorAction,
  Opportunity,
  ReadinessState,
  TodayBrain,
} from '../types';

/* Home — command center. Title: “Your brand, today.”
   Subtitle: “Here is what is happening and what you can do next.”
   Sections:
   A. Today's priorities (real recommendations)
   B. Needs your decision (genuine approvals)
   C. Content status (real counts, never fabricated)
   D. Research summary (real new items)
   E. Learning summary (only with evidence)
   F. Honest system status (only when it affects the user) */

export function OverviewPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { health } = useHealth();
  const navigate = useNavigate();

  const [today, setToday] = useState<TodayBrain | null>(null);
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [priorities, setPriorities] = useState<OperatorAction[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [needsDecision, setNeedsDecision] = useState<number | null>(null);
  const [ideasCount, setIdeasCount] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  const [learningCount, setLearningCount] = useState<number | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiDown, setAiDown] = useState(false);
  const [scanState, setScanState] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiDown(false);
    try {
      const [todayRes, readinessRes, actionsRes, oppsRes, onboardingRes] = await Promise.all([
        getTodayBrain().catch((e) => {
          if (isAiUnavailable(e)) setAiDown(true);
          return null;
        }),
        getReadiness().catch(() => null),
        listNextActions({ status: 'pending' }).catch(() => ({ actions: [] as OperatorAction[], total: 0 })),
        listOpportunities({ status: 'NEW' }).catch(() => ({ opportunities: [] as Opportunity[] })),
        getOnboarding().catch(() => null),
      ]);
      setToday(todayRes?.brain ?? null);
      setReadiness(readinessRes?.readiness ?? null);
      setPriorities((actionsRes.actions ?? []).slice(0, 5));
      setOpportunities((oppsRes?.opportunities ?? []).slice(0, 3));
      setOnboarding(onboardingRes?.onboarding ?? null);

      const [reviewsRes, ideasRes, pubsRes, learnRes] = await Promise.all([
        listReviews().catch(() => null),
        listContentIdeas().catch(() => null),
        listPublishRecords().catch(() => null),
        listLearningProposals({ status: 'PROPOSED' }).catch(() => null),
      ]);
      setNeedsDecision(
        reviewsRes ? reviewsRes.reviews.filter((r) => (r.status ?? '').toUpperCase() === 'SUBMITTED').length : null,
      );
      setIdeasCount(ideasRes ? ideasRes.contentIdeas.length : null);
      setPublishedCount(pubsRes ? pubsRes.publishRecords.length : null);
      setLearningCount(learnRes ? learnRes.proposals.length : todayRes?.brain.newLearnedPatterns ?? null);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void fetchAll();
    else setLoading(false);
  }, [isAuthenticated, fetchAll]);

  async function handleScan() {
    setScanning(true);
    setScanState(null);
    try {
      const result = await triggerRun();
      setScanState(`Scan ${result.result.status.toLowerCase().replace(/_/g, ' ')}. New ideas will appear in Research as the run finishes.`);
      await fetchAll();
    } catch (err) {
      if (isAiUnavailable(err)) {
        setScanState('AI writing is temporarily unavailable. Your existing drafts are safe — try again later.');
      } else {
        setScanState(friendlyErrorMessage(err));
      }
    } finally {
      setScanning(false);
    }
  }

  if (authLoading) {
    return (
      <div className="stack">
        <PageHead title="Home" sub="Checking your session…" />
        <SkeletonBlock lines={3} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead
          kicker="Your brand, today"
          title="Your brand, today."
          sub="Here is what is happening and what you can do next. Sign in to see your workspace."
        />
        <LoginForm />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="stack">
        <PageHead title="Your brand, today." sub="Here is what is happening and what you can do next." />
        <SkeletonBlock lines={2} />
        <SkeletonBlock lines={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="stack">
        <PageHead title="Your brand, today." sub="Here is what is happening and what you can do next." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  const rec = today?.recommendation ?? null;
  const linkedIn = readiness?.platformExecution?.find((p) => p.platform === 'linkedin');

  return (
    <div className="stack">
      <PageHead
        kicker="Your brand, today"
        title="Your brand, today."
        sub="Here is what is happening and what you can do next."
        nextStep="Work through Today’s priorities top to bottom, then check what needs your decision."
        helpHref="/help"
        actions={
          <>
            {onboarding && !onboarding.complete ? (
              <Link to="/onboarding" className="btn btn-secondary btn-sm">Continue setup</Link>
            ) : null}
            <button type="button" className="btn btn-primary btn-sm" disabled={scanning} onClick={() => void handleScan()}>
              {scanning ? 'Checking sources…' : 'Check for new ideas'}
            </button>
          </>
        }
      />

      {scanState ? (
        <div className="card" role="status" style={{ padding: '0.75rem 1rem' }}>
          <p className="muted" style={{ margin: 0 }}>{scanState}</p>
        </div>
      ) : null}

      {onboarding && !onboarding.complete ? (
        <div className="card" style={{ padding: '0.75rem 1rem' }}>
          <div className="row-between">
            <p className="muted" style={{ margin: 0 }}>
              Setup is incomplete — recommendations get better as each step lands. Next: {onboarding.currentStep ?? 'your business profile'}.
            </p>
            <Link to="/onboarding" className="btn btn-secondary btn-sm">Continue setup</Link>
          </div>
        </div>
      ) : null}

      {/* A. Today's priorities */}
      <SectionCard
        title="Today's priorities"
        action={<Link to="/observatory" className="btn btn-ghost btn-sm">View all research</Link>}
      >
        {priorities.length === 0 && !rec && opportunities.length === 0 ? (
          <EmptyState
            title="Nothing urgent today"
            what="No ranked recommendations right now."
            why="New suggestions appear after you connect sources and check for new ideas."
            nextStep="Connect 1–2 research sources, then choose “Check for new ideas” above."
            action={
              <div className="actions" style={{ justifyContent: 'center' }}>
                <Link to="/sources" className="btn btn-primary btn-sm">Add a source</Link>
                <Link to="/observatory" className="btn btn-secondary btn-sm">Open Research</Link>
              </div>
            }
          />
        ) : (
          <ul className="plain-list">
            {rec ? (
              <li className="priority-card">
                <p style={{ fontWeight: 700, margin: 0 }}>{rec.text}</p>
                <p className="priority-why">Why it matters: {(rec.why ?? []).slice(0, 2).join(' ') || 'This matches your audience and topics.'}</p>
                <p className="tiny" style={{ margin: '0.35rem 0 0' }}>
                  Confidence {rec.confidence}
                  {typeof today?.newSignals === 'number' ? ` · ${today.newSignals} new signals` : ''}
                  {typeof today?.highPotentialOpportunities === 'number' ? ` · ${today.highPotentialOpportunities} worth a look` : ''}
                </p>
                <div className="actions" style={{ marginTop: '0.6rem' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/observatory')}>Explore</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/opportunities')}>Create content</button>
                </div>
              </li>
            ) : null}
            {priorities.slice(0, 3).map((a) => (
              <li key={a.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 650, margin: 0 }}>{a.title}</p>
                    {a.reasons[0] ? <p className="priority-why">{a.reasons[0]}</p> : null}
                  </div>
                  <div className="actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/observatory')}>Explore</button>
                  </div>
                </div>
              </li>
            ))}
            {opportunities.slice(0, 2).map((o) => (
              <li key={o.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 650, margin: 0 }}>{o.title}</p>
                    <p className="tiny" style={{ margin: '0.2rem 0 0' }}>
                      Why it matters: {typeof o.topic === 'string' && o.topic ? `matches “${o.topic}”` : 'matches your topics'}
                      {typeof o.score === 'number' ? ` · score ${Math.round(o.score)}` : ''}
                    </p>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/opportunities`)}>
                    Create content
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* B. Needs your decision */}
      <SectionCard
        title="Needs your decision"
        action={<Link to="/approvals" className="btn btn-ghost btn-sm">View all</Link>}
      >
        {needsDecision === null ? (
          <p className="muted" style={{ margin: 0 }}>
            <HonestValue value={null} fallback="Not available from the connected sources." />
          </p>
        ) : needsDecision === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing waiting. When AI prepares something, it appears here — approval never means it already happened.
          </p>
        ) : (
          <div className="row-between">
            <p style={{ margin: 0 }}>
              <strong>{`${needsDecision} ${needsDecision === 1 ? 'item waits' : 'items wait'} for your review.`}</strong>
              <span className="muted"> Approve, edit, or reject — nothing moves without you.</span>
            </p>
            <Link to="/approvals" className="btn btn-primary btn-sm">Review now</Link>
          </div>
        )}
      </SectionCard>

      {/* C. Content status */}
      <SectionCard
        title="Content status"
        action={
          <div className="actions">
            <Link to="/content" className="btn btn-ghost btn-sm">Open Content</Link>
            <Link to="/calendar" className="btn btn-ghost btn-sm">View calendar</Link>
          </div>
        }
      >
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Ideas & drafts</div>
            <p className="stat-card-value" style={{ fontSize: '1.2rem' }}>
              <HonestValue value={ideasCount} />
            </p>
            <Link to="/content" className="tiny">Open drafts</Link>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Needs your decision</div>
            <p className="stat-card-value" style={{ fontSize: '1.2rem' }}>
              <HonestValue value={needsDecision} />
            </p>
            <Link to="/approvals" className="tiny">Review</Link>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Published (recorded)</div>
            <p className="stat-card-value" style={{ fontSize: '1.2rem' }}>
              <HonestValue value={publishedCount} />
            </p>
            <Link to="/analytics" className="tiny">See results</Link>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">LinkedIn</div>
            <p className="stat-card-value" style={{ fontSize: '1rem' }}>
              {linkedIn?.connected ? 'Connected' : 'Not connected'}
            </p>
            <Link to="/connections" className="tiny">Connect an account</Link>
          </div>
        </div>
        <div className="actions" style={{ marginTop: '0.75rem' }}>
          <Link to="/create" className="btn btn-primary btn-sm">Create content</Link>
          <Link to="/calendar" className="btn btn-secondary btn-sm">View calendar</Link>
        </div>
      </SectionCard>

      <div className="brief-grid">
        <div className="stack" style={{ minWidth: 0 }}>
          {/* D. Research summary */}
          <SectionCard title="New in research" action={<Link to="/observatory" className="btn btn-ghost btn-sm">View all research</Link>}>
            {opportunities.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No new source items yet. Connect sources and check for new ideas — useful developments will show here.
              </p>
            ) : (
              <ul className="plain-list">
                {opportunities.map((o) => (
                  <li key={o.id} className="card-row">
                    <p style={{ fontWeight: 600, margin: 0 }}>{o.title}</p>
                    <div className="actions" style={{ marginTop: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/observatory')}>Why it matters</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/opportunities')}>Create content</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className="brief-rail">
          {/* E. Learning summary */}
          <SectionCard title="What AI has learned" action={<Link to="/learning" className="btn btn-ghost btn-sm">View learning</Link>}>
            {learningCount === null || learningCount === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Not enough evidence yet. Insights appear after real results accumulate.</p>
            ) : (
              <p style={{ margin: 0 }}>
                <strong>{learningCount}</strong> observation{learningCount === 1 ? '' : 's'} waiting for your review.
              </p>
            )}
            <div className="actions" style={{ marginTop: '0.6rem' }}>
              <Link to="/learning" className="btn btn-secondary btn-sm">See evidence</Link>
            </div>
          </SectionCard>

          {/* F. Honest system status */}
          <SectionCard title="System status">
            {aiDown ? (
              <p className="muted" style={{ margin: 0 }}>
                AI writing is temporarily unavailable. Your drafts are safe.
                <br />
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => void fetchAll()}>
                  Try again
                </button>
              </p>
            ) : linkedIn && !linkedIn.connected ? (
              <p className="muted" style={{ margin: 0 }}>
                Connect LinkedIn to use supported account features.
                <br />
                <Link to="/connections" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>Fix connection</Link>
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                All good. API {health ? health.status : 'checking'} ·{' '}
                <Link to="/brain">Open the full evidence trail</Link> if you need it.
              </p>
            )}
          </SectionCard>
        </div>
      </div>

      <GuideCard
        whereAmI="Home — your daily command center."
        whatIsThis="Priorities, decisions, content counts, research and learning — all from real workspace data."
        whyItMatters="You see one calm list instead of technical modules. Suggestions are always labelled; executed actions are separate."
        whatYouCanDo="Explore a signal, create content, review a decision, or check sources. Every button goes somewhere real."
        whatNext="Finish setup, then Research → Create → Content → Review → Learning."
        action={<Link to="/help" className="btn btn-ghost btn-sm">What goes where?</Link>}
      />

      <div className="card safety-banner">
        <p className="muted" style={{ margin: 0 }}>
          Nothing publishes without your review. Approve or reject every item in{' '}
          <Link to="/approvals">Needs your decision</Link>.
        </p>
      </div>
    </div>
  );
}
