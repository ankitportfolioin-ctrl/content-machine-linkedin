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

// Gate 1 honesty: these types are served by the research connector registry
// (once per intelligence run), NOT by per-feed URL fetching. Accepting them
// as FeedSource rows would imply per-feed connector capability that does not
// exist, so creation/retargeting is refused with an honest explanation.
// The onboarding UI already offers only rss/atom/hackernews/github_releases/
// blog/site. The DB enum is left untouched (no migration; legacy rows, if any,
// keep flowing through generic URL ingestion).
const CONNECTOR_MANAGED_TYPES = new Set<string>([
  'REDDIT',
  'YOUTUBE',
  'GOOGLE_TRENDS',
  'LINKEDIN',
  'X',
  'INSTAGRAM',
  'TIKTOK',
]);

function rejectConnectorManagedType(rawType: string): void {
  const mapped = TYPE_MAP[rawType as keyof typeof TYPE_MAP];
  if (mapped && CONNECTOR_MANAGED_TYPES.has(mapped)) {
    throw new ValidationError(
      `Feed type '${rawType}' is served by the research connector registry, not by feed fetching. ` +
        `It cannot be added as a feed source. Reddit and Google Trends run automatically once per ` +
        `intelligence cycle; authenticated platforms need their own connection first. Nothing was created.`,
    );
  }
}

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
    rejectConnectorManagedType(data.type);
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
    if (data.type !== undefined) {
      rejectConnectorManagedType(data.type);
    }
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
