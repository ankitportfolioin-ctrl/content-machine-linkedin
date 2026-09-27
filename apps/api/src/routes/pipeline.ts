import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { pipelineOpportunityCreateSchema, pipelineOpportunityUpdateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, stage, leadId } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (stage && typeof stage === 'string') {
      where.stage = stage.toUpperCase();
    }
    if (leadId) {
      where.leadId = leadId;
    }

    const [opportunities, total] = await Promise.all([
      prisma.pipelineOpportunity.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          lead: { select: { id: true, name: true, company: true, linkedinUrl: true } },
        },
      }),
      prisma.pipelineOpportunity.count({ where }),
    ]);

    res.json({ opportunities, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = pipelineOpportunityCreateSchema.parse(req.body);

    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, workspaceId: authReq.workspaceId },
    });

    if (!lead) {
      throw new NotFoundError('Lead');
    }

    const opportunity = await prisma.pipelineOpportunity.create({
      data: {
        workspaceId: authReq.workspaceId,
        leadId: data.leadId,
        ownerId: authReq.user.id,
        name: data.name,
        stage: data.stage.toUpperCase() as 'PROSPECTING' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST',
        value: data.value,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        probability: data.probability,
      },
    });

    res.status(201).json({ opportunity });
  } catch (error) {
    next(error);
  }
});

router.get('/:opportunityId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;

    const opportunity = await prisma.pipelineOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
      include: {
        lead: { select: { id: true, name: true, company: true, linkedinUrl: true } },
      },
    });

    if (!opportunity) {
      throw new NotFoundError('Pipeline Opportunity');
    }

    res.json({ opportunity });
  } catch (error) {
    next(error);
  }
});

router.patch('/:opportunityId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;
    const data = pipelineOpportunityUpdateSchema.parse(req.body);

    const opportunity = await prisma.pipelineOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
    });

    if (!opportunity) {
      throw new NotFoundError('Pipeline Opportunity');
    }

    const updated = await prisma.pipelineOpportunity.update({
      where: { id: opportunityId },
      data: {
        name: data.name,
        stage: data.stage?.toUpperCase() as 'PROSPECTING' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST' | undefined,
        value: data.value,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
        probability: data.probability,
      },
    });

    res.json({ opportunity: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/:opportunityId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;

    const opportunity = await prisma.pipelineOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
    });

    if (!opportunity) {
      throw new NotFoundError('Pipeline Opportunity');
    }

    await prisma.pipelineOpportunity.delete({ where: { id: opportunityId } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;