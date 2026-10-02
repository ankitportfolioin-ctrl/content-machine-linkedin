import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry, AIProviderError } from '@growth-operator/ai';
import { z } from 'zod';
import { ContentError } from './errors';
import { resolveAudience } from './audience';
import {
  OBJECTIVE_INFLUENCE,
  selectNarrative,
  validateAngle,
  assertValidStrategy,
} from './strategy';
import { ContentAngle, ContentFormatKind, ContentNarrative, ContentObjective } from './types';

function extractJsonFromMarkdown(content: string): string {
  const trimmed = content.trim();
  const markdownMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (markdownMatch?.[1]) {
    return markdownMatch[1].trim();
  }
  return trimmed;
}

export const PlanEvidenceMapSchema = z.array(z.object({
  claimRef: z.string().min(1).max(2000),
  sourceClaimId: z.string().uuid().optional(),
  note: z.string().max(2000).optional(),
})).max(50);

export interface PlanGenerateInput {
  workspaceId: string;
  contentIdeaId?: string;
  opportunityId?: string;
  topicId?: string;
  thesis?: string;
  thesisOverride?: string;
  audienceOverride?: string;
  objective?: ContentObjective;
  angle?: ContentAngle;
  format?: ContentFormatKind;
  sourceIds?: string[];
  claimIds?: string[];
  trendSignalIds?: string[];
  claims?: Array<{ id?: string; text: string; type: string; evidence: string; confidence: number }>;
  gaps?: Array<{ type: string; description: string }>;
  contradictions?: Array<{ claim1: string; claim2: string; severity: string }>;
  profile?: { role?: string | null; headline?: string | null; professionalContext?: string | null; industry?: string | null } | null;
  icp?: { id?: string; name?: string | null; description?: string | null; criteria?: unknown; targetRoles?: string[]; industries?: string[]; companySize?: string | null; problems?: string | null; exclusions?: string | null } | null;
  createdBy?: string;
}

export class ContentPlanService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
  }

  /**
   * Generates a full content plan. The plan is a structured artifact — but its
   * strategic prose (key points, hook direction, reasoning) is AI-composed, so
   * an empty provider registry yields AI_UNAVAILABLE with zero output.
   */
  async generatePlan(input: PlanGenerateInput) {
    const available = this.aiRegistry.getAvailable();
    if (available.length === 0) {
      throw new ContentError('AI_UNAVAILABLE', 'Cannot generate a content plan without an AI provider.');
    }

    const thesis = (input.thesisOverride ?? input.thesis ?? '').trim();
    if (!thesis) {
      throw new ContentError('PLAN_INVALID', 'Plan generation requires a thesis (opportunity thesis, idea title, or explicit override).');
    }

    const audience = resolveAudience(input.profile ?? null, input.icp ?? null, input.audienceOverride);
    if (audience.insufficientContext) {
      throw new ContentError('INSUFFICIENT_CONTEXT', 'Cannot resolve an audience: no ICP is configured and no audience override was supplied. Refusing to invent audience details.');
    }

    const validObjectives: ContentObjective[] = ['EDUCATE', 'EXPLAIN', 'CHALLENGE', 'BUILD_AUTHORITY', 'SHARE_FRAMEWORK', 'START_DISCUSSION', 'TEACH_PRACTICAL', 'ANALYZE', 'REFRAME'];
    const objective: ContentObjective = (input.objective && validObjectives.includes(input.objective as ContentObjective))
      ? input.objective as ContentObjective
      : 'EDUCATE';
    const validAngles: ContentAngle[] = ['EDUCATIONAL', 'CONTRARIAN', 'PRACTICAL', 'FRAMEWORK', 'ANALYSIS', 'OBSERVATION', 'BREAKDOWN'];
    const angle: ContentAngle = (input.angle && validAngles.includes(input.angle as ContentAngle))
      ? input.angle as ContentAngle
      : 'EDUCATIONAL';
    const format = this.normalizeFormat(input.format ?? 'TEXT_POST');
    const narrative = selectNarrative(objective, angle, format);
    assertValidStrategy({ objective, angle, format, narrative });

    const angleCheck = validateAngle(angle, {
      prevailingAssumption: angle === 'CONTRARIAN' ? this.derivePrevailingAssumption(input) : undefined,
      supportingEvidenceRefs: (input.claims ?? []).map((c) => c.id ?? c.text.slice(0, 80)),
      actionableRefs: (input.claims ?? []).filter((c) => c.type === 'RECOMMENDATION' || c.type === 'OBSERVATION').map((c) => c.id ?? c.text.slice(0, 80)),
      stepCount: (input.claims ?? []).length,
    });
    if (!angleCheck.ok) {
      throw new ContentError('PLAN_INVALID', (angleCheck as { reason: string }).reason);
    }

    const influence = OBJECTIVE_INFLUENCE[objective];
    const claimLines = (input.claims ?? []).map((c) => `- [${c.type}] ${c.text.slice(0, 300)} (evidence: ${c.evidence.slice(0, 300)}; confidence ${c.confidence})`).join('\n');
    const gapLines = (input.gaps ?? []).map((g) => `- [${g.type}] ${g.description.slice(0, 300)}`).join('\n');
    const contradictionLines = (input.contradictions ?? []).map((c) => `- "${c.claim1.slice(0, 200)}" vs "${c.claim2.slice(0, 200)}" (severity ${c.severity})`).join('\n');

const provider = available[0]!;
    let response;
    let content: string | undefined;
    try {
      response = await provider.chatCompletion({
        messages: [
          { role: 'system', content: 'You are a content strategist. Build a structured content plan from the supplied thesis, audience, evidence, and gaps. Use ONLY the supplied material. Never invent statistics, experiences, or evidence. Return only valid JSON matching the schema.' },
          { role: 'user', content: `Thesis: ${thesis}\nAudience: ${audience.primaryAudience}\nObjective: ${objective}\nAngle: ${angle}\nFormat: ${format}\nNarrative: ${narrative}\n\nClaims:\n${claimLines || '(none)'}\n\nGaps:\n${gapLines || '(none)'}\n\nContradictions:\n${contradictionLines || '(none)'}\n\nHook guidance: ${influence.hookGuidance}\nCTA guidance: ${influence.ctaGuidance}\n\nReturn JSON with EXACTLY these fields:
- coreQuestion: string (optional)
- keyPoints: array of 3-8 strings (REQUIRED)
- hookDirection: string (optional)
- ctaStrategy: string (optional)
- reasoning: string (optional)
- mustNotClaim: array of strings (optional)
- evidenceMap: array of objects with claimRef and note (optional)
- contradictionNotes: string (optional)

ALL string fields MUST be strings, NOT arrays. ALL array fields MUST be arrays, NOT strings.` },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 2500,
        responseFormat: { type: 'json_object' },
      });
      content = response.choices[0]?.message?.content;
      if (!content) {
        throw new ContentError('AI_UNAVAILABLE', 'AI returned an empty plan response.');
      }
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw new ContentError('AI_UNAVAILABLE', 'Cannot generate a content plan without an AI provider.');
      }
      if (error instanceof ContentError) throw error;
      // Any other error (network, timeout, JSON parse, etc.) = provider unavailable
      throw new ContentError('AI_UNAVAILABLE', 'Cannot generate a content plan without an AI provider.');
    }

    let parsed;
    try {
      const extractedJson = extractJsonFromMarkdown(content!);
      parsed = z.object({
        coreQuestion: z.string().max(2000).nullish(),
        keyPoints: z.array(z.string().min(1).max(1000)).min(1).max(20),
        hookDirection: z.string().max(2000).nullish(),
        ctaStrategy: z.string().max(2000).nullish(),
        reasoning: z.string().max(5000).nullish(),
        mustNotClaim: z.array(z.string().min(1).max(1000)).max(30).default([]),
        evidenceMap: PlanEvidenceMapSchema.default([]),
        contradictionNotes: z.string().max(5000).nullish(),
      }).safeParse(JSON.parse(extractedJson));
    } catch {
      throw new ContentError('AI_UNAVAILABLE', 'AI returned an invalid response format.');
    }
    if (!parsed.success) {
      throw new ContentError('PLAN_INVALID', `AI plan output validation failed: ${parsed.error.message}`);
    }

    const evidenceMap = parsed.data.evidenceMap.length > 0
      ? parsed.data.evidenceMap
      : (input.claims ?? []).map((c) => ({ claimRef: c.text.slice(0, 300), sourceClaimId: c.id, note: `Type ${c.type}` }));

    return this.prisma.contentPlan.create({
      data: {
        workspaceId: input.workspaceId,
        contentIdeaId: input.contentIdeaId ?? null,
        opportunityId: input.opportunityId ?? null,
        topicId: input.topicId ?? null,
        thesis,
        coreQuestion: parsed.data.coreQuestion ?? null,
        audience: audience.primaryAudience,
        audienceReason: audience.matchReason,
        objective,
        angle,
        format: format as never,
        narrativeStructure: narrative as never,
        keyPoints: parsed.data.keyPoints,
        hookDirection: parsed.data.hookDirection ?? null,
        ctaStrategy: parsed.data.ctaStrategy ?? influence.ctaGuidance,
        evidenceMap,
        contradictionNotes: parsed.data.contradictionNotes ?? (contradictionLines || null),
        voiceInstructions: null,
        mustNotClaim: parsed.data.mustNotClaim,
        sourceIds: input.sourceIds ?? undefined,
        claimIds: input.claimIds ?? undefined,
        trendSignalIds: input.trendSignalIds ?? undefined,
        reasoning: parsed.data.reasoning ?? null,
        evidenceSnapshot: input.claims ? input.claims.map((c) => ({ text: c.text, type: c.type, confidence: c.confidence })) : undefined,
        status: 'DRAFT',
        createdBy: input.createdBy ?? null,
      },
    });
  }

  validatePlanData(data: {
    thesis: string;
    audience: string;
    keyPoints: string[];
    objective: string;
    angle: string;
    format: string;
    narrativeStructure: string;
    evidenceMap?: Array<{ claimRef: string }>;
  }): { ok: boolean; reasons: string[] } {
    const reasons: string[] = [];
    if (!data.thesis || data.thesis.trim().length === 0) reasons.push('Plan thesis is empty.');
    if (!data.audience || data.audience.trim().length === 0) reasons.push('Plan audience is empty.');
    if (!data.keyPoints || data.keyPoints.length === 0) reasons.push('Plan has no key points.');
    try {
      assertValidStrategy({ objective: data.objective, angle: data.angle, format: data.format, narrative: data.narrativeStructure });
    } catch (error) {
      reasons.push(error instanceof ContentError ? error.message : 'Invalid strategy combination.');
    }
    if (data.angle?.toUpperCase() === 'CONTRARIAN' && (!data.evidenceMap || data.evidenceMap.length === 0)) {
      reasons.push('Contrarian plan has no evidence map entries to defend the opposing thesis.');
    }
    return { ok: reasons.length === 0, reasons };
  }

  async validatePlan(workspaceId: string, planId: string): Promise<{ ok: boolean; reasons: string[] }> {
    const plan = await this.prisma.contentPlan.findFirst({ where: { id: planId, workspaceId } });
    if (!plan) {
      throw new ContentError('PLAN_INVALID', 'Content plan not found in this workspace.');
    }
    const reasons: string[] = [];
    if (!plan.thesis || plan.thesis.trim().length === 0) reasons.push('Plan thesis is empty.');
    if (!plan.audience || plan.audience.trim().length === 0) reasons.push('Plan audience is empty.');
    if (!Array.isArray(plan.keyPoints) || plan.keyPoints.length === 0) reasons.push('Plan has no key points.');
    try {
      assertValidStrategy({ objective: plan.objective as string, angle: plan.angle as string, format: plan.format as string, narrative: plan.narrativeStructure as string });
    } catch (error) {
      reasons.push(error instanceof ContentError ? error.message : 'Invalid strategy combination.');
    }
    if (plan.angle === 'CONTRARIAN') {
      const map = (plan.evidenceMap as Array<{ claimRef?: string }>) ?? [];
      if (map.length === 0) {
        reasons.push('Contrarian plan has no evidence map entries to defend the opposing thesis.');
      }
    }
    return { ok: reasons.length === 0, reasons };
  }

  async approvePlan(workspaceId: string, planId: string) {
    const validation = await this.validatePlan(workspaceId, planId);
    if (!validation.ok) {
      throw new ContentError('PLAN_INVALID', `Plan cannot be approved: ${validation.reasons.join(' ')}`);
    }
    return this.prisma.contentPlan.update({ where: { id: planId }, data: { status: 'APPROVED' } });
  }

  private normalizeFormat(format: string): ContentFormatKind {
    const upper = format.toUpperCase();
    const known: ContentFormatKind[] = ['POST', 'TEXT_POST', 'ARTICLE', 'CAROUSEL', 'VIDEO', 'POLL', 'CHECKLIST', 'FRAMEWORK', 'CONTRARIAN'];
    if ((known as string[]).includes(upper)) return upper as ContentFormatKind;
    return 'TEXT_POST';
  }

  private derivePrevailingAssumption(input: PlanGenerateInput): string | undefined {
    const text = [...(input.gaps ?? []).map((g) => g.description), ...(input.claims ?? []).map((c) => c.text)].join(' ').slice(0, 500);
    return text.length >= 10 ? text : undefined;
  }
}
