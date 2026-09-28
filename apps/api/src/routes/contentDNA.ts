import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { contentDNASchema, contentStageAdvanceSchema, originalityCheckSchema, performanceRecordSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ContentDNAService, ContentFactoryService, checkOriginality, attentionValue, businessValue } from '@growth-operator/business';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();
router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const dnaSvc = new ContentDNAService(prisma);
const factory = new ContentFactoryService(prisma);

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = contentDNASchema.parse(req.body);
    res.status(201).json({ dna: await dnaSvc.upsert(authReq.workspaceId, data as any) });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const rows = await (prisma as any).contentDNA.findMany({ where: { workspaceId: authReq.workspaceId }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ dnas: rows });
  } catch (e) { next(e); }
});

router.get('/:dnaId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { dnaId } = req.params;
    const dna = await (prisma as any).contentDNA.findFirst({ where: { id: dnaId, workspaceId: authReq.workspaceId } });
    if (!dna) throw new NotFoundError('Content DNA');
    const history = await factory.history(authReq.workspaceId, dnaId!);
    const attention = attentionValue(dna);
    const business = businessValue(dna);
    res.json({ dna, history, attentionValue: attention, businessValue: business });
  } catch (e) { next(e); }
});

router.post('/:dnaId/advance', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { dnaId } = req.params;
    const data = contentStageAdvanceSchema.parse(req.body);
    if (!dnaId) throw new NotFoundError('Content DNA');
    res.json({ dna: await factory.advanceStage(authReq.workspaceId, dnaId, data.toStage as any, authReq.user.id, data.notes) });
  } catch (e) { next(e); }
});

router.post('/:dnaId/performance', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { dnaId } = req.params;
    const data = performanceRecordSchema.parse(req.body);
    if (!dnaId) throw new NotFoundError('Content DNA');
    const updated = await dnaSvc.recordPerformance(authReq.workspaceId, dnaId, data);
    res.json({ dna: updated, attentionValue: attentionValue(updated), businessValue: businessValue(updated) });
  } catch (e) { next(e); }
});

router.post('/originality-check', async (req, res, next) => {
  try {
    const data = originalityCheckSchema.parse(req.body);
    res.json({ result: checkOriginality(data.draft, data.sources) });
  } catch (e) { next(e); }
});

router.get('/baseline/summary', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { pillar, format, audienceSegmentId } = req.query as Record<string, string>;
    const baseline = await dnaSvc.baseline(authReq.workspaceId, {
      ...(pillar ? { pillar } : {}),
      ...(format ? { format } : {}),
      ...(audienceSegmentId ? { audienceSegmentId } : {}),
    });
    if (baseline.medianReach === null) {
      return res.json({ ...baseline, message: 'Insufficient data: no comparable posts with reach recorded.' });
    }
    res.json(baseline);
  } catch (e) { next(e); }
});

export default router;
