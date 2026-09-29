import { describe, it, expect } from 'vitest';
import { scoreCandidate, rankScored } from '../scoring';
import { Candidate } from '../types';

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    kind: 'content_review',
    identityKey: 'content_review:r1',
    subjectId: 'r1',
    title: 'Review content draft',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    facts: { waitingDays: 3, ready: true, evidenceCount: 2 },
    reasons: ['Content review waiting 3 day(s).'],
    evidenceLinks: [{ label: 'Review', ref: 'contentReview:r1' }],
    ...overrides,
  };
}

describe('Deterministic scoring', () => {
  it('produces bounded, explainable scores', () => {
    const scored = scoreCandidate({ candidate: candidate(), confirmedLearning: [] });
    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(100);
    expect(scored.dimensions.length).toBe(6);
    expect(scored.reasons.length).toBeGreaterThan(0);
    expect(scored.learningApplied).toEqual([]);
  });

  it('omits dimensions without source data instead of manufacturing values', () => {
    const scored = scoreCandidate({
      candidate: candidate({ facts: {} }),
      confirmedLearning: [],
    });
    const relevance = scored.dimensions.find((d) => d.name === 'relevance')!;
    expect(relevance.points).toBe(8);
    expect(scored.score).toBeLessThan(scoreCandidate({ candidate: candidate(), confirmedLearning: [] }).score);
  });

  it('applies confirmed learning transparently with caps', () => {
    const scored = scoreCandidate({
      candidate: candidate({ facts: { waitingDays: 1, ready: true, learningDimensions: ['timeliness'] } }),
      confirmedLearning: [{ dimension: 'timeliness', adjustment: 0.1, reason: 'Measured uplift.', proposalId: 'p-1', confirmedAt: new Date().toISOString() }],
    });
    expect(scored.learningApplied).toHaveLength(1);
    expect(scored.score).toBeLessThanOrEqual(100);
  });

  it('ignores learning for unmatched dimensions', () => {
    const scored = scoreCandidate({
      candidate: candidate(),
      confirmedLearning: [{ dimension: 'nope', adjustment: 0.1, reason: 'x', proposalId: 'p-1', confirmedAt: new Date().toISOString() }],
    });
    expect(scored.learningApplied).toHaveLength(0);
  });

  it('scores identically without objective markers (legacy behavior preserved)', () => {
    const plain = scoreCandidate({ candidate: candidate(), confirmedLearning: [] });
    const unconfigured = scoreCandidate({
      candidate: candidate({ facts: { waitingDays: 3, ready: true, evidenceCount: 2, subjectMeta: {} } }),
      confirmedLearning: [],
    });
    expect(unconfigured.score).toBe(plain.score);
  });

  it('adds a bounded bonus for configured-objective alignment', () => {
    const base = scoreCandidate({ candidate: candidate(), confirmedLearning: [] });
    const aligned = scoreCandidate({
      candidate: candidate({
        facts: {
          waitingDays: 3,
          ready: true,
          evidenceCount: 2,
          subjectMeta: {
            objectivesConfigured: true,
            objectiveMatches: [{ level: 'CONTENT', goal: 'Publish checklists', terms: ['checklist'] }],
          },
        },
      }),
      confirmedLearning: [],
    });
    const relevance = aligned.dimensions.find((d) => d.name === 'relevance')!;
    expect(relevance.points).toBeLessThanOrEqual(25);
    expect(aligned.score).toBeGreaterThan(base.score);
    expect(aligned.score - base.score).toBeLessThanOrEqual(5);
    expect(aligned.reasons.join(' ')).toMatch(/Supports CONTENT objective/);
  });

  it('applies a small reasoned deduction on configured-but-unmatched workspaces', () => {
    const base = scoreCandidate({ candidate: candidate(), confirmedLearning: [] });
    const mismatched = scoreCandidate({
      candidate: candidate({
        facts: {
          waitingDays: 3,
          ready: true,
          evidenceCount: 2,
          subjectMeta: { objectivesConfigured: true, objectiveMatches: [] },
        },
      }),
      confirmedLearning: [],
    });
    expect(mismatched.score).toBeLessThan(base.score);
    expect(base.score - mismatched.score).toBeLessThanOrEqual(3);
  });

  it('breaks ties deterministically by age then identity', () => {
    const a = scoreCandidate({ candidate: candidate({ identityKey: 'k:b', createdAt: new Date('2026-09-01T00:00:00Z') }), confirmedLearning: [] });
    const b = scoreCandidate({ candidate: candidate({ identityKey: 'k:a', createdAt: new Date('2026-09-01T00:00:00Z') }), confirmedLearning: [] });
    expect(a.score).toBe(b.score);
    const ranked = rankScored([a, b]);
    expect(ranked[0]?.identityKey).toBe('k:a');
    expect(rankScored([])).toEqual([]);
  });
});
