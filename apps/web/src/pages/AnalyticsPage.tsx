import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginForm } from '../components/LoginForm';
import { WorkspaceSelector } from '../components/WorkspaceSelector';
import {
  friendlyErrorMessage,
  getAnalyticsSummary,
  isAiUnavailable,
} from '../services/api';
import { AnalyticsSummary } from '../types';

const DEFAULT_RATES = 'reply_rate:replies:sends';

export function AnalyticsPage() {
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
          <h2 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
            Your results
          </h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Sign in to view recorded results computed from your recorded outcome metrics.
          </p>
        </div>
        <LoginForm />
      </div>
    );
  }

  return <AnalyticsDashboard />;
}

function AnalyticsDashboard() {
  const [metricFilter, setMetricFilter] = useState('');
  const [ratesInput, setRatesInput] = useState(DEFAULT_RATES);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUnavailable(false);
    try {
      const rates = parseRatesInput(ratesInput);
      const data = await getAnalyticsSummary({
        metricName: metricFilter.trim() || undefined,
        rates: rates.length > 0 ? rates : undefined,
      });
      setSummary(data.summary);
      setNotice(typeof data.notice === 'string' ? data.notice : null);
    } catch (err) {
      if (isAiUnavailable(err)) {
        setAiUnavailable(true);
      } else {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [metricFilter, ratesInput]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

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
          <h2 className="health-card-title">Your results</h2>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            Recorded results computed only from user-recorded outcome metrics. No estimates.
          </p>
        </div>
        <WorkspaceSelector />
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Filters
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            placeholder="Metric name filter (e.g. replies)"
            style={{ ...fieldStyle, flex: '1 1 200px' }}
          />
          <input
            value={ratesInput}
            onChange={(e) => setRatesInput(e.target.value)}
            placeholder="Rates as name:num:den, comma-separated"
            title="Rates format: name:numeratorMetric:denominatorMetric, comma-separated"
            style={{ ...fieldStyle, flex: '2 1 260px' }}
          />
          <button className="btn btn-primary" disabled={loading} onClick={() => void fetchSummary()}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Rates format: name:numeratorMetric:denominatorMetric, separated by commas. Rates with
          insufficient data are omitted with a reason, never estimated.
        </p>
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Loading recorded results...</h2>
            <p className="empty-state-description">Please wait while we fetch recorded metrics</p>
          </div>
        </div>
      ) : null}

      {!loading && aiUnavailable ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">AI assistance unavailable</h2>
            <p className="empty-state-description">
              Analytics computation is temporarily unavailable. Recorded metrics are unchanged;
              please try again later.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => void fetchSummary()}
              style={{ marginTop: '1rem' }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !aiUnavailable && error ? (
        <div className="card">
          <div className="empty-state">
            <h2 className="empty-state-title">Something went wrong</h2>
            <p className="empty-state-description">{error}</p>
            <button
              className="btn btn-secondary"
              onClick={() => void fetchSummary()}
              style={{ marginTop: '1rem' }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !aiUnavailable && !error && summary ? (
        <SummaryView summary={summary} notice={notice} />
      ) : null}
    </div>
  );
}

function SummaryView({ summary, notice }: { summary: AnalyticsSummary; notice: string | null }) {
  const aggregates = Array.isArray(summary.aggregates) ? summary.aggregates : [];
  const rates = Array.isArray(summary.rates) ? summary.rates : [];
  const omitted = Array.isArray(summary.omittedRates) ? summary.omittedRates : [];

  if (aggregates.length === 0 && rates.length === 0 && omitted.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <h2 className="empty-state-title">No recorded results yet</h2>
          <p className="empty-state-description">
            There are no recorded outcome metrics for this workspace yet. Record outcomes from
            content versions or pipeline deals to see aggregates here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Recorded results ({summary.totalMetrics} recorded metric
          {summary.totalMetrics === 1 ? '' : 's'})
        </h3>
        {notice ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            {notice}
          </p>
        ) : null}
        {aggregates.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Insufficient data: no metric aggregates to show for the current filter.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.5rem' }}>Metric</th>
                  <th style={{ padding: '0.5rem' }}>Value (avg)</th>
                  <th style={{ padding: '0.5rem' }}>Count / sample</th>
                  <th style={{ padding: '0.5rem' }}>Sources</th>
                  <th style={{ padding: '0.5rem' }}>Period</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((agg) => (
                  <tr
                    key={String(agg.metricName)}
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{String(agg.metricName)}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {agg.avg === null || typeof agg.avg === 'undefined'
                        ? 'Insufficient data'
                        : `${String(agg.avg)} (sum ${String(agg.sum)}, min ${String(agg.min)}, max ${String(agg.max)})`}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {String(agg.count)} recorded · sample size {String(agg.sampleSize)}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {agg.sources.length > 0 ? agg.sources.map(String).join(', ') : 'No source recorded'}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {agg.period?.from || agg.period?.to
                        ? `${agg.period.from ?? '—'} → ${agg.period.to ?? '—'}`
                        : 'No period recorded'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
          Observed patterns (rates)
        </h3>
        {rates.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Insufficient data: no rates could be computed from recorded metrics.
          </p>
        ) : (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
            {rates.map((rate) => (
              <li
                key={String(rate.name)}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                <p style={{ fontWeight: 600 }}>{String(rate.name)}: {String(rate.value)}</p>
                <p style={{ color: 'var(--color-text-secondary)' }}>
                  Numerator total {String(rate.numerator)} · Denominator total {String(rate.denominator)}
                </p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                  Computed from {(rate.numeratorMetricIds ?? []).length} numerator and{' '}
                  {(rate.denominatorMetricIds ?? []).length} denominator recorded measurement(s).
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {omitted.length > 0 ? (
        <div className="card">
          <h3 className="health-card-title" style={{ marginBottom: '0.5rem' }}>
            Omitted rates
          </h3>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
            {omitted.map((o, index) => (
              <li
                key={`${String(o.name)}-${index}`}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                <p style={{ fontWeight: 600 }}>{String(o.name)}</p>
                <p style={{ color: 'var(--color-text-secondary)' }}>{String(o.reason)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function parseRatesInput(
  input: string,
): { name: string; numeratorMetric: string; denominatorMetric: string }[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(':').map((s) => s.trim()))
    .filter((chunks) => chunks.length === 3 && chunks.every((c) => c && c.length > 0))
    .map((chunks) => ({
      name: chunks[0] as string,
      numeratorMetric: chunks[1] as string,
      denominatorMetric: chunks[2] as string,
    }));
}

const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text)',
  padding: '0.625rem 0.75rem',
  width: '100%',
};
