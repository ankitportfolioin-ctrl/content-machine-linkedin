import { z } from 'zod';
import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { contentDraftCreateSchema, contentDraftUpdateSchema, draftComposeSchema, claimBindingCreateSchema, yfpQualityGateSchema } from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { ValidationError, NotFoundError } from '../utils/errors';
import { createDefaultRegistry } from '@growth-operator/ai';
import {
  DraftComposer,
  EvidenceService,
  ReviewService,
  runQualityGates,
  runYFPQualityGates,
  renderPreview,
  assertNoInternalMarkup,
} from '@growth-operator/content';
import { ClaimLedgerService } from '@growth-operator/intelligence';
import { forwardContentError } from '../utils/contentErrors';
import { getEnv } from '../config/env';

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
const composer = new DraftComposer(prisma, aiRegistry);
const evidenceService = new EvidenceService(prisma);
const reviewService = new ReviewService(prisma);
const claimLedger = new ClaimLedgerService(prisma);

function toContentError(error: unknown, next: (err: unknown) => void): void {
  forwardContentError(error, next);
}

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, contentIdeaId } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (contentIdeaId) {
      where.contentIdeaId = contentIdeaId;
    }

    const [contentDrafts, total] = await Promise.all([
      prisma.contentDraft.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          contentIdea: { select: { id: true, title: true, status: true } },
          versions: { orderBy: { version: 'desc' }, take: 5 },
        },
      }),
      prisma.contentDraft.count({ where }),
    ]);

    res.json({ contentDrafts, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const data = contentDraftCreateSchema.parse(req.body);

    const contentIdea = await prisma.contentIdea.findFirst({
      where: { id: data.contentIdeaId, workspaceId: authReq.workspaceId },
    });

    if (!contentIdea) {
      throw new NotFoundError('Content Idea');
    }

    const existingDraft = await prisma.contentDraft.findUnique({
      where: { contentIdeaId_version: { contentIdeaId: data.contentIdeaId, version: data.version } },
    });

    if (existingDraft) {
      throw new ValidationError(`Draft version ${data.version} already exists for this content idea`);
    }

    const contentDraft = await prisma.contentDraft.create({
      data: {
        workspaceId: authReq.workspaceId,
        contentIdeaId: data.contentIdeaId,
        authorId: authReq.user.id,
        body: data.body,
        version: data.version,
      },
    });

    res.status(201).json({ contentDraft });
  } catch (error) {
    next(error);
  }
});

router.get('/:contentDraftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const contentDraft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
      include: {
        contentIdea: { select: { id: true, title: true, format: true, status: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });

    if (!contentDraft) {
      throw new NotFoundError('Content Draft');
    }

    res.json({ contentDraft });
  } catch (error) {
    next(error);
  }
});

router.patch('/:contentDraftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;
    const data = contentDraftUpdateSchema.parse(req.body);

    const contentDraft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
    });

    if (!contentDraft) {
      throw new NotFoundError('Content Draft');
    }

    await reviewService.assertDraftMutable(authReq.workspaceId, contentDraftId);

    const updated = await prisma.contentDraft.update({
      where: { id: contentDraftId },
      data: {
        body: data.body,
        version: data.version,
      },
    });

    res.json({ contentDraft: updated });
  } catch (error) {
    toContentError(error, next);
  }
});

router.delete('/:contentDraftId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const contentDraft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
    });

    if (!contentDraft) {
      throw new NotFoundError('Content Draft');
    }

    await reviewService.assertDraftMutable(authReq.workspaceId, contentDraftId);

    await prisma.contentDraft.delete({ where: { id: contentDraftId } });

    res.status(204).send();
  } catch (error) {
    toContentError(error, next);
  }
});

router.post('/compose', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = draftComposeSchema.parse(req.body);

    const plan = await prisma.contentPlan.findFirst({ where: { id: data.planId, workspaceId: authReq.workspaceId } });
    if (!plan) throw new NotFoundError('Content Plan');

    const result = await composer.composeFromPlan(
      authReq.workspaceId,
      plan.id,
      authReq.user.id,
      plan.contentIdeaId ?? undefined
    );
    res.status(201).json({ draftId: result.draftId, body: result.body, structure: result.structure, preview: result.preview });
  } catch (error) {
    toContentError(error, next);
  }
});

router.post('/:contentDraftId/revisions', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const revision = await reviewService.createRevision(authReq.workspaceId, contentDraftId, authReq.user.id);
    res.status(201).json({ contentDraft: revision });
  } catch (error) {
    toContentError(error, next);
  }
});

router.post('/:contentDraftId/bindings', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;
    const data = z.object({ bindings: z.array(claimBindingCreateSchema).min(1).max(100) }).parse(req.body);

    await reviewService.assertDraftMutable(authReq.workspaceId, contentDraftId);
    const bindings = await evidenceService.createBindings(authReq.workspaceId, contentDraftId, data.bindings);
    res.status(201).json({ bindings });
  } catch (error) {
    toContentError(error, next);
  }
});

router.get('/:contentDraftId/bindings', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const draft = await prisma.contentDraft.findFirst({ where: { id: contentDraftId, workspaceId: authReq.workspaceId } });
    if (!draft) throw new NotFoundError('Content Draft');
    const bindings = await evidenceService.getBindings(authReq.workspaceId, contentDraftId);
    res.json({ bindings });
  } catch (error) {
    next(error);
  }
});

router.post('/:contentDraftId/validate', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const draft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
      include: { contentIdea: true },
    });
    if (!draft) throw new NotFoundError('Content Draft');

    const plan = draft.planId
      ? await prisma.contentPlan.findFirst({ where: { id: draft.planId, workspaceId: authReq.workspaceId } })
      : null;
    const bindings = await evidenceService.getBindings(authReq.workspaceId, contentDraftId);
    const boundClaims = bindings
      .filter((b: { sourceClaimId: string | null }) => b.sourceClaimId)
      .map((b: { sourceClaimId: string | null }) => b.sourceClaimId as string);
    const sourceClaims = boundClaims.length > 0
      ? await prisma.sourceClaim.findMany({ where: { id: { in: boundClaims }, workspaceId: authReq.workspaceId } })
      : [];
    const claimById = new Map(sourceClaims.map((c) => [c.id, c]));

    const findings = evidenceService.validateDraftText(
      draft.body,
      bindings.map((b: { span: string; evidenceStatus: string; sourceClaimId: string | null }) => ({
        span: b.span,
        evidenceStatus: b.evidenceStatus,
        sourceClaim: b.sourceClaimId ? (claimById.get(b.sourceClaimId) as never) ?? null : null,
      }))
    );

    const voiceProfile = await prisma.voiceProfile.findFirst({
      where: { workspaceId: authReq.workspaceId, userId: authReq.user.id },
      orderBy: { updatedAt: 'desc' },
    });
    const receipts = await prisma.voiceReceipt.findMany({ where: { workspaceId: authReq.workspaceId }, take: 50 });
    const contradictionSourceIds = ((plan?.sourceIds as string[] | null) ?? []) as string[];
    const contradictions: Array<{ severity: string }> = [];
    for (const sourceId of contradictionSourceIds) {
      const found = await claimLedger.detectContradictions(authReq.workspaceId, sourceId);
      for (const c of found) contradictions.push({ severity: c.severity });
    }

    const gateRun = runQualityGates({
      draftBody: draft.body,
      structure: (draft.structure as object | null) ?? undefined,
      format: ((plan?.format as string | null) ?? (draft.contentIdea.format as string | null) ?? null) as never,
      planThesis: plan?.thesis ?? draft.contentIdea.thesis ?? draft.contentIdea.title,
      draftThesis: extractDraftThesis(draft.body),
      bannedWords: voiceProfile?.bannedWords ?? [],
      receiptFacts: receipts.map((r) => r.fact),
      boundEvidenceTexts: sourceClaims.map((c) => c.evidenceText),
      evidenceFindings: findings,
      evidenceCoverage: evidenceService.evidenceCoverage(bindings.map((b: { evidenceStatus: string }) => ({ evidenceStatus: b.evidenceStatus }))),
      contradictionPresent: contradictions.length > 0,
      contradictionSeverity: contradictions[0]?.severity ?? null,
      existingTitles: await existingIdeaTitles(authReq.workspaceId, draft.contentIdeaId),
      cta: extractCta(draft.body),
    });

    await prisma.contentQualityGateResult.deleteMany({ where: { workspaceId: authReq.workspaceId, draftId: contentDraftId } });
    for (const result of gateRun.results) {
      await prisma.contentQualityGateResult.create({
        data: {
          workspaceId: authReq.workspaceId,
          draftId: contentDraftId,
          gate: result.gate,
          status: result.status,
          severity: result.severity,
          message: result.message,
          evidence: result.evidence.slice(0, 5).join(' | ') || null,
        },
      });
    }

    res.json({ validation: gateRun, findings });
  } catch (error) {
    toContentError(error, next);
  }
});

router.get('/:contentDraftId/gates', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const draft = await prisma.contentDraft.findFirst({ where: { id: contentDraftId, workspaceId: authReq.workspaceId } });
    if (!draft) throw new NotFoundError('Content Draft');
    const gates = await prisma.contentQualityGateResult.findMany({
      where: { workspaceId: authReq.workspaceId, draftId: contentDraftId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ gates });
  } catch (error) {
    next(error);
  }
});

router.get('/:contentDraftId/preview', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentDraftId } = req.params;

    const draft = await prisma.contentDraft.findFirst({
      where: { id: contentDraftId, workspaceId: authReq.workspaceId },
      include: { contentIdea: { select: { title: true, format: true } } },
    });
    if (!draft) throw new NotFoundError('Content Draft');

    const plan = draft.planId
      ? await prisma.contentPlan.findFirst({ where: { id: draft.planId, workspaceId: authReq.workspaceId } })
      : null;
    const rendered = renderPreview({
      format: ((plan?.format as string | null) ?? (draft.contentIdea.format as string | null) ?? 'TEXT_POST') as never,
      body: draft.body,
      structure: (draft.structure as object | null) ?? undefined,
      title: draft.contentIdea.title,
    });
    const forbidden = assertNoInternalMarkup(rendered);
    res.json({ preview: rendered, internalMarkupFound: forbidden });
  } catch (error) {
    next(error);
  }
});

router.post('/yfp-quality-gates', async (req, res, next) => {
  try {
    const data = yfpQualityGateSchema.parse(req.body);
    const result = runYFPQualityGates({
      draftBody: data.draftBody,
      structure: data.structure,
      format: data.format as never,
      planThesis: data.planThesis,
      draftThesis: data.draftThesis,
      bannedWords: data.bannedWords,
      receiptFacts: data.receiptFacts,
      boundEvidenceTexts: data.boundEvidenceTexts,
      evidenceFindings: data.evidenceFindings as never,
      evidenceCoverage: data.evidenceCoverage,
      contradictionPresent: data.contradictionPresent,
      contradictionSeverity: data.contradictionSeverity,
      existingTitles: data.existingTitles,
      cta: data.cta,
      workspaceProfile: data.workspaceProfile,
      icp: data.icp,
      audienceProblems: data.audienceProblems,
      sourceTypes: data.sourceTypes,
      topicCategory: data.topicCategory,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

function extractDraftThesis(body: string): string {
  const first = body.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0)[0] ?? '';
  return first.slice(0, 2000);
}

function extractCta(body: string): string | null {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
  const last = lines[lines.length - 1] ?? '';
  return /^(ps|p\.s\.|👇|🔗|comment|share|follow|subscribe|download|grab|get|join|dm|message)/i.test(last) ? last.slice(0, 500) : null;
}

async function existingIdeaTitles(workspaceId: string, excludeIdeaId: string): Promise<string[]> {
  const ideas = await prisma.contentIdea.findMany({ where: { workspaceId, id: { not: excludeIdeaId } }, select: { title: true }, take: 200 });
  return ideas.map((i) => i.title);
}

export default router;