import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { learningSignalCreateSchema, learningDeriveSchema, learningConfirmSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { LearningDerivationService, deriveProposal } from '@growth-operator/learning';
import { forwardLearningError } from '../utils/learningErrors';
const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, sourceType, signalType } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (sourceType && typeof sourceType === 'string') {
      where.sourceType = sourceType.toUpperCase();
    }
    if (signalType && typeof signalType === 'string') {
      where.signalType = signalType;
    }

    const [signals, total] = await Promise.all([
      prisma.learningSignal.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.learningSignal.count({ where }),
    ]);

    res.json({ signals, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = learningSignalCreateSchema.parse(req.body);

    let sourceExists = false;
    const sourceTypeUpper = data.sourceType.toUpperCase() as 'CONTENT_PERFORMANCE' | 'ENGAGEMENT' | 'CONVERSION' | 'FEEDBACK';
    switch (sourceTypeUpper) {
      case 'CONTENT_PERFORMANCE': {
        const contentIdea = await prisma.contentIdea.findFirst({
          where: { id: data.sourceId, workspaceId: authReq.workspaceId },
        });
        sourceExists = !!contentIdea;
        break;
      }
      case 'ENGAGEMENT': {
        const lead = await prisma.lead.findFirst({
          where: { id: data.sourceId, workspaceId: authReq.workspaceId },
        });
        sourceExists = !!lead;
        break;
      }
      case 'CONVERSION': {
        const opportunity = await prisma.pipelineOpportunity.findFirst({
          where: { id: data.sourceId, workspaceId: authReq.workspaceId },
        });
        sourceExists = !!opportunity;
        break;
      }
      case 'FEEDBACK': {
        sourceExists = true;
        break;
      }
    }

    if (!sourceExists) {
      throw new NotFoundError(`Source ${data.sourceType} with id ${data.sourceId}`);
    }

    const signal = await prisma.learningSignal.create({
      data: {
        workspaceId: authReq.workspaceId,
        userId: authReq.user.id,
        sourceType: sourceTypeUpper,
        sourceId: data.sourceId,
        signalType: data.signalType,
        signalValue: data.signalValue,
        metadata: data.metadata as any,
      },
    });

    res.status(201).json({ signal });
  } catch (error) {
    next(error);
  }
});

const derivationService = new LearningDerivationService(prisma);

router.get('/derived', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { status, dimension } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof status === 'string') where.status = status.toUpperCase();
    if (typeof dimension === 'string') where.dimension = dimension;
    const proposals = await prisma.learningProposal.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 });
    res.json({ proposals });
  } catch (error) {
    next(error);
  }
});

router.post('/derived', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = learningDeriveSchema.parse(req.body);
    const { dimension, observedPattern, supportingMeasurements, sourceMetricIds, sampleSize, denominator, proposedAdjustment, reason, confidence } = req.body as {
      dimension?: string; observedPattern?: string; supportingMeasurements?: unknown;
      sourceMetricIds?: string[]; sampleSize?: number; denominator?: number;
      proposedAdjustment?: number; reason?: string; confidence?: number;
    };

    let proposal;
    if (dimension && observedPattern && reason && proposedAdjustment !== undefined) {
      proposal = await derivationService.propose({
        workspaceId: authReq.workspaceId,
        dimension,
        observedPattern,
        supportingMeasurements: supportingMeasurements ?? {},
        sourceMetricIds: sourceMetricIds ?? [],
        sampleSize: sampleSize ?? 0,
        denominator,
        proposedAdjustment,
        reason,
        confidence,
      });
    } else {
      const metricName = data.metricName ?? 'responses';
      const rows = await prisma.outcomeMetric.findMany({
        where: { workspaceId: authReq.workspaceId, metricName },
        orderBy: { recordedAt: 'asc' },
        take: 500,
      });
      if (rows.length === 0) {
        return res.status(422).json({ error: { code: 'INSUFFICIENT_DATA', message: `No recorded measurements for metric "${metricName}". Derivation requires measured data.` } });
      }
      const groups = new Map<string, Array<{ value: number; id: string }>>();
      for (const row of rows) {
        const key = `${metricName}:${row.unit ?? 'default'}`;
        const list = groups.get(key) ?? [];
        list.push({ value: row.metricValue, id: row.id });
        groups.set(key, list);
      }
      const groupAverages = [...groups.entries()].map(([label, items]) => ({
        label,
        avg: Math.round((items.reduce((a, b) => a + b.value, 0) / items.length) * 100) / 100,
        count: items.length,
        metricIds: items.map((i) => i.id),
      }));
      const derived = deriveProposal({
        dimension: 'evidence_strength',
        groupAverages,
        reason: `Derived from ${rows.length} recorded "${metricName}" measurement(s).`,
        minSampleSize: data.minSampleSize,
      });
      if (!derived) {
        return res.status(422).json({ error: { code: 'INSUFFICIENT_DATA', message: 'Recorded measurements do not support a learning proposal (need 2+ groups at minimum sample with a sufficient gap).' } });
      }
      proposal = await derivationService.propose({
        workspaceId: authReq.workspaceId,
        dimension: derived.dimension,
        observedPattern: derived.observedPattern,
        supportingMeasurements: groupAverages,
        sourceMetricIds: derived.sourceMetricIds,
        sampleSize: derived.sampleSize,
        denominator: derived.denominator,
        proposedAdjustment: derived.proposedAdjustment,
        reason: derived.reason,
        confidence: derived.confidence,
      });
    }
    res.status(201).json({ proposal });
  } catch (error) {
    forwardLearningError(error, next);
  }
});

router.post('/derived/:proposalId/confirm', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { proposalId } = req.params;
    if (!proposalId) throw new NotFoundError('Learning Proposal');
    learningConfirmSchema.parse(req.body ?? {});
    const proposal = await derivationService.transition(
      authReq.workspaceId, proposalId, 'confirm', { userId: authReq.user.id, role: authReq.workspaceRole }
    );
    res.json({ proposal });
  } catch (error) {
    forwardLearningError(error, next);
  }
});

router.post('/derived/:proposalId/reject', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { proposalId } = req.params;
    if (!proposalId) throw new NotFoundError('Learning Proposal');
    const proposal = await derivationService.transition(
      authReq.workspaceId, proposalId, 'reject', { userId: authReq.user.id, role: authReq.workspaceRole }
    );
    res.json({ proposal });
  } catch (error) {
    forwardLearningError(error, next);
  }
});

router.post('/derived/:proposalId/revoke', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { proposalId } = req.params;
    if (!proposalId) throw new NotFoundError('Learning Proposal');
    const proposal = await derivationService.transition(
      authReq.workspaceId, proposalId, 'revoke', { userId: authReq.user.id, role: authReq.workspaceRole }
    );
    res.json({ proposal });
  } catch (error) {
    forwardLearningError(error, next);
  }
});

export default router;