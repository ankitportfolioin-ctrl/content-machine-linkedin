import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, requireRole, AuthenticatedRequest } from '../middleware/auth';
import {
  prospectResearchCreateSchema,
  prospectSignalCreateSchema,
  qualificationRunSchema,
  prospectBriefCreateSchema,
} from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { NotFoundError } from '../utils/errors';
import { createDefaultRegistry } from '@growth-operator/ai';
import {
  buildProspectCandidate,
  ProspectResearchService,
  QualificationService,
  scoreProspect,
  SignalService,
  intentStatusForSignals,
  BriefService,
} from '@growth-operator/sales';
import { LearningDerivationService, applyLearningInfluence } from '@growth-operator/learning';
import { forwardSalesError } from '../utils/salesErrors';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY);
const researchService = new ProspectResearchService(prisma, aiRegistry);
const qualificationService = new QualificationService(prisma);
const signalService = new SignalService(prisma);
const briefService = new BriefService(prisma, aiRegistry);
const learningDerivation = new LearningDerivationService(prisma);

router.post('/discover', async (req, res, next) => {
  try {
    const candidate = buildProspectCandidate(req.body ?? {});
    res.status(201).json({ candidate });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/research', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = prospectResearchCreateSchema.parse(req.body);

    const research = await researchService.createResearch({
      workspaceId: authReq.workspaceId,
      leadId: data.leadId,
      name: data.name,
      title: data.title,
      company: data.company,
      companyDomain: data.companyDomain,
      location: data.location,
      publicSourceUrls: data.publicSourceUrls,
    });
    res.status(201).json({ research });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/research', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof leadId === 'string') where.leadId = leadId;
    const research = await prisma.prospectResearch.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 50 });
    res.json({ research });
  } catch (error) {
    next(error);
  }
});

router.get('/research/:researchId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { researchId } = req.params;
    if (!researchId) throw new NotFoundError('Prospect Research');
    const research = await prisma.prospectResearch.findFirst({ where: { id: researchId, workspaceId: authReq.workspaceId } });
    if (!research) throw new NotFoundError('Prospect Research');
    res.json({ research });
  } catch (error) {
    next(error);
  }
});

router.post('/research/:researchId/synthesize', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { researchId } = req.params;
    if (!researchId) throw new NotFoundError('Prospect Research');
    const { material } = req.body as { material?: string[] };
    const synthesis = await researchService.synthesizeResearch({
      workspaceId: authReq.workspaceId,
      researchId,
      material: material ?? [],
    });
    res.json({ synthesis });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/signals', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = prospectSignalCreateSchema.parse(req.body);
    const signal = await signalService.recordSignal(authReq.workspaceId, {
      ...data,
      signalType: data.signalType.toUpperCase(),
      observedAt: data.observedAt ? new Date(data.observedAt) : undefined,
    });
    res.status(201).json({ signal });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/signals', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof leadId === 'string') where.leadId = leadId;
    const signals = await prisma.prospectSignal.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ signals });
  } catch (error) {
    next(error);
  }
});

router.get('/intent', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.query;
    if (typeof leadId !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'leadId query parameter is required.' } });
    }
    const result = await signalService.intentStatus(authReq.workspaceId, leadId);
    res.json(result);
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/qualify', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = qualificationRunSchema.parse(req.body);
    const { problemEvidence, timingEvidence, researchFactCount } = req.body as {
      problemEvidence?: string[];
      timingEvidence?: string[];
      researchFactCount?: number;
    };
    const result = await qualificationService.qualifyAndPersist(authReq.workspaceId, data.leadId, {
      problemEvidence,
      timingEvidence,
      researchFactCount,
    });
    res.status(201).json({ qualification: result });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/qualification', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.query;
    if (typeof leadId !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'leadId query parameter is required.' } });
    }
    const qualification = await prisma.qualificationResult.findUnique({
      where: { workspaceId_leadId: { workspaceId: authReq.workspaceId, leadId } },
    });
    if (!qualification) throw new NotFoundError('Qualification Result');
    const baseScore = scoreProspect({
      dimensions: qualification.dimensions as never,
      researchConfidence: qualification.confidence,
    });
    const confirmed = await learningDerivation.confirmedInfluences(authReq.workspaceId);
    const withLearning = applyLearningInfluence(
      baseScore.dimensions.map((d) => ({ name: d.name, score: d.score, reason: d.reason, evidence: d.evidence })),
      confirmed
    );
    res.json({
      qualification,
      score: baseScore,
      learningInfluence: {
        dimensions: withLearning.dimensions,
        applied: withLearning.applied,
        ignored: withLearning.ignored,
        overallScore: withLearning.overallScore,
      },
    });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.post('/briefs', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = prospectBriefCreateSchema.parse(req.body);
    const brief = await briefService.createBrief({
      workspaceId: authReq.workspaceId,
      leadId: data.leadId,
      researchId: data.researchId,
      createdBy: authReq.user.id,
    });
    res.status(201).json({ brief });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

router.get('/briefs', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { leadId } = req.query;
    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (typeof leadId === 'string') where.leadId = leadId;
    const briefs = await prisma.prospectBrief.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 50 });
    res.json({ briefs });
  } catch (error) {
    next(error);
  }
});

router.get('/briefs/:briefId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { briefId } = req.params;
    if (!briefId) throw new NotFoundError('Prospect Brief');
    const brief = await prisma.prospectBrief.findFirst({ where: { id: briefId, workspaceId: authReq.workspaceId } });
    if (!brief) throw new NotFoundError('Prospect Brief');
    res.json({ brief });
  } catch (error) {
    next(error);
  }
});

router.post('/briefs/:briefId/synthesize', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { briefId } = req.params;
    if (!briefId) throw new NotFoundError('Prospect Brief');
    const { material } = req.body as { material?: string[] };
    const synthesis = await briefService.synthesizeBriefContext(authReq.workspaceId, briefId, material ?? []);
    res.json({ synthesis });
  } catch (error) {
    forwardSalesError(error, next);
  }
});

export default router;
