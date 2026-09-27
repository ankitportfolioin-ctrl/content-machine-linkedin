import { describe, it, expect, vi } from 'vitest';
import { validateHook, generateHook } from '../hook';
import { ContentError } from '../errors';

const THESIS = 'Most teams do not need another AI tool. They need a better workflow for the tools they already have.';

function emptyRegistry() {
  return { getAvailable: vi.fn().mockReturnValue([]) } as never;
}

describe('Hook validation', () => {
  it('accepts a grounded hook', () => {
    const result = validateHook(
      'Your team does not have a tool problem. It has a workflow problem.',
      { thesis: THESIS, evidenceTexts: ['Teams adopt tools without changing workflows.'] }
    );
    expect(result.ok).toBe(true);
  });

  it('rejects generic templates', () => {
    const result = validateHook("In today's fast-paced world, AI is changing everything.", { thesis: THESIS });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/generic template/i);
  });

  it('rejects invented statistics', () => {
    const result = validateHook('73% of teams waste their AI budget every quarter.', {
      thesis: THESIS,
      evidenceTexts: ['Teams adopt tools without changing workflows.'],
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/numbers not present in evidence/i);
  });

  it('accepts statistics present in evidence', () => {
    const result = validateHook('73% of the teams we studied kept their existing stack.', {
      thesis: THESIS,
      evidenceTexts: ['In our study, 73% of teams kept their existing stack.'],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects invented personal achievements', () => {
    const result = validateHook('I scaled three startups to millions with this workflow.', { thesis: THESIS });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/no verified receipt/i);
  });

  it('rejects hooks unfaithful to the thesis', () => {
    const result = validateHook('Ten breakfast recipes for busy founders.', { thesis: THESIS });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/faithful to the thesis/i);
  });
});

describe('Hook generation AI availability', () => {
  it('returns AI_UNAVAILABLE with zero prose on an empty registry', async () => {
    await expect(generateHook(emptyRegistry(), {
      thesis: THESIS,
      audience: 'SaaS founders',
      angle: 'OBSERVATION',
    })).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('validates AI output before returning it', async () => {
    const provider = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ hook: 'x'.repeat(600), strategy: 'claim', groundedIn: THESIS }) } }],
      }),
    };
    const registry = { getAvailable: vi.fn().mockReturnValue([provider]) } as never;
    await expect(generateHook(registry, { thesis: THESIS, audience: 'Founders', angle: 'OBSERVATION' }))
      .rejects.toBeInstanceOf(ContentError);
  });
});
