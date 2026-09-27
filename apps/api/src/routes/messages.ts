import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { messageCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, conversationId } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (conversationId) {
      where.conversationId = conversationId;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'asc' },
        skip,
        take: limitNum,
        include: {
          conversation: { select: { id: true, subject: true, leadId: true } },
        },
      }),
      prisma.message.count({ where }),
    ]);

    res.json({ messages, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = messageCreateSchema.parse(req.body);

    const conversation = await prisma.conversation.findFirst({
      where: { id: data.conversationId, workspaceId: authReq.workspaceId },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation');
    }

    const message = await prisma.message.create({
      data: {
        workspaceId: authReq.workspaceId,
        conversationId: data.conversationId,
        senderId: authReq.user.id,
        body: data.body,
        direction: data.direction.toUpperCase() as 'INBOUND' | 'OUTBOUND',
        linkedinMessageId: data.linkedinMessageId,
      },
    });

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
});

router.get('/:messageId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { messageId } = req.params;

    const message = await prisma.message.findFirst({
      where: { id: messageId, workspaceId: authReq.workspaceId },
      include: {
        conversation: { select: { id: true, subject: true, leadId: true } },
      },
    });

    if (!message) {
      throw new NotFoundError('Message');
    }

    res.json({ message });
  } catch (error) {
    next(error);
  }
});

router.delete('/:messageId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { messageId } = req.params;

    const message = await prisma.message.findFirst({
      where: { id: messageId, workspaceId: authReq.workspaceId },
    });

    if (!message) {
      throw new NotFoundError('Message');
    }

    await prisma.message.delete({ where: { id: messageId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;