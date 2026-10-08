import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useHealth } from '../hooks/useHealth';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, StatusDot, EmptyState, ErrorState, SkeletonBlock, TimeAgo } from '../components/ui';
import {
  friendlyErrorMessage,
  getOnboarding,
  getReadiness,
  getTodayBrain,
  listNextActions,
  listOpportunities,
  listReports,
  listRuns,
  triggerRun,
} from '../services/api';
import type {
  OnboardingProgress,
  OperatorAction,
  Opportunity,
  ReadinessState,
  TodayBrain,
} from '../types';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

interface ActivityEvent {
  id: string;
  text: string;
  at: string | null;
}

function actionTime(a: OperatorAction): string | null {
  return a.completedAt ?? a.acceptedAt ?? a.decidedAt ?? a.dismissedAt ?? null;
}

export function OverviewPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { health, loading: healthLoading } = useHealth();
  const navigate = useNavigate();

  const [today, setToday] = useState<TodayBrain | null>(null);
  const [readiness, setReadiness] = useState<ReadinessState | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanState, setScanState] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayRes, readinessRes, oppsRes] = await Promise.all([
        getTodayBrain().catch(() => null),
        getReadiness().catch(() => null),
        listOpportunities({ status: 'NEW' }).catch(() => ({ opportunities: [] as Opportunity[] })),
      ]);
      setToday(todayRes?.brain ?? null);
      setReadiness(readinessRes?.readiness ?? null);
      setOpportunities((oppsRes?.opportunities ?? []).slice(0, 3));

      const [actionsRes, reportsRes, runsRes, onboardingRes] = await Promise.all([
        listNextActions({ status: 'pending' }).catch(() => ({ actions: [] as OperatorAction[] })),
        listReports({ frequency: 'DAILY', limit: 3 }).catch(() => ({ reports: [] })),
        listRuns({ take: 5 }).catch(() => ({ runs: [] })),
        getOnboarding().catch(() => null),
      ]);
      setOnboarding(onboardingRes?.onboarding ?? null);

      const events: ActivityEvent[] = [];
      for (const a of actionsRes.actions ?? []) {
        const at = actionTime(a);
        if (at) events.push({ id: `action-${a.id}`, text: `${a.title} — ${String(a.status).toLowerCase()}`, at });
      }
      for (const r of reportsRes.reports ?? []) {
        const created = (r as unknown as { createdAt?: string }).createdAt ?? null;
        events.push({ id: `report-${r.id}`, text: `Daily digest ${String((r as unknown as { frequency?: string }).frequency ?? '').toLowerCase() || 'ready'}`, at: created });
      }
      for (const run of runsRes.runs ?? []) {
        const date = (run as unknown as { runDate?: string }).runDate ?? null;
        events.push({ id: `run-${run.id}`, text: `Intelligence run ${String(run.status).toLowerCase().replace(/_/g, ' ')}`, at: date });
      }
      events.sort((a, b) => {
        if (!a.at) return 1;
        if (!b.at) return -1;
        return new Date(b.at).getTime() - new Date(a.at).getTime();
      });
      setActivity(events.slice(0, 6));
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
      setScanState(`Scan ${result.result.status.toLowerCase().replace(/_/g, ' ')}. Fresh signals will appear as the run completes.`);
      await fetchAll();
    } catch (err) {
      setScanState(friendlyErrorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  if (authLoading || (!isAuthenticated && healthLoading)) {
    return (
      <div className="stack">
        <PageHead title="Overview" sub="Your growth command center" />
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Checking connection...</h2>
          </div>
        </div>
        <SkeletonBlock lines={3} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Start here" title="Growth Command Center" sub="Sign in to see what your growth system discovered." />
        <LoginForm />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="stack">
        <PageHead title="Overview" sub="Loading your briefing…" />
        <SkeletonBlock lines={2} />
        <SkeletonBlock lines={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="stack">
        <PageHead title="Overview" sub="Your growth command center" />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  const linkedIn = readiness?.platformExecution?.find((p) => p.platform === 'linkedin');
  const intelReady = readiness?.workspaceIntelligenceReady.ready;
  const rec = today?.recommendation ?? null;
  const topOpps = opportunities;

  return (
    <div className="stack">
      <PageHead
        kicker="Today's Briefing"
        title={`${greeting()}`}
        sub="Your growth system is active. Here is what it found and what needs you."
        actions={
          <button type="button" className="btn btn-primary" disabled={scanning} onClick={() => void handleScan()}>
            {scanning ? 'Scanning…' : 'Run Intelligence Scan'}
          </button>
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
            <p className="muted" style={{ margin: 0 }}>Onboarding is incomplete — recommendations improve as each step lands in the workspace.</p>
            <Link to="/onboarding" className="btn btn-secondary btn-sm">Continue onboarding</Link>
          </div>
        </div>
      ) : null}

      <div className="stat-grid" aria-label="System status">
        <div className="stat-card">
          <div className="stat-card-label">LinkedIn</div>
          <StatusDot tone={linkedIn?.connected ? 'ok' : 'idle'} label={linkedIn?.connected ? 'Connected' : 'Not connected'} />
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Intelligence</div>
          <StatusDot tone={intelReady ? 'live' : 'idle'} label={intelReady ? 'Monitoring' : 'Not configured'} />
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Content</div>
          <p className="stat-card-value" style={{ fontSize: '1.2rem' }}>
            {today ? `${today.readyForApproval} awaiting approval` : 'Unknown'}
          </p>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Learning</div>
          <p className="stat-card-value" style={{ fontSize: '1.2rem' }}>
            {today ? `${today.newLearnedPatterns} new patterns` : 'Unknown'}
          </p>
        </div>
      </div>

      <div className="brief-grid">
        <div className="stack" style={{ minWidth: 0 }}>
      {rec ? (
        <section className="recommend" aria-label="Today's signal">
          <div className="kicker">Today's signal</div>
          <p className="recommend-text">{rec.text}</p>
          <div className="row-between" style={{ marginTop: '1rem' }}>
            <div className="actions" aria-label="Signal facts">
              <span className="badge badge-accent">Confidence {rec.confidence}</span>
              {typeof today?.newSignals === 'number' ? (
                <span className="badge badge-neutral">{today.newSignals} new signals</span>
              ) : null}
              {typeof today?.highPotentialOpportunities === 'number' ? (
                <span className="badge badge-neutral">{today.highPotentialOpportunities} high-potential</span>
              ) : null}
            </div>
            <div className="actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/observatory')}>
                Explore Signal
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/opportunities')}>
                Create Content
              </button>
            </div>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No signal yet"
          what="The system has not produced a briefing recommendation for this workspace."
          why="Run an intelligence scan after connecting sources, and today's signal will appear here."
          action={
            <button type="button" className="btn btn-primary btn-sm" disabled={scanning} onClick={() => void handleScan()}>
              {scanning ? 'Scanning…' : 'Run Intelligence Scan'}
            </button>
          }
        />
      )}

          <SectionCard
            title="Top opportunities"
            action={<Link to="/opportunities" className="btn btn-ghost btn-sm">View all</Link>}
          >
          {topOpps.length === 0 ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                No new opportunities yet.
              </p>
              <p style={{ margin: '0.4rem 0 0' }}>
                <Link to="/observatory">Inspect signals</Link> or run a scan.
              </p>
            </>
          ) : (
            <ul className="plain-list">
              {topOpps.map((o) => (
                <li key={o.id} className="card-row">
                  <div className="row-between">
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>{o.title}</p>
                      <p className="tiny">
                        {typeof o.score === 'number' ? `Score ${Math.round(o.score)}` : 'Unscored'}
                        {o.topic ? ` · ${o.topic}` : ''}
                      </p>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/opportunities?selected=${encodeURIComponent(o.id)}`)}>
                      Create Draft
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </SectionCard>
        </div>

        <div className="brief-rail">
          <SectionCard title="Your AI's view: what's working">
            {rec && rec.why.length > 0 ? (
              <ul className="evidence-list">
                {rec.why.slice(0, 3).map((w, i) => (
                  <li key={i}>
                    <span className="evidence-dot" aria-hidden="true" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No evidence yet — run a scan and the reasoning behind each suggestion will show up here.
              </p>
            )}
            {typeof today?.newLearnedPatterns === 'number' && today.newLearnedPatterns > 0 ? (
              <p style={{ margin: '0.75rem 0 0' }}>
                <Link to="/learning">{today.newLearnedPatterns} patterns learned from your posts</Link>
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            title="AI activity"
            action={<Link to="/radar" className="btn btn-ghost btn-sm">Open Radar</Link>}
          >
          {activity.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No recorded activity yet. Runs, digests, and decisions will stream in here.
            </p>
          ) : (
            <ul className="timeline">
              {activity.map((e, i) => (
                <li key={e.id} className="timeline-item">
                  <span className="timeline-rail" aria-hidden="true">
                    <span className={`timeline-dot${i > 2 ? ' dim' : ''}`} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0 }}>{e.text}</p>
                    <TimeAgo value={e.at} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          </SectionCard>
        </div>
      </div>

      <div className="card safety-banner">
        <p className="muted" style={{ margin: 0 }}>
          Nothing publishes without your review. Approve or dismiss every post in{' '}
          <Link to="/approvals">Review posts</Link>.
        </p>
      </div>

      <p className="tiny">
        API {health ? health.status : 'checking'} · Need the full evidence trail?{' '}
        <Link to="/brain">Open the intelligence workbench</Link>.
      </p>
    </div>
  );
}
