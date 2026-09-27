import { describe, it, expect } from 'vitest';
import { runQualityGates } from '../gates';

const CLEAN_BODY = [
  'Most teams do not have a tool problem. They have a workflow problem.',
  '',
  'When teams adopt tools without changing how work flows, the tools add overhead instead of leverage.',
  '',
  'Start by mapping one workflow end to end before buying anything new.',
].join('\n');

function baseInput() {
  return {
    draftBody: CLEAN_BODY,
    structure: {
      hook: 'Most teams do not have a tool problem.',
      context: 'Tool sprawl is common.',
      development: 'Map one workflow first.',
      takeaway: 'Workflows beat tools.',
    },
    format: 'TEXT_POST' as const,
    planThesis: 'Most teams do not need another AI tool. They need a better workflow for the tools they already have.',
    draftThesis: 'Most teams do not have a tool problem. They have a workflow problem.',
    bannedWords: [] as string[],
    receiptFacts: [] as string[],
    boundEvidenceTexts: [] as string[],
    evidenceFindings: [] as never[],
    evidenceCoverage: 0.8,
    contradictionPresent: false,
    existingTitles: [] as string[],
    cta: null,
  };
}

describe('Quality gates', () => {
  it('passes a clean draft with a high score', () => {
    const result = runQualityGates(baseInput());
    expect(result.finalStatus).toBe('PASS');
    expect(result.overallScore).toBeGreaterThan(0.8);
    expect(result.results.length).toBeGreaterThan(10);
  });

  it('hard gate overrides score: 87/100-style pass with a critical failure is BLOCKED', () => {
    const passing = runQualityGates(baseInput());
    expect(passing.overallScore).toBeGreaterThan(0.8);

    const blocked = runQualityGates({
      ...baseInput(),
      evidenceFindings: [{
        span: 'Customers report 91% improvement.',
        kind: 'UNSUPPORTED_STATISTIC',
        severity: 'BLOCKED',
        message: 'Invented statistic.',
      }],
    });
    // Score stays numeric, but the final status must be BLOCKED.
    expect(typeof blocked.overallScore).toBe('number');
    expect(blocked.finalStatus).toBe('BLOCKED');
  });

  it('blocks internal markup', () => {
    const result = runQualityGates({ ...baseInput(), draftBody: `${CLEAN_BODY}\n\n[SLIDE 1] Intro` });
    expect(result.finalStatus).toBe('BLOCKED');
    expect(result.results.find((r) => r.gate === 'internal_markup')?.status).toBe('BLOCKED');
  });

  it('blocks banned words (fixture H)', () => {
    const result = runQualityGates({ ...baseInput(), bannedWords: ['leverage'] , draftBody: `${CLEAN_BODY} Leverage everything.` });
    expect(result.finalStatus).toBe('BLOCKED');
    expect(result.results.find((r) => r.gate === 'voice_compliance')?.status).toBe('BLOCKED');
  });

  it('blocks placeholders', () => {
    const result = runQualityGates({ ...baseInput(), draftBody: `${CLEAN_BODY}\n\nTODO: add example` });
    expect(result.finalStatus).toBe('BLOCKED');
  });

  it('detects thesis drift', () => {
    const result = runQualityGates({
      ...baseInput(),
      draftThesis: 'The operational framework for scaling AI with predictable repeatability.',
    });
    const thesis = result.results.find((r) => r.gate === 'thesis_fidelity');
    expect(thesis).toBeDefined();
    expect(['REVIEW_REQUIRED', 'BLOCKED']).toContain(thesis?.status);
  });

  it('detects repeated sentences', () => {
    const repeated = 'Workflows beat tool sprawl every single time in practice. Workflows beat tool sprawl every single time in practice.';
    const result = runQualityGates({ ...baseInput(), draftBody: `${CLEAN_BODY}\n\n${repeated}` });
    expect(result.results.find((r) => r.gate === 'repetition')?.status).toBe('REVIEW_REQUIRED');
  });

  it('detects duplicate titles', () => {
    const result = runQualityGates({
      ...baseInput(),
      existingTitles: ['Most teams do not have a tool problem.'],
    });
    expect(result.results.find((r) => r.gate === 'duplicate_content')?.status).toBe('REVIEW_REQUIRED');
  });

  it('blocks empty drafts', () => {
    const result = runQualityGates({ ...baseInput(), draftBody: '   ' });
    expect(result.finalStatus).toBe('BLOCKED');
  });

  it('blocks high-severity contradictions, reviews the rest', () => {
    const blocked = runQualityGates({ ...baseInput(), contradictionPresent: true, contradictionSeverity: 'HIGH' });
    expect(blocked.results.find((r) => r.gate === 'contradiction')?.status).toBe('BLOCKED');
    const review = runQualityGates({ ...baseInput(), contradictionPresent: true, contradictionSeverity: 'LOW' });
    expect(review.results.find((r) => r.gate === 'contradiction')?.status).toBe('REVIEW_REQUIRED');
  });
});
