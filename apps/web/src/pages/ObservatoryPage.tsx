import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock, GuideCard, TimeAgo } from '../components/ui';
import {
  convertOpportunity,
  friendlyErrorMessage,
  getOpportunity,
  listOpportunities,
  listSources,
  listTrends,
  listGaps,
  triageOpportunity,
} from '../services/api';
import type { Source, TrendSignal, ContentGap, Opportunity } from '../types';

const FILTERS = ['All', 'New', 'Saved', 'Opportunities', 'Content gaps'] as const;
type Filter = (typeof FILTERS)[number];

/* Research — find things worth talking about.
   Filters: All / New / Saved / Opportunities / Content gaps.
   Never invents source, time, engagement, or trend status.
   “Trending” is never used unless the backend says so with evidence. */

function isRecent(ts: string | undefined): boolean {
  if (!ts) return false;
  const ms = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(ms)) return false;
  return ms < 7 * 24 * 60 * 60 * 1000;
}

export function ObservatoryPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('All');
  const [sources, setSources] = useState<Source[]>([]);
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [gaps, setGaps] = useState<ContentGap[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ title?: string; description?: string; evidence?: unknown } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, g, o] = await Promise.all([
        listSources().catch(() => ({ sources: [] as Source[] })),
        listTrends().catch(() => ({ trends: [] as TrendSignal[] })),
        listGaps().catch(() => ({ gaps: [] as ContentGap[] })),
        listOpportunities().catch(() => ({ opportunities: [] as Opportunity[] })),
      ]);
      setSources(s.sources ?? []);
      setTrends(t.trends ?? []);
      setGaps(g.gaps ?? []);
      setOpportunities(o.opportunities ?? []);
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

  const counts = useMemo(
    () => ({ sources: sources.length, trends: trends.length, gaps: gaps.length, opportunities: opportunities.length }),
    [sources, trends, gaps, opportunities],
  );

  async function openDetail(id: string) {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await getOpportunity(id);
      setDetail({
        title: res.opportunity.title,
        description: res.opportunity.description,
        evidence: res.opportunity.evidence,
      });
    } catch (err) {
      setDetail({ title: 'Could not load details', description: friendlyErrorMessage(err) });
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCreate(id: string, title: string) {
    setActionMsg((p) => ({ ...p, [id]: 'Creating a draft idea…' }));
    try {
      const res = await convertOpportunity(id, title);
      setActionMsg((p) => ({ ...p, [id]: `Saved “${res.contentIdea.title}” as an idea. Nothing was published.` }));
    } catch (err) {
      setActionMsg((p) => ({ ...p, [id]: friendlyErrorMessage(err) }));
    }
  }

  async function handleDismiss(id: string) {
    if (!window.confirm('Dismiss this opportunity? It leaves Research but stays in your records.')) return;
    setActionMsg((p) => ({ ...p, [id]: 'Dismissing…' }));
    try {
      await triageOpportunity(id, 'DISMISSED');
      setOpportunities((prev) => prev.filter((o) => o.id !== id));
      setActionMsg((p) => ({ ...p, [id]: 'Dismissed.' }));
    } catch (err) {
      setActionMsg((p) => ({ ...p, [id]: friendlyErrorMessage(err) }));
    }
  }

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead title="Research" sub="Sign in to see things worth talking about." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead title="Research" sub="Reading your enabled sources…" />
        <SkeletonBlock lines={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead title="Research" sub="Things worth talking about." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  const showAll = filter === 'All';
  const newTrends = trends.filter((t) => isRecent(typeof t.updatedAt === 'string' ? t.updatedAt : typeof t.createdAt === 'string' ? t.createdAt : undefined));
  const newOpps = opportunities.filter((o) => isRecent(typeof o.updatedAt === 'string' ? o.updatedAt : typeof o.createdAt === 'string' ? o.createdAt : undefined));
  const newSources = sources.filter((s) => isRecent(typeof s.updatedAt === 'string' ? s.updatedAt : typeof s.createdAt === 'string' ? s.createdAt : undefined));

  const isEmpty =
    (filter === 'All' && trends.length === 0 && gaps.length === 0 && sources.length === 0 && opportunities.length === 0) ||
    (filter === 'New' && newTrends.length === 0 && newOpps.length === 0 && newSources.length === 0) ||
    (filter === 'Saved' && sources.length === 0) ||
    (filter === 'Opportunities' && opportunities.length === 0) ||
    (filter === 'Content gaps' && gaps.length === 0);

  return (
    <div className="stack">
      <PageHead
        kicker="Things worth talking about"
        title="Research"
        sub={`Monitoring ${counts.sources} saved ${counts.sources === 1 ? 'item' : 'items'} · ${counts.opportunities} opportunities · ${counts.gaps} gaps. Only real sources — nothing invented.`}
        nextStep="Open “Why it matters” on one item, then save it or create content from it."
        helpHref="/help#research"
        actions={
          <div className="actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchAll()}>Refresh</button>
            <Link to="/sources" className="btn btn-ghost btn-sm">Manage sources</Link>
          </div>
        }
      />

      <div className="tabs" role="tablist" aria-label="Research filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`btn btn-sm ${filter === f ? 'btn-primary tab-active' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}
            title={
              f === 'All'
                ? 'Everything: opportunities, gaps and saved items'
                : f === 'New'
                  ? 'Only items from the last 7 days with a verified date'
                  : f === 'Saved'
                    ? 'Single articles and links you saved'
                    : f === 'Opportunities'
                      ? 'Candidate topics with evidence — convert one to start writing'
                      : 'Questions your audience asks that you have not answered yet'
            }
          >
            {f}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState
          title={
            filter === 'Saved'
              ? 'No saved items yet'
              : filter === 'Opportunities'
                ? 'No opportunities yet'
                : filter === 'Content gaps'
                  ? 'No content gaps yet'
                  : 'No research yet'
          }
          what={
            filter === 'Saved'
              ? 'You have not saved any single articles or links.'
              : 'The system has not recorded matching research yet.'
          }
          why="Research only reads sources you enable. A failed fetch is shown as an error — never as success."
          nextStep="Add 1–2 sources in Research Sources, then choose “Check for new ideas” on Home."
          action={
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Link to="/sources" className="btn btn-primary btn-sm">Add a source</Link>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchAll()}>Try again</button>
            </div>
          }
        />
      ) : (
        <>
          {(showAll || filter === 'Opportunities' || filter === 'New') && (filter === 'New' ? newOpps : opportunities).length > 0 ? (
            <SectionCard title={`Opportunities (${(filter === 'New' ? newOpps : opportunities).length})`}>
              <ul className="plain-list">
                {(filter === 'New' ? newOpps : opportunities).map((o) => (
                  <li key={o.id} className="card-row">
                    <p style={{ fontWeight: 650, margin: 0 }}>{o.title}</p>
                    {o.description ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{String(o.description).slice(0, 220)}</p> : null}
                    <p className="tiny" style={{ marginTop: '0.25rem' }}>
                      {typeof o.score === 'number' ? `Score ${Math.round(o.score)} · ` : ''}
                      {typeof o.topic === 'string' && o.topic ? `Topic: ${o.topic} · ` : ''}
                      {typeof o.status === 'string' && o.status ? String(o.status) : 'Recorded'}
                    </p>
                    <div className="actions" style={{ marginTop: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openDetail(o.id)}>Why it matters</button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleCreate(o.id, o.title)}>Create content</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleDismiss(o.id)}>Dismiss</button>
                    </div>
                    {actionMsg[o.id] ? <p className="muted" style={{ margin: '0.4rem 0 0' }}>{actionMsg[o.id]}</p> : null}
                    {detailId === o.id ? (
                      <div className="detail-block" style={{ marginTop: '0.6rem' }}>
                        {detailLoading ? (
                          <p className="muted" style={{ margin: 0 }}>Loading evidence…</p>
                        ) : detail ? (
                          <>
                            <p style={{ fontWeight: 700, margin: '0 0 0.25rem' }}>{detail.title ?? o.title}</p>
                            {detail.description ? <p className="muted" style={{ margin: 0 }}>{detail.description}</p> : <p className="muted" style={{ margin: 0 }}>No extra description recorded. Evidence below is what the source stated — the rest is AI interpretation.</p>}
                            {detail.evidence ? (
                              <details style={{ marginTop: '0.4rem' }}>
                                <summary>Evidence & limitations</summary>
                                <pre className="tiny" style={{ whiteSpace: 'pre-wrap', margin: '0.3rem 0 0' }}>{JSON.stringify(detail.evidence, null, 2).slice(0, 2000)}</pre>
                              </details>
                            ) : null}
                            <div className="actions" style={{ marginTop: '0.5rem' }}>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/content')}>Open in Content</button>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailId(null)}>Back to research</button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {(showAll || filter === 'New') && (filter === 'New' ? newTrends : trends).length > 0 && !(['Opportunities', 'Saved', 'Content gaps'] as string[]).includes(filter) ? (
            <SectionCard title={`What is gaining attention (${(filter === 'New' ? newTrends : trends).length})`}>
              <p className="muted" style={{ marginTop: 0 }}>
                Shown only when independent sources agree. No viral scores are invented.
              </p>
              <ul className="plain-list">
                {(filter === 'New' ? newTrends : trends).map((t) => (
                  <li key={t.id} className="card-row">
                    <p style={{ fontWeight: 650, margin: 0 }}>{t.title ?? 'Untitled'}</p>
                    {t.description ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{t.description}</p> : null}
                    <div className="actions" style={{ marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }))}
                        aria-expanded={!!expanded[t.id]}
                      >
                        {expanded[t.id] ? 'Hide why' : 'Why it matters'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/opportunities')}>
                        Turn into opportunity
                      </button>
                    </div>
                    {expanded[t.id] ? (
                      <p className="muted" style={{ margin: '0.4rem 0 0' }}>
                        {typeof t.strength === 'number' ? `Strength ${Math.round(t.strength)}. ` : ''}
                        Recorded from your enabled sources<TimeAgo value={typeof t.updatedAt === 'string' ? t.updatedAt : typeof t.createdAt === 'string' ? t.createdAt : null} />.
                        What the source stated is separate from AI interpretation.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {(showAll || filter === 'Content gaps') && gaps.length > 0 ? (
            <SectionCard title={`Content gaps (${gaps.length})`}>
              <p className="muted" style={{ marginTop: 0 }}>Questions your audience asks that you have not answered yet.</p>
              <ul className="plain-list">
                {gaps.map((g) => (
                  <li key={g.id} className="card-row">
                    <p style={{ fontWeight: 650, margin: 0 }}>{g.title ?? 'Untitled gap'}</p>
                    {g.description ? <p className="muted" style={{ margin: '0.25rem 0 0' }}>{g.description}</p> : null}
                    <div className="actions" style={{ marginTop: '0.5rem' }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/create')}>Create content</button>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          {(showAll || filter === 'Saved' || filter === 'New') && (filter === 'New' ? newSources : sources).length > 0 && !(['Opportunities', 'Content gaps'] as string[]).includes(filter) ? (
            <SectionCard title={`Saved items (${(filter === 'New' ? newSources : sources).length})`} action={<Link to="/sources" className="btn btn-ghost btn-sm">Manage sources</Link>}>
              <ul className="plain-list">
                {(filter === 'New' ? newSources : sources).map((s) => (
                  <li key={s.id} className="card-row">
                    <p style={{ fontWeight: 650, margin: 0 }}>{s.title ?? s.url ?? 'Untitled source'}</p>
                    {s.url ? (
                      <p className="tiny mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', margin: '0.2rem 0 0' }}>
                        <a href={s.url} target="_blank" rel="noreferrer">Read source</a> · {s.url}
                      </p>
                    ) : null}
                    <div className="actions" style={{ marginTop: '0.5rem' }}>
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Read source</a> : null}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/create')}>Create from this</button>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}

      <GuideCard
        whereAmI="Research — things worth talking about."
        whatIsThis="Opportunities with evidence, gaps you could fill, and single items you saved."
        whyItMatters="Ideas come from sources you enabled — never invented. Dates and sources are shown only when verified."
        whatYouCanDo="Read source, open why it matters, create content linked to evidence, save, dismiss, refresh, or clear filters."
        whatNext="Convert one opportunity, then continue writing in Content."
        action={<Link to="/create" className="btn btn-secondary btn-sm">Start creating</Link>}
      />
    </div>
  );
}
