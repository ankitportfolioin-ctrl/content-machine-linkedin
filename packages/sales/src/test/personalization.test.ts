import { describe, it, expect } from 'vitest';
import { validatePersonalization } from '../strategy';

describe('Personalization grounding', () => {
  it('rejects funding claims without funding evidence', () => {
    const result = validatePersonalization(
      ['Congrats on your recent funding round!'],
      ['The company posted about a product launch.']
    );
    expect(result.ok).toBe(false);
  });

  it('rejects hiring claims without hiring evidence', () => {
    const result = validatePersonalization(
      ['I saw you are hiring engineers.'],
      ['The company is in SaaS.']
    );
    expect(result.ok).toBe(false);
  });

  it('rejects invented struggle claims', () => {
    const result = validatePersonalization(
      ["I know you're struggling with pipeline."],
      ['General industry report.']
    );
    expect(result.ok).toBe(false);
  });

  it('accepts grounded personalization', () => {
    const result = validatePersonalization(
      ['Your post on scaling support teams resonated.'],
      ['Prospect post: scaling support teams from 5 to 50.']
    );
    expect(result.ok).toBe(true);
  });
});
