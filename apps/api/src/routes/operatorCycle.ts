import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { operatorCycleTriggerSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { OperatorCycleService } from '@growth-operator/decision';
import { forwardDecisionError } from '../utils/decisionErrors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const cycleService = new OperatorCycleService(prisma);

router.post('/cycle', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = operatorCycleTriggerSchema.parse(req.body ?? {});

    const result = await cycleService.runCycle({
      workspaceId: authReq.workspaceId,
      idempotencyKey: data.idempotencyKey,
      correlationId: data.correlationId,
      actorId: authReq.user.id,
    });

    res.status(201).json({ cycle: result });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.post('/cycle/resume', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = operatorCycleTriggerSchema.parse(req.body ?? {});

    const result = await cycleService.resumeCycle(
      authReq.workspaceId,
      data.idempotencyKey
    );

    res.json({ cycle: result });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.get('/cycle', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
    const cycles = await cycleService.listCycles(authReq.workspaceId, limit);
    res.json({ cycles });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.get('/cycle/:cycleId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { cycleId } = req.params;
    if (!cycleId) throw new NotFoundError('Operator Cycle');
    const cycle = await cycleService.getCycleById(authReq.workspaceId, cycleId);
    if (!cycle) throw new NotFoundError('Operator Cycle');
    res.json({ cycle });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

router.get('/cycle/key/:idempotencyKey', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { idempotencyKey } = req.params;
    if (!idempotencyKey) throw new NotFoundError('Operator Cycle');
    const cycle = await cycleService.getCycle(authReq.workspaceId, idempotencyKey);
    if (!cycle) throw new NotFoundError('Operator Cycle');
    res.json({ cycle });
  } catch (error) {
    forwardDecisionError(error, next);
  }
});

export default router;