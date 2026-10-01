import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { feedSourceCreateSchema, feedSourceUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError, ValidationError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const TYPE_MAP = {
  rss: 'RSS',
  atom: 'ATOM',
  hackernews: 'HACKERNEWS',
  github_releases: 'GITHUB_RELEASES',
  blog: 'BLOG',
  site: 'SITE',
  reddit: 'REDDIT',
  youtube: 'YOUTUBE',
  google_trends: 'GOOGLE_TRENDS',
  linkedin: 'LINKEDIN',
  x: 'X',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
} as const;

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { active } = req.query as Record<string, string | undefined>;
    const feeds = await prisma.feedSource.findMany({
      where: {
        workspaceId: authReq.workspaceId,
        ...(active === 'true' ? { active: true } : {}),
        ...(active === 'false' ? { active: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ feeds });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = feedSourceCreateSchema.parse(req.body);
    const existing = await prisma.feedSource.findUnique({
      where: { workspaceId_url: { workspaceId: authReq.workspaceId, url: data.url } },
    });
    if (existing) {
      throw new ValidationError('This URL is already a feed source in this workspace.');
    }
    const feed = await prisma.feedSource.create({
      data: {
        workspaceId: authReq.workspaceId,
        url: data.url,
        type: TYPE_MAP[data.type],
        name: data.name ?? null,
        active: data.active,
      },
    });
    res.status(201).json({ feed });
  } catch (error) {
    next(error);
  }
});

router.patch('/:feedId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { feedId } = req.params;
    if (!feedId) throw new NotFoundError('Feed Source');
    const data = feedSourceUpdateSchema.parse(req.body);
    const existing = await prisma.feedSource.findFirst({
      where: { id: feedId, workspaceId: authReq.workspaceId },
    });
    if (!existing) throw new NotFoundError('Feed Source');
    const feed = await prisma.feedSource.update({
      where: { id: feedId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: TYPE_MAP[data.type] } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    res.json({ feed });
  } catch (error) {
    next(error);
  }
});

router.delete('/:feedId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { feedId } = req.params;
    if (!feedId) throw new NotFoundError('Feed Source');
    const existing = await prisma.feedSource.findFirst({
      where: { id: feedId, workspaceId: authReq.workspaceId },
    });
    if (!existing) throw new NotFoundError('Feed Source');
    await prisma.feedSource.delete({ where: { id: feedId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
