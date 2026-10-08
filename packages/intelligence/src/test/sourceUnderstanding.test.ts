import { describe, it, expect } from 'vitest';
import type { AIProviderRegistry } from '@growth-operator/ai';
import type { ChatCompletionResponse } from '@growth-operator/ai';
import { SourceUnderstandingService } from '../sourceUnderstanding';

/**
 * G1 regression: `contentPattern` is an optional decoration (the prompt
 * permits `null`). A failure confined to it must not discard valid core
 * fields; core-field failures must still reject the whole understanding.
 */

function stubRegistryAI(cannedContent: string): AIProviderRegistry {
  const provider = {
    type: 'openrouter',
    isAvailable: () => true,
    getModels: () => ['gpt-4o-mini'],
    chatCompletion: async () =>
      ({
        choices: [{ message: { content: cannedContent } }],
      }) as unknown as ChatCompletionResponse,
  };
  return {
    getAvailable: () => [provider],
    get: () => provider,
  } as unknown as AIProviderRegistry;
}

function coreUnderstanding(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    thesis: 'React 19.3 ships View Transitions and faster Server Components.',
    mainProblem: 'Keeping up with React release cadence and migration cost.',
    observations: ['Release notes list new APIs and bug fixes.'],
    claims: [
      {
        text: 'React 19.3 adds ViewTransition APIs.',
        type: 'FACT',
        evidence: 'Adds <ViewTransition /> and addTransitionType APIs',
        confidence: 0.9,
      },
    ],
    evidence: ['Adds <ViewTransition /> and addTransitionType APIs'],
    implications: ['Teams can adopt view transitions incrementally.'],
    uncertainties: ['Long-term browser support is unclear.'],
    contradictions: [],
    audienceRelevance: ['Relevant to frontend developers on React.'],
    possibleAngles: ['What React 19.3 changes for your upgrade plan.'],
    ...extra,
  };
}

const VALID_PATTERN = {
  format: { primary: 'NEWS_ANALYSIS', confidence: 0.8 },
  hook: { type: 'NEWS', confidence: 0.7 },
  structure: { confidence: 0.6 },
  metadata: { extractionMethod: 'ai', extractedAt: '2026-10-08T16:00:00.000Z' },
};

describe('SourceUnderstandingService (G1 optional contentPattern robustness)', () => {
  it('TEST 1 accepts contentPattern:null and keeps core fields', async () => {
    const service = new SourceUnderstandingService(
      stubRegistryAI(JSON.stringify(coreUnderstanding({ contentPattern: null }))),
    );
    const result = await service.understand('content', 'title', 'https://example.com/r');
    expect(result.understanding).not.toBeNull();
    expect(result.understanding?.thesis).toContain('React 19.3');
    expect(result.understanding?.claims).toHaveLength(1);
    expect(result.understanding?.contentPattern).toBeUndefined();
    expect(result.provider).toBe('openrouter');
  });

  it('TEST 2 preserves core understanding when contentPattern metadata is malformed', async () => {
    const service = new SourceUnderstandingService(
      stubRegistryAI(
        JSON.stringify(
          coreUnderstanding({
            contentPattern: {
              format: { primary: 'NEWS_ANALYSIS', confidence: 0.8 },
              hook: { type: 'NEWS', confidence: 0.7 },
              structure: { confidence: 0.6 },
              metadata: { extractionMethod: 'ai', extractedAt: 'not-a-datetime' },
            },
          }),
        ),
      ),
    );
    const result = await service.understand('content', 'title', 'https://example.com/r');
    expect(result.understanding).not.toBeNull();
    expect(result.understanding?.thesis).toContain('React 19.3');
    expect(result.understanding?.claims).toHaveLength(1);
    expect(result.understanding?.contentPattern).toBeUndefined();
  });

  it('TEST 3 still rejects a malformed required core field', async () => {
    const broken = coreUnderstanding();
    delete broken.thesis;
    const service = new SourceUnderstandingService(
      stubRegistryAI(JSON.stringify(broken)),
    );
    const result = await service.understand('content', 'title', 'https://example.com/r');
    expect(result.understanding).toBeNull();
    expect(result.error ?? '').toMatch(/validation failed/i);
  });

  it('TEST 5 leaves fully valid output (including pattern) unchanged', async () => {
    const service = new SourceUnderstandingService(
      stubRegistryAI(JSON.stringify(coreUnderstanding({ contentPattern: VALID_PATTERN }))),
    );
    const result = await service.understand('content', 'title', 'https://example.com/r');
    expect(result.understanding).not.toBeNull();
    expect(result.understanding?.contentPattern?.format.primary).toBe('NEWS_ANALYSIS');
    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('gpt-4o-mini');
  });
});
