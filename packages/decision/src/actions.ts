import { PrismaClient } from '@prisma/client';
import { createDefaultRegistry } from '@growth-operator/ai';
import { LearningDerivationService } from '@growth-operator/learning';
import { ProspectResearchService, SalesBridgeService, SalesError } from '@growth-operator/sales';
import { DecisionError } from './errors';
import { ActionStatus, ScoredAction } from './types';
import { collectCandidates } from './collectors';
import { checkEligibility } from './eligibility';
import { rankScored, scoreCandidate } from './scoring';
import { explainAction } from './explain';
import { buildObjectionIdea, buildRelevanceIdea, buildRelevanceResearch, buildSignalIdea, extractResultKeys, extractSalesResultKeys } from './initiation';

export class OperatorActionService {
  private prisma: PrismaClient;
  private learning: LearningDerivationService;
  private research: ProspectResearchService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.learning = new LearningDerivationService(prisma);
    // Empty registry: createResearch never touches AI (only synthesize does,
    // which this service never calls). Passed for constructor compatibility only.
    this.research = new ProspectResearchService(prisma, createDefaultRegistry());
  }

  /**
   * Refreshes the workspace action queue: collects candidates, filters by
   * live eligibility, scores and ranks deterministically, upserts PENDING
   * rows, and removes PENDING rows whose artifacts stopped being eligible.
   * DISMISSED/COMPLETED rows are never touched (they suppress recurrence).
   * Dismissing/completing records the operator's decision only — it never
   * executes the underlying business action.
   */
  async refreshWorkspace(workspaceId: string, limit = 20): Promise<ScoredAction[]> {
    const now = Date.now();
    const candidates = await collectCandidates(this.prisma, workspaceId, now);

    const existing = await this.prisma.operatorAction.findMany({ where: { workspaceId } });
    const suppressed = new Map(
      existing
        .filter((r: { status: string }) => r.status !== 'PENDING')
        .map((r: { identityKey: string; status: string }) => [r.identityKey, r.status] as [string, string])
    );

    const eligibleKeys = new Set<string>();
    const scored: ScoredAction[] = [];
    const confirmed = await this.learning.confirmedInfluences(workspaceId);

    for (const candidate of candidates) {
      if (suppressed.has(candidate.identityKey)) continue;
      const verdict = await checkEligibility(this.prisma, workspaceId, candidate);
      if (!verdict.eligible) continue;
      eligibleKeys.add(candidate.identityKey);
      scored.push(scoreCandidate({ candidate, confirmedLearning: confirmed, now }));
    }

    const ranked = rankScored(scored);

    const persistedMeta = new Map(
      existing
        .filter((r: { status: string }) => r.status === 'PENDING')
        .map((r: { identityKey: string; subjectMeta: unknown }) => [r.identityKey, r.subjectMeta] as [string, unknown])
    );

    for (const action of ranked) {
      // Initiation linkage (resultIdeaId/Title/initiatedAt for content ideas,
      // resultResearchId/Title/initiatedResearchAt for sales research) is operator
      // history: freshly collected candidates never carry it, so re-merge it on
      // update rather than letting refresh erase it.
      const preserved = {
        ...extractResultKeys(persistedMeta.get(action.identityKey)),
        ...extractSalesResultKeys(persistedMeta.get(action.identityKey)),
      };
      const subjectMeta = { ...((action.facts.subjectMeta ?? {}) as object), ...preserved };
      await this.prisma.operatorAction.upsert({
        where: { workspaceId_identityKey: { workspaceId, identityKey: action.identityKey } },
        create: {
          workspaceId,
          identityKey: action.identityKey,
          kind: action.kind,
          subjectId: action.subjectId,
          title: action.title,
          score: action.score,
          reasons: action.reasons,
          evidenceLinks: action.evidenceLinks as object,
          subjectMeta: (action.facts.subjectMeta ?? {}) as object,
          status: 'PENDING',
        },
        update: {
          title: action.title,
          score: action.score,
          reasons: action.reasons,
          evidenceLinks: action.evidenceLinks as object,
          subjectMeta: subjectMeta as object,
        },
      });
    }

    await this.prisma.operatorAction.deleteMany({
      where: { workspaceId, status: 'PENDING', identityKey: { notIn: [...eligibleKeys] } },
    });

    return ranked.slice(0, limit);
  }

  async listWorkspace(workspaceId: string, status: ActionStatus = 'PENDING', limit = 20) {
    return this.prisma.operatorAction.findMany({
      where: { workspaceId, status },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  /**
   * Batch 2 (A): acceptance authorizes the system to prepare internal work
   * from a recommendation. Acceptance is NOT execution approval: it creates
   * no draft/review/publication, sends nothing, and leaves all existing
   * approval gates enforced. Only PENDING actions can be accepted.
   */
  async accept(
    workspaceId: string,
    actionId: string,
    provenance?: {
      decidedBy?: string;
      decisionReason?: string;
      evidenceRefs?: string[];
      model?: string;
      modelVersion?: string;
      policySnapshot?: Record<string, unknown>;
    }
  ) {
    return this.transition(workspaceId, actionId, 'ACCEPTED', provenance);
  }

  async transition(
    workspaceId: string,
    actionId: string,
    to: 'ACCEPTED' | 'DISMISSED' | 'COMPLETED',
    provenance?: {
      decidedBy?: string;
      decisionReason?: string;
      evidenceRefs?: string[];
      model?: string;
      modelVersion?: string;
      policySnapshot?: Record<string, unknown>;
    }
  ) {
    const row = await this.prisma.operatorAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!row) {
      throw new DecisionError('NOT_FOUND', 'Operator action not found in this workspace.');
    }
    const from = row.status;
    const allowed =
      (to === 'ACCEPTED' && from === 'PENDING') ||
      ((to === 'DISMISSED' || to === 'COMPLETED') && (from === 'PENDING' || from === 'ACCEPTED'));
    if (!allowed) {
      throw new DecisionError(
        'INVALID_TRANSITION',
        `Cannot transition ${from} -> ${to}. Allowed: PENDING -> ACCEPTED, PENDING/ACCEPTED -> DISMISSED/COMPLETED.`
      );
    }
    const now = new Date();
    const policy = await this.prisma.autonomyPolicy.findUnique({ where: { workspaceId } });
    const settings = await this.prisma.workspaceSettings.findUnique({ where: { workspaceId } });
    const policySnapshot = provenance?.policySnapshot ?? {
      tier1PostingEnabled: policy?.tier1PostingEnabled ?? false,
      tier2HumanApprovalAck: policy?.tier2HumanApprovalAck ?? false,
      dailyPreparationCap: settings?.dailyPreparationCap ?? 0,
    };

    // acceptedAt/acceptedBy ride on the Batch 2 migration; spread (not a
    // fresh literal) so they pass assignability against stale generated
    // input types.
    const batch2 = (
      to === 'ACCEPTED' ? { acceptedAt: now, acceptedBy: provenance?.decidedBy ?? 'system' } : {}
    ) as Record<string, unknown>;
    return this.prisma.operatorAction.update({
      where: { id: row.id },
      data: {
        status: to,
        ...(to === 'DISMISSED' ? { dismissedAt: now } : {}),
        ...(to === 'COMPLETED' ? { completedAt: now } : {}),
        ...batch2,
        decidedBy: provenance?.decidedBy ?? 'system',
        decidedAt: now,
        decisionReason: provenance?.decisionReason ?? null,
        evidenceRefs: provenance?.evidenceRefs ?? [],
        model: provenance?.model ?? null,
        modelVersion: provenance?.modelVersion ?? null,
        policySnapshot: policySnapshot as object,
      },
    });
  }

  /**
   * Human-initiated workflow scaffolding: creates exactly one DRAFT ContentIdea
   * prefilled from a PENDING objection_pattern, prospect_relevance, or
   * sales_content_signal action's recorded evidence. The idea is a draft only —
   * no plan, draft, review, approval, or publication is created, and the action
   * stays PENDING for the operator to complete manually. The create + linkage
   * update run atomically.
   */
  async initiateIdea(workspaceId: string, actionId: string, authorId: string) {
    const row = await this.prisma.operatorAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!row) {
      throw new DecisionError('NOT_FOUND', 'Operator action not found in this workspace.');
    }
    if (row.kind !== 'objection_pattern' && row.kind !== 'prospect_relevance' && row.kind !== 'sales_content_signal') {
      throw new DecisionError('CONFLICT', `Only objection_pattern, prospect_relevance, and sales_content_signal actions can start ideas (kind: ${row.kind}).`);
    }
    if (row.status !== 'PENDING' && row.status !== 'ACCEPTED') {
      throw new DecisionError('CONFLICT', `Only PENDING or ACCEPTED actions can start ideas (current: ${row.status}).`);
    }
    const meta = (row.subjectMeta ?? {}) as Record<string, unknown>;
    if (typeof meta['resultIdeaId'] === 'string') {
      const prior = await this.prisma.contentIdea.findFirst({
        where: { id: meta['resultIdeaId'] as string, workspaceId },
      });
      if (prior) {
        throw new DecisionError('CONFLICT', 'An idea was already started from this action.', {
          ideaId: prior.id,
          ideaTitle: (prior as { title?: unknown }).title ?? meta['resultIdeaTitle'] ?? null,
        });
      }
    }

    const candidates = await collectCandidates(this.prisma, workspaceId, Date.now());
    const candidate = candidates.find((c) => c.identityKey === row.identityKey);
    if (!candidate) {
      throw new DecisionError('CONFLICT', 'The operator action no longer qualifies; nothing was created.');
    }
    const verdict = await checkEligibility(this.prisma, workspaceId, candidate);
    if (!verdict.eligible) {
      throw new DecisionError('CONFLICT', verdict.reason ?? 'The operator action is no longer eligible; nothing was created.');
    }

    const candidateMeta = (candidate.facts.subjectMeta ?? {}) as Record<string, unknown>;
    let prefill: { title: string; description: string; tags: string[] };
    if (row.kind === 'sales_content_signal') {
      // Live bridge read doubles as workspace-scoped existence revalidation:
      // a deleted or foreign signal throws SalesError here, converted below.
      const signalId =
        typeof candidateMeta['signalId'] === 'string'
          ? (candidateMeta['signalId'] as string)
          : (typeof candidate.subjectId === 'string' ? candidate.subjectId : '');
      let contentInput: {
        signalType: string;
        evidence: string;
        frequency: number | null;
        recommendedAngle: string | null;
        reasoning: string | null;
        conversationCount: number;
      };
      try {
        const bridge = new SalesBridgeService(this.prisma);
        contentInput = await bridge.toContentInput(workspaceId, signalId);
      } catch (error) {
        if (error instanceof SalesError) {
          throw new DecisionError('CONFLICT', 'The sales signal no longer exists in this workspace; nothing was created.');
        }
        throw error;
      }
      const conversationIds = Array.isArray(candidateMeta['conversationIds'])
        ? (candidateMeta['conversationIds'] as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      prefill = buildSignalIdea({
        signalId,
        signalType: contentInput.signalType,
        evidence: contentInput.evidence,
        frequency: contentInput.frequency,
        conversationCount: contentInput.conversationCount,
        recommendedAngle: contentInput.recommendedAngle,
        reasoning: contentInput.reasoning,
        conversationIds,
        identityKey: candidate.identityKey,
      });
    } else prefill =
      row.kind === 'prospect_relevance'
        ? buildRelevanceIdea({
            topicId:
              typeof candidateMeta['topicId'] === 'string' ? (candidateMeta['topicId'] as string) : '',
            topicName:
              typeof candidateMeta['topicName'] === 'string' ? (candidateMeta['topicName'] as string) : '',
            leadId: typeof candidate.subjectId === 'string' ? candidate.subjectId : '',
            leadName:
              typeof candidateMeta['leadName'] === 'string' ? (candidateMeta['leadName'] as string) : '',
            relevance:
              typeof candidateMeta['relevance'] === 'number' ? (candidateMeta['relevance'] as number) : 0,
            dimensions: Array.isArray(candidateMeta['dimensions'])
              ? (candidateMeta['dimensions'] as unknown[])
                  .filter(
                    (v): v is Record<string, unknown> => typeof v === 'object' && v !== null
                  )
                  .map((d) => ({
                    name: typeof d['name'] === 'string' ? (d['name'] as string) : 'unknown',
                    score: typeof d['score'] === 'number' ? (d['score'] as number) : 0,
                    reason: typeof d['reason'] === 'string' ? (d['reason'] as string) : '',
                  }))
              : [],
            icp: (() => {
              const raw = candidateMeta['icpUsed'] as Record<string, unknown> | null | undefined;
              if (raw && typeof raw['id'] === 'string' && typeof raw['name'] === 'string') {
                return { id: raw['id'] as string, name: raw['name'] as string };
              }
              return null;
            })(),
            identityKey: candidate.identityKey,
          })
        : buildObjectionIdea({
            normalizedObjection: typeof candidateMeta['normalizedObjection'] === 'string' ? (candidateMeta['normalizedObjection'] as string) : '',
            count: typeof candidateMeta['count'] === 'number' ? (candidateMeta['count'] as number) : 0,
            conversationIds: Array.isArray(candidateMeta['conversationIds'])
              ? (candidateMeta['conversationIds'] as unknown[]).filter((v): v is string => typeof v === 'string')
              : [],
            classificationIds: Array.isArray(candidateMeta['classificationIds'])
              ? (candidateMeta['classificationIds'] as unknown[]).filter((v): v is string => typeof v === 'string')
              : [],
            sampleEvidence: Array.isArray(candidateMeta['sampleEvidence'])
              ? (candidateMeta['sampleEvidence'] as unknown[]).filter((v): v is string => typeof v === 'string')
              : [],
            identityKey: candidate.identityKey,
          });

    const initiatedAt = new Date().toISOString();
    const idea = await this.prisma.contentIdea.create({
      data: {
        workspaceId,
        authorId,
        title: prefill.title,
        description: prefill.description,
        tags: prefill.tags,
      },
    });
    try {
      const ideaTitle = (idea as { title?: unknown }).title;
      const action = await this.prisma.operatorAction.update({
        where: { id: row.id },
        data: {
          subjectMeta: {
            ...(meta as object),
            resultIdeaId: idea.id,
            resultIdeaTitle: typeof ideaTitle === 'string' ? ideaTitle : prefill.title,
            initiatedAt,
          } as object,
        },
      });
      return { idea, action };
    } catch (error) {
      await this.prisma.contentIdea.delete({ where: { id: idea.id } }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Human-initiated sales scaffolding: records exactly one ProspectResearch row
   * from a PENDING prospect_relevance action's recorded evidence, then links it
   * in the action subjectMeta. The research row carries facts only (no profile
   * fields, no unknowns, no confidence estimate) so downstream brief assembly
   * keeps falling back to the lead's real profile. No outreach, draft, review,
   * or approval is created, and the action stays PENDING for the operator to
   * complete manually. The create + linkage update run atomically.
   */
  async initiateSalesResearch(workspaceId: string, actionId: string) {
    const row = await this.prisma.operatorAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!row) {
      throw new DecisionError('NOT_FOUND', 'Operator action not found in this workspace.');
    }
    if (row.kind !== 'prospect_relevance') {
      throw new DecisionError('CONFLICT', `Only prospect_relevance actions can start sales research (kind: ${row.kind}).`);
    }
    if (row.status !== 'PENDING' && row.status !== 'ACCEPTED') {
      throw new DecisionError('CONFLICT', `Only PENDING or ACCEPTED actions can start sales research (current: ${row.status}).`);
    }
    const meta = (row.subjectMeta ?? {}) as Record<string, unknown>;
    if (typeof meta['resultResearchId'] === 'string') {
      const prior = await this.prisma.prospectResearch.findFirst({
        where: { id: meta['resultResearchId'] as string, workspaceId },
      });
      if (prior) {
        throw new DecisionError('CONFLICT', 'Sales research was already started from this action.', {
          researchId: prior.id,
          researchTitle: meta['resultResearchTitle'] ?? null,
        });
      }
    }

    const candidates = await collectCandidates(this.prisma, workspaceId, Date.now());
    const candidate = candidates.find((c) => c.identityKey === row.identityKey);
    if (!candidate) {
      throw new DecisionError('CONFLICT', 'The operator action no longer qualifies; nothing was created.');
    }
    const verdict = await checkEligibility(this.prisma, workspaceId, candidate);
    if (!verdict.eligible) {
      throw new DecisionError('CONFLICT', verdict.reason ?? 'The operator action is no longer eligible; nothing was created.');
    }

    const candidateMeta = (candidate.facts.subjectMeta ?? {}) as Record<string, unknown>;
    const leadId = typeof candidate.subjectId === 'string' ? candidate.subjectId : '';
    const lead = leadId
      ? await this.prisma.lead.findFirst({ where: { id: leadId, workspaceId } })
      : null;
    if (!lead) {
      throw new DecisionError('CONFLICT', 'The prospect no longer exists in this workspace; nothing was created.');
    }
    const researchInput = buildRelevanceResearch({
      topicId:
        typeof candidateMeta['topicId'] === 'string' ? (candidateMeta['topicId'] as string) : '',
      topicName:
        typeof candidateMeta['topicName'] === 'string' ? (candidateMeta['topicName'] as string) : '',
      leadId,
      leadName:
        typeof candidateMeta['leadName'] === 'string' ? (candidateMeta['leadName'] as string) : '',
      relevance:
        typeof candidateMeta['relevance'] === 'number' ? (candidateMeta['relevance'] as number) : 0,
      dimensions: Array.isArray(candidateMeta['dimensions'])
        ? (candidateMeta['dimensions'] as unknown[])
            .filter(
              (v): v is Record<string, unknown> => typeof v === 'object' && v !== null
            )
            .map((d) => ({
              name: typeof d['name'] === 'string' ? (d['name'] as string) : 'unknown',
              score: typeof d['score'] === 'number' ? (d['score'] as number) : 0,
              reason: typeof d['reason'] === 'string' ? (d['reason'] as string) : '',
            }))
        : [],
      icp: (() => {
        const raw = candidateMeta['icpUsed'] as Record<string, unknown> | null | undefined;
        if (raw && typeof raw['id'] === 'string' && typeof raw['name'] === 'string') {
          return { id: raw['id'] as string, name: raw['name'] as string };
        }
        return null;
      })(),
      identityKey: candidate.identityKey,
    });

    const initiatedResearchAt = new Date().toISOString();
    let research: { id: string };
    try {
      research = await this.research.createResearch({
        workspaceId,
        leadId,
        facts: researchInput.facts,
      });
    } catch (error) {
      if (error instanceof SalesError) {
        throw new DecisionError('CONFLICT', error.message);
      }
      throw error;
    }
    try {
      const action = await this.prisma.operatorAction.update({
        where: { id: row.id },
        data: {
          subjectMeta: {
            ...(meta as object),
            resultResearchId: research.id,
            resultResearchTitle: researchInput.resultTitle,
            initiatedResearchAt,
          } as object,
        },
      });
      return { research, action };
    } catch (error) {
      await this.prisma.prospectResearch.delete({ where: { id: research.id } }).catch(() => undefined);
      throw error;
    }
  }

  async explain(workspaceId: string, actionId: string) {
    const row = await this.prisma.operatorAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!row) {
      throw new DecisionError('NOT_FOUND', 'Operator action not found in this workspace.');
    }
    const candidates = await collectCandidates(this.prisma, workspaceId, Date.now());
    const candidate = candidates.find((c) => c.identityKey === row.identityKey);
    const confirmed = await this.learning.confirmedInfluences(workspaceId);
    if (!candidate) {
      return explainAction(
        {
          kind: row.kind as ScoredAction['kind'],
          identityKey: row.identityKey,
          subjectId: row.subjectId,
          title: row.title,
          createdAt: row.createdAt,
          facts: {},
          reasons: row.reasons,
          evidenceLinks: (row.evidenceLinks as ScoredAction['evidenceLinks']) ?? [],
          score: row.score,
          dimensions: [],
          learningApplied: [],
          signalConfidence: 'UNKNOWN' as const,
          recommendationConfidence: 'UNKNOWN' as const,
        },
        row.status
      );
    }
    const verdict = await checkEligibility(this.prisma, workspaceId, candidate);
    const scored = scoreCandidate({ candidate, confirmedLearning: confirmed });
    void verdict;
    return explainAction(scored, row.status);
  }
}
