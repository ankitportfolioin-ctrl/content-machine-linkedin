import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';
import { SalesError } from './errors';

export const BriefSynthesisSchema = z.object({
  possibleRelevance: z.string().max(3000),
  risks: z.array(z.string().min(1).max(1000)).max(10).default([]),
  recommendedApproach: z.enum(['educational', 'conversational', 'problem-led', 'content-led', 'no_outreach']).default('conversational'),
});

export type BriefSynthesis = z.infer<typeof BriefSynthesisSchema>;

const APPROACHES = ['educational', 'conversational', 'problem-led', 'content-led', 'no_outreach'] as const;

export class BriefService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async createBrief(input: {
    workspaceId: string;
    leadId?: string;
    researchId?: string;
    recommendedApproach?: string;
    createdBy?: string;
  }) {
    let lead: { id: string; name: string; headline: string | null; company: string | null; location: string | null } | null = null;
    if (input.leadId) {
      lead = await this.prisma.lead.findFirst({ where: { id: input.leadId, workspaceId: input.workspaceId } });
      if (!lead) {
        throw new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.');
      }
    }
    const research = input.researchId
      ? await this.prisma.prospectResearch.findFirst({ where: { id: input.researchId, workspaceId: input.workspaceId } })
      : await this.prisma.prospectResearch.findFirst({ where: { workspaceId: input.workspaceId, leadId: input.leadId ?? undefined }, orderBy: { updatedAt: 'desc' } });

    const facts = (research?.facts as Array<{ statement: string; sourceRef: string; confidence: number }> | null) ?? [];
    const researchUnknowns = (research?.unknowns as string[] | null) ?? [];
    const unknowns = researchUnknowns.length > 0
      ? researchUnknowns
      : (facts.length === 0 ? ['Any specific claim about this prospect (no verified facts on record)'] : []);
    const signals = await this.prisma.prospectSignal.findMany({ where: { workspaceId: input.workspaceId, leadId: input.leadId ?? undefined }, take: 20 });
    const qualification = input.leadId
      ? await this.prisma.qualificationResult.findUnique({ where: { workspaceId_leadId: { workspaceId: input.workspaceId, leadId: input.leadId } } })
      : null;

    const risks: string[] = [];
    if (facts.length === 0) risks.push('No verified facts; outreach would rely on unverified claims.');
    if ((research?.unknowns as string[] | null ?? []).length > 3) risks.push('Research has extensive unknowns.');
    if (signals.length === 0) risks.push('No public buying signals observed.');

    let approach = input.recommendedApproach ?? 'conversational';
    if (!(APPROACHES as readonly string[]).includes(approach)) {
      throw new SalesError('EVIDENCE_MISSING', `Unknown recommended approach: ${approach}.`);
    }
    if (facts.length === 0 && approach !== 'no_outreach') {
      approach = 'no_outreach';
      risks.push('No verified facts: recommending no outreach until research improves.');
    }

    return this.prisma.prospectBrief.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId ?? null,
        who: {
          name: research?.name ?? lead?.name ?? null,
          title: research?.title ?? lead?.headline ?? null,
          company: research?.company ?? lead?.company ?? null,
        } as object,
        whyFit: qualification ? { status: qualification.status, reasoning: qualification.reasoning } as object : null,
        knownFacts: facts as object,
        unknowns,
        signals: signals.map((s: { id: string; signalType: string; evidence: string; confidence: number }) => ({ id: s.id, type: s.signalType, evidence: s.evidence, confidence: s.confidence })) as object,
        relevance: null,
        risks: risks as object,
        doNotClaim: unknowns.slice(0, 10),
        recommendedApproach: approach,
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async synthesizeBriefContext(
    workspaceId: string,
    briefId: string,
    material: string[]
  ): Promise<BriefSynthesis> {
    const brief = await this.prisma.prospectBrief.findFirst({ where: { id: briefId, workspaceId } });
    if (!brief) {
      throw new SalesError('INSUFFICIENT_DATA', 'Prospect brief not found in this workspace.');
    }
    const available = this.aiRegistry.getAvailable();
    if (available.length === 0) {
      throw new SalesError('AI_UNAVAILABLE', 'Cannot synthesize brief context without an AI provider.');
    }
    const provider = available[0]!;
    const response = await provider.chatCompletion({
      messages: [
        { role: 'system', content: 'You assist B2B outreach preparation. Rules: 1. Use ONLY supplied material. 2. Never invent facts, urgency, or intent ("they want your product" is forbidden). 3. Recommend no_outreach when evidence is insufficient. 4. Return only valid JSON matching the schema.' },
        { role: 'user', content: `Brief material:\n${material.map((m) => `- ${m.slice(0, 600)}`).join('\n')}\n\nReturn JSON: { possibleRelevance, risks[], recommendedApproach }.` },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.2,
      maxTokens: 1500,
      responseFormat: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new SalesError('AI_UNAVAILABLE', 'AI returned an empty brief response.');
    }
    const parsed = BriefSynthesisSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      throw new SalesError('EVIDENCE_MISSING', `AI brief output validation failed: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}
