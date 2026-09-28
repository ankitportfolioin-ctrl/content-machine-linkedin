import { describe, it, expect } from 'vitest';
import {
  summarizeFeedback,
  feedbackDemotion,
  applyFeedbackDemotion,
  FEEDBACK_TYPES,
  NEGATIVE_FEEDBACK,
  FEEDBACK_PENALTY_STEP,
  MAX_FEEDBACK_PENALTY,
  MAX_FEEDBACK_REASONS,
  FeedbackRow,
} from '../opportunityFeedback';

function row(feedback: string, reason: string | null = null, at = '2026-09-18T00:00:00Z'): FeedbackRow {
  return { feedback, reason, createdAt: new Date(at) };
}

describe('summarizeFeedback', () => {
  it('1. aggregates an honest empty summary', () => {
    expect(summarizeFeedback([])).toEqual({
      total: 0,
      counts: { USEFUL: 0, NOT_USEFUL: 0, ALREADY_COVERED: 0, WRONG_AUDIENCE: 0, WEAK_EVIDENCE: 0, NOT_TIMELY: 0 },
      reasons: [],
    });
  });

  it('2. counts a single vote', () => {
    const out = summarizeFeedback([row('USEFUL')]);
    expect(out.total).toBe(1);
    expect(out.counts.USEFUL).toBe(1);
  });

  it('3. counts multiple feedback types', () => {
    const out = summarizeFeedback([row('USEFUL'), row('NOT_USEFUL'), row('NOT_USEFUL'), row('WRONG_AUDIENCE', 'Too generic')]);
    expect(out.total).toBe(4);
    expect(out.counts).toMatchObject({ USEFUL: 1, NOT_USEFUL: 2, WRONG_AUDIENCE: 1 });
  });

  it('4. supports all six FeedbackType values exhaustively', () => {
    expect(FEEDBACK_TYPES).toHaveLength(6);
    const out = summarizeFeedback(FEEDBACK_TYPES.map((t) => row(t, `reason for ${t}`)));
    expect(out.total).toBe(6);
    for (const t of FEEDBACK_TYPES) expect(out.counts[t]).toBe(1);
    expect(out.reasons).toHaveLength(6);
  });

  it('5. handles tied counts without inventing order', () => {
    const out = summarizeFeedback([row('USEFUL'), row('NOT_USEFUL')]);
    expect(out.counts.USEFUL).toBe(1);
    expect(out.counts.NOT_USEFUL).toBe(1);
  });

  it('6. orders deterministically across runs', () => {
    const rows = [row('USEFUL', 'b'), row('NOT_USEFUL', 'a', '2026-09-19T00:00:00Z')];
    expect(summarizeFeedback(rows)).toEqual(summarizeFeedback(rows));
  });

  it('7. caps reasons at MAX_FEEDBACK_REASONS', () => {
    expect(MAX_FEEDBACK_REASONS).toBe(10);
    const rows = Array.from({ length: 15 }, (_, i) => row('USEFUL', `reason ${i}`));
    expect(summarizeFeedback(rows).reasons).toHaveLength(MAX_FEEDBACK_REASONS);
  });

  it('8. orders reasons newest-first', () => {
    const out = summarizeFeedback([
      row('USEFUL', 'older', '2026-09-10T00:00:00Z'),
      row('USEFUL', 'newer', '2026-09-20T00:00:00Z'),
    ]);
    expect(out.reasons.map((r) => r.reason)).toEqual(['newer', 'older']);
  });

  it('9. drops empty/null reasons instead of rendering fake text', () => {
    const out = summarizeFeedback([row('USEFUL', ''), row('USEFUL', '   '), row('USEFUL', null), row('USEFUL', 'real')]);
    expect(out.total).toBe(4);
    expect(out.reasons).toHaveLength(1);
    expect(out.reasons[0]!.reason).toBe('real');
  });

  it('10. ignores unknown feedback strings rather than misclassifying', () => {
    const out = summarizeFeedback([row('BOGUS', 'x'), row('USEFUL')]);
    expect(out.total).toBe(1);
    expect(out.counts.USEFUL).toBe(1);
  });
});

describe('demotion math', () => {
  const empty = summarizeFeedback([]);

  it('12. zero feedback yields zero penalty', () => {
    expect(feedbackDemotion(empty)).toEqual({ negativeVotes: 0, penalty: 0 });
    expect(applyFeedbackDemotion(0.8, empty)).toEqual({ rankedScore: 0.8, penalty: 0, negativeVotes: 0 });
  });

  it('13. one negative vote demotes by exactly one step without burying', () => {
    const summary = summarizeFeedback([row('NOT_USEFUL')]);
    expect(feedbackDemotion(summary)).toEqual({ negativeVotes: 1, penalty: FEEDBACK_PENALTY_STEP });
    expect(FEEDBACK_PENALTY_STEP).toBe(0.05);
    expect(applyFeedbackDemotion(0.8, summary).rankedScore).toBe(0.75);
  });

  it('multiple negative votes increase demotion', () => {
    const summary = summarizeFeedback([row('NOT_USEFUL'), row('WRONG_AUDIENCE'), row('WEAK_EVIDENCE')]);
    expect(feedbackDemotion(summary).penalty).toBe(0.15);
    expect(applyFeedbackDemotion(0.8, summary).rankedScore).toBe(0.65);
  });

  it('14. demotion is bounded by the cap', () => {
    expect(MAX_FEEDBACK_PENALTY).toBe(0.2);
    const summary = summarizeFeedback(Array.from({ length: 20 }, () => row('NOT_TIMELY')));
    const out = applyFeedbackDemotion(0.9, summary);
    expect(out.penalty).toBe(MAX_FEEDBACK_PENALTY);
    expect(out.rankedScore).toBe(0.7);
  });

  it('floors ranked score at zero without deleting', () => {
    expect(applyFeedbackDemotion(0.1, summarizeFeedback([row('NOT_USEFUL'), row('NOT_USEFUL'), row('NOT_USEFUL'), row('NOT_USEFUL'), row('NOT_USEFUL')])).rankedScore).toBe(0);
  });

  it('15. positive feedback never creates a negative penalty', () => {
    expect(NEGATIVE_FEEDBACK.has('USEFUL')).toBe(false);
    const summary = summarizeFeedback([row('USEFUL'), row('USEFUL')]);
    expect(feedbackDemotion(summary)).toEqual({ negativeVotes: 0, penalty: 0 });
    expect(applyFeedbackDemotion(0.8, summary).rankedScore).toBe(0.8);
  });

  it('11. per-row stacking stays bounded', () => {
    const summary = summarizeFeedback([row('ALREADY_COVERED'), row('ALREADY_COVERED'), row('USEFUL')]);
    expect(feedbackDemotion(summary)).toEqual({ negativeVotes: 2, penalty: 0.1 });
  });
});
