import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { PageHead, SectionCard, EmptyState, ErrorState, SkeletonBlock } from '../components/ui';
import { createExperiment, friendlyErrorMessage, listExperiments } from '../services/api';
import type { ExperimentItem } from '../types';

export function ExperimentsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [experiments, setExperiments] = useState<ExperimentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hypothesis, setHypothesis] = useState('');
  const [variable, setVariable] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listExperiments();
      setExperiments(data.experiments ?? []);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!hypothesis.trim() || !variable.trim()) {
      setMessage('Hypothesis and variable are both required.');
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      await createExperiment({
        hypothesis: hypothesis.trim(),
        variable: variable.trim(),
        controlDescription: 'Current approach',
        variantDescription: variable.trim(),
      });
      setHypothesis('');
      setVariable('');
      setMessage('Experiment recorded. It stays proposed until measured.');
      await fetchAll();
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  if (authLoading) return <SkeletonBlock lines={4} />;
  if (!isAuthenticated) {
    return (
      <div className="stack">
        <PageHead kicker="Learning" title="Experiments" sub="Sign in to track experiments." />
        <LoginForm />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="stack">
        <PageHead kicker="Learning" title="Experiments" sub="Loading controlled tests…" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="stack">
        <PageHead kicker="Learning" title="Experiments" sub="Test one variable at a time." />
        <ErrorState message={error} onRetry={() => void fetchAll()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHead
        kicker="Learning"
        title="Experiments"
        sub={experiments.length === 0 ? 'No experiments yet.' : `${experiments.length} controlled test${experiments.length === 1 ? '' : 's'} on record.`}
      />
      <SectionCard title="New experiment">
        <form onSubmit={handleCreate} className="stack-sm">
          <input
            className="field"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="Hypothesis (e.g. shorter hooks earn more saves)"
            aria-label="Hypothesis"
          />
          <input
            className="field"
            value={variable}
            onChange={(e) => setVariable(e.target.value)}
            placeholder="Variable under test (e.g. hook length)"
            aria-label="Variable"
          />
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
              {creating ? 'Recording…' : 'Record experiment'}
            </button>
          </div>
          {message ? (
            <p className="muted" role="status" style={{ margin: 0 }}>{message}</p>
          ) : null}
        </form>
      </SectionCard>

      {experiments.length === 0 ? (
        <EmptyState
          title="No experiments yet"
          what="Controlled tests turn guesses into measured learning."
          why="Record one variable above — results and conclusions land here when measured."
          action={<Link to="/analytics" className="btn btn-secondary btn-sm">Review performance</Link>}
        />
      ) : (
        <SectionCard title={`On record (${experiments.length})`}>
          <ul className="plain-list">
            {experiments.map((x) => (
              <li key={x.id} className="card-row">
                <div className="row-between">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 650, fontSize: '0.9rem' }}>{x.hypothesis}</p>
                    <p className="tiny" style={{ marginTop: '0.2rem' }}>
                      Variable: {x.variable} · Metric: {x.metricName}
                    </p>
                    {x.conclusion ? <p className="muted" style={{ marginTop: '0.25rem' }}>{x.conclusion}</p> : null}
                  </div>
                  <span className="badge badge-neutral">{x.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
