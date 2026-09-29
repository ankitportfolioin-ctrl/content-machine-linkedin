import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { attributionLinkSchema, attributionUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { AttributionService, AttributionError, AttributionType } from '@growth-operator/business';
import { AppError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const service = new AttributionService(prisma);

function forwardAttributionError(error: unknown, next: (err: unknown) => void): void {
  if (error instanceof AttributionError) {
    next(new AppError(error.message, 422, error.code));
    return;
  }
  next(error);
}

/** Batch 2 (D): create (or evidence-guarded update) an attribution link. */
router.post('/links', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = attributionLinkSchema.parse(req.body);
    const link = await service.link({
      workspaceId: authReq.workspaceId,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      targetType: data.targetType,
      targetId: data.targetId,
      attributionType: data.attributionType as AttributionType,
      evidenceRefs: data.evidenceRefs,
      reason: data.reason,
      recordedBy: authReq.user.id,
    });
    res.status(201).json({ link });
  } catch (error) {
    forwardAttributionError(error, next);
  }
});

router.patch('/links/:linkId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { linkId } = req.params;
    if (!linkId) {
      next(new AppError('Attribution link id is required.', 400, 'VALIDATION_ERROR'));
      return;
    }
    const data = attributionUpdateSchema.parse(req.body);
    const link = await service.update(authReq.workspaceId, linkId, {
      attributionType: data.attributionType as AttributionType | undefined,
      evidenceRefs: data.evidenceRefs,
      reason: data.reason,
      recordedBy: authReq.user.id,
    });
    res.json({ link });
  } catch (error) {
    forwardAttributionError(error, next);
  }
});

/**
 * Batch 2 (D): links pointing at a record (e.g. an outcome metric or
 * pipeline opportunity), with the strongest defensible level called out.
 * UNKNOWN is reported honestly when nothing defensible exists.
 */
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { targetType, targetId, sourceType, sourceId } = req.query as Record<string, string | undefined>;
    if (targetType && targetId) {
      const links = await service.listForTarget(authReq.workspaceId, targetType, targetId);
      res.json({ links, strongest: AttributionService.strongest(links) });
      return;
    }
    if (sourceType && sourceId) {
      const links = await service.listForSource(authReq.workspaceId, sourceType, sourceId);
      res.json({ links, strongest: AttributionService.strongest(links) });
      return;
    }
    next(new AppError('Provide targetType+targetId or sourceType+sourceId.', 400, 'VALIDATION_ERROR'));
  } catch (error) {
    forwardAttributionError(error, next);
  }
});

export default router;
