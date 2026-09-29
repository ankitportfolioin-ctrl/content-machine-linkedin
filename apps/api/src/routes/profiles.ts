import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { profileCreateSchema, profileUpdateSchema } from '@growth-operator/schemas';
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
    const data = profileCreateSchema.parse(req.body);

    const existing = await prisma.profile.findUnique({
      where: { userId_workspaceId: { userId: authReq.user.id, workspaceId: authReq.workspaceId } },
    });

    if (existing) {
      const updated = await prisma.profile.update({
        where: { id: existing.id },
        data: {
          linkedinUrl: data.linkedinUrl,
          headline: data.headline,
          role: data.role,
          summary: data.summary,
          professionalContext: data.professionalContext,
          industry: data.industry,
          location: data.location,
          avatarUrl: data.avatarUrl,
        },
      });
      return res.json({ profile: updated });
    }

    const profile = await prisma.profile.create({
      data: {
        userId: authReq.user.id,
        workspaceId: authReq.workspaceId,
        linkedinUrl: data.linkedinUrl,
        headline: data.headline,
        role: data.role,
        summary: data.summary,
        professionalContext: data.professionalContext,
        industry: data.industry,
        location: data.location,
        avatarUrl: data.avatarUrl,
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

    // Allowlisted + validated: unknown keys (e.g. legacy `name`/`bio`) are
    // stripped by zod instead of crashing Prisma.
    const data = profileUpdateSchema.parse(req.body);

    const updated = await prisma.profile.update({
      where: { id: profileId },
      data: {
        linkedinUrl: data.linkedinUrl,
        headline: data.headline,
        role: data.role,
        summary: data.summary,
        professionalContext: data.professionalContext,
        industry: data.industry,
        location: data.location,
        avatarUrl: data.avatarUrl,
      },
    });

    res.json({ profile: updated });
  } catch (error) {
    next(error);
  }
});

export default router;