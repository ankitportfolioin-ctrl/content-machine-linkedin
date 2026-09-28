import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { businessProfileSchema, brandProfileSchema, strategyProfileSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { BusinessBrainService, BusinessProfileService, BrandProfileService, StrategyProfileService } from '@growth-operator/business';

const router: ExpressRouter = Router();
router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const businessSvc = new BusinessProfileService(prisma);
const brandSvc = new BrandProfileService(prisma);
const strategySvc = new StrategyProfileService(prisma);
const brain = new BusinessBrainService(prisma);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.json(await brain.getFullProfile(authReq.workspaceId));
  } catch (e) { next(e); }
});

router.get('/context', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.json({ context: await brain.getBusinessContext(authReq.workspaceId) });
  } catch (e) { next(e); }
});

router.put('/business', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = businessProfileSchema.parse(req.body);
    res.json({ business: await businessSvc.update(authReq.workspaceId, data as any) });
  } catch (e) { next(e); }
});

router.put('/brand', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = brandProfileSchema.parse(req.body);
    res.json({ brand: await brandSvc.update(authReq.workspaceId, data as any) });
  } catch (e) { next(e); }
});

router.put('/strategy', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = strategyProfileSchema.parse(req.body);
    res.json({ strategy: await strategySvc.update(authReq.workspaceId, data as any) });
  } catch (e) { next(e); }
});

export default router;
