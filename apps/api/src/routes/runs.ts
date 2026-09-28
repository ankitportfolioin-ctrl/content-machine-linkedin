import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { runsTriggerSchema } from '@growth-operator/schemas';
import { NotFoundError } from '../utils/errors';
import { getLatestRuns, getRunWithStages, runDailyLoop } from '../worker/dailyRun';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const take = Math.min(50, Math.max(1, Number(req.query.take ?? 20) || 20));
    res.json({ runs: await getLatestRuns(authReq.workspaceId, take) });
  } catch (error) {
    next(error);
  }
});

router.get('/:runId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { runId } = req.params;
    if (!runId) throw new NotFoundError('Daily Run');
    const run = await getRunWithStages(authReq.workspaceId, runId);
    if (!run) throw new NotFoundError('Daily Run');
    res.json({ run });
  } catch (error) {
    next(error);
  }
});

router.post('/trigger', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = runsTriggerSchema.parse(req.body ?? {});
    // Manual Tier-0 run: idempotent, writes only prepared/ledger state.
    // Execution stays policy-gated (EXECUTION stage always SKIPPED in Step C).
    const result = await runDailyLoop(authReq.workspaceId, data.runDate);
    res.status(201).json({ result });
  } catch (error) {
    next(error);
  }
});

export default router;
