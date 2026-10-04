import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { experimentCreateSchema, experimentCompleteSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ExperimentEngineService } from '@growth-operator/business';
import { NotFoundError, ValidationError, AppError } from '../utils/errors';

const router: ExpressRouter = Router();
router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const svc = new ExperimentEngineService(prisma);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { status } = req.query as Record<string, string>;
    res.json({ experiments: await svc.list(authReq.workspaceId, status) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = experimentCreateSchema.parse(req.body);
    res.status(201).json({ experiment: await svc.create(authReq.workspaceId, data) });
  } catch (e) { next(e); }
});

router.post('/:experimentId/start', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { experimentId } = req.params;
    if (!experimentId) throw new NotFoundError('Experiment');
    const experiment = await svc.start(authReq.workspaceId, experimentId);
    res.json({ experiment });
  } catch (e) {
    if (e instanceof Error && e.name === 'ExperimentNotFoundError') {
      next(new NotFoundError('Experiment'));
    } else if (e instanceof Error && e.name === 'ExperimentInvalidStateError') {
      next(new ValidationError(e.message));
    } else {
      next(e);
    }
  }
});

router.post('/:experimentId/complete', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { experimentId } = req.params;
    if (!experimentId) throw new NotFoundError('Experiment');
    const data = experimentCompleteSchema.parse(req.body);
    const experiment = await svc.complete(authReq.workspaceId, experimentId, data);
    res.status(201).json({ experiment });
  } catch (e) {
    if (e instanceof Error && e.name === 'ExperimentNotFoundError') {
      next(new NotFoundError('Experiment'));
    } else if (e instanceof Error && e.name === 'ExperimentInvalidStateError') {
      next(new ValidationError(e.message));
    } else if (e instanceof Error && e.name === 'ExperimentNotRunningError') {
      next(new AppError(e.message, 422, 'EXPERIMENT_NOT_RUNNING'));
    } else {
      next(e);
    }
  }
});

export default router;
