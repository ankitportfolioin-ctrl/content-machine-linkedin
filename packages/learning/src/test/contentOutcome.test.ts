import { describe, it, expect } from 'vitest';
import { groupContentOutcomes, dimensionForAttribute, ContentOutcomeService } from '../contentOutcome';

describe('Content-outcome grouping', () => {
  it('groups recorded values by attribute and skips unattributed rows', () => {
    const summary = groupContentOutcomes([
      { metricId: 'm1', metricValue: 10, attributeValue: 'POST' },
      { metricId: 'm2', metricValue: 20, attributeValue: 'POST' },
      { metricId: 'm3', metricValue: 4, attributeValue: 'ARTICLE' },
      { metricId: 'm4', metricValue: 7, attributeValue: null },
    ], 'format', 'responses');
    expect(summary.totalMetrics).toBe(4);
    expect(summary.skippedWithoutAttribute).toBe(1);
    const post = summary.groups.find((g) => g.label === 'format:POST')!;
    expect(post.avg).toBe(15);
    expect(post.count).toBe(2);
    expect(post.metricIds).toEqual(['m1', 'm2']);
  });

  it('maps attributes to documented opportunity dimensions', () => {
    expect(dimensionForAttribute('format')).toBe('actionability');
    expect(dimensionForAttribute('angle')).toBe('differentiation');
    expect(dimensionForAttribute('objective')).toBe('audience_fit');
  });
});

describe('Content-outcome derivation', () => {
  const service = new ContentOutcomeService({} as never);

  it('derives a bounded proposal from sufficient group gaps', () => {
    const summary = groupContentOutcomes([
      { metricId: 'm1', metricValue: 20, attributeValue: 'POST' },
      { metricId: 'm2', metricValue: 22, attributeValue: 'POST' },
      { metricId: 'm3', metricValue: 24, attributeValue: 'POST' },
      { metricId: 'm4', metricValue: 4, attributeValue: 'ARTICLE' },
      { metricId: 'm5', metricValue: 5, attributeValue: 'ARTICLE' },
      { metricId: 'm6', metricValue: 6, attributeValue: 'ARTICLE' },
    ], 'format', 'responses');
    const outcome = service.deriveFromSummary(summary, 3);
    if (!outcome.derived) throw new Error('Expected a derived proposal');
    expect(outcome.dimension).toBe('actionability');
    expect(outcome.derived.proposedAdjustment).toBeGreaterThan(0);
    expect(outcome.derived.proposedAdjustment).toBeLessThanOrEqual(0.2);
    expect(outcome.derived.reason).toMatch(/format -> actionability/);
  });

  it('refuses derivation below threshold with an honest reason', () => {
    const summary = groupContentOutcomes([
      { metricId: 'm1', metricValue: 10, attributeValue: 'POST' },
    ], 'format', 'responses');
    const outcome = service.deriveFromSummary(summary, 3);
    expect(outcome.derived).toBeNull();
    if (outcome.derived) throw new Error('Expected no proposal');
    expect((outcome as { reason: string }).reason).toMatch(/need 2\+ attribute groups/);
  });
});
