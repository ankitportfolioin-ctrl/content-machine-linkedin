import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { commentIngestSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { CommentBrainService } from '@growth-operator/business';

const router: ExpressRouter = Router();
router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const svc = new CommentBrainService(prisma);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { type, contentVersionId } = req.query as Record<string, string>;
    res.json({ comments: await svc.list(authReq.workspaceId, { ...(type ? { type } : {}), ...(contentVersionId ? { contentVersionId } : {}) }) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = commentIngestSchema.parse(req.body);
    res.status(201).json(await svc.ingest(authReq.workspaceId, data));
  } catch (e) { next(e); }
});

router.get('/signals', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const signals = await prisma.audienceSignal.findMany({ where: { workspaceId: authReq.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ signals });
  } catch (e) { next(e); }
});

// Batch 2 (F): sales intelligence signals originating from comments.
// LEAD_SIGNAL is not a confirmed lead: signals wait for human review and
// never auto-create prospects, outreach, or conversations.
router.get('/sales-signals', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { status } = req.query as Record<string, string | undefined>;
    res.json({ signals: await svc.listSalesSignals(authReq.workspaceId, status) });
  } catch (e) { next(e); }
});

router.get('/:commentId/sales-signals', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { commentId } = req.params;
    if (!commentId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'commentId is required.' } });
      return;
    }
    res.json({ signals: await svc.salesSignalsForComment(authReq.workspaceId, commentId) });
  } catch (e) { next(e); }
});

router.post('/sales-signals/:signalId/review', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { signalId } = req.params;
    if (!signalId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'signalId is required.' } });
      return;
    }
    const decision = req.body?.decision === 'DISMISSED' ? 'DISMISSED' : 'REVIEWED';
    res.json({
      signal: await svc.reviewSalesSignal(authReq.workspaceId, signalId, decision, authReq.user.id),
    });
  } catch (e) { next(e); }
});

export default router;
