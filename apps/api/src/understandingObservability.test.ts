import { describe, it, expect } from 'vitest';
import type { AIProviderRegistry, ChatCompletionResponse } from '@growth-operator/ai';
import { SourceUnderstandingService } from '@growth-operator/intelligence';
import { buildUnderstandingSkipNote } from './worker/stages';

/**
 * TEST 4 (G2): a SourceUnderstanding validation failure must be observable —
 * the skip note carries kind + document/source ids + concise reason, and the
 * note contract is locked so operators (and runStage.error readers) can rely
 * on it. No secrets ever flow through this path: only ids, the failure kind,
 * the provider *type*, and the validation message are interpolated.
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

describe('G2 understanding-failure observability', () => {
  it('records a validation failure with kind, ids, and reason', async () => {
    const broken = JSON.stringify({
      // thesis (required) deliberately absent → core validation failure
      mainProblem: 'A problem.',
      observations: [],
      claims: [],
      evidence: [],
      implications: [],
      uncertainties: [],
      contradictions: [],
      audienceRelevance: [],
      possibleAngles: [],
    });
    const service = new SourceUnderstandingService(stubRegistryAI(broken));
    const result = await service.understand(
      'some content',
      'Some title',
      'https://example.com/article',
    );

    expect(result.understanding).toBeNull();
    expect(result.aiAvailable).toBe(true);
    expect(result.error ?? '').toMatch(/validation failed/i);

    const note = buildUnderstandingSkipNote({
      kind: 'VALIDATION_ERROR',
      documentId: 'doc-123',
      sourceId: 'src-456',
      reason: result.error ?? '',
      provider: 'openrouter',
    });

    expect(note).toContain('VALIDATION_ERROR');
    expect(note).toContain('document=doc-123');
    expect(note).toContain('source=src-456');
    expect(note).toContain('provider=openrouter');
    expect(note).toContain('validation failed');
  });

  it('keeps the four skip kinds distinguishable with a locked format', () => {
    expect(
      buildUnderstandingSkipNote({
        kind: 'AI_UNAVAILABLE',
        documentId: 'd1',
        sourceId: 's1',
        reason: 'AI_UNAVAILABLE: No AI providers configured or available',
      }),
    ).toBe('AI_UNAVAILABLE document=d1 source=s1: AI_UNAVAILABLE: No AI providers configured or available');

    expect(
      buildUnderstandingSkipNote({
        kind: 'UNDERSTANDING_CALL_FAILED',
        documentId: 'd2',
        sourceId: 's2',
        reason: 'fetch failed',
        provider: 'openrouter',
      }),
    ).toBe('UNDERSTANDING_CALL_FAILED document=d2 source=s2 provider=openrouter: fetch failed');

    expect(
      buildUnderstandingSkipNote({
        kind: 'UNDERSTANDING_FAILED',
        documentId: 'd3',
        sourceId: 's3',
        reason: 'Understanding failed: boom',
      }),
    ).toBe('UNDERSTANDING_FAILED document=d3 source=s3: Understanding failed: boom');
  });

  it('truncates long reasons so notes stay operationally concise', () => {
    const note = buildUnderstandingSkipNote({
      kind: 'VALIDATION_ERROR',
      documentId: 'd4',
      sourceId: 's4',
      reason: `x`.repeat(500),
    });
    expect(note.length).toBeLessThan(300);
    expect(note.endsWith('...')).toBe(true);
    expect(note).toContain('document=d4');
  });
});
