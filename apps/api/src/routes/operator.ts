import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { operatorActionsQuerySchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { createDefaultRegistry } from '@growth-operator/ai';
import { OperatorActionService, explainWithAi, extractResultKeys, extractSalesResultKeys } from '@growth-operator/decision';
import { forwardDecisionError } from '../utils/decisionErrors';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY);
const actionService = new OperatorActionService(prisma);

router.get('/next-actions', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const query = operatorActionsQuerySchema.parse(req.query);
    void query;

    const ranked = await actionService.refreshWorkspace(authReq.workspaceId, 50);
    const filtered = query.kind ? ranked.filter((a) => a.kind === query.kind) : ranked;
    const persisted = await prisma.operatorAction.findMany({
      where: { workspaceId: authReq.workspaceId, status: 'PENDING' },
      select: { id: true, identityKey: true, subjectMeta: true },
    });
    const idByKey = new Map(persisted.map((r) => [r.identityKey, r.id]));
    const metaByKey = new Map(persisted.map((r) => [r.identityKey, r.subjectMeta]));
    res.json({
      actions: filtered.map((a) => ({
        id: idByKey.get(a.identityKey) ?? null,
        identityKey: a.identityKey,
        kind: a.kind,
        subjectId: a.subjectId,
        title: a.title,
        score: a.score,
        reasons: a.reasons,
        evidenceLinks: a.evidenceLinks,
        subjectMeta: { ...((a.facts.subjectMeta ?? {}) as object), ...extractResultKeys(metaByKey.get(a.identityKey)), ...extractSalesResultKeys(metaByKey.get(a.identityKey)) },
        status: 'PENDING' as const,
      })),
      total: filtered.length,
    });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.get('/actions', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const query = operatorActionsQuerySchema.parse(req.query);
    const status = query.status.toUpperCase() as 'PENDING' | 'DISMISSED' | 'COMPLETED';

    const actions = await actionService.listWorkspace(
      authReq.workspaceId,
      status,
      query.limit
    );
    res.json({ actions });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.post('/actions/:actionId/dismiss', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { actionId } = req.params;
    if (!actionId) throw new NotFoundError('Operator Action');
    const action = await actionService.transition(authReq.workspaceId, actionId, 'DISMISSED');
    res.json({ action });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.post('/actions/:actionId/complete', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { actionId } = req.params;
    if (!actionId) throw new NotFoundError('Operator Action');
    const action = await actionService.transition(authReq.workspaceId, actionId, 'COMPLETED');
    res.json({ action });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.post('/actions/:actionId/ideas', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { actionId } = req.params;
    if (!actionId) throw new NotFoundError('Operator Action');
    const result = await actionService.initiateIdea(authReq.workspaceId, actionId, authReq.user.id);
    res.status(201).json(result);
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.post('/actions/:actionId/research', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { actionId } = req.params;
    if (!actionId) throw new NotFoundError('Operator Action');
    const result = await actionService.initiateSalesResearch(authReq.workspaceId, actionId);
    res.status(201).json(result);
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.get('/explanations/:actionId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { actionId } = req.params;
    if (!actionId) throw new NotFoundError('Operator Action');
    const { format } = req.query;

    const explanation = await actionService.explain(authReq.workspaceId, actionId);
    if (format === 'ai') {
      try {
        const ai = await explainWithAi(aiRegistry, explanation);
        return res.json({ explanation, aiSummary: ai.summary, aiAvailable: true });
      } catch (error) {
        return res.json({ explanation, aiAvailable: false, aiError: (error as Error).message });
      }
    }
    res.json({ explanation });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

export default router;
