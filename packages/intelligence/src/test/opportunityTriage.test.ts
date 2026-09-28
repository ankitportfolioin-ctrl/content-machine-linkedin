import { describe, it, expect } from 'vitest';
import { validateOpportunityTriage } from '../contentOpportunity';

describe('validateOpportunityTriage', () => {
  it('accepts NEW → REVIEWED', () => {
    expect(validateOpportunityTriage('NEW', 'REVIEWED')).toEqual({ valid: true, reason: null });
  });

  it('accepts NEW → DISMISSED', () => {
    expect(validateOpportunityTriage('NEW', 'DISMISSED')).toEqual({ valid: true, reason: null });
  });

  it('rejects REVIEWED → REVIEWED', () => {
    const verdict = validateOpportunityTriage('REVIEWED', 'REVIEWED');
    expect(verdict.valid).toBe(false);
    expect(typeof verdict.reason).toBe('string');
  });

  it('rejects REVIEWED → DISMISSED', () => {
    expect(validateOpportunityTriage('REVIEWED', 'DISMISSED').valid).toBe(false);
  });

  it('rejects REVIEWED → NEW', () => {
    expect(validateOpportunityTriage('REVIEWED', 'NEW').valid).toBe(false);
  });

  it('rejects DISMISSED → DISMISSED', () => {
    expect(validateOpportunityTriage('DISMISSED', 'DISMISSED').valid).toBe(false);
  });

  it('rejects DISMISSED → REVIEWED', () => {
    expect(validateOpportunityTriage('DISMISSED', 'REVIEWED').valid).toBe(false);
  });

  it('rejects DISMISSED → NEW', () => {
    expect(validateOpportunityTriage('DISMISSED', 'NEW').valid).toBe(false);
  });

  it('rejects CONVERTED → anything', () => {
    for (const to of ['NEW', 'REVIEWED', 'DISMISSED', 'CONVERTED']) {
      expect(validateOpportunityTriage('CONVERTED', to).valid).toBe(false);
    }
  });

  it('rejects unknown destinations and empty input', () => {
    for (const to of ['ARCHIVED', 'DELETED', '', 'new']) {
      expect(validateOpportunityTriage('NEW', to).valid).toBe(false);
    }
  });

  it('is deterministic', () => {
    expect(validateOpportunityTriage('NEW', 'REVIEWED')).toEqual(validateOpportunityTriage('NEW', 'REVIEWED'));
  });
});
