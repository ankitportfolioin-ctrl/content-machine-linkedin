import { describe, it, expect } from 'vitest';
import { aggregateMetrics } from '../aggregation';

const rows = [
  { id: 'm1', metricName: 'responses', metricValue: 5, source: 'Manual CRM entry', recordedAt: new Date('2026-09-01T00:00:00Z') },
  { id: 'm2', metricName: 'responses', metricValue: 7, source: 'Weekly review notes', recordedAt: new Date('2026-09-08T00:00:00Z') },
  { id: 'm3', metricName: 'messages_sent', metricValue: 20, source: 'Manual CRM entry', recordedAt: new Date('2026-09-08T00:00:00Z') },
];

describe('Aggregation engine', () => {
  it('computes aggregates with numerators, denominators, and provenance', () => {
    const summary = aggregateMetrics(rows);
    expect(summary.totalMetrics).toBe(3);
    const responses = summary.aggregates.find((a) => a.metricName === 'responses')!;
    expect(responses.count).toBe(2);
    expect(responses.sum).toBe(12);
    expect(responses.avg).toBe(6);
    expect(responses.min).toBe(5);
    expect(responses.max).toBe(7);
    expect(responses.sources).toContain('Manual CRM entry');
    expect(responses.sampleSize).toBe(2);
    expect(responses.metricIds).toEqual(['m1', 'm2']);
    expect(responses.period.from).toBeDefined();
  });

  it('computes defined rates and omits undefined ones with reasons', () => {
    const summary = aggregateMetrics(rows, [
      { name: 'response_rate', numeratorMetric: 'responses', denominatorMetric: 'messages_sent' },
      { name: 'ghost_rate', numeratorMetric: 'responses', denominatorMetric: 'impressions' },
    ]);
    const rate = summary.rates.find((r) => r.name === 'response_rate')!;
    expect(rate.numerator).toBe(12);
    expect(rate.denominator).toBe(20);
    expect(rate.value).toBe(0.6);
    expect(rate.numeratorMetricIds).toEqual(['m1', 'm2']);
    expect(summary.omittedRates.some((r) => r.name === 'ghost_rate' && r.reason.includes('Insufficient data'))).toBe(true);
  });

  it('returns explicit empty states, never zero-filled estimates', () => {
    const summary = aggregateMetrics([]);
    expect(summary.aggregates).toEqual([]);
    expect(summary.rates).toEqual([]);
    expect(summary.totalMetrics).toBe(0);
    const withRates = aggregateMetrics([], [{ name: 'response_rate', numeratorMetric: 'a', denominatorMetric: 'b' }]);
    expect(withRates.omittedRates).toHaveLength(1);
  });

  it('omits zero-denominator rates instead of dividing', () => {
    const summary = aggregateMetrics(
      [{ id: 'm1', metricName: 'responses', metricValue: 5, source: 'CRM', recordedAt: new Date() }],
      [{ name: 'r', numeratorMetric: 'responses', denominatorMetric: 'responses' }]
    );
    expect(summary.rates).toHaveLength(1);
    const zeroed = aggregateMetrics(
      [{ id: 'm1', metricName: 'responses', metricValue: 0, source: 'CRM', recordedAt: new Date() }],
      [{ name: 'r', numeratorMetric: 'responses', denominatorMetric: 'responses' }]
    );
    expect(zeroed.rates).toHaveLength(0);
    expect(zeroed.omittedRates[0]?.reason).toMatch(/zero/i);
  });
});
