import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SignalService, intentStatusForSignals } from '../signals';

const mockPrisma = {
  lead: { findFirst: vi.fn() },
  prospectSignal: { create: vi.fn(), findMany: vi.fn() },
} as unknown as PrismaClient;

describe('Buying signals', () => {
  it('computes intent status without manufacturing urgency', () => {
    expect(intentStatusForSignals(0, false)).toBe('NO_SIGNAL');
    expect(intentStatusForSignals(1, false)).toBe('WEAK_SIGNAL');
    expect(intentStatusForSignals(1, true)).toBe('RELEVANT_SIGNAL');
    expect(intentStatusForSignals(3, true)).toBe('MULTIPLE_SIGNALS');
  });

  it('refuses to record signals without public evidence', async () => {
    const service = new SignalService(mockPrisma);
    await expect(service.recordSignal('workspace-1', {
      signalType: 'HIRING',
      source: 'x',
      confidence: 0.7,
      evidence: '',
      interpretation: 'Hiring.',
    })).rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('rejects unknown signal types', async () => {
    const service = new SignalService(mockPrisma);
    await expect(service.recordSignal('workspace-1', {
      signalType: 'VIBES',
      source: 'x',
      confidence: 0.7,
      evidence: 'Something.',
      interpretation: 'Something.',
    })).rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });
});
