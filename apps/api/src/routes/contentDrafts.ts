import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { contentDraftCreateSchema, contentDraftUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ValidationError, NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, contentIdeaId } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (contentIdeaId) {
      where.contentIdeaId = contentIdeaId;
    }

    const [contentDrafts, total] = await Promise.all([
      prisma.contentDraft.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          contentIdea: { select: { id: true, title: true, status: true } },
          versions: { orderBy: { version: 'desc' }, take: 5 },
        },
      }),
      prisma.contentDraft.count({ where }),
    ]);

    res.json({ contentDrafts, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = contentDraftCreateSchema.parse(req.body);

    const contentIdea = await prisma.contentIdea.findFirst({
      where: { id: data.contentIdeaId, workspaceId: authReq.workspaceId },
    });

    if (!contentIdea) {
      throw new NotFoundError('Content Idea');
    }

    const existingDraft = await prisma.contentDraft.findUnique({
      where: { contentIdeaId_version: { contentIdeaId: data.contentIdeaId, version: data.version } },
    });

    if (existingDraft) {
      throw new ValidationError(`Draft version ${data.version} already exists for this content idea`);
    }

    const contentDraft = await prisma.contentDraft.create({
      data: {
        workspaceId: authReq.workspaceId,
        contentIdeaId: data.contentIdeaId,
        authorId: authReq.user.id,
        body: data.body,
        version: data.version,
      },
    });

    res.status(201).json({ contentDraft });
  } catch (error) {
    next(error);
  }
});

router.get('/:contentDraftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const contentDraft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
      include: {
        contentIdea: { select: { id: true, title: true, format: true, status: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });

    if (!contentDraft) {
      throw new NotFoundError('Content Draft');
    }

    res.json({ contentDraft });
  } catch (error) {
    next(error);
  }
});

router.patch('/:contentDraftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;
    const data = contentDraftUpdateSchema.parse(req.body);

    const contentDraft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
    });

    if (!contentDraft) {
      throw new NotFoundError('Content Draft');
    }

    const updated = await prisma.contentDraft.update({
      where: { id: contentDraftId },
      data: {
        body: data.body,
        version: data.version,
      },
    });

    res.json({ contentDraft: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/:contentDraftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const contentDraft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
    });

    if (!contentDraft) {
      throw new NotFoundError('Content Draft');
    }

    await prisma.contentDraft.delete({ where: { id: contentDraftId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;