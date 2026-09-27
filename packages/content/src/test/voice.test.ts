import { describe, it, expect } from 'vitest';
import { assembleVoiceContext, checkBannedWords, checkReceiptLeakage } from '../voice';

describe('Voice context', () => {
  it('assembles internal instructions without rendering content', () => {
    const context = assembleVoiceContext({
      profile: { role: 'Founder', industry: 'SaaS' },
      voiceProfile: {
        tone: 'Direct and practical.',
        bannedWords: ['leverage', 'synergy'],
        preferredVocabulary: ['workflow', 'evidence'],
        contentPillars: ['AI workflows'],
      },
      receipts: [{ fact: 'Built a developer community to 45,000 engineers.' }],
    });
    expect(context.instructions).toContain('Founder');
    expect(context.instructions).toContain('Direct and practical.');
    expect(context.bannedWords).toEqual(['leverage', 'synergy']);
    expect(context.receiptFacts).toHaveLength(1);
  });
});

describe('Banned words', () => {
  it('flags banned words case-insensitively', () => {
    const violations = checkBannedWords('We must LEVERAGE our synergy.', ['leverage']);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ word: 'leverage', occurrences: 1 });
  });

  it('respects word boundaries', () => {
    const violations = checkBannedWords('The team leveraged existing tooling.', ['leverage']);
    expect(violations).toHaveLength(0);
  });

  it('passes clean content', () => {
    expect(checkBannedWords('A calm, evidence-led workflow.', ['leverage', 'synergy'])).toHaveLength(0);
  });
});

describe('Receipt leakage', () => {
  const fact = 'Built a developer community to 45,000 engineers over three years';

  it('flags receipt phrasing without supporting evidence', () => {
    const findings = checkReceiptLeakage(
      `In my experience, I built a developer community to 45,000 engineers over three years, so trust me.`,
      [fact],
      []
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.supportedByEvidence).toBe(false);
  });

  it('does not flag receipts backed by evidence bindings', () => {
    const findings = checkReceiptLeakage(
      `We built a developer community to 45,000 engineers over three years.`,
      [fact],
      [`Case study: built a developer community to 45,000 engineers over three years.`]
    );
    expect(findings).toHaveLength(0);
  });

  it('ignores unrelated content', () => {
    const findings = checkReceiptLeakage('Workflows beat tool sprawl.', [fact], []);
    expect(findings).toHaveLength(0);
  });
});
