import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '@growth-operator/db';
import { AutoPreparationService } from '@growth-operator/decision';
import { forwardDecisionError } from '../utils/decisionErrors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const service = new AutoPreparationService(prisma);

/** Batch 2 (B): current policy + daily quota state. */
router.get('/status', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const status = await service.quotaStatus(authReq.workspaceId);
    res.json({ status });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

/** Batch 2 (B): auditable preparation log (why each item was prepared/skipped). */
router.get('/log', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 50)));
    const logs = await prisma.preparationLog.findMany({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    res.json({ logs });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

/**
 * Batch 2 (B): run one auto-preparation pass. Only prepares what prior
 * human judgment (or an explicit cold-prep policy) authorizes, within the
 * daily quota. Preparation is internal scaffolding for review — never
 * execution.
 */
router.post('/run', requireRole('OWNER', 'ADMIN', 'MEMBER'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const limit = typeof req.body?.limit === 'number' ? req.body.limit : 20;
    const result = await service.run(authReq.workspaceId, { actorId: authReq.user.id, limit });
    res.json(result);
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

export default router;
