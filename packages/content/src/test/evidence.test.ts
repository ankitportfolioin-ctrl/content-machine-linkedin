import { describe, it, expect } from 'vitest';
import { EvidenceService } from '../evidence';

const service = new EvidenceService({} as never);

describe('Claim validation', () => {
  it('blocks invented statistics', () => {
    const findings = service.validateDraftText(
      'Our customers report a 73% improvement within one quarter of adoption.',
      [{ span: 'Our customers report a 73% improvement within one quarter of adoption.', evidenceStatus: 'REVIEW_REQUIRED' }]
    );
    expect(findings.some((f) => f.kind === 'UNSUPPORTED_STATISTIC' && f.severity === 'BLOCKED')).toBe(true);
  });

  it('accepts statistics bound to STATISTIC claims', () => {
    const findings = service.validateDraftText(
      'In the study, 73% of teams kept their stack.',
      [{
        span: 'In the study, 73% of teams kept their stack.',
        evidenceStatus: 'SUPPORTED',
        claimType: 'STATISTIC',
        evidenceText: 'Study result: 73% of teams kept their stack.',
      }],
    );
    expect(findings.filter((f) => f.kind === 'UNSUPPORTED_STATISTIC')).toHaveLength(0);
  });

  it('blocks evidence overreach (may → guarantees)', () => {
    const findings = service.validateDraftText('This workflow guarantees improvement for every team.', [
      {
        span: 'This workflow guarantees improvement for every team.',
        evidenceStatus: 'SUPPORTED',
        evidenceText: 'The workflow may improve outcomes for some teams.',
      },
    ]);
    expect(findings.some((f) => f.kind === 'OVERREACH' && f.severity === 'BLOCKED')).toBe(true);
  });

  it('flags unsupported causal claims for review', () => {
    const findings = service.validateDraftText(
      'Tool sprawl causes engineering burnout across the industry.',
      [{ span: 'Tool sprawl causes engineering burnout across the industry.', evidenceStatus: 'REVIEW_REQUIRED' }]
    );
    expect(findings.some((f) => f.kind === 'UNSUPPORTED_CAUSAL' && f.severity === 'REVIEW_REQUIRED')).toBe(true);
  });

  it('blocks contradicted claims', () => {
    const findings = service.validateDraftText('Remote work always increases output.', [
      { span: 'Remote work always increases output.', evidenceStatus: 'CONTRADICTED' },
    ]);
    expect(findings.some((f) => f.kind === 'CONTRADICTED_CLAIM' && f.severity === 'BLOCKED')).toBe(true);
  });

  it('computes evidence coverage', () => {
    expect(service.evidenceCoverage([])).toBe(0);
    expect(service.evidenceCoverage([
      { evidenceStatus: 'SUPPORTED' },
      { evidenceStatus: 'REVIEW_REQUIRED' },
    ])).toBe(0.5);
  });
});
