import { describe, it, expect } from 'vitest';
import { checkThesisPreservation } from '../thesis';

const ORIGINAL = 'Most people don\'t need another AI tool. They need a better workflow for using the tools they already have.';

describe('Thesis preservation', () => {
  it('accepts exact preservation', () => {
    const result = checkThesisPreservation(ORIGINAL, ORIGINAL);
    expect(result.verdict).toBe('OK');
    expect(result.similarity).toBe(1);
  });

  it('accepts acceptable wording variation', () => {
    const result = checkThesisPreservation(
      ORIGINAL,
      'Most people do not need another AI tool; they need a better workflow for the tools they already use.'
    );
    expect(result.verdict).toBe('OK');
    expect(result.similarity).toBeGreaterThanOrEqual(0.5);
  });

  it('flags major semantic drift for review or blocks it', () => {
    const result = checkThesisPreservation(
      ORIGINAL,
      'The operational framework for scaling AI with predictable repeatability.'
    );
    expect(['REVIEW_REQUIRED', 'BLOCKED']).toContain(result.verdict);
    expect(result.similarity).toBeLessThan(0.5);
  });

  it('blocks unrelated generated content', () => {
    const result = checkThesisPreservation(ORIGINAL, 'Ten productivity hacks for remote teams.');
    expect(result.verdict).toBe('BLOCKED');
  });

  it('blocks empty candidates', () => {
    const result = checkThesisPreservation(ORIGINAL, '   ');
    expect(result.verdict).toBe('BLOCKED');
  });
});
