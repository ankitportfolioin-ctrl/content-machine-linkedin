import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import { friendlyErrorMessage, getLearningDashboard, listExperiments } from '../services/api';
import { ExperimentItem, LearningDashboard } from '../types';

export function LearningPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [data, setData] = useState<LearningDashboard | null>(null);
  const [experiments, setExperiments] = useState<ExperimentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hypothesis, setHypothesis] = useState('');
  const [variable, setVariable] = useState('');
  const [control, setControl] = useState('');
  const [variant, setVariant] = useState('');
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, exps] = await Promise.all([getLearningDashboard(), listExperiments()]);
      setData(dash);
      setExperiments(exps.experiments ?? []);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    try {
      const { createExperiment } = await import('../services/api');
      await createExperiment({ hypothesis: hypothesis.trim(), variable: variable.trim() || 'hook', controlDescription: control.trim() || 'control', variantDescription: variant.trim() || 'variant', metricName: 'saves' });
      setHypothesis('');
      setVariable('');
      setControl('');
      setVariant('');
      setFormMsg('Experiment designed. Start it from the API or extend the UI to run it.');
      await fetchAll();
    } catch (err) {
      setFormMsg(friendlyErrorMessage(err));
    }
  }

  if (authLoading || loading) return <div className="card"><div className="empty-state"><h2 className="empty-state-title">Loading learning...</h2></div></div>;
  if (!isAuthenticated) return <div className="stack"><div className="card"><h2 className="section-title">Learning</h2><p className="muted">Sign in first.</p></div><LoginForm /></div>;
  if (error) return <div className="card"><div className="empty-state"><h2 className="empty-state-title">Something went wrong</h2><p className="empty-state-description">{error}</p><button className="btn btn-secondary" onClick={() => void fetchAll()} style={{ marginTop: '1rem' }}>Retry</button></div></div>;

  return (
    <div className="stack">
      <div className="card row-between">
        <div>
          <p className="kicker">Learning Brain</p>
          <h2 className="section-title" style={{ fontSize: '1.25rem' }}>What the business knows</h2>
          <p className="muted">What we know, think, test, and don't know — with evidence, never magic numbers.</p>
        </div>
        <WorkspaceSelector />
      </div>

      <div className="card stack-sm">
        <h3 className="section-title">What we know <span className="badge badge-success">confirmed</span></h3>
        {!data || data.whatWeKnow.length === 0 ? <p className="muted">Insufficient data: no confirmed patterns yet.</p> : (
          <ul className="bullet-list">
            {data.whatWeKnow.map((k) => <li key={k.id}><strong>{k.dimension}</strong>: {k.pattern} (n={k.sample}, evidence {String(k.maturity ?? 'CONFIRMED')})</li>)}
          </ul>
        )}
      </div>

      <div className="card stack-sm">
        <h3 className="section-title">What we think <span className="badge badge-warning">proposed</span></h3>
        {!data || data.whatWeThink.length === 0 ? <p className="muted">No proposed patterns.</p> : (
          <ul className="bullet-list">
            {data.whatWeThink.map((k) => <li key={k.id}><strong>{k.dimension}</strong>: {k.pattern} (evidence {String(k.maturity ?? 'HYPOTHESIS')}{typeof k.evidenceCount === 'number' ? `, ${k.evidenceCount} occurrence${k.evidenceCount === 1 ? '' : 's'}` : ''})</li>)}
          </ul>
        )}
      </div>

      <div className="card stack-sm">
        <h3 className="section-title">What we are testing <span className="badge badge-info">running</span></h3>
        {!data || data.whatWeAreTesting.length === 0 ? <p className="muted">No running experiments.</p> : (
          <ul className="bullet-list">
            {data.whatWeAreTesting.map((t) => <li key={t.id}>{t.hypothesis} (var: {t.variable}, metric: {t.metric})</li>)}
          </ul>
        )}
        {experiments.length > 0 ? (
          <ul className="plain-list" style={{ marginTop: '0.75rem' }}>
            {experiments.slice(0, 10).map((e) => (
              <li key={e.id} className="card-row">
                <p style={{ fontWeight: 600 }}>{e.hypothesis}</p>
                <p className="muted">{e.status}{e.result ? ` · ${e.result}` : ''}{typeof e.confidence !== 'undefined' && e.confidence !== null ? ` · conf ${e.confidence}` : ''}</p>
                {e.conclusion ? <p style={{ fontSize: '0.875rem' }}>{e.conclusion}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="card stack-sm">
        <h3 className="section-title">What we don't know</h3>
        <ul className="bullet-list">
          {(data?.whatWeDontKnow ?? []).map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </div>

      <div className="card stack-sm">
        <h3 className="section-title">Design an experiment</h3>
        <form onSubmit={(e) => void handleCreate(e)} className="stack-sm">
          <input value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="Hypothesis (e.g. Problem-first hooks may outperform announcement-first for tutorials)" className="field" required minLength={10} />
          <div className="actions">
            <input value={variable} onChange={(e) => setVariable(e.target.value)} placeholder="Variable (e.g. hook)" className="field" style={{ flex: '1 1 160px' }} />
            <input value={control} onChange={(e) => setControl(e.target.value)} placeholder="Control description" className="field" style={{ flex: '1 1 200px' }} />
            <input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Variant description" className="field" style={{ flex: '1 1 200px' }} />
            <button type="submit" className="btn btn-primary">Design</button>
          </div>
        </form>
        {formMsg ? <p className="muted">{formMsg}</p> : null}
      </div>
    </div>
  );
}
