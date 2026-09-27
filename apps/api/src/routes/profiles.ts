import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const profiles = await prisma.profile.findMany({
      where: { workspaceId: authReq.workspaceId },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ profiles });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { linkedinUrl, headline, summary, industry, location, avatarUrl } = req.body;

    const existing = await prisma.profile.findUnique({
      where: { userId_workspaceId: { userId: authReq.user.id, workspaceId: authReq.workspaceId } },
    });

    if (existing) {
      const updated = await prisma.profile.update({
        where: { id: existing.id },
        data: { linkedinUrl, headline, summary, industry, location, avatarUrl },
      });
      return res.json({ profile: updated });
    }

    const profile = await prisma.profile.create({
      data: {
        userId: authReq.user.id,
        workspaceId: authReq.workspaceId,
        linkedinUrl,
        headline,
        summary,
        industry,
        location,
        avatarUrl,
      },
    });

    res.status(201).json({ profile });
  } catch (error) {
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const profile = await prisma.profile.findUnique({
      where: { userId_workspaceId: { userId: authReq.user.id, workspaceId: authReq.workspaceId } },
    });

    if (!profile) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Profile not found', timestamp: new Date().toISOString() },
      });
    }

    res.json({ profile });
  } catch (error) {
    next(error);
  }
});

router.patch('/:profileId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { profileId } = req.params;

    const profile = await prisma.profile.findFirst({
      where: { id: profileId, workspaceId: authReq.workspaceId },
    });

    if (!profile) {
      throw new NotFoundError('Profile');
    }

    if (profile.userId !== authReq.user.id) {
      const membership = await prisma.workspaceMembership.findUnique({
        where: { userId_workspaceId: { userId: authReq.user.id, workspaceId: authReq.workspaceId } },
      });
      if (!membership || membership.role === 'VIEWER') {
        throw new NotFoundError('Profile');
      }
    }

    const updated = await prisma.profile.update({
      where: { id: profileId },
      data: req.body,
    });

    res.json({ profile: updated });
  } catch (error) {
    next(error);
  }
});

export default router;