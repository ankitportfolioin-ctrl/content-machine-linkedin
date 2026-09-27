import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { analyticsEventCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
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

export default router;