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
  researchTriggerSchema,
  factCheckSchema,
} from '@growth-operator/schemas';
import { prisma } from '@growth-operator/db';
import { AppError, NotFoundError, ValidationError } from '../utils/errors';
import { SourceIngestionService } from '@growth-operator/intelligence';
import { SourceUnderstandingService } from '@growth-operator/intelligence';
import { ClaimLedgerService } from '@growth-operator/intelligence';
import { TopicClusteringService } from '@growth-operator/intelligence';
import { TrendSignalService, loadTopicTrendEvidence } from '@growth-operator/intelligence';
import { AudienceProblemService } from '@growth-operator/intelligence';
import { connectorRegistry, primeConnectorRegistry } from '@growth-operator/intelligence';
import { buildFactCheckList, getSourceReliability, listSourceReliabilities } from '@growth-operator/intelligence';
import { ContentOpportunityService, toOpportunityLearningView,
  ContentOpportunityInput, validateOpportunityTriage } from '@growth-operator/intelligence';
import { ContentPatternService, fetchFeedbackSummary, applyFeedbackDemotion } from '@growth-operator/intelligence';
import { ContentGapService } from '@growth-operator/intelligence';
import { LearningDerivationService, applyLearningInfluence } from '@growth-operator/learning';
import { AIProviderRegistry, createDefaultRegistry } from '@growth-operator/ai';
import { loadWorkspaceConnectorConfigs, buildWorkerFetchConfigs } from '../services/workspaceConnectors';
import { getEnv } from '../config/env';

const router: ExpressRouter = Router();

router.use(authMiddleware);
router.use(workspaceMiddleware);
router.use(workspaceMembershipMiddleware);

const env = getEnv();
const aiRegistry = createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);

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
        // G3: same historical-evidence wiring as the worker stage — persisted
        // mentions for this workspace+topic plus the current mention, so the
        // unchanged service decides from real history, not one data point.
        const history = await loadTopicTrendEvidence(
          prisma,
          authReq.workspaceId,
          topic.id,
          source.id,
        );
        await trendService.updateTrendSignal(authReq.workspaceId, topic.id, [
          ...history,
          {
            sourceId: source.id,
            mentionStrength: mention.mentionStrength,
            relevanceScore: mention.relevanceScore,
            createdAt: new Date(),
          },
        ]);
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

interface ContentIdeaWithLineage {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  sourceIds: string[] | null;
  claimIds: string[] | null;
  trendSignalIds: string[] | null;
  evidenceSnapshot: unknown;
  opportunity: {
    id: string;
    title: string;
    thesis: string;
    problem: string;
    audience: string;
    angle: string;
    objective: string;
    contentFormat: string | null;
    opportunityScore: number;
    status: string;
    reasoning: string;
    evidenceSummary: string;
    originKind: string | null;
    originId: string | null;
    topic: { id: string; name: string; canonicalName: string } | null;
  } | null;
  topic: {
    id: string;
    name: string;
    canonicalName: string;
    description: string | null;
  } | null;
}

router.get('/lineage/:contentIdeaId', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { contentIdeaId } = req.params;

    const contentIdea = await prisma.contentIdea.findFirst({
      where: { id: contentIdeaId, workspaceId: authReq.workspaceId },
      include: {
        opportunity: {
          include: {
            topic: true,
          },
        },
        topic: true,
      } as any,
    }) as ContentIdeaWithLineage | null;

    if (!contentIdea) {
      throw new NotFoundError('Content Idea');
    }

    const sourceIds = (contentIdea.sourceIds as string[] | null) ?? [];
    const claimIds = (contentIdea.claimIds as string[] | null) ?? [];
    const trendSignalIds = (contentIdea.trendSignalIds as string[] | null) ?? [];

    const [sources, claims, trendSignals] = await Promise.all([
      sourceIds.length > 0
        ? prisma.intelligenceSource.findMany({
            where: { id: { in: sourceIds }, workspaceId: authReq.workspaceId },
            include: { documents: { take: 1, orderBy: { fetchedAt: 'desc' } } },
          })
        : Promise.resolve([]),
      claimIds.length > 0
        ? prisma.sourceClaim.findMany({
            where: { id: { in: claimIds }, workspaceId: authReq.workspaceId },
            include: { source: true },
          })
        : Promise.resolve([]),
      trendSignalIds.length > 0
        ? prisma.trendSignal.findMany({
            where: { id: { in: trendSignalIds }, workspaceId: authReq.workspaceId },
            include: { topic: true },
          })
        : Promise.resolve([]),
    ]);

    const lineage = {
      contentIdea: {
        id: contentIdea.id,
        title: contentIdea.title,
        status: contentIdea.status,
        createdAt: contentIdea.createdAt,
      },
      opportunity: contentIdea.opportunity
        ? {
            id: contentIdea.opportunity.id,
            title: contentIdea.opportunity.title,
            thesis: contentIdea.opportunity.thesis,
            problem: contentIdea.opportunity.problem,
            audience: contentIdea.opportunity.audience,
            angle: contentIdea.opportunity.angle,
            objective: contentIdea.opportunity.objective,
            contentFormat: contentIdea.opportunity.contentFormat,
            opportunityScore: contentIdea.opportunity.opportunityScore,
            status: contentIdea.opportunity.status,
            reasoning: contentIdea.opportunity.reasoning,
            evidenceSummary: contentIdea.opportunity.evidenceSummary,
            originKind: contentIdea.opportunity.originKind,
            originId: contentIdea.opportunity.originId,
            topic: contentIdea.opportunity.topic
              ? {
                  id: contentIdea.opportunity.topic.id,
                  name: contentIdea.opportunity.topic.name,
                  canonicalName: contentIdea.opportunity.topic.canonicalName,
                }
              : null,
          }
        : null,
      topic: contentIdea.topic
        ? {
            id: contentIdea.topic.id,
            name: contentIdea.topic.name,
            canonicalName: contentIdea.topic.canonicalName,
            description: contentIdea.topic.description,
          }
        : null,
      sources: sources.map((s) => ({
        id: s.id,
        title: s.title,
        url: s.url,
        canonicalUrl: s.canonicalUrl,
        sourceType: s.sourceType,
        publisher: s.publisher,
        author: s.author,
        publishedAt: s.publishedAt,
        description: s.description,
        status: s.status,
        document: s.documents[0]
          ? {
              id: s.documents[0].id,
              wordCount: s.documents[0].wordCount,
              language: s.documents[0].language,
              extractionStatus: s.documents[0].extractionStatus,
            }
          : null,
      })),
      claims: claims.map((c) => ({
        id: c.id,
        claimText: c.claimText,
        claimType: c.claimType,
        evidenceText: c.evidenceText,
        evidenceLocation: c.evidenceLocation,
        confidence: c.confidence,
        status: c.status,
        source: c.source
          ? {
              id: c.source.id,
              title: c.source.title,
              url: c.source.url,
              sourceType: c.source.sourceType,
            }
          : null,
        provenance: c.provenance,
      })),
      trendSignals: trendSignals.map((t) => ({
        id: t.id,
        status: t.status,
        mentionCount: t.mentionCount,
        sourceCount: t.sourceCount,
        firstSeenAt: t.firstSeenAt,
        lastSeenAt: t.lastSeenAt,
        recencyScore: t.recencyScore,
        sourceDiversityScore: t.sourceDiversityScore,
        frequencyScore: t.frequencyScore,
        evidenceSummary: t.evidenceSummary,
        topic: t.topic
          ? {
              id: t.topic.id,
              name: t.topic.name,
              canonicalName: t.topic.canonicalName,
            }
          : null,
      })),
      evidenceSnapshot: contentIdea.evidenceSnapshot,
    };

    res.json({ lineage });
  } catch (error) {
    next(error);
  }
});

router.get('/audience-problems', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const service = new AudienceProblemService(prisma, aiRegistry);
    const result = await service.discoverProblems({ workspaceId: authReq.workspaceId });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/opportunities/score-yfp', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = opportunityScoreSchema.parse(req.body);
    const topic = await prisma.topic.findFirst({ where: { id: data.topicId, workspaceId: authReq.workspaceId } });
    if (!topic) {
      throw new NotFoundError('Topic');
    }
    const scoring = await opportunityService.scoreOpportunityYFP({
      workspaceId: authReq.workspaceId,
      topicId: data.topicId,
      sourceIds: data.sourceIds,
      claimIds: data.claimIds,
      trendSignalIds: data.trendSignalIds,
      workspaceProfile: data.workspaceProfile,
      icp: data.icp,
      contentGaps: data.contentGaps,
    });
    res.json(scoring);
  } catch (error) {
    next(error);
  }
});

router.get('/source-reliability', async (req, res, next) => {
  try {
    const { sourceType } = req.query;
    if (typeof sourceType === 'string' && sourceType.trim()) {
      res.json({ reliability: getSourceReliability(sourceType) });
      return;
    }
    res.json({ reliabilities: listSourceReliabilities() });
  } catch (error) {
    next(error);
  }
});

router.post('/fact-check', async (req, res, next) => {
  try {
    const data = factCheckSchema.parse(req.body);
    res.json(buildFactCheckList(data.claims));
  } catch (error) {
    next(error);
  }
});

router.get('/research/status', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const connectors = connectorRegistry.getAllConnectors().map((c) => ({
      sourceType: c.sourceType,
      displayName: c.displayName,
      tier: c.capabilities.tier,
      requiresAuth: c.capabilities.requiresAuth,
      provides: c.capabilities.provides,
      limitations: c.capabilities.limitations,
    }));
    const [feedSources, recentRuns] = await Promise.all([
      prisma.feedSource.findMany({
        where: { workspaceId: authReq.workspaceId },
        select: { id: true, url: true, type: true, name: true, active: true, lastFetchedAt: true, lastError: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      prisma.dailyRun.findMany({
        where: { workspaceId: authReq.workspaceId },
        orderBy: { runDate: 'desc' },
        take: 5,
        select: { id: true, runDate: true, status: true, summary: true },
      }),
    ]);
    const latestSource = await prisma.intelligenceSource.findFirst({
      where: { workspaceId: authReq.workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    res.json({ connectors, feedSources, recentRuns, latestSourceAt: latestSource?.createdAt ?? null });
  } catch (error) {
    next(error);
  }
});

// Content Patterns endpoints
const patternsService = new ContentPatternService(prisma);

router.get('/patterns', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { limit, offset, formatPrimary, hookType } = req.query;
    const [patterns, total] = await Promise.all([
      patternsService.getPatternsByWorkspace(authReq.workspaceId, {
        formatPrimary: formatPrimary as string,
        hookType: hookType as string,
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
      }),
      prisma.contentPattern.count({ where: { workspaceId: authReq.workspaceId } }),
    ]);
    res.json({ patterns, pagination: { limit: parseInt(limit as string) || 50, offset: parseInt(offset as string) || 0, total } });
  } catch (error) {
    next(error);
  }
});

router.get('/patterns/counts', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    res.json(await patternsService.getPatternCountsByWorkspace(authReq.workspaceId));
  } catch (error) {
    next(error);
  }
});

router.get('/patterns/growth', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const days = parseInt(req.query.days as string) || 7;
    res.json(await patternsService.getPatternGrowth(authReq.workspaceId, days));
  } catch (error) {
    next(error);
  }
});

router.post('/research/trigger', async (req, res, next) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const data = researchTriggerSchema.parse(req.body ?? {});
    const requested = (data.sources ?? {}) as Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;

    // Persisted workspace configuration is the default; the request body
    // may override per call (one-shot, never persisted). Missing rows mean
    // disabled — nothing is inferred as enabled.
    const persisted = await loadWorkspaceConnectorConfigs(authReq.workspaceId);
    const { fetchConfigs: eligible } = buildWorkerFetchConfigs(persisted);
    const merged: Record<string, { enabled: boolean; config: Record<string, unknown> }> = {};
    for (const [key, def] of Object.entries(eligible)) {
      const override = requested[key];
      merged[key] = {
        enabled: typeof override?.enabled === 'boolean' ? override.enabled : def.enabled,
        config: { ...def.config, ...(override?.config ?? {}) },
      };
    }

    // Gate 1: prime the shared registry exactly like the daily loop does.
    // No-auth providers become reachable; authenticated ones stay honest
    // unless the server actually holds credentials.
    primeConnectorRegistry(connectorRegistry, {
      YOUTUBE_API_KEY: env.YOUTUBE_API_KEY,
      YOUTUBE_ACCESS_TOKEN: env.YOUTUBE_ACCESS_TOKEN,
    });
    const fetchConfigs: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of Object.entries(merged)) {
      fetchConfigs[key] = { enabled: value.enabled, config: value.config };
    }
    const { signals, errors } = await connectorRegistry.fetchFromAllSources(
      authReq.workspaceId,
      data.limit,
      fetchConfigs
    );

    const ingestion = new SourceIngestionService(prisma);
    let stored = 0;
    let skipped = 0;
    const storeErrors: string[] = [];
    for (const signal of signals.slice(0, data.limit)) {
      try {
        const result = await ingestion.ingest(authReq.workspaceId, signal.url, {
          sourceType: signal.sourceType as never,
        });
        if (result.status === 'FAILED') {
          skipped += 1;
          if (result.error) storeErrors.push(`${signal.sourceType}: ${result.error.slice(0, 160)}`);
        } else {
          stored += 1;
        }
      } catch (error) {
        skipped += 1;
        storeErrors.push(error instanceof Error ? error.message.slice(0, 160) : 'Unknown ingest error');
      }
    }

    res.status(201).json({
      trigger: {
        requested: data.limit,
        discovered: signals.length,
        stored,
        skipped,
        connectorErrors: errors,
        storeErrors: storeErrors.slice(0, 10),
        collectedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;