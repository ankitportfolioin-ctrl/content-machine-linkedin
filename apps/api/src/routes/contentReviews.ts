import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { reviewActionSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { ReviewService } from '@growth-operator/content';
import { forwardContentError } from '../utils/contentErrors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const reviewService = new ReviewService(prisma);

function toContentError(error: unknown, next: (err: unknown) => void): void {
  forwardContentError(error, next);
}

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId, status } = req.query;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (draftId && typeof draftId === 'string') where.draftId = draftId;
    if (status && typeof status === 'string') where.status = status.toUpperCase();

    const reviews = await prisma.contentReview.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { draftId, note } = req.body as { draftId?: string; note?: string };
    if (!draftId || typeof draftId !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'draftId is required.' } });
    }

    const review = await reviewService.submitForReview(authReq.workspaceId, draftId, authReq.user.id, note);
    res.status(201).json({ review });
  } catch (error) {
    toContentError(error, next);
  }
});

router.get('/:reviewId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { reviewId } = req.params;

    const review = await prisma.contentReview.findFirst({ where: { id: reviewId, workspaceId: authReq.workspaceId } });
    if (!review) throw new NotFoundError('Content Review');
    res.json({ review });
  } catch (error) {
    next(error);
  }
});

router.post('/:reviewId/decision', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { reviewId } = req.params;
    const data = reviewActionSchema.parse({ ...req.body, action: req.body?.action ?? 'approve' });

    if (data.action === 'submit') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Use POST /content-reviews to submit a review.' } });
    }

    const gateSummary = await latestGateSummary(authReq.workspaceId, reviewId);
    const review = await reviewService.transition(
      authReq.workspaceId,
      reviewId,
      data.action,
      { userId: authReq.user.id, role: authReq.workspaceRole },
      gateSummary
    );
    res.json({ review });
  } catch (error) {
    toContentError(error, next);
  }
});

async function latestGateSummary(workspaceId: string, reviewId: string): Promise<Array<{ gate: string; status: string }>> {
  const review = await prisma.contentReview.findFirst({ where: { id: reviewId, workspaceId } });
  if (!review) return [];
  const gates = await prisma.contentQualityGateResult.findMany({
    where: { workspaceId, draftId: review.draftId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const latestByGate = new Map<string, { gate: string; status: string }>();
  for (const gate of gates) {
    if (!latestByGate.has(gate.gate)) {
      latestByGate.set(gate.gate, { gate: gate.gate, status: gate.status });
    }
  }
  return [...latestByGate.values()];
}

export default router;
