import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, requireRole, AuthenticatedRequest } from '../middleware/auth';
import {
  outreachStrategyCreateSchema,
  outreachDraftComposeSchema,
  outreachDraftReviseSchema,
  outreachReviewActionSchema,
  preparedActionCreateSchema,
} from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { createDefaultRegistry } from '@growth-operator/ai';
import {
  OutreachStrategyService,
  OutreachComposer,
  OutreachReviewService,
  PreparedActionService,
  runOutreachGates,
  suggestRelevantContent,
} from '@growth-operator/sales';
import { forwardSalesError } from '../utils/salesErrors';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
const strategyService = new OutreachStrategyService(prisma);
const composer = new OutreachComposer(prisma, aiRegistry);
const reviewService = new OutreachReviewService(prisma);
const preparedService = new PreparedActionService(prisma, reviewService);

async function evaluateDraftGates(workspaceId: string, draftId: string) {
  const draft = await prisma.outreachDraft.findFirst({
    where: { id: draftId, workspaceId },
    include: { strategy: true },
  });
  if (!draft) return null;
  const strategyEvidence = (draft.strategy.relevantEvidence as Array<{ statement: string; sourceRef?: string }>) ?? [];
  let qualificationStatus: string | null = null;
  if (draft.strategy.leadId) {
    const row = await prisma.qualificationResult.findUnique({
      where: { workspaceId_leadId: { workspaceId, leadId: draft.strategy.leadId } },
    });
    qualificationStatus = row?.status ?? null;
  }
  const others = await prisma.outreachDraft.findMany({
    where: { workspaceId, id: { not: draftId } },
    select: { body: true },
    take: 200,
  });
  return runOutreachGates({
    body: draft.body,
    qualificationStatus,
    evidenceRefs: strategyEvidence.map((e) => `${e.statement} ${e.sourceRef ?? ''}`),
    personalizationStatements: [draft.strategy.reasonForContact, draft.opening],
    contradictionPresent: false,
    existingBodies: others.map((d) => d.body),
    cta: draft.cta,
    draftType: draft.draftType,
  });
}

router.post('/strategies', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = outreachStrategyCreateSchema.parse(req.body);
    const strategy = await strategyService.createStrategy({
      workspaceId: authReq.workspaceId,
      leadId: data.leadId,
      briefId: data.briefId,
      objective: data.objective,
      audience: data.audience,
      relationshipStage: data.relationshipStage.toUpperCase() as never,
      angle: data.angle,
      reasonForContact: data.reasonForContact,
      relevantEvidence: data.relevantEvidence,
      personalizationLevel: data.personalizationLevel.toUpperCase() as never,
      ctaType: data.ctaType,
      riskFlags: data.riskFlags,
      mustNotClaim: data.mustNotClaim,
      relevantContentId: data.relevantContentId,
      contentReason: data.contentReason,
      createdBy: authReq.user.id,
    });
    res.status(201).json({ strategy });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/strategies', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof leadId === 'string') where.leadId = leadId;
    const strategies = await prisma.outreachStrategy.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 50 });
    res.json({ strategies });
  } catch (error) {
    next(error);
  }
});

router.get('/strategies/relevant-content', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.query;
    if (typeof leadId !== 'string' || leadId.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'leadId query parameter is required.' } });
    }
    const suggestions = await suggestRelevantContent(prisma, authReq.workspaceId, { leadId });
    res.json({ suggestions });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/strategies/:strategyId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { strategyId } = req.params;
    if (!strategyId) throw new NotFoundError('Outreach Strategy');
    const strategy = await prisma.outreachStrategy.findFirst({
      where: { id: strategyId, workspaceId: authReq.workspaceId },
      include: { drafts: { select: { id: true, draftType: true, version: true, createdAt: true } } },
    });
    if (!strategy) throw new NotFoundError('Outreach Strategy');
    res.json({ strategy });
  } catch (error) {
    next(error);
  }
});

router.post('/strategies/:strategyId/approve', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { strategyId } = req.params;
    if (!strategyId) throw new NotFoundError('Outreach Strategy');
    const strategy = await strategyService.approveStrategy(authReq.workspaceId, strategyId);
    res.json({ strategy });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/drafts', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = outreachDraftComposeSchema.parse(req.body);
    const draft = await composer.composeFromStrategy(
      authReq.workspaceId,
      data.strategyId,
      data.draftType.toUpperCase() as never,
      authReq.user.id
    );
    res.status(201).json({ draft });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/drafts', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { strategyId, leadId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof strategyId === 'string') where.strategyId = strategyId;
    if (typeof leadId === 'string') where.leadId = leadId;
    const drafts = await prisma.outreachDraft.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 50 });
    res.json({ drafts });
  } catch (error) {
    next(error);
  }
});

router.get('/drafts/:draftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId } = req.params;
    if (!draftId) throw new NotFoundError('Outreach Draft');
    const draft = await prisma.outreachDraft.findFirst({
      where: { id: draftId, workspaceId: authReq.workspaceId },
      include: { strategy: true },
    });
    if (!draft) throw new NotFoundError('Outreach Draft');
    res.json({ draft });
  } catch (error) {
    next(error);
  }
});

router.patch('/drafts/:draftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId } = req.params;
    if (!draftId) throw new NotFoundError('Outreach Draft');
    const data = outreachDraftReviseSchema.parse(req.body);

    const draft = await prisma.outreachDraft.findFirst({ where: { id: draftId, workspaceId: authReq.workspaceId } });
    if (!draft) throw new NotFoundError('Outreach Draft');
    await reviewService.assertDraftMutable(authReq.workspaceId, draftId);

    const updated = await prisma.outreachDraft.update({
      where: { id: draftId },
      data: {
        opening: data.opening ?? undefined,
        relevance: data.relevance ?? undefined,
        evidence: data.evidence ?? undefined,
        value: data.value ?? undefined,
        cta: data.cta ?? undefined,
        body: data.body ?? undefined,
        version: draft.version + 1,
      },
    });
    res.json({ draft: updated });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/drafts/:draftId/revisions', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId } = req.params;
    if (!draftId) throw new NotFoundError('Outreach Draft');
    const revision = await reviewService.createRevision(authReq.workspaceId, draftId, authReq.user.id);
    res.status(201).json({ draft: revision });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/drafts/:draftId/validate', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId } = req.params;
    if (!draftId) throw new NotFoundError('Outreach Draft');

    const gateRun = await evaluateDraftGates(authReq.workspaceId, draftId);
    if (!gateRun) throw new NotFoundError('Outreach Draft');
    res.json({ validation: gateRun });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/drafts/:draftId/gates', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId } = req.params;
    if (!draftId) throw new NotFoundError('Outreach Draft');
    const gateRun = await evaluateDraftGates(authReq.workspaceId, draftId);
    if (!gateRun) throw new NotFoundError('Outreach Draft');
    res.json({ gates: gateRun.results, finalStatus: gateRun.finalStatus, overallScore: gateRun.overallScore });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/reviews', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId, note } = req.body as { draftId?: string; note?: string };
    if (!draftId || typeof draftId !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'draftId is required.' } });
    }
    const review = await reviewService.submitForReview(authReq.workspaceId, draftId, authReq.user.id, note);
    res.status(201).json({ review });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/reviews', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof draftId === 'string') where.draftId = draftId;
    const reviews = await prisma.outreachReview.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
});

router.post('/reviews/:reviewId/decision', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { reviewId } = req.params;
    if (!reviewId) throw new NotFoundError('Outreach Review');
    const { action, note } = outreachReviewActionSchema.parse({ ...req.body, action: req.body?.action ?? 'approve' });
    if (action === 'submit') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use POST /outreach/reviews to submit a review.' } });
    }
    // Approval always re-evaluates gates server-side from the current draft;
    // client-supplied summaries are never trusted for blocking decisions.
    const target = await prisma.outreachReview.findFirst({ where: { id: reviewId, workspaceId: authReq.workspaceId } });
    if (!target) throw new NotFoundError('Outreach Review');
    const fresh = await evaluateDraftGates(authReq.workspaceId, target.draftId);
    const gateSummary = (fresh?.results ?? []).map((g) => ({ gate: g.gate, status: g.status }));
    const review = await reviewService.transition(
      authReq.workspaceId,
      reviewId,
      action,
      { userId: authReq.user.id, role: authReq.workspaceRole },
      gateSummary
    );
    void note;
    res.json({ review });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/prepared-actions', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = preparedActionCreateSchema.parse(req.body);
    const action = await preparedService.prepareAction({
      workspaceId: authReq.workspaceId,
      actionType: data.actionType,
      target: data.target,
      draftId: data.draftId,
      approvalId: data.approvalId,
      evidence: data.evidence,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
    res.status(201).json({ preparedAction: action });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/prepared-actions', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const actions = await prisma.preparedAction.findMany({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ preparedActions: actions });
  } catch (error) {
    next(error);
  }
});

router.post('/prepared-actions/:actionId/ready', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { actionId } = req.params;
    if (!actionId) throw new NotFoundError('Prepared Action');
    const action = await preparedService.markReady(authReq.workspaceId, actionId);
    res.json({ preparedAction: action });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

export default router;
