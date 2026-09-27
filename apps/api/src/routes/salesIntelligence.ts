import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import {
  conversationClassifySchema,
  followUpRecommendSchema,
  salesContentSignalCreateSchema,
} from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { createDefaultRegistry } from '@growth-operator/ai';
import { ClassificationService, SalesBridgeService, aggregateObjectionPatterns, computeTopicRelevance } from '@growth-operator/sales';
import { forwardSalesError } from '../utils/salesErrors';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY);
const classificationService = new ClassificationService(prisma, aiRegistry);
const bridgeService = new SalesBridgeService(prisma);

router.post('/classify', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = conversationClassifySchema.parse(req.body);
    const { messageBody } = req.body as { messageBody?: string };
    const classification = await classificationService.classifyConversation(authReq.workspaceId, data.conversationId, messageBody);
    res.status(201).json({ classification });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/classifications', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { conversationId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof conversationId === 'string') where.conversationId = conversationId;
    const classifications = await prisma.conversationClassificationResult.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ classifications });
  } catch (error) {
    next(error);
  }
});

router.post('/follow-ups', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = followUpRecommendSchema.parse(req.body);
    const followUp = await classificationService.recommendFollowUp(authReq.workspaceId, {
      conversationId: data.conversationId,
      leadId: data.leadId,
    });
    res.status(201).json({ followUp });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/follow-ups', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { conversationId, leadId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof conversationId === 'string') where.conversationId = conversationId;
    if (typeof leadId === 'string') where.leadId = leadId;
    const followUps = await prisma.followUpRecommendation.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ followUps });
  } catch (error) {
    next(error);
  }
});

router.post('/content-signals', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = salesContentSignalCreateSchema.parse(req.body);
    const signal = await bridgeService.createSignal(authReq.workspaceId, {
      signalType: data.signalType,
      conversationIds: data.sourceConversationIds,
      evidence: data.evidence,
      recommendedAngle: data.recommendedAngle,
      reasoning: data.reasoning,
    });
    res.status(201).json({ signal });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/content-signals', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const signals = await prisma.salesContentSignal.findMany({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ signals });
  } catch (error) {
    next(error);
  }
});

router.get('/content-signals/:signalId/content-input', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { signalId } = req.params;
    if (!signalId) throw new NotFoundError('Sales Content Signal');
    const input = await bridgeService.toContentInput(authReq.workspaceId, signalId);
    res.json({ contentInput: input });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/objections', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const rawMin = typeof req.query.minSampleSize === 'string' ? parseInt(req.query.minSampleSize, 10) : 2;
    const minSampleSize = Number.isFinite(rawMin) ? Math.min(50, Math.max(1, rawMin)) : 2;
    const aggregation = await aggregateObjectionPatterns(prisma, authReq.workspaceId, minSampleSize);
    res.json({ objections: aggregation });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/topics/:topicId/relevance', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { topicId } = req.params;
    if (!topicId) throw new NotFoundError('Topic');
    const { leadId } = req.query;
    const topic = await prisma.topic.findFirst({ where: { id: topicId, workspaceId: authReq.workspaceId } });
    if (!topic) throw new NotFoundError('Topic');
    if (typeof leadId === 'string') {
      const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId: authReq.workspaceId } });
      if (!lead) throw new NotFoundError('Lead');
    }
    const icp = await prisma.iCP.findFirst({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { updatedAt: 'desc' },
    });
    const relevance = await computeTopicRelevance(prisma, authReq.workspaceId, {
      topicId,
      leadId: typeof leadId === 'string' ? leadId : undefined,
      icp: icp ? {
        id: icp.id,
        name: icp.name,
        description: icp.description,
        targetRoles: icp.targetRoles,
        industries: icp.industries,
        companySize: icp.companySize,
        problems: icp.problems,
        exclusions: icp.exclusions,
      } : null,
    });
    res.json({ relevance, icpUsed: icp ? { id: icp.id, name: icp.name } : null });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

export default router;
