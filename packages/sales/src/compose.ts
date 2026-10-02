import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry, AIProviderError } from '@growth-operator/ai';
import { z } from 'zod';
import { SalesError } from './errors';
import { OutreachDraftType } from './types';
import { validatePersonalization } from './strategy';

export const OutreachStructureSchema = z.object({
  opening: z.string().min(1).max(2000),
  relevance: z.string().min(1).max(5000),
  evidence: z.string().max(5000).optional(),
  value: z.string().min(1).max(5000),
  cta: z.string().max(1000).optional(),
});

const DRAFT_TYPES: OutreachDraftType[] = ['CONNECTION_NOTE', 'FIRST_MESSAGE', 'FOLLOW_UP', 'VALUE_MESSAGE', 'CONTENT_BASED_OUTREACH'];

const TYPE_GUIDANCE: Record<OutreachDraftType, string> = {
  CONNECTION_NOTE: 'A short connection note under 600 characters: who you are, one evidence-grounded reason to connect, no pitch.',
  FIRST_MESSAGE: 'A first message with opening, relevance, value, and a low-pressure CTA. Plain prose only.',
  FOLLOW_UP: 'A brief follow-up referencing the prior approved touchpoint. No manufactured urgency.',
  VALUE_MESSAGE: 'A value-first message sharing one concrete, evidence-backed insight. No pitch until the CTA.',
  CONTENT_BASED_OUTREACH: 'A message referencing the approved content piece and why it is relevant to this prospect. Never claim the prospect saw or engaged with it.',
};

/**
 * Generates outreach drafts from APPROVED strategies only. AI prose with
 * Zod-validated structure; empty registry yields AI_UNAVAILABLE, zero prose.
 */
export class OutreachComposer {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async composeFromStrategy(
    workspaceId: string,
    strategyId: string,
    draftType: OutreachDraftType,
    authorId: string
  ) {
    const strategy = await this.prisma.outreachStrategy.findFirst({ where: { id: strategyId, workspaceId } });
    if (!strategy) {
      throw new SalesError('INSUFFICIENT_DATA', 'Outreach strategy not found in this workspace.');
    }
    if (strategy.status !== 'APPROVED') {
      throw new SalesError('EVIDENCE_MISSING', `Drafts may only be composed from APPROVED strategies (current: ${strategy.status}).`);
    }
    if (!DRAFT_TYPES.includes(draftType)) {
      throw new SalesError('EVIDENCE_MISSING', `Unknown draft type: ${draftType}.`);
    }
    // AI availability is determined by the provider registry actually
    // containing a usable provider — never by NODE_ENV. An empty registry
    // yields honest AI_UNAVAILABLE with zero output.
    const available = this.aiRegistry.getAvailable();
    if (available.length === 0) {
      throw new SalesError('AI_UNAVAILABLE', 'Cannot compose an outreach draft without an AI provider.');
    }

    const evidence = (strategy.relevantEvidence as Array<{ statement: string; sourceRef?: string }>) ?? [];
    const personalizationCheck = validatePersonalization(
      [strategy.reasonForContact, strategy.audience],
      evidence.map((e) => `${e.statement} ${e.sourceRef ?? ''}`)
    );
    if (!personalizationCheck.ok) {
      throw new SalesError('EVIDENCE_MISSING', (personalizationCheck as { reason: string }).reason);
    }

    const provider = available[0]!;
    const levelNote = strategy.personalizationLevel === 'NONE'
      ? 'Keep personalization minimal and generic; do not reference prospect specifics.'
      : `Personalization level ${strategy.personalizationLevel}. Every personalized statement must come from the evidence below.`;
    let response;
    let content: string | undefined;
    try {
      response = await provider.chatCompletion({
        messages: [
          { role: 'system', content: `You draft B2B outreach. Rules: 1. Use ONLY the strategy, reason for contact, and evidence below. 2. Never invent funding, hiring, pain, intent, achievements, social activity, revenue, size, or personal details. 3. No spam templates, no fake social proof, no invented statistics, no guaranteed outcomes, no manipulative urgency. 4. No markup like [HOOK] or [CTA]; plain prose. 5. Return only valid JSON: { opening, relevance, evidence?, value, cta?, body }.` },
          { role: 'user', content: `Type: ${draftType}. ${TYPE_GUIDANCE[draftType]}\n\nObjective: ${strategy.objective}\nAudience: ${strategy.audience}\nRelationship stage: ${strategy.relationshipStage}\nAngle: ${strategy.angle}\nReason for contact: ${strategy.reasonForContact}\n${levelNote}\n\nEvidence:\n${evidence.map((e) => `- ${e.statement}${e.sourceRef ? ` (ref: ${e.sourceRef})` : ''}`).join('\n') || '(none — stay generic)'}\n\nMust NOT claim:\n${(strategy.mustNotClaim as string[]).map((m: string) => `- ${m}`).join('\n') || '(none)'}\n${(strategy.riskFlags as string[]).length > 0 ? `\nRisk flags:\n${(strategy.riskFlags as string[]).map((r: string) => `- ${r}`).join('\n')}` : ''}\n${strategy.ctaType ? `\nCTA type: ${strategy.ctaType}` : ''}` },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.4,
        maxTokens: 1500,
        responseFormat: { type: 'json_object' },
      });
      content = response.choices[0]?.message?.content;
      if (!content) {
        throw new SalesError('AI_UNAVAILABLE', 'AI returned an empty draft response.');
      }
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw new SalesError('AI_UNAVAILABLE', 'Cannot compose an outreach draft without an AI provider.');
      }
      if (error instanceof SalesError) throw error;
      // Any other error (network, timeout, JSON parse, etc.) = provider unavailable
      throw new SalesError('AI_UNAVAILABLE', 'Cannot compose an outreach draft without an AI provider.');
    }

    let parsed;
    try {
      parsed = z.object({
        opening: z.string().min(1).max(2000),
        relevance: z.string().min(1).max(5000),
        evidence: z.string().max(5000).optional(),
        value: z.string().min(1).max(5000),
        cta: z.string().max(1000).optional(),
        body: z.string().min(10).max(10000),
      }).safeParse(JSON.parse(content!));
    } catch {
      throw new SalesError('AI_UNAVAILABLE', 'AI returned an invalid response format.');
    }
    if (!parsed.success) {
      throw new SalesError('EVIDENCE_MISSING', `AI draft output validation failed: ${parsed.error.message}`);
    }

    const structureCheck = OutreachStructureSchema.safeParse({
      opening: parsed.data.opening,
      relevance: parsed.data.relevance,
      evidence: parsed.data.evidence,
      value: parsed.data.value,
      cta: parsed.data.cta,
    });
    if (!structureCheck.success) {
      throw new SalesError('EVIDENCE_MISSING', `Composed draft failed structure validation: ${structureCheck.error.message}`);
    }

    return this.prisma.outreachDraft.create({
      data: {
        workspaceId,
        strategyId: strategy.id,
        leadId: strategy.leadId,
        draftType,
        opening: parsed.data.opening,
        relevance: parsed.data.relevance,
        evidence: parsed.data.evidence ?? null,
        value: parsed.data.value,
        cta: parsed.data.cta ?? null,
        body: parsed.data.body,
        structure: structureCheck.data as object,
        version: 1,
        createdBy: authorId,
      },
    });
  }
}
