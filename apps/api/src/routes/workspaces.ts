import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { workspaceCreateSchema, workspaceUpdateSchema, workspaceMembershipCreateSchema, workspaceMembershipUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';
import { generateId } from '@growth-operator/shared';

const router: ExpressRouter = Router();

// Apply auth middleware to all workspace routes
router.use(authMiddleware);

// Routes that don't require a specific workspace context
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;

    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId: authReq.user.id },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, description: true, isActive: true, createdAt: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const workspaces = memberships.map((m: { workspace: { id: string; name: string; slug: string; description: string | null; isActive: boolean; createdAt: Date }; role: string }) => ({
      ...m.workspace,
      role: m.role,
    }));

    res.json({ workspaces });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = workspaceCreateSchema.parse(req.body);

    const slug = data.slug || generateId().slice(0, 8);

    const existingSlug = await prisma.workspace.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ConflictError('Workspace slug already exists');
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        memberships: {
          create: {
            userId: authReq.user.id,
            role: 'OWNER',
          },
        },
      },
      include: {
        memberships: {
          where: { userId: authReq.user.id },
          select: { role: true },
        },
      },
    });

    res.status(201).json({ workspace });
  } catch (error) {
    next(error);
  }
});

// Routes that require a specific workspace context
const workspaceScopedRouter: ExpressRouter = Router();
workspaceScopedRouter.use(workspaceMiddleware);
workspaceScopedRouter.use(workspaceMembershipMiddleware);

workspaceScopedRouter.get('/:workspaceId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { workspaceId } = req.params;

    if (workspaceId !== authReq.workspaceId) {
      throw new ValidationError('Workspace ID mismatch');
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, email: true, name: true, avatarUrl: true } },
          },
        },
        _count: {
          select: { profiles: true, icps: true, contentIdeas: true, leads: true },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundError('Workspace');
    }

    res.json({ workspace });
  } catch (error) {
    next(error);
  }
});

workspaceScopedRouter.patch('/:workspaceId', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { workspaceId } = req.params;
    const data = workspaceUpdateSchema.parse(req.body);

    if (workspaceId !== authReq.workspaceId) {
      throw new ValidationError('Workspace ID mismatch');
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data,
    });

    res.json({ workspace });
  } catch (error) {
    next(error);
  }
});

workspaceScopedRouter.get('/:workspaceId/members', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { workspaceId } = req.params;

    if (workspaceId !== authReq.workspaceId) {
      throw new ValidationError('Workspace ID mismatch');
    }

    const members = await prisma.workspaceMembership.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true, isActive: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });

    res.json({ members });
  } catch (error) {
    next(error);
  }
});

workspaceScopedRouter.post('/:workspaceId/members', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { workspaceId } = req.params;
    const data = workspaceMembershipCreateSchema.parse(req.body);

    if (workspaceId !== authReq.workspaceId) {
      throw new ValidationError('Workspace ID mismatch');
    }

    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const existing = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: data.userId, workspaceId } },
    });

    if (existing) {
      throw new ConflictError('User is already a member of this workspace');
    }

    const membership = await prisma.workspaceMembership.create({
      data: {
        userId: data.userId,
        workspaceId,
        role: data.role!.toUpperCase() as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
      },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
    });

    res.status(201).json({ membership });
  } catch (error) {
    next(error);
  }
});

workspaceScopedRouter.patch('/:workspaceId/members/:userId', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { workspaceId, userId } = req.params;
    const data = workspaceMembershipUpdateSchema.parse(req.body);

    if (workspaceId !== authReq.workspaceId) {
      throw new ValidationError('Workspace ID mismatch');
    }

    if (userId === authReq.user.id && data.role!.toUpperCase() !== 'OWNER') {
      throw new ValidationError('Cannot change your own role from owner');
    }

    const membership = await prisma.workspaceMembership.update({
      where: { userId_workspaceId: { userId: userId!, workspaceId: workspaceId! } },
      data: { role: data.role!.toUpperCase() as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
    });

    res.json({ membership });
  } catch (error) {
    next(error);
  }
});

workspaceScopedRouter.delete('/:workspaceId/members/:userId', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { workspaceId, userId } = req.params;

    if (workspaceId !== authReq.workspaceId) {
      throw new ValidationError('Workspace ID mismatch');
    }

    if (userId === authReq.user.id) {
      throw new ValidationError('Cannot remove yourself from workspace');
    }

    const membership = await prisma.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId: userId!, workspaceId: workspaceId! } },
    });

    if (!membership) {
      throw new NotFoundError('Membership');
    }

    if (membership.role === 'OWNER') {
      throw new ValidationError('Cannot remove workspace owner');
    }

    await prisma.workspaceMembership.delete({
      where: { userId_workspaceId: { userId: userId!, workspaceId: workspaceId! } },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Mount the workspace-scoped routes
router.use('/', workspaceScopedRouter);

export default router;