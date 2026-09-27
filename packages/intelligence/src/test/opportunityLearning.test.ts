import { describe, it, expect } from 'vitest';
import { toOpportunityLearningView } from '../opportunityLearning';
import type { OpportunityScoreResult } from '../contentOpportunity';

const base: OpportunityScoreResult = {
  overallScore: 0.6,
  dimensions: [
    { name: 'actionability', score: 0.7, explanation: 'Actionable.', evidence: ['c1'] },
    { name: 'timeliness', score: 0.5, explanation: 'Dated.', evidence: [] },
  ],
  criticalFailure: false,
};

describe('Opportunity learning view', () => {
  it('maps adjusted dimensions back onto the opportunity score shape', () => {
    const view = toOpportunityLearningView(base, {
      dimensions: [
        { name: 'actionability', score: 0.76, reason: 'Base. Workspace-confirmed learning adjustment +0.06: Measured uplift.', evidence: ['c1'], baseScore: 0.7, appliedAdjustment: 0.06 },
        { name: 'timeliness', score: 0.5, reason: 'Dated.', evidence: [], baseScore: 0.5, appliedAdjustment: 0 },
      ],
      applied: [{ dimension: 'actionability', adjustment: 0.06, reason: 'Measured uplift.', proposalId: 'p-1', confirmedAt: new Date().toISOString() }],
      ignored: [],
      overallScore: 0.63,
    });
    expect(view.baseOverallScore).toBe(0.6);
    expect(view.overallScore).toBe(0.63);
    const actionability = view.dimensions.find((d) => d.name === 'actionability')!;
    expect(actionability.baseScore).toBe(0.7);
    expect(actionability.appliedAdjustment).toBe(0.06);
    expect(actionability.explanation).toContain('Workspace-confirmed learning adjustment');
    expect(view.learning.applied).toHaveLength(1);
    expect(view.criticalFailure).toBe(false);
  });

  it('passes untouched dimensions through with zero adjustment', () => {
    const view = toOpportunityLearningView(base, {
      dimensions: [],
      applied: [],
      ignored: [{ dimension: 'icp_fit', reason: 'No matching base dimension; influence not applied.' }],
      overallScore: 0.6,
    });
    expect(view.dimensions.every((d) => d.appliedAdjustment === 0)).toBe(true);
    expect(view.dimensions.every((d) => d.score === d.baseScore)).toBe(true);
    expect(view.learning.ignored).toHaveLength(1);
  });

  it('preserves critical failures in the view', () => {
    const view = toOpportunityLearningView(
      { ...base, criticalFailure: true, failureReason: 'Critical contradiction.' },
      { dimensions: [], applied: [], ignored: [{ dimension: '*', reason: 'Critical evidence failure.' }], overallScore: 0.6 }
    );
    expect(view.criticalFailure).toBe(true);
    expect(view.failureReason).toBe('Critical contradiction.');
  });
});
