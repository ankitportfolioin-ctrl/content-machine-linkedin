import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { contentPlanCreateSchema, contentPlanGenerateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { createDefaultRegistry } from '@growth-operator/ai';
import { ContentPlanService } from '@growth-operator/content';
import { forwardContentError } from '../utils/contentErrors';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
const planService = new ContentPlanService(prisma, aiRegistry);

function toContentError(error: unknown, next: (err: unknown) => void): void {
  forwardContentError(error, next);
}

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, status, contentIdeaId } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (status && typeof status === 'string') where.status = status.toUpperCase();
    if (contentIdeaId && typeof contentIdeaId === 'string') where.contentIdeaId = contentIdeaId;

    const [plans, total] = await Promise.all([
      prisma.contentPlan.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.contentPlan.count({ where }),
    ]);

    res.json({ plans, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = contentPlanCreateSchema.parse(req.body);

    if (data.contentIdeaId) {
      const idea = await prisma.contentIdea.findFirst({ where: { id: data.contentIdeaId, workspaceId: authReq.workspaceId } });
      if (!idea) throw new NotFoundError('Content Idea');
    }

    const normalized = {
      ...data,
      objective: data.objective.toUpperCase(),
      angle: data.angle.toUpperCase(),
      format: data.format.toUpperCase(),
      narrativeStructure: data.narrativeStructure.toUpperCase(),
    };
    const validation = await planService.validatePlanData(normalized);
    if (!validation.ok) {
      return res.status(422).json({ error: { code: 'PLAN_INVALID', message: validation.reasons.join(' '), reasons: validation.reasons } });
    }

    const plan = await prisma.contentPlan.create({
      data: {
        workspaceId: authReq.workspaceId,
        contentIdeaId: data.contentIdeaId ?? null,
        opportunityId: data.opportunityId ?? null,
        topicId: data.topicId ?? null,
        thesis: data.thesis,
        coreQuestion: null,
        audience: data.audience,
        audienceReason: data.audienceReason ?? null,
        objective: data.objective.toUpperCase() as never,
        angle: data.angle.toUpperCase() as never,
        format: data.format.toUpperCase() as never,
        narrativeStructure: data.narrativeStructure.toUpperCase() as never,
        keyPoints: data.keyPoints,
        hookDirection: data.hookDirection ?? null,
        ctaStrategy: data.ctaStrategy ?? null,
        evidenceMap: data.evidenceMap,
        contradictionNotes: data.contradictionNotes ?? null,
        voiceInstructions: data.voiceInstructions ?? null,
        mustNotClaim: data.mustNotClaim,
        sourceIds: data.sourceIds ?? undefined,
        claimIds: data.claimIds ?? undefined,
        trendSignalIds: data.trendSignalIds ?? undefined,
        reasoning: data.reasoning ?? null,
        evidenceSnapshot: data.evidenceSnapshot ? JSON.parse(JSON.stringify(data.evidenceSnapshot)) : undefined,
        status: 'DRAFT',
        createdBy: authReq.user.id,
      },
    });

    res.status(201).json({ plan });
  } catch (error) {
    toContentError(error, next);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = contentPlanGenerateSchema.parse(req.body);

    const [idea, opportunity, profile, icp] = await Promise.all([
      data.contentIdeaId ? prisma.contentIdea.findFirst({ where: { id: data.contentIdeaId, workspaceId: authReq.workspaceId } }) : Promise.resolve(null),
      data.opportunityId ? prisma.contentOpportunity.findFirst({ where: { id: data.opportunityId, workspaceId: authReq.workspaceId } }) : Promise.resolve(null),
      prisma.profile.findFirst({ where: { userId: authReq.user.id, workspaceId: authReq.workspaceId } }),
      prisma.iCP.findFirst({ where: { workspaceId: authReq.workspaceId }, orderBy: { updatedAt: 'desc' } }),
    ]);

    if (data.contentIdeaId && !idea) throw new NotFoundError('Content Idea');
    if (data.opportunityId && !opportunity) throw new NotFoundError('Content Opportunity');

    const claims =opportunity
      ? await prisma.sourceClaim.findMany({ where: { id: { in: ((opportunity.claimIds as string[]) ?? []) }, workspaceId: authReq.workspaceId } })
      : [];
    const gaps = await prisma.contentGap.findMany({ where: { workspaceId: authReq.workspaceId }, take: 10, orderBy: { importanceScore: 'desc' } });

    const plan = await planService.generatePlan({
      workspaceId: authReq.workspaceId,
      contentIdeaId: data.contentIdeaId,
      opportunityId: data.opportunityId,
      topicId: data.topicId ?? opportunity?.topicId ?? idea?.topicId ?? undefined,
      thesis: data.thesisOverride ?? opportunity?.thesis ?? idea?.thesis ?? idea?.title,
      audienceOverride: data.audienceOverride ?? idea?.audience ?? undefined,
      objective: (data.objective?.toUpperCase() ?? idea?.objective?.toUpperCase()) as never,
      angle: (data.angle?.toUpperCase() ?? idea?.angle?.toUpperCase()) as never,
      format: (data.format?.toUpperCase() ?? idea?.format ?? undefined) as never,
      sourceIds: (opportunity?.sourceIds as string[]) ?? (idea?.sourceIds as string[]) ?? undefined,
      claimIds: (opportunity?.claimIds as string[]) ?? (idea?.claimIds as string[]) ?? undefined,
      trendSignalIds: (opportunity?.trendSignalIds as string[]) ?? (idea?.trendSignalIds as string[]) ?? undefined,
      claims: claims.map((c) => ({ id: c.id, text: c.claimText, type: c.claimType, evidence: c.evidenceText, confidence: c.confidence })),
      gaps: gaps.map((g) => ({ type: g.gapType, description: g.description })),
      contradictions: [],
      profile: profile ? { role: profile.role, headline: profile.headline, professionalContext: profile.professionalContext, industry: profile.industry } : null,
      icp: icp ? { id: icp.id, name: icp.name, description: icp.description, criteria: icp.criteria, targetRoles: icp.targetRoles, industries: icp.industries, companySize: icp.companySize, problems: icp.problems, exclusions: icp.exclusions } : null,
      createdBy: authReq.user.id,
    });

    res.status(201).json({ plan });
  } catch (error) {
    toContentError(error, next);
  }
});

router.get('/:planId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { planId } = req.params;

    const plan = await prisma.contentPlan.findFirst({
      where: { id: planId, workspaceId: authReq.workspaceId },
      include: { drafts: { select: { id: true, version: true, createdAt: true } } },
    });
    if (!plan) throw new NotFoundError('Content Plan');

    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

router.post('/:planId/approve', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { planId } = req.params;

    if (!planId) throw new NotFoundError('Content Plan');
    const existing = await prisma.contentPlan.findFirst({ where: { id: planId, workspaceId: authReq.workspaceId } });
    if (!existing) throw new NotFoundError('Content Plan');

    const plan = await planService.approvePlan(authReq.workspaceId, planId);
    res.json({ plan });
  } catch (error) {
    toContentError(error, next);
  }
});

router.post('/:planId/validate', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { planId } = req.params;
    if (!planId) throw new NotFoundError('Content Plan');

    const result = await planService.validatePlan(authReq.workspaceId, planId);
    res.json({ validation: result });
  } catch (error) {
    toContentError(error, next);
  }
});

export default router;
