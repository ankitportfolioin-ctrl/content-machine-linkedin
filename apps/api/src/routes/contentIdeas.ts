import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { contentIdeaCreateSchema, contentIdeaUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, status } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (status && typeof status === 'string') {
      where.status = status.toUpperCase();
    }

    const [contentIdeas, total] = await Promise.all([
      prisma.contentIdea.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          drafts: {
            select: { id: true, version: true, createdAt: true },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.contentIdea.count({ where }),
    ]);

    res.json({ contentIdeas, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = contentIdeaCreateSchema.parse(req.body);

    const contentIdea = await prisma.contentIdea.create({
      data: {
        workspaceId: authReq.workspaceId,
        authorId: authReq.user.id,
        title: data.title,
        description: data.description,
        angle: data.angle,
        format: data.format?.toUpperCase() as 'POST' | 'ARTICLE' | 'CAROUSEL' | 'VIDEO' | 'POLL' | undefined,
        status: (data.status?.toUpperCase() as 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED') || 'DRAFT',
        tags: data.tags,
      },
    });

    res.status(201).json({ contentIdea });
  } catch (error) {
    next(error);
  }
});

router.get('/:contentIdeaId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentIdeaId } = req.params;

    const contentIdea = await prisma.contentIdea.findFirst({
      where: { id: contentIdeaId, workspaceId: authReq.workspaceId },
      include: {
        drafts: {
          orderBy: { version: 'desc' },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 5,
            },
          },
        },
      },
    });

    if (!contentIdea) {
      throw new NotFoundError('Content Idea');
    }

    res.json({ contentIdea });
  } catch (error) {
    next(error);
  }
});

router.patch('/:contentIdeaId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentIdeaId } = req.params;
    const data = contentIdeaUpdateSchema.parse(req.body);

    const contentIdea = await prisma.contentIdea.findFirst({
      where: { id: contentIdeaId, workspaceId: authReq.workspaceId },
    });

    if (!contentIdea) {
      throw new NotFoundError('Content Idea');
    }

    const updated = await prisma.contentIdea.update({
      where: { id: contentIdeaId },
      data: {
        title: data.title,
        description: data.description,
        angle: data.angle,
        format: data.format?.toUpperCase() as 'POST' | 'ARTICLE' | 'CAROUSEL' | 'VIDEO' | 'POLL' | undefined,
        status: data.status?.toUpperCase() as 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED' | undefined,
        tags: data.tags,
      },
    });

    res.json({ contentIdea: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/:contentIdeaId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentIdeaId } = req.params;

    const contentIdea = await prisma.contentIdea.findFirst({
      where: { id: contentIdeaId, workspaceId: authReq.workspaceId },
    });

    if (!contentIdea) {
      throw new NotFoundError('Content Idea');
    }

    await prisma.contentIdea.delete({ where: { id: contentIdeaId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;