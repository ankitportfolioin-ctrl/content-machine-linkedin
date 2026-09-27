import { describe, it, expect, vi } from 'vitest';
import { checkThesisPreservation } from '../thesis';
import { validateFormatStructure } from '../strategy';
import { EvidenceService } from '../evidence';
import { runQualityGates } from '../gates';
import { generateHook } from '../hook';

const evidence = new EvidenceService({} as never);
const emptyRegistry = { getAvailable: vi.fn().mockReturnValue([]) } as never;

describe('Manual quality fixtures', () => {
  it('FIXTURE A preserves the user thesis', () => {
    const original = "Most people don't need another AI tool. They need a better workflow for using the tools they already have.";
    const drifted = 'The operational framework for scaling AI with predictable repeatability.';
    const check = checkThesisPreservation(original, drifted);
    expect(['REVIEW_REQUIRED', 'BLOCKED']).toContain(check.verdict);
    expect(checkThesisPreservation(original, original).verdict).toBe('OK');
  });

  it('FIXTURE B checklist produces a real checklist', () => {
    const analysisLike = validateFormatStructure('CHECKLIST', {
      title: 'Deep Analysis',
      items: [{ label: 'Introduction and background discussion' }],
    });
    expect(analysisLike.ok).toBe(false);
    const checklist = validateFormatStructure('CHECKLIST', {
      title: 'Practical Checklist',
      items: [
        { label: 'Map one workflow' },
        { label: 'Remove one tool' },
        { label: 'Measure the difference' },
      ],
    });
    expect(checklist.ok).toBe(true);
  });

  it('FIXTURE C carousel produces structured slides with no markup', () => {
    const result = validateFormatStructure('CAROUSEL', {
      title: 'Workflow wins',
      slides: [
        { order: 1, type: 'COVER', headline: 'Workflows beat tools', body: 'Why.', evidenceRefs: [] },
        { order: 2, type: 'INSIGHT', headline: 'Map first', body: 'How.', evidenceRefs: [] },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('FIXTURE D unsupported statistic is BLOCKED, not fabricated', () => {
    const findings = evidence.validateDraftText('Revenue grew 212% in six weeks.', [
      { span: 'Revenue grew 212% in six weeks.', evidenceStatus: 'REVIEW_REQUIRED' },
    ]);
    expect(findings.some((f) => f.kind === 'UNSUPPORTED_STATISTIC' && f.severity === 'BLOCKED')).toBe(true);
  });

  it('FIXTURE E contradictions surface instead of vanishing', () => {
    const findings = evidence.validateDraftText('Remote work always increases output.', [
      { span: 'Remote work always increases output.', evidenceStatus: 'CONTRADICTED' },
    ]);
    expect(findings.some((f) => f.kind === 'CONTRADICTED_CLAIM' && f.severity === 'BLOCKED')).toBe(true);
  });

  it('FIXTURE F AI unavailable yields AI_UNAVAILABLE with no prose', async () => {
    await expect(generateHook(emptyRegistry, {
      thesis: 'Workflows beat tools.', audience: 'Founders', angle: 'OBSERVATION',
    })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('FIXTURE G 87/100-style score with critical failure is BLOCKED', () => {
    const run = runQualityGates({
      draftBody: 'Workflows beat tools in practice. Map one workflow before buying software, then measure the difference carefully over time.',
      format: 'TEXT_POST',
      planThesis: 'Workflows beat tools in practice.',
      draftThesis: 'Workflows beat tools in practice.',
      bannedWords: [],
      receiptFacts: [],
      boundEvidenceTexts: [],
      evidenceFindings: [{ span: 'Grew 400% overnight.', kind: 'UNSUPPORTED_STATISTIC', severity: 'BLOCKED', message: 'Invented.' }],
      evidenceCoverage: 0.9,
      existingTitles: [],
      cta: null,
    });
    expect(typeof run.overallScore).toBe('number');
    expect(run.finalStatus).toBe('BLOCKED');
  });

  it('FIXTURE H banned word fails the voice gate', () => {
    const run = runQualityGates({
      draftBody: 'We must leverage synergies to scale growth efficiently across the entire organization starting today.',
      format: 'TEXT_POST',
      bannedWords: ['leverage'],
      boundEvidenceTexts: [],
      evidenceFindings: [],
      evidenceCoverage: 0,
      existingTitles: [],
      cta: null,
    });
    expect(run.results.find((r) => r.gate === 'voice_compliance')?.status).toBe('BLOCKED');
  });
});
