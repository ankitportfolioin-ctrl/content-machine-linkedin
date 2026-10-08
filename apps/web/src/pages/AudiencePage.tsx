import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock } from '../components/ui';
import { friendlyErrorMessage, listAudienceProblems } from '../services/api';
import type { AudienceProblemGroup } from '../types';

export function AudiencePage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<AudienceProblemGroup[]>([]);
  const [analyzed, setAnalyzed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAudienceProblems();
      setGroups(data.groups ?? []);
      setAnalyzed(data.totalSignalsAnalyzed ?? 0);
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

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Your progress" title="Your audience" sub="Sign in to see audience needs." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead kicker="Your progress" title="Your audience" sub="Clustering recurring problems…" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead kicker="Your progress" title="Your audience" sub="Recurring problems and needs." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Your progress"
        title="Your audience"
        sub={groups.length === 0 ? 'No audience clusters yet.' : `${groups.length} recurring problem${groups.length === 1 ? '' : 's'} across ${analyzed} analyzed signals.`}
      />
      {groups.length === 0 ? (
        <EmptyState
          title="No audience problems yet"
          what="The system clusters recurring audience problems from independent sources."
          why="Connect sources and run a scan — clusters with suggested formats and hooks will appear here."
          action={<Link to="/connections" className="btn btn-secondary btn-sm">Manage connections</Link>}
        />
      ) : (
        <div className="grid-2">
          {groups.map((g) => (
            <SectionCard key={g.id} title={g.audience || 'Audience'}>
              <p style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em', marginBottom: '0.5rem' }}>
                {g.problem}
              </p>
              <div className="actions" style={{ marginBottom: '0.6rem' }} aria-label="Evidence">
                <span className="badge badge-accent">{`Recurring across ${g.frequency} independent source${g.frequency === 1 ? '' : 's'}`}</span>
                <span className="badge badge-neutral">Relevance: {g.yfpRelevance}</span>
                <span className="badge badge-neutral">{g.evidence.length} evidence quote{g.evidence.length === 1 ? '' : 's'}</span>
              </div>
              <div className="card-row" style={{ marginBottom: '0.5rem' }}>
                <p className="tiny">Suggested format</p>
                <p style={{ fontWeight: 650, fontSize: '0.87rem' }}>{g.suggestedContent.format.toLowerCase().replace(/_/g, ' ')}</p>
                <p className="tiny" style={{ marginTop: '0.35rem' }}>Suggested hook</p>
                <p style={{ fontSize: '0.87rem', color: 'var(--color-text-secondary)' }}>“{g.suggestedContent.hook}”</p>
              </div>
              {g.evidence.slice(0, 2).map((e, i) => (
                <p key={i} className="tiny" style={{ marginTop: '0.3rem' }}>
                  “{e.quote}” — {e.sourceType}
                </p>
              ))}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
