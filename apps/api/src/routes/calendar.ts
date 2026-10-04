import { Router, Router as ExpressRouter } from 'express';
import {
  authMiddleware,
  workspaceMiddleware,
  workspaceMembershipMiddleware,
  AuthenticatedRequest,
} from '../middleware/auth';
import { prisma } from '@growth-operator/db';
import { CalendarService } from '@growth-operator/content';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const calendar = new CalendarService(prisma);

// GET /api/v1/calendar?days=30 — planning-only read model. Sequencing and
// de-conflicting prepared work; never schedules or dispatches anything.
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const raw = Number.parseInt(String(req.query.days ?? '30'), 10);
    const days = Number.isFinite(raw) ? raw : 30;
    res.json({ calendar: await calendar.view(authReq.workspaceId, { days }) });
  } catch (error) {
    next(error);
  }
});

export default router;
