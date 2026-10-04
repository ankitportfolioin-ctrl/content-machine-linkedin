import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { audienceSegmentSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { AudienceBrainService } from '@growth-operator/business';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();
router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const svc = new AudienceBrainService(prisma);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.json({ segments: await svc.list(authReq.workspaceId) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = audienceSegmentSchema.parse(req.body);
    res.status(201).json({ segment: await svc.upsert(authReq.workspaceId, undefined, data as any) });
  } catch (e) { next(e); }
});

router.post('/seed-defaults', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.status(201).json({ segments: await svc.seedDefaults(authReq.workspaceId) });
  } catch (e) { next(e); }
});

router.put('/:segmentId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { segmentId } = req.params;
    if (!segmentId) throw new NotFoundError('Audience Segment');
    const data = audienceSegmentSchema.parse(req.body);
    const result = await svc.upsert(authReq.workspaceId, segmentId, data as any);
    if (!result) throw new NotFoundError('Audience Segment');
    res.json({ segment: result });
  } catch (e) { next(e); }
});

router.get('/:segmentId/who-why', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { segmentId } = req.params;
    if (!segmentId) throw new NotFoundError('Audience Segment');
    const result = await svc.answerWhoWhy(segmentId, authReq.workspaceId);
    if (!result) throw new NotFoundError('Audience Segment');
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
