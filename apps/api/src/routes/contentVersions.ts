import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { contentVersionCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ValidationError, NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, contentDraftId } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (contentDraftId) {
      where.contentDraftId = contentDraftId;
    }

    const [contentVersions, total] = await Promise.all([
      prisma.contentVersion.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          contentDraft: { select: { id: true, contentIdeaId: true, version: true } },
        },
      }),
      prisma.contentVersion.count({ where }),
    ]);

    res.json({ contentVersions, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = contentVersionCreateSchema.parse(req.body);

    const contentDraft = await prisma.contentDraft.findFirst({
      where: { id: data.contentDraftId, workspaceId: authReq.workspaceId },
    });

    if (!contentDraft) {
      throw new NotFoundError('Content Draft');
    }

    const existingVersion = await prisma.contentVersion.findUnique({
      where: { contentDraftId_version: { contentDraftId: data.contentDraftId, version: data.version } },
    });

    if (existingVersion) {
      throw new ValidationError(`Version ${data.version} already exists for this draft`);
    }

    const contentVersion = await prisma.contentVersion.create({
      data: {
        workspaceId: authReq.workspaceId,
        contentDraftId: data.contentDraftId,
        authorId: authReq.user.id,
        body: data.body,
        version: data.version,
        changeSummary: data.changeSummary,
      },
    });

    res.status(201).json({ contentVersion });
  } catch (error) {
    next(error);
  }
});

router.get('/:contentVersionId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentVersionId } = req.params;

    const contentVersion = await prisma.contentVersion.findFirst({
      where: { id: contentVersionId, workspaceId: authReq.workspaceId },
      include: {
        contentDraft: { select: { id: true, contentIdeaId: true, version: true } },
      },
    });

    if (!contentVersion) {
      throw new NotFoundError('Content Version');
    }

    res.json({ contentVersion });
  } catch (error) {
    next(error);
  }
});

router.delete('/:contentVersionId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentVersionId } = req.params;

    const contentVersion = await prisma.contentVersion.findFirst({
      where: { id: contentVersionId, workspaceId: authReq.workspaceId },
    });

    if (!contentVersion) {
      throw new NotFoundError('Content Version');
    }

    await prisma.contentVersion.delete({ where: { id: contentVersionId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;