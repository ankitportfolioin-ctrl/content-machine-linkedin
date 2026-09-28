import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '@growth-operator/db';
import { BrainReportService, DiversityService } from '@growth-operator/business';

const router: ExpressRouter = Router();
router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const brain = new BrainReportService(prisma);
const diversity = new DiversityService(prisma);

router.get('/today', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.json({ brain: await brain.today(authReq.workspaceId) });
  } catch (e) { next(e); }
});

router.get('/learning', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.json(await brain.learningDashboard(authReq.workspaceId));
  } catch (e) { next(e); }
});

router.post('/weekly', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { periodStart, periodEnd } = req.body as { periodStart?: string; periodEnd?: string };
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    res.status(201).json({ report: await brain.weekly(authReq.workspaceId, start, end) });
  } catch (e) { next(e); }
});

router.get('/reports', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { frequency, limit } = req.query as Record<string, string | undefined>;
    const take = Math.min(50, Math.max(1, Number(limit ?? 20) || 20));
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (frequency === 'DAILY' || frequency === 'WEEKLY' || frequency === 'MONTHLY') {
      where.frequency = frequency;
    }
    const reports = await prisma.intelligenceReport.findMany({ where, orderBy: { generatedAt: 'desc' }, take });
    res.json({ reports });
  } catch (e) { next(e); }
});

router.post('/diversity/snapshot', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { days } = req.body as { days?: number };
    res.status(201).json(await diversity.snapshot(authReq.workspaceId, days ?? 30));
  } catch (e) { next(e); }
});

router.get('/diversity/latest', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const snapshot = await diversity.latest(authReq.workspaceId);
    if (!snapshot) return res.json({ snapshot: null, message: 'Insufficient data: no diversity snapshot yet.' });
    res.json({ snapshot });
  } catch (e) { next(e); }
});

export default router;
