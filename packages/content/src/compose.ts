import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry, AIProviderError } from '@growth-operator/ai';
import { z } from 'zod';
import { ContentError } from './errors';
import { validateFormatStructure } from './strategy';
import { renderPreview } from './preview';
import { ContentFormatKind } from './types';

const ComposeOutputSchema = z.object({
  body: z.string().min(50).max(50000),
  structure: z.record(z.unknown()),
});

export interface ComposeResult {
  draftId: string;
  body: string;
  structure: unknown;
  preview: string;
}

const FORMAT_PROMPTS: Record<string, string> = {
  TEXT_POST: 'Write a LinkedIn text post with: hook, context, development, takeaway, and an optional CTA. Plain prose only.',
  POST: 'Write a LinkedIn text post with: hook, context, development, takeaway, and an optional CTA. Plain prose only.',
  ARTICLE: 'Write an article with: title, introduction, 2+ sections (heading + body), conclusion. Plain prose only.',
  CAROUSEL: 'Write a carousel as structured slides: title, 2-10 slides (order, type from COVER/CONTEXT/PROBLEM/INSIGHT/FRAMEWORK/EXAMPLE/TRADEOFF/TAKEAWAY/CTA, headline, body, evidenceRefs), caption. First slide must be COVER. Plain text only, no [SLIDE] markup.',
  CHECKLIST: 'Write a practical checklist: title, 3+ items (label + detail), takeaway. Every item must be actionable. Plain text only.',
  FRAMEWORK: 'Write a framework: name, premise, 2+ named steps (name + description), application. Plain text only.',
  CONTRARIAN: 'Write a contrarian piece: prevailingAssumption, opposingThesis, evidence[], interpretation, takeaway. The opposing thesis must be defensible from the evidence. Plain text only.',
};

/**
 * Composes a draft from an APPROVED plan only. Prose is AI-generated, so an
 * empty registry yields AI_UNAVAILABLE with zero output. Structure is
 * Zod-validated per format before anything is persisted.
 */
export class DraftComposer {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  async composeFromPlan(
    workspaceId: string,
    planId: string,
    authorId: string,
    contentIdeaId?: string
  ): Promise<ComposeResult> {
    const plan = await this.prisma.contentPlan.findFirst({ where: { id: planId, workspaceId } });
    if (!plan) {
      throw new ContentError('PLAN_INVALID', 'Content plan not found in this workspace.');
    }
    if (plan.status !== 'APPROVED') {
      throw new ContentError('PLAN_INVALID', `Drafts may only be composed from APPROVED plans (current: ${plan.status}).`);
    }

    const available = this.aiRegistry.getAvailable();
    if (available.length === 0) {
      throw new ContentError('AI_UNAVAILABLE', 'Cannot compose a draft without an AI provider.');
    }

    const format = plan.format as ContentFormatKind;
    const formatPrompt = FORMAT_PROMPTS[format] ?? FORMAT_PROMPTS.TEXT_POST!;
    const keyPoints = (plan.keyPoints as string[]).map((k) => `- ${k}`).join('\n');
    const evidenceMap = (plan.evidenceMap as Array<{ claimRef: string; note?: string }>).map((e) => `- ${e.claimRef}`).join('\n');

    const provider = available[0]!;
    let response;
    try {
      response = await provider.chatCompletion({
        messages: [
          { role: 'system', content: `You compose content from an approved plan. Rules: 1. Use ONLY the plan thesis, key points, and evidence below. 2. Do not invent statistics, experiences, or evidence. 3. Do not emit markup like [SLIDE], [HOOK], [CTA], JSON fences, or generation instructions. 4. Return only valid JSON: { body, structure }.` },
          { role: 'user', content: `Thesis: ${plan.thesis}\nAudience: ${plan.audience}\nObjective: ${plan.objective}\nAngle: ${plan.angle}\nFormat: ${format}\n\nKey points:\n${keyPoints}\n\nEvidence:\n${evidenceMap || '(none)'}\n${plan.contradictionNotes ? `\nKnown contradictions (do not take sides silently):\n${plan.contradictionNotes}` : ''}\n${(plan.mustNotClaim as string[]).length > 0 ? `\nMUST NOT CLAIM:\n${(plan.mustNotClaim as string[]).map((m: string) => `- ${m}`).join('\n')}` : ''}\n${plan.voiceInstructions ? `\nVoice: ${plan.voiceInstructions}` : ''}\n\n${formatPrompt}` },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 4000,
        responseFormat: { type: 'json_object' },
      });
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw new ContentError('AI_UNAVAILABLE', 'Cannot compose a draft without an AI provider.');
      }
      throw error;
    }

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ContentError('AI_UNAVAILABLE', 'AI returned an empty draft response.');
    }
    const parsed = ComposeOutputSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      throw new ContentError('PLAN_INVALID', `AI draft output validation failed: ${parsed.error.message}`);
    }

    const structureCheck = validateFormatStructure(format, parsed.data.structure);
    if (!structureCheck.ok) {
      throw new ContentError('PLAN_INVALID', `Composed draft failed format validation: ${(structureCheck as { reason: string }).reason}`);
    }

    const ideaId = contentIdeaId ?? plan.contentIdeaId;
    if (!ideaId) {
      throw new ContentError('PLAN_INVALID', 'Plan has no content idea; pass contentIdeaId to compose.');
    }
    const siblings = await this.prisma.contentDraft.findMany({
      where: { workspaceId, contentIdeaId: ideaId },
      orderBy: { version: 'desc' },
      take: 1,
    });
    const version = (siblings[0]?.version ?? 0) + 1;

    const draft = await this.prisma.contentDraft.create({
      data: {
        workspaceId,
        contentIdeaId: ideaId,
        planId: plan.id,
        authorId,
        body: parsed.data.body,
        structure: parsed.data.structure as object,
        version,
      },
    });

    const preview = renderPreview({ format, body: draft.body, structure: parsed.data.structure });
    return { draftId: draft.id, body: draft.body, structure: parsed.data.structure, preview };
  }
}
