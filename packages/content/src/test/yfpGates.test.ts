import { describe, it, expect } from 'vitest';
import { runYFPQualityGates, YFPQualityGateInput } from '../gates';

const GOOD_BODY = `You can deploy your first website today. This beginner tutorial walks through a simple project from scratch, and you will learn practical skills along the way.

Step 1, generate the pages with an AI assistant. Step 2, test the build locally. Step 3, deploy to a free host so your first real world project is live.

For example, one student shipped a small portfolio in a weekend and shared it to find freelance clients. I learned that finishing matters more than perfect code. According to the official docs, static hosting may be free for small projects and could suit your first site.

## What you will build
1. A live page you can share
2. A simple contact form
3. A project you can show in your portfolio

Key takeaway: learn by shipping real projects, and keep building your skills one deploy at a time.`;

const HYPE_BODY = `This guaranteed system will 10x your income overnight with zero effort and passive income on autopilot. Studies show 97% of people get rich with this secret hack. Experts agree this trick is revolutionary magic. Buy now before it is gone forever and ever, this is your only chance to win big money fast with no work at all.`;

function baseInput(body: string): YFPQualityGateInput {
  return {
    draftBody: body,
    bannedWords: [],
    receiptFacts: [],
    boundEvidenceTexts: [],
    evidenceFindings: [],
    evidenceCoverage: 0.8,
    existingTitles: [],
  };
}

describe('runYFPQualityGates', () => {
  it('scores a beginner-friendly tutorial highly across YFP dimensions', () => {
    const result = runYFPQualityGates({
      ...baseInput(GOOD_BODY),
      topicCategory: 'Beginner-friendly coding tutorials',
      workspaceProfile: 'Helps beginners learn practical tech skills',
      icp: 'Beginner developers learning AI tools',
      audienceProblems: [{ problem: 'Beginners struggle to deploy', audience: 'Beginner developers' }],
    });
    const dim = Object.fromEntries(result.yfpDimensions.map((d) => [d.name, d]));
    expect(dim.relevance?.score).toBe(25);
    expect(dim.relevance?.status).toBe('PASS');
    expect(dim.educational_value?.score).toBe(20);
    expect(dim.accuracy?.score).toBe(20);
    expect(dim.structure?.score).toBe(10);
    expect(dim.business_alignment?.status).toBe('PASS');
    expect(result.yfpOverallScore).toBeGreaterThanOrEqual(90);
  });

  it('penalizes hype language and unsupported statistics', () => {
    const result = runYFPQualityGates(baseInput(HYPE_BODY));
    const dim = Object.fromEntries(result.yfpDimensions.map((d) => [d.name, d]));
    expect(dim.business_alignment?.status).not.toBe('PASS');
    expect(dim.accuracy?.score).toBeLessThan(12);
  });

  it('keeps hard base failures blocking', () => {
    const result = runYFPQualityGates(baseInput('   '));
    expect(result.finalStatus).toBe('BLOCKED');
  });

  it('distinguishes missing signals from zero with partial evidence', () => {
    const full = runYFPQualityGates({
      ...baseInput(GOOD_BODY),
      topicCategory: 'Beginner-friendly coding tutorials',
      workspaceProfile: 'Helps beginners learn practical tech skills',
      icp: 'Beginner developers learning AI tools',
      audienceProblems: [{ problem: 'Beginners struggle to deploy', audience: 'Beginner developers' }],
    });
    const sparse = runYFPQualityGates(baseInput(GOOD_BODY));
    const fullRelevance = full.yfpDimensions.find((d) => d.name === 'relevance')?.score ?? 0;
    const sparseRelevance = sparse.yfpDimensions.find((d) => d.name === 'relevance')?.score ?? 0;
    expect(fullRelevance).toBeGreaterThan(sparseRelevance);
  });
});
