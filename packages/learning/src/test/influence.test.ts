import { describe, it, expect } from 'vitest';
import { applyLearningInfluence } from '../influence';

const base = [
  { name: 'evidence_strength', score: 0.7, reason: 'Strong claims.', evidence: ['c1'] },
  { name: 'timeliness', score: 0.5, reason: 'Dated.', evidence: [] },
];

describe('Learning influence seam', () => {
  it('applies confirmed influences with full explanation', () => {
    const result = applyLearningInfluence(base, [{
      dimension: 'timeliness', adjustment: 0.08, reason: 'Measured uplift.',
      proposalId: 'p-1', confirmedAt: new Date().toISOString(),
    }]);
    const timeliness = result.dimensions.find((d) => d.name === 'timeliness')!;
    expect(timeliness.baseScore).toBe(0.5);
    expect(timeliness.appliedAdjustment).toBe(0.08);
    expect(timeliness.score).toBe(0.58);
    expect(timeliness.reason).toContain('Workspace-confirmed learning adjustment');
    expect(result.applied).toHaveLength(1);
    expect(result.overallScore).toBeGreaterThan(0.6);
  });

  it('clamps adjustments so scores cannot run away', () => {
    const result = applyLearningInfluence(
      [{ name: 'timeliness', score: 0.95, reason: 'r', evidence: [] }],
      [
        { dimension: 'timeliness', adjustment: 0.2, reason: 'a', proposalId: 'p-1', confirmedAt: new Date().toISOString() },
        { dimension: 'timeliness', adjustment: 0.2, reason: 'b', proposalId: 'p-2', confirmedAt: new Date().toISOString() },
      ]
    );
    const timeliness = result.dimensions.find((d) => d.name === 'timeliness')!;
    expect(timeliness.score).toBeLessThanOrEqual(1);
    expect(timeliness.appliedAdjustment).toBeLessThanOrEqual(0.2);
  });

  it('ignores out-of-bounds and unmatched influences', () => {
    const result = applyLearningInfluence(base, [
      { dimension: 'timeliness', adjustment: 0.9, reason: 'wild', proposalId: 'p-x', confirmedAt: new Date().toISOString() },
      { dimension: 'nope', adjustment: 0.05, reason: 'unknown dim', proposalId: 'p-y', confirmedAt: new Date().toISOString() },
    ]);
    expect(result.dimensions.find((d) => d.name === 'timeliness')!.score).toBe(0.5);
    expect(result.ignored).toHaveLength(2);
  });

  it('leaves scores untouched with no influences', () => {
    const result = applyLearningInfluence(base, []);
    expect(result.dimensions.map((d) => d.score)).toEqual([0.7, 0.5]);
    expect(result.applied).toHaveLength(0);
  });
});
