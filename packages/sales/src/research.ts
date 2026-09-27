import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';
import { SalesError } from './errors';

export const ResearchSynthesisSchema = z.object({
  personSummary: z.string().max(3000),
  companySummary: z.string().max(3000),
  facts: z.array(z.object({
    statement: z.string().min(1).max(2000),
    sourceRef: z.string().max(500),
    confidence: z.number().min(0).max(1),
  })).max(40),
  unknowns: z.array(z.string().min(1).max(1000)).max(30).default([]),
  confidence: z.number().min(0).max(1),
});

export type ResearchSynthesis = z.infer<typeof ResearchSynthesisSchema>;

export interface ResearchFactInput {
  statement: string;
  sourceRef: string;
  confidence: number;
}

export class ProspectResearchService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async createResearch(input: {
    workspaceId: string;
    leadId?: string;
    name?: string;
    title?: string;
    company?: string;
    companyDomain?: string;
    location?: string;
    publicSourceUrls?: string[];
    facts?: ResearchFactInput[];
    unknowns?: string[];
    confidence?: number;
  }) {
    if (input.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: input.leadId, workspaceId: input.workspaceId } });
      if (!lead) {
        throw new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.');
      }
    }
    for (const fact of input.facts ?? []) {
      if (!fact.statement?.trim() || !fact.sourceRef?.trim()) {
        throw new SalesError('EVIDENCE_MISSING', 'Research facts require both a statement and a source reference.');
      }
    }
    return this.prisma.prospectResearch.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId ?? null,
        name: input.name ?? null,
        title: input.title ?? null,
        company: input.company ?? null,
        companyDomain: input.companyDomain ?? null,
        location: input.location ?? null,
        publicSourceUrls: input.publicSourceUrls ?? [],
        facts: (input.facts ?? []) as object,
        unknowns: input.unknowns ?? [],
        confidence: input.confidence ?? null,
      },
    });
  }

  /**
   * AI synthesis over caller-supplied material only. Empty registry yields
   * AI_UNAVAILABLE with zero output — synthesis is never faked.
   */
  async synthesizeResearch(input: {
    workspaceId: string;
    researchId: string;
    material: string[];
  }): Promise<ResearchSynthesis> {
    const research = await this.prisma.prospectResearch.findFirst({
      where: { id: input.researchId, workspaceId: input.workspaceId },
    });
    if (!research) {
      throw new SalesError('INSUFFICIENT_DATA', 'Prospect research not found in this workspace.');
    }
    const available = this.aiRegistry.getAvailable();
    if (available.length === 0) {
      throw new SalesError('AI_UNAVAILABLE', 'Cannot synthesize research without an AI provider.');
    }
    const provider = available[0]!;
    const response = await provider.chatCompletion({
      messages: [
        { role: 'system', content: 'You synthesize prospect research. Rules: 1. Use ONLY the supplied material. 2. Never infer private information or invent personal details. 3. Every fact needs a sourceRef from the material. 4. List everything unverifiable under unknowns. 5. Return only valid JSON matching the schema.' },
        { role: 'user', content: `Material:\n${input.material.map((m) => `- ${m.slice(0, 800)}`).join('\n')}\n\nReturn JSON: { personSummary, companySummary, facts[{statement, sourceRef, confidence}], unknowns[], confidence }.` },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 2500,
      responseFormat: { type: 'json_object' },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new SalesError('AI_UNAVAILABLE', 'AI returned an empty research response.');
    }
    const parsed = ResearchSynthesisSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      throw new SalesError('EVIDENCE_MISSING', `AI research output validation failed: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}
