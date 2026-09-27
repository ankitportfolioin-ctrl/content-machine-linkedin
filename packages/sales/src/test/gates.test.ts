import { describe, it, expect } from 'vitest';
import { runOutreachGates } from '../gates';

const BASE = {
  body: 'Hi Jane, your post on scaling support teams resonated. Teams that map one workflow before buying tools tend to adopt faster. Worth a brief conversation about your onboarding flow?',
  qualificationStatus: 'POSSIBLE_FIT',
  evidenceRefs: ['Prospect post: scaling support teams from 5 to 50.'],
  personalizationStatements: ['Your post on scaling support teams resonated.'],
  cta: 'Open to a brief conversation?',
};

describe('Outreach quality gates', () => {
  it('passes a grounded draft', () => {
    const run = runOutreachGates(BASE);
    expect(run.results).toHaveLength(15);
    expect(run.finalStatus).toBe('PASS');
  });

  it('hard gate overrides score: 88/100-style pass with fabricated detail is BLOCKED', () => {
    const clean = runOutreachGates(BASE);
    expect(clean.overallScore).toBeGreaterThan(0.8);

    const blocked = runOutreachGates({
      ...BASE,
      body: 'Hi Jane, congrats on your recent funding round! Our platform guarantees 10x pipeline overnight. Act now!',
      personalizationStatements: ['congrats on your recent funding round'],
      evidenceRefs: [],
    });
    expect(typeof blocked.overallScore).toBe('number');
    expect(blocked.finalStatus).toBe('BLOCKED');
    expect(blocked.results.find((r) => r.gate === 'spamminess')?.status).toBe('BLOCKED');
  });

  it('blocks unqualified prospects', () => {
    const run = runOutreachGates({ ...BASE, qualificationStatus: 'UNQUALIFIED' });
    expect(run.results.find((r) => r.gate === 'prospect_fit')?.status).toBe('BLOCKED');
    expect(run.finalStatus).toBe('BLOCKED');
  });

  it('blocks unsupported numbers', () => {
    const run = runOutreachGates({ ...BASE, body: 'Customers see 73% improvement in one quarter.', evidenceRefs: [] });
    expect(run.results.find((r) => r.gate === 'unsupported_claims')?.status).toBe('BLOCKED');
  });

  it('blocks internal markup and placeholders', () => {
    const markup = runOutreachGates({ ...BASE, body: 'Hi Jane. [HOOK] Let us talk.' });
    expect(markup.results.find((r) => r.gate === 'internal_markup')?.status).toBe('BLOCKED');
    const placeholder = runOutreachGates({ ...BASE, body: 'Hi Jane. TODO: add personalization here properly for them.' });
    expect(placeholder.results.find((r) => r.gate === 'placeholder_detection')?.status).toBe('BLOCKED');
  });

  it('blocks private personal data', () => {
    const run = runOutreachGates({ ...BASE, body: 'Hi Jane. I found your home address and personal phone, let us talk.' });
    expect(run.results.find((r) => r.gate === 'privacy_boundary')?.status).toBe('BLOCKED');
  });

  it('flags duplicates without blocking honest first sends', () => {
    const run = runOutreachGates({ ...BASE, existingBodies: [BASE.body] });
    expect(run.results.find((r) => r.gate === 'duplicate_message')?.status).toBe('REVIEW_REQUIRED');
  });
});
