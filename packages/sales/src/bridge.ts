import { PrismaClient } from '@prisma/client';
import { SalesError } from './errors';

export interface ContentSignalInput {
  signalType: string;
  conversationIds: string[];
  evidence: string;
  recommendedAngle?: string;
  reasoning?: string;
}

const ABSOLUTE_QUANTIFIERS = [/most prospects/i, /all prospects/i, /everyone/i, /always/i, /never/i];

/**
 * Content↔sales bridge. Signals aggregate MEASURED conversation evidence for
 * the Content Machine to consume as an input. Frequency must be measured from
 * the supplied conversation IDs — never asserted ("most prospects" requires
 * a real denominator, which this service does not invent).
 */
export class SalesBridgeService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createSignal(workspaceId: string, input: ContentSignalInput) {
    if (!input.evidence?.trim()) {
      throw new SalesError('EVIDENCE_MISSING', 'Sales content signals require evidence text.');
    }
    if (input.conversationIds.length > 0) {
      const count = await this.prisma.conversation.count({
        where: { id: { in: input.conversationIds }, workspaceId },
      });
      if (count !== input.conversationIds.length) {
        throw new SalesError('EVIDENCE_MISSING', 'One or more source conversations were not found in this workspace.');
      }
    }
    for (const pattern of ABSOLUTE_QUANTIFIERS) {
      if (pattern.test(`${input.evidence} ${input.reasoning ?? ''}`) && input.conversationIds.length < 2) {
        throw new SalesError(
          'EVIDENCE_MISSING',
          'Absolute quantifiers ("most prospects", "always", ...) require measured frequency across multiple conversations. Supply conversation IDs or soften the wording.'
        );
      }
    }
    return this.prisma.salesContentSignal.create({
      data: {
        workspaceId,
        signalType: input.signalType,
        sourceConversationIds: input.conversationIds,
        evidence: input.evidence,
        frequency: input.conversationIds.length > 0 ? input.conversationIds.length : null,
        recommendedAngle: input.recommendedAngle ?? null,
        reasoning: input.reasoning ?? null,
      },
    });
  }

  async toContentInput(workspaceId: string, signalId: string): Promise<{
    signalType: string;
    evidence: string;
    frequency: number | null;
    recommendedAngle: string | null;
    reasoning: string | null;
    conversationCount: number;
  }> {
    const signal = await this.prisma.salesContentSignal.findFirst({ where: { id: signalId, workspaceId } });
    if (!signal) {
      throw new SalesError('EVIDENCE_MISSING', 'Sales content signal not found in this workspace.');
    }
    return {
      signalType: signal.signalType,
      evidence: signal.evidence,
      frequency: signal.frequency,
      recommendedAngle: signal.recommendedAngle,
      reasoning: signal.reasoning,
      conversationCount: signal.sourceConversationIds.length,
    };
  }
}
