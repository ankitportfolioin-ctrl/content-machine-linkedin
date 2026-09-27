import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { voiceProfileCreateSchema, voiceProfileUpdateSchema, voiceReceiptCreateSchema, writingSampleCreateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/profile', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const profile = await prisma.voiceProfile.findFirst({
      where: { workspaceId: authReq.workspaceId, userId: authReq.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ voiceProfile: profile });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = req.body?.id
      ? voiceProfileUpdateSchema.parse(req.body)
      : voiceProfileCreateSchema.parse(req.body);

    const existing = await prisma.voiceProfile.findFirst({
      where: { workspaceId: authReq.workspaceId, userId: authReq.user.id },
      orderBy: { updatedAt: 'desc' },
    });

    const voiceProfile = existing
      ? await prisma.voiceProfile.update({ where: { id: existing.id }, data })
      : await prisma.voiceProfile.create({
          data: {
            workspaceId: authReq.workspaceId,
            userId: authReq.user.id,
            role: data.role ?? null,
            headline: data.headline ?? null,
            professionalContext: data.professionalContext ?? null,
            tone: data.tone ?? null,
            writingStyle: data.writingStyle ?? null,
            bannedWords: data.bannedWords ?? [],
            preferredVocabulary: data.preferredVocabulary ?? [],
            contentPillars: data.contentPillars ?? [],
          },
        });

    res.json({ voiceProfile });
  } catch (error) {
    next(error);
  }
});

router.get('/receipts', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const receipts = await prisma.voiceReceipt.findMany({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ receipts });
  } catch (error) {
    next(error);
  }
});

router.post('/receipts', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = voiceReceiptCreateSchema.parse(req.body);

    const receipt = await prisma.voiceReceipt.create({
      data: { workspaceId: authReq.workspaceId, fact: data.fact, context: data.context ?? null },
    });
    res.status(201).json({ receipt });
  } catch (error) {
    next(error);
  }
});

router.delete('/receipts/:receiptId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { receiptId } = req.params;

    const existing = await prisma.voiceReceipt.findFirst({ where: { id: receiptId, workspaceId: authReq.workspaceId } });
    if (!existing) throw new NotFoundError('Voice Receipt');
    await prisma.voiceReceipt.delete({ where: { id: receiptId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/samples', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const samples = await prisma.writingSample.findMany({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ samples });
  } catch (error) {
    next(error);
  }
});

router.post('/samples', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = writingSampleCreateSchema.parse(req.body);

    const sample = await prisma.writingSample.create({
      data: { workspaceId: authReq.workspaceId, title: data.title ?? null, content: data.content },
    });
    res.status(201).json({ sample });
  } catch (error) {
    next(error);
  }
});

router.delete('/samples/:sampleId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { sampleId } = req.params;

    const existing = await prisma.writingSample.findFirst({ where: { id: sampleId, workspaceId: authReq.workspaceId } });
    if (!existing) throw new NotFoundError('Writing Sample');
    await prisma.writingSample.delete({ where: { id: sampleId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
