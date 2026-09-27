import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { publishRecordCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { PublishService } from '@growth-operator/learning';
import { forwardLearningError } from '../utils/learningErrors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const publishService = new PublishService(prisma);

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = publishRecordCreateSchema.parse(req.body);
    const record = await publishService.recordPublication(authReq.workspaceId, authReq.user.id, {
      contentVersionId: data.contentVersionId,
      outreachDraftId: data.outreachDraftId,
      pipelineOpportunityId: data.pipelineOpportunityId,
      channel: data.channel,
      externalRef: data.externalRef,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : undefined,
    });
    res.status(201).json({
      publishRecord: record,
      notice: 'Publication recorded as a user assertion. External publication was not verified by the system.',
    });
  } catch (error) {
    forwardLearningError(error, next);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const records = await prisma.publishRecord.findMany({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });
    res.json({ publishRecords: records });
  } catch (error) {
    next(error);
  }
});

router.get('/:recordId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { recordId } = req.params;
    if (!recordId) throw new NotFoundError('Publish Record');
    const record = await prisma.publishRecord.findFirst({
      where: { id: recordId, workspaceId: authReq.workspaceId },
      include: { outcomeMetrics: { select: { id: true, metricName: true, metricValue: true, source: true } } },
    });
    if (!record) throw new NotFoundError('Publish Record');
    res.json({ publishRecord: record });
  } catch (error) {
    next(error);
  }
});

export default router;
