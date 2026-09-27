import { PrismaClient } from '@prisma/client';
import { SalesError } from './errors';
import { IntentStatus } from './types';

export const SIGNAL_TYPES = [
  'HIRING',
  'PRODUCT_LAUNCH',
  'TECH_MIGRATION',
  'EXPANSION',
  'OPERATIONAL_CHANGE',
  'ANNOUNCEMENT',
  'PROBLEM_CONTENT',
  'COMPANY_INITIATIVE',
] as const;

export interface SignalInput {
  leadId?: string;
  signalType: string;
  source: string;
  observedAt?: Date;
  confidence: number;
  evidence: string;
  interpretation: string;
}

export function intentStatusForSignals(count: number, hasRelevant: boolean): IntentStatus {
  if (count === 0) return 'NO_SIGNAL';
  if (count === 1) return hasRelevant ? 'RELEVANT_SIGNAL' : 'WEAK_SIGNAL';
  return 'MULTIPLE_SIGNALS';
}

export class SignalService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async recordSignal(workspaceId: string, input: SignalInput) {
    if (!(SIGNAL_TYPES as readonly string[]).includes(input.signalType)) {
      throw new SalesError('EVIDENCE_MISSING', `Unknown signal type: ${input.signalType}.`);
    }
    if (!input.source?.trim() || !input.evidence?.trim() || !input.interpretation?.trim()) {
      throw new SalesError('EVIDENCE_MISSING', 'Signals require source, evidence, and interpretation. Signals without public evidence are not recorded.');
    }
    if (input.confidence < 0 || input.confidence > 1) {
      throw new SalesError('EVIDENCE_MISSING', 'Signal confidence must be between 0 and 1.');
    }
    if (input.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: input.leadId, workspaceId } });
      if (!lead) {
        throw new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.');
      }
    }
    return this.prisma.prospectSignal.create({
      data: {
        workspaceId,
        leadId: input.leadId ?? null,
        signalType: input.signalType as never,
        source: input.source,
        observedAt: input.observedAt ?? null,
        confidence: input.confidence,
        evidence: input.evidence,
        interpretation: input.interpretation,
      },
    });
  }

  async intentStatus(workspaceId: string, leadId: string): Promise<{ status: IntentStatus; signals: unknown[] }> {
    const signals = await this.prisma.prospectSignal.findMany({ where: { workspaceId, leadId }, orderBy: { createdAt: 'desc' } });
    const relevant = signals.filter((s: { confidence: number }) => s.confidence >= 0.6).length > 0;
    return { status: intentStatusForSignals(signals.length, relevant), signals };
  }
}
