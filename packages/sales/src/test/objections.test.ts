import { describe, it, expect } from 'vitest';
import { aggregateObjectionPatterns } from '../objections';

function stubPrisma(rows: Array<{ id: string; conversationId: string; evidence: string | null }>) {
  return {
    conversationClassificationResult: {
      findMany: async () => rows,
    },
  } as never;
}

const rows = [
  { id: 'c1', conversationId: 'conv-a', evidence: 'Objection language detected: "too expensive for our budget".' },
  { id: 'c2', conversationId: 'conv-b', evidence: 'Objection language detected: "Too expensive for our budget!"' },
  { id: 'c3', conversationId: 'conv-c', evidence: 'Objection language detected: "we have no time this quarter".' },
  { id: 'c4', conversationId: 'conv-d', evidence: null },
];

describe('Objection aggregation', () => {
  it('groups repeated objections into patterns with provenance', async () => {
    const result = await aggregateObjectionPatterns(stubPrisma(rows), 'ws-1', 2);
    expect(result.totalObjections).toBe(3);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]!.count).toBe(2);
    expect(result.patterns[0]!.conversationIds).toEqual(expect.arrayContaining(['conv-a', 'conv-b']));
    expect(result.patterns[0]!.sampleEvidence.length).toBeGreaterThan(0);
    expect(result.rawEvidence).toHaveLength(3);
  });

  it('keeps sub-threshold objections as raw evidence, never as patterns', async () => {
    const result = await aggregateObjectionPatterns(stubPrisma(rows), 'ws-1', 3);
    expect(result.patterns).toHaveLength(0);
    expect(result.totalObjections).toBe(3);
    expect(result.rawEvidence.some((r) => r.conversationId === 'conv-c')).toBe(true);
  });

  it('returns an explicit empty state when nothing is recorded', async () => {
    const result = await aggregateObjectionPatterns(stubPrisma([]), 'ws-1', 2);
    expect(result.patterns).toEqual([]);
    expect(result.rawEvidence).toEqual([]);
    expect(result.totalObjections).toBe(0);
  });
});
