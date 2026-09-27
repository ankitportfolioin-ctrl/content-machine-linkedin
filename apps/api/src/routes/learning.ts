import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { learningSignalCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, sourceType, signalType } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (sourceType && typeof sourceType === 'string') {
      where.sourceType = sourceType.toUpperCase();
    }
    if (signalType && typeof signalType === 'string') {
      where.signalType = signalType;
    }

    const [signals, total] = await Promise.all([
      prisma.learningSignal.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.learningSignal.count({ where }),
    ]);

    res.json({ signals, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = learningSignalCreateSchema.parse(req.body);

    let sourceExists = false;
    const sourceTypeUpper = data.sourceType.toUpperCase() as 'CONTENT_PERFORMANCE' | 'ENGAGEMENT' | 'CONVERSION' | 'FEEDBACK';
    switch (sourceTypeUpper) {
      case 'CONTENT_PERFORMANCE': {
        const contentIdea = await prisma.contentIdea.findFirst({
          where: { id: data.sourceId, workspaceId: authReq.workspaceId },
        });
        sourceExists = !!contentIdea;
        break;
      }
      case 'ENGAGEMENT': {
        const lead = await prisma.lead.findFirst({
          where: { id: data.sourceId, workspaceId: authReq.workspaceId },
        });
        sourceExists = !!lead;
        break;
      }
      case 'CONVERSION': {
        const opportunity = await prisma.pipelineOpportunity.findFirst({
          where: { id: data.sourceId, workspaceId: authReq.workspaceId },
        });
        sourceExists = !!opportunity;
        break;
      }
      case 'FEEDBACK': {
        sourceExists = true;
        break;
      }
    }

    if (!sourceExists) {
      throw new NotFoundError(`Source ${data.sourceType} with id ${data.sourceId}`);
    }

    const signal = await prisma.learningSignal.create({
      data: {
        workspaceId: authReq.workspaceId,
        userId: authReq.user.id,
        sourceType: sourceTypeUpper,
        sourceId: data.sourceId,
        signalType: data.signalType,
        signalValue: data.signalValue,
        metadata: data.metadata as any,
      },
    });

    res.status(201).json({ signal });
  } catch (error) {
    next(error);
  }
});

export default router;;