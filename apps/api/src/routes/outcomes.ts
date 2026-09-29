import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { outcomeMetricCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { OutcomeService } from '@growth-operator/learning';
import { AttributionService } from '@growth-operator/business';
import { forwardLearningError } from '../utils/learningErrors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const outcomeService = new OutcomeService(prisma);

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = outcomeMetricCreateSchema.parse(req.body);
    const metric = await outcomeService.recordOutcome(authReq.workspaceId, authReq.user.id, {
      publishRecordId: data.publishRecordId,
      contentVersionId: data.contentVersionId,
      outreachDraftId: data.outreachDraftId,
      pipelineOpportunityId: data.pipelineOpportunityId,
      metricName: data.metricName,
      metricValue: data.metricValue,
      unit: data.unit,
      source: data.source,
      recordedAt: data.recordedAt ? new Date(data.recordedAt) : undefined,
      idempotencyKey: data.idempotencyKey,
    });
    res.status(201).json({
      outcomeMetric: metric,
      notice: 'User-recorded outcome. Values are stored as recorded, never estimated or inferred.',
    });
  } catch (error) {
    forwardLearningError(error, next);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { metricName, publishRecordId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof metricName === 'string') where.metricName = metricName;
    if (typeof publishRecordId === 'string') where.publishRecordId = publishRecordId;
    const metrics = await prisma.outcomeMetric.findMany({ where, orderBy: { recordedAt: 'desc' }, take: 500 });
    res.json({ outcomeMetrics: metrics });
  } catch (error) {
    next(error);
  }
});

router.get('/:metricId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { metricId } = req.params;
    if (!metricId) throw new NotFoundError('Outcome Metric');
    const metric = await prisma.outcomeMetric.findFirst({ where: { id: metricId, workspaceId: authReq.workspaceId } });
    if (!metric) throw new NotFoundError('Outcome Metric');
    // Batch 2 (D): surface the evidence level honestly. UNKNOWN is
    // reported as UNKNOWN — never a stronger label than evidence supports.
    const attribution = new AttributionService(prisma);
    const links = await attribution.listForTarget(authReq.workspaceId, 'outcomeMetric', metricId);
    res.json({
      outcomeMetric: metric,
      attribution: { links, strongest: AttributionService.strongest(links) },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
