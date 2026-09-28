import { Router, Router as ExpressRouter } from 'express';
import { authMiddleware, workspaceMiddleware, workspaceMembershipMiddleware, AuthenticatedRequest } from '../middleware/auth';
import {
  intelligenceSourceCreateSchema,
  intelligenceSourceUpdateSchema,
  topicResearchSchema,
  opportunityFeedbackSchema,
  opportunityConvertSchema,
  opportunityTriageSchema,
  opportunityScoreSchema,
} from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { SourceIngestionService } from '@growth-operator/intelligence';
import { SourceUnderstandingService } from '@growth-operator/intelligence';
import { ClaimLedgerService } from '@growth-operator/intelligence';
import { TopicClusteringService } from '@growth-operator/intelligence';
import { TrendSignalService } from '@growth-operator/intelligence';
import { ContentOpportunityService, toOpportunityLearningView,
  ContentOpportunityInput, validateOpportunityTriage } from '@growth-operator/intelligence';
import { fetchFeedbackSummary, applyFeedbackDemotion } from '@growth-operator/intelligence';
import { ContentGapService } from '@growth-operator/intelligence';
import { LearningDerivationService, applyLearningInfluence } from '@growth-operator/learning';
import { AIProviderRegistry, createDefaultRegistry } from '@growth-operator/ai';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY);

const ingestionService = new SourceIngestionService(prisma);
const understandingService = new SourceUnderstandingService(aiRegistry);
const claimLedgerService = new ClaimLedgerService(prisma);
const topicService = new TopicClusteringService(prisma, aiRegistry);
const trendService = new TrendSignalService(prisma);
const opportunityService = new ContentOpportunityService(prisma, aiRegistry, topicService, trendService);
const gapService = new ContentGapService(prisma, aiRegistry);
const learningDerivation = new LearningDerivationService(prisma);

async function scoreOpportunityWithLearning(workspaceId: string, input: ContentOpportunityInput) {
  const scoreResult = await opportunityService.scoreOpportunity(input);
  if (scoreResult.criticalFailure) {
    return toOpportunityLearningView(scoreResult, {
      dimensions: scoreResult.dimensions.map((d) => ({
        name: d.name,
        score: d.score,
        reason: d.explanation,
        evidence: d.evidence,
        baseScore: d.score,
        appliedAdjustment: 0,
      })),
      applied: [],
      ignored: [{ dimension: '*', reason: 'Critical evidence failure; confirmed learning is not applied over a failed base score.' }],
      overallScore: scoreResult.overallScore,
    });
  }
  const confirmed = await learningDerivation.confirmedInfluences(workspaceId);
  const withLearning = applyLearningInfluence(
    scoreResult.dimensions.map((d) => ({ name: d.name, score: d.score, reason: d.explanation, evidence: d.evidence })),
    confirmed
  );
  return toOpportunityLearningView(scoreResult, withLearning);
}

router.post('/sources', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = intelligenceSourceCreateSchema.parse(req.body);

    const result = await ingestionService.ingest(authReq.workspaceId, data.url, {
      sourceType: data.sourceType?.toUpperCase() as any,
    });

    res.status(201).json({ source: result });
  } catch (error) {
    next(error);
  }
});

router.get('/sources', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, status, sourceType } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (status && typeof status === 'string') {
      where.status = status.toUpperCase();
    }
    if (sourceType && typeof sourceType === 'string') {
      where.sourceType = sourceType.toUpperCase();
    }

    const [sources, total] = await Promise.all([
      prisma.intelligenceSource.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          _count: { select: { documents: true, claims: true } },
        },
      }),
      prisma.intelligenceSource.count({ where }),
    ]);

    res.json({ sources, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.get('/sources/:sourceId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { sourceId } = req.params;

    const source = await prisma.intelligenceSource.findFirst({
      where: { id: sourceId, workspaceId: authReq.workspaceId },
      include: {
        documents: {
          orderBy: { fetchedAt: 'desc' },
          take: 1,
        },
        _count: { select: { documents: true, claims: true, topicMentions: true } },
      },
    });

    if (!source) {
      throw new NotFoundError('Intelligence Source');
    }

    res.json({ source });
  } catch (error) {
    next(error);
  }
});

router.post('/sources/:sourceId/reprocess', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { sourceId } = req.params;

    const source = await prisma.intelligenceSource.findFirst({
      where: { id: sourceId, workspaceId: authReq.workspaceId },
    });

    if (!source) {
      throw new NotFoundError('Intelligence Source');
    }

    await prisma.intelligenceSource.update({
      where: { id: sourceId },
      data: { status: 'ACTIVE' },
    });

    const result = await ingestionService.ingest(authReq.workspaceId, source.url, {
      sourceType: source.sourceType,
    });

    res.json({ source: result });
  } catch (error) {
    next(error);
  }
});

router.get('/sources/:sourceId/claims', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { sourceId } = req.params;

    const source = await prisma.intelligenceSource.findFirst({
      where: { id: sourceId, workspaceId: authReq.workspaceId },
    });

    if (!source) {
      throw new NotFoundError('Intelligence Source');
    }

    const claims = await prisma.sourceClaim.findMany({
      where: { workspaceId: authReq.workspaceId, sourceId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ claims });
  } catch (error) {
    next(error);
  }
});

router.get('/topics', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [topics, total] = await Promise.all([
      prisma.topic.findMany({
        where: { workspaceId: authReq.workspaceId },
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: {
          _count: { select: { mentions: true, trendSignals: true, opportunities: true, gaps: true } },
        },
      }),
      prisma.topic.count({ where: { workspaceId: authReq.workspaceId } }),
    ]);

    res.json({ topics, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.post('/topics/research', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = topicResearchSchema.parse(req.body);

    const result = await ingestionService.ingest(authReq.workspaceId, data.query, {
      sourceType: 'USER_URL',
    });

    if (result.status === 'FAILED') {
      throw new ValidationError(result.error || 'Research ingestion failed');
    }

    const source = await prisma.intelligenceSource.findUnique({
      where: { id: result.sourceId },
      include: { documents: true },
    });

    if (!source || !source.documents[0]) {
      throw new ValidationError('Failed to extract content');
    }

    const understanding = await understandingService.understand(
      source.documents[0].cleanContent,
      source.title,
      source.url
    );

    if (!understanding.aiAvailable) {
      return res.json({
        topics: [],
        message: understanding.error || 'AI understanding unavailable',
        aiAvailable: false,
      });
    }

    if (!understanding.understanding) {
      return res.json({
        topics: [],
        message: understanding.error || 'Understanding failed',
        aiAvailable: true,
      });
    }

    const topicResult = await topicService.normalizeTopics(authReq.workspaceId, [{
      sourceId: source.id,
      understanding: understanding.understanding,
    }]);

    for (const mention of topicResult.topicMentions) {
      const topic = await prisma.topic.findUnique({
        where: { workspaceId_canonicalName: { workspaceId: authReq.workspaceId, canonicalName: mention.topicCanonicalName } },
      });
      if (topic) {
        await trendService.updateTrendSignal(authReq.workspaceId, topic.id, [{
          sourceId: source.id,
          mentionStrength: mention.mentionStrength,
          relevanceScore: mention.relevanceScore,
          createdAt: new Date(),
        }]);
      }
    }

    const gaps = await gapService.detectGaps({
      workspaceId: authReq.workspaceId,
      topicId: topicResult.topics[0]?.canonicalName || '',
      sources: source.documents.map(d => ({
        id: d.id,
        title: source.title || '',
        description: source.description || '',
        mainContent: d.cleanContent,
      })),
      claims: (await claimLedgerService.getClaimsForSource(authReq.workspaceId, source.id)).map(c => ({
        claimText: c.claimText,
        claimType: c.claimType,
        evidenceText: c.evidenceText,
        confidence: c.confidence,
      })),
      workspaceProfile: '',
      icp: '',
      existingTopics: [],
    });

    const opportunities = await opportunityService.generateOpportunity({
      workspaceId: authReq.workspaceId,
      topicId: topicResult.topics[0]?.canonicalName || '',
      sourceIds: [source.id],
      claimIds: (await claimLedgerService.getClaimsForSource(authReq.workspaceId, source.id)).map(c => c.id),
      trendSignalIds: [],
      workspaceProfile: '',
      icp: '',
      contentGaps: gaps.map(g => ({ type: g.gapType, description: g.description, evidence: g.evidence })),
    });

    res.json({
      topics: topicResult.topics,
      gaps,
      opportunities: opportunities.opportunity ? [opportunities.opportunity] : [],
      aiAvailable: understanding.aiAvailable,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/topics/:topicId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { topicId } = req.params;

    const topic = await prisma.topic.findFirst({
      where: { id: topicId, workspaceId: authReq.workspaceId },
      include: {
        mentions: { include: { source: true }, orderBy: { createdAt: 'desc' } },
        trendSignals: { orderBy: { calculatedAt: 'desc' } },
        opportunities: { orderBy: { createdAt: 'desc' } },
        gaps: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!topic) {
      throw new NotFoundError('Topic');
    }

    res.json({ topic });
  } catch (error) {
    next(error);
  }
});

router.get('/trends', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, status } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (status && typeof status === 'string') {
      where.status = status.toUpperCase();
    }

    const [trends, total] = await Promise.all([
      prisma.trendSignal.findMany({
        where,
        orderBy: { [sortBy as string || 'calculatedAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: { topic: true },
      }),
      prisma.trendSignal.count({ where }),
    ]);

    res.json({ trends, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.get('/trends/:trendId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { trendId } = req.params;

    const trend = await prisma.trendSignal.findFirst({
      where: { id: trendId, workspaceId: authReq.workspaceId },
      include: { topic: true },
    });

    if (!trend) {
      throw new NotFoundError('Trend Signal');
    }

    res.json({ trend });
  } catch (error) {
    next(error);
  }
});

router.get('/opportunities', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, status } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (status && typeof status === 'string') {
      where.status = status.toUpperCase();
    }

    const [opportunities, total] = await Promise.all([
      prisma.contentOpportunity.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: { topic: true },
      }),
      prisma.contentOpportunity.count({ where }),
    ]);

    res.json({ opportunities, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.get('/opportunities/:opportunityId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;

    const opportunity = await prisma.contentOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
      include: { topic: true },
    });

    if (!opportunity) {
      throw new NotFoundError('Content Opportunity');
    }

    const feedbackSummary = await fetchFeedbackSummary(prisma, authReq.workspaceId, opportunity.id);

    res.json({ opportunity, feedbackSummary });
  } catch (error) {
    next(error);
  }
});

router.post('/opportunities/score', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = opportunityScoreSchema.parse(req.body);
    const topic = await prisma.topic.findFirst({ where: { id: data.topicId, workspaceId: authReq.workspaceId } });
    if (!topic) {
      throw new NotFoundError('Topic');
    }
    const scoring = await scoreOpportunityWithLearning(authReq.workspaceId, {
      workspaceId: authReq.workspaceId,
      topicId: data.topicId,
      sourceIds: data.sourceIds,
      claimIds: data.claimIds,
      trendSignalIds: data.trendSignalIds,
      workspaceProfile: data.workspaceProfile,
      icp: data.icp,
      contentGaps: data.contentGaps,
    });
    res.json({ scoring, scoringInputs: { ...data, workspaceId: authReq.workspaceId } });
  } catch (error) {
    next(error);
  }
});

router.get('/opportunities/:opportunityId/score', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;

    const opportunity = await prisma.contentOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
    });

    if (!opportunity) {
      throw new NotFoundError('Content Opportunity');
    }

    const asIds = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    const scoringInputs = {
      workspaceId: authReq.workspaceId,
      topicId: opportunity.topicId,
      sourceIds: asIds(opportunity.sourceIds),
      claimIds: asIds(opportunity.claimIds),
      trendSignalIds: asIds(opportunity.trendSignalIds),
      workspaceProfile: '',
      icp: '',
      contentGaps: [] as Array<{ type: string; description: string; evidence: string }>,
    };
    const scoring = await scoreOpportunityWithLearning(authReq.workspaceId, scoringInputs);
    const feedbackSummary = await fetchFeedbackSummary(prisma, authReq.workspaceId, opportunity.id);
    const { rankedScore: rankedOverallScore, penalty: feedbackPenalty } = applyFeedbackDemotion(
      scoring.overallScore,
      feedbackSummary
    );
    res.json({ scoring, scoringInputs, storedScore: opportunity.opportunityScore, feedbackSummary, rankedOverallScore, feedbackPenalty });
  } catch (error) {
    next(error);
  }
});

router.post('/opportunities/:opportunityId/feedback', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;
    const data = opportunityFeedbackSchema.parse(req.body);

    const opportunity = await prisma.contentOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
    });

    if (!opportunity) {
      throw new NotFoundError('Content Opportunity');
    }

    const feedback = await prisma.opportunityFeedback.create({
      data: {
        workspaceId: authReq.workspaceId,
        opportunityId,
        userId: authReq.user.id,
        feedback: data.feedback.toUpperCase() as any,
        reason: data.reason || null,
      },
    });

    res.status(201).json({ feedback });
  } catch (error) {
    next(error);
  }
});

router.post('/opportunities/:opportunityId/convert', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;
    const data = opportunityConvertSchema.parse(req.body);

    const opportunity = await prisma.contentOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
      include: { topic: true },
    });

    if (!opportunity) {
      throw new NotFoundError('Content Opportunity');
    }

    await prisma.contentOpportunity.update({
      where: { id: opportunityId },
      data: { status: 'CONVERTED' },
    });

    const sourceIds = (opportunity.sourceIds as string[] | null) ?? [];
    const claimIds = (opportunity.claimIds as string[] | null) ?? [];
    const trendSignalIds = (opportunity.trendSignalIds as string[] | null) ?? [];

    const contentIdea = await prisma.contentIdea.create({
      data: {
        workspaceId: authReq.workspaceId,
        authorId: authReq.user.id,
        title: data.contentIdeaTitle || opportunity.title,
        description: opportunity.thesis,
        angle: opportunity.angle,
        format: opportunity.contentFormat as any,
        status: 'DRAFT',
        tags: [],
        opportunityId: opportunity.id,
        topicId: opportunity.topicId,
        sourceIds,
        claimIds,
        trendSignalIds,
        thesis: opportunity.thesis,
        audience: opportunity.audience,
        objective: opportunity.objective,
        reasoning: opportunity.reasoning,
        evidenceSnapshot: {
          evidenceSummary: opportunity.evidenceSummary,
          sourceIds,
          claimIds,
          trendSignalIds,
        },
      },
    });

    res.status(201).json({
      contentIdea,
      provenance: {
        opportunityId: opportunity.id,
        topicId: opportunity.topicId,
        sourceIds,
        claimIds,
        trendSignalIds,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/opportunities/:opportunityId/status', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { opportunityId } = req.params;
    const data = opportunityTriageSchema.parse(req.body);

    const opportunity = await prisma.contentOpportunity.findFirst({
      where: { id: opportunityId, workspaceId: authReq.workspaceId },
    });

    if (!opportunity) {
      throw new NotFoundError('Content Opportunity');
    }

    const to = data.status.toUpperCase();
    const verdict = validateOpportunityTriage(opportunity.status, to);
    if (!verdict.valid) {
      throw new AppError(verdict.reason ?? 'Invalid opportunity transition.', 422, 'INVALID_TRANSITION');
    }

    const updated = await prisma.contentOpportunity.update({
      where: { id: opportunityId },
      data: { status: to as 'REVIEWED' | 'DISMISSED' },
    });

    res.json({ opportunity: updated });
  } catch (error) {
    next(error);
  }
});

router.get('/gaps', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { page, limit, sortBy, sortOrder, gapType } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { workspaceId: authReq.workspaceId };
    if (gapType && typeof gapType === 'string') {
      where.gapType = gapType.toUpperCase();
    }

    const [gaps, total] = await Promise.all([
      prisma.contentGap.findMany({
        where,
        orderBy: { [sortBy as string || 'createdAt']: sortOrder as 'asc' | 'desc' || 'desc' },
        skip,
        take: limitNum,
        include: { topic: true },
      }),
      prisma.contentGap.count({ where }),
    ]);

    res.json({ gaps, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    next(error);
  }
});

router.get('/gaps/:gapId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { gapId } = req.params;

    const gap = await prisma.contentGap.findFirst({
      where: { id: gapId, workspaceId: authReq.workspaceId },
      include: { topic: true },
    });

    if (!gap) {
      throw new NotFoundError('Content Gap');
    }

    res.json({ gap });
  } catch (error) {
    next(error);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;

    const [
      sourceCount,
      topicCount,
      trendCount,
      opportunityCount,
      gapCount,
      recentSources,
    ] = await Promise.all([
      prisma.intelligenceSource.count({ where: { workspaceId: authReq.workspaceId } }),
      prisma.topic.count({ where: { workspaceId: authReq.workspaceId } }),
      prisma.trendSignal.count({ where: { workspaceId: authReq.workspaceId } }),
      prisma.contentOpportunity.count({ where: { workspaceId: authReq.workspaceId } }),
      prisma.contentGap.count({ where: { workspaceId: authReq.workspaceId } }),
      prisma.intelligenceSource.findMany({
        where: { workspaceId: authReq.workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const trendingTopics = await prisma.trendSignal.count({
      where: { workspaceId: authReq.workspaceId, status: 'TRENDING' },
    });

    res.json({
      overview: {
        sources: sourceCount,
        topics: topicCount,
        trends: trendCount,
        trendingTopics,
        opportunities: opportunityCount,
        gaps: gapCount,
      },
      recentSources,
    });
  } catch (error) {
    next(error);
  }
});

export default router;