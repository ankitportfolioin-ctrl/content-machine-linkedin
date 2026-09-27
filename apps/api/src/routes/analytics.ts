import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { analyticsEventCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { AggregationService, RateDefinition } from '@growth-operator/learning';
const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, eventType } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (eventType && typeof eventType === 'string') {
      where.eventType = eventType;
    }

    const [events, total] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where,
        orderBy: { [sortBy as string || 'timestamp']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.analyticsEvent.count({ where }),
    ]);

    res.json({ events, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = analyticsEventCreateSchema.parse(req.body);

    const event = await prisma.analyticsEvent.create({
      data: {
        workspaceId: authReq.workspaceId,
        userId: authReq.user.id,
        eventType: data.eventType,
        eventName: data.eventName,
        properties: data.properties as any,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      },
    });

    res.status(201).json({ event });
  } catch (error) {
    next(error);
  }
});

const aggregationService = new AggregationService(prisma);

router.get('/summary', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { metricName, from, to, rates } = req.query;

    let rateDefinitions: RateDefinition[] = [];
    if (typeof rates === 'string' && rates.length > 0) {
      try {
        const parsed = JSON.parse(rates) as unknown;
        if (Array.isArray(parsed)) {
          rateDefinitions = (parsed as Array<{ name?: string; numeratorMetric?: string; denominatorMetric?: string }>)
            .filter((r) => r && typeof r.name === 'string' && typeof r.numeratorMetric === 'string' && typeof r.denominatorMetric === 'string')
            .map((r) => ({ name: r.name as string, numeratorMetric: r.numeratorMetric as string, denominatorMetric: r.denominatorMetric as string }));
        }
      } catch {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid rates parameter; expected JSON array of {name, numeratorMetric, denominatorMetric}.' } });
      }
    }

    const summary = await aggregationService.summarize(authReq.workspaceId, {
      metricName: typeof metricName === 'string' ? metricName : undefined,
      from: typeof from === 'string' ? new Date(from) : undefined,
      to: typeof to === 'string' ? new Date(to) : undefined,
      rates: rateDefinitions,
    });
    res.json({
      summary,
      notice: 'Computed exclusively from user-recorded OutcomeMetric rows. Empty or insufficient data is reported explicitly, never estimated.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;