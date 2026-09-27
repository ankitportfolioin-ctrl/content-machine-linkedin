import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { leadCreateSchema, leadUpdateSchema } from '@growth-operator/schemas';
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

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          conversations: { select: { id: true, subject: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          opportunities: { select: { id: true, name: true, stage: true, value: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({ leads, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = leadCreateSchema.parse(req.body);

    const lead = await prisma.lead.create({
      data: {
        workspaceId: authReq.workspaceId,
        linkedinUrl: data.linkedinUrl,
        name: data.name,
        headline: data.headline,
        company: data.company,
        location: data.location,
        status: data.status.toUpperCase() as 'NEW' | 'CONTACTED' | 'CONNECTED' | 'RESPONDING' | 'QUALIFIED' | 'DISQUALIFIED' | 'CLOSED',
        tags: data.tags,
        notes: data.notes,
      },
    });

    res.status(201).json({ lead });
  } catch (error) {
    next(error);
  }
});

router.get('/:leadId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId: authReq.workspaceId },
      include: {
        conversations: { orderBy: { createdAt: 'desc' } },
        opportunities: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

router.patch('/:leadId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.params;
    const data = leadUpdateSchema.parse(req.body);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId: authReq.workspaceId },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        linkedinUrl: data.linkedinUrl,
        name: data.name,
        headline: data.headline,
        company: data.company,
        location: data.location,
        status: data.status?.toUpperCase() as 'NEW' | 'CONTACTED' | 'CONNECTED' | 'RESPONDING' | 'QUALIFIED' | 'DISQUALIFIED' | 'CLOSED' | undefined,
        tags: data.tags,
        notes: data.notes,
      },
    });

    res.json({ lead: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/:leadId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId: authReq.workspaceId },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    await prisma.lead.delete({ where: { id: leadId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;