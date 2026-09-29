import { describe, it, expect, vi } from 'vitest';
import { explainAction, explainWithAi } from '../explain';
import { ScoredAction } from '../types';

function scored(): ScoredAction {
  return {
    kind: 'content_review',
    identityKey: 'content_review:r1',
    subjectId: 'r1',
    title: 'Review content draft',
    createdAt: new Date(),
    facts: { subjectMeta: { reviewId: 'r1' } },
    reasons: ['Content review waiting 3 day(s).'],
    evidenceLinks: [{ label: 'Review', ref: 'contentReview:r1' }],
    score: 62,
    dimensions: [{ name: 'urgency', points: 18, maxPoints: 30, reason: 'Awaiting review for 3 day(s).' }],
    learningApplied: [],
    signalConfidence: 'UNKNOWN' as const,
    recommendationConfidence: 'UNKNOWN' as const,
  };
}

function emptyRegistry() {
  return { getAvailable: vi.fn().mockReturnValue([]) } as never;
}

describe('Deterministic explanation', () => {
  it('answers why from computed data only', () => {
    const explanation = explainAction(scored(), 'PENDING');
    expect(explanation.identityKey).toBe('content_review:r1');
    expect(explanation.reasons).toContain('Content review waiting 3 day(s).');
    expect(explanation.dimensions).toHaveLength(1);
    expect(explanation.lifecycle).toMatch(/review/i);
    expect(explanation.subjectMeta).toEqual({ reviewId: 'r1' });
  });

  it('states objective alignment from persisted markers, never placeholders', () => {
    const aligned = explainAction(
      {
        ...scored(),
        facts: {
          subjectMeta: {
            objectivesConfigured: true,
            objectiveMatches: [{ level: 'CONTENT', goal: 'Publish checklists', terms: ['checklist'] }],
          },
        },
      },
      'PENDING'
    );
    expect(aligned.whyNot ?? []).not.toContain('No specific objective linked');
    expect(aligned.whyNot ?? []).not.toContainEqual(expect.stringMatching(/Does not visibly support/));

    const mismatched = explainAction(
      {
        ...scored(),
        facts: { subjectMeta: { objectivesConfigured: true, objectiveMatches: [] } },
      },
      'PENDING'
    );
    expect(mismatched.whyNot ?? []).toContain('Does not visibly support any configured objective');

    const unconfigured = explainAction(scored(), 'PENDING');
    expect(unconfigured.whyNot ?? []).toContain(
      'No workspace objectives configured — ranked on signal strength alone'
    );
  });

  it('reports attribution and lead-state caveats honestly', () => {
    const explanation = explainAction(
      {
        ...scored(),
        facts: {
          subjectMeta: {
            objectivesConfigured: false,
            attribution: { strongest: 'UNKNOWN', linkCount: 0, reason: null, target: 'lead:lead-1' },
            leadState: {
              status: 'NEW',
              qualificationStatus: 'INSUFFICIENT_DATA',
              hasApprovedStrategy: false,
              hasSubmittedReview: false,
              hasReadyAction: false,
              latestFollowUp: null,
              outreachBlockedBy: null,
            },
          },
        },
      },
      'PENDING'
    );
    expect(explanation.whyNot ?? []).toContain('No recorded attribution — evidence is unlinked');
    expect(explanation.whyNot ?? []).toContain(
      'Lead qualification is insufficient-data — research before outreach'
    );
  });
});

describe('Optional AI explanation', () => {
  it('returns AI_UNAVAILABLE with deterministic reasons intact on empty registry', async () => {
    await expect(explainWithAi(emptyRegistry(), explainAction(scored(), 'PENDING')))
      .rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('rejects invalid AI output without fabricating', async () => {
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ nope: 1 }) } }] }),
    };
    const registry = { getAvailable: vi.fn().mockReturnValue([provider]) } as never;
    await expect(explainWithAi(registry, explainAction(scored(), 'PENDING'))).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('returns validated summaries without changing score or rank', async () => {
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ summary: 'A review has waited 3 days and is ready for decision.' }) } }],
      }),
    };
    const registry = { getAvailable: vi.fn().mockReturnValue([provider]) } as never;
    const result = await explainWithAi(registry, explainAction(scored(), 'PENDING'));
    expect(result.aiAvailable).toBe(true);
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
