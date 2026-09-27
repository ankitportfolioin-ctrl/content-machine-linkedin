import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { conversationCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, leadId } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (leadId) {
      where.leadId = leadId;
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          lead: { select: { id: true, name: true, company: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({ conversations, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = conversationCreateSchema.parse(req.body);

    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, workspaceId: authReq.workspaceId },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    const conversation = await prisma.conversation.create({
      data: {
        workspaceId: authReq.workspaceId,
        leadId: data.leadId,
        userId: authReq.user.id,
        subject: data.subject,
      },
    });

    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
});

router.get('/:conversationId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { conversationId } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId: authReq.workspaceId },
      include: {
        lead: { select: { id: true, name: true, linkedinUrl: true, company: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation');
    }

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

router.delete('/:conversationId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { conversationId } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId: authReq.workspaceId },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation');
    }

    await prisma.conversation.delete({ where: { id: conversationId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;