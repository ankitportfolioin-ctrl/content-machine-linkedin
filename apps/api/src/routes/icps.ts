import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { icpCreateSchema, icpUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [icps, total] = await Promise.all([
      prisma.iCP.findMany({
        where: { workspaceId: authReq.workspaceId },
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.iCP.count({ where: { workspaceId: authReq.workspaceId } }),
    ]);

    res.json({ icps, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    // icpCreateSchema already accepts the full product surface (targetRoles,
    // industries, companySize, problems, exclusions) — persist all of it so
    // qualification reads real values instead of empty arrays.
    const data = icpCreateSchema.parse(req.body);

    const icp = await prisma.iCP.create({
      data: {
        workspaceId: authReq.workspaceId,
        name: data.name,
        description: data.description,
        criteria: data.criteria as any,
        targetRoles: data.targetRoles ?? [],
        industries: data.industries ?? [],
        companySize: data.companySize,
        problems: data.problems,
        exclusions: data.exclusions,
      },
    });

    res.status(201).json({ icp });
  } catch (error) {
    next(error);
  }
});

router.get('/:icpId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { icpId } = req.params;

    const icp = await prisma.iCP.findFirst({
      where: { id: icpId, workspaceId: authReq.workspaceId },
    });

    if (!icp) {
      throw new NotFoundError('ICP');
    }

    res.json({ icp });
  } catch (error) {
    next(error);
  }
});

router.patch('/:icpId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { icpId } = req.params;
    const data = icpUpdateSchema.parse(req.body);

    const icp = await prisma.iCP.findFirst({
      where: { id: icpId, workspaceId: authReq.workspaceId },
    });

    if (!icp) {
      throw new NotFoundError('ICP');
    }

    const updated = await prisma.iCP.update({
      where: { id: icpId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.criteria !== undefined ? { criteria: data.criteria as any } : {}),
        ...(data.targetRoles !== undefined ? { targetRoles: data.targetRoles } : {}),
        ...(data.industries !== undefined ? { industries: data.industries } : {}),
        ...(data.companySize !== undefined ? { companySize: data.companySize } : {}),
        ...(data.problems !== undefined ? { problems: data.problems } : {}),
        ...(data.exclusions !== undefined ? { exclusions: data.exclusions } : {}),
      },
    });

    res.json({ icp: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/:icpId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { icpId } = req.params;

    const icp = await prisma.iCP.findFirst({
      where: { id: icpId, workspaceId: authReq.workspaceId },
    });

    if (!icp) {
      throw new NotFoundError('ICP');
    }

    await prisma.iCP.delete({ where: { id: icpId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;