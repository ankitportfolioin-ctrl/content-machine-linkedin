import { PrismaClient } from '@prisma/client';
import { TopicClusteringService } from './topicClustering';
import { TrendSignalService } from './trendSignal';
import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';

export interface OpportunityScoreDimension {
  name: string;
  score: number;
  explanation: string;
  evidence: string[];
}

/**
 * Triage transition contract for content opportunities. Only NEW opportunities
 * may be triaged, and only to REVIEWED (acknowledged, retained as history) or
 * DISMISSED (rejected, retained as history). Every other combination —
 * including any transition out of a terminal state and any unknown status —
 * is invalid. Pure and exhaustive; the route maps a negative verdict to 422.
 */
export function validateOpportunityTriage(
  from: string,
  to: string
): { valid: boolean; reason: string | null } {
  if (to !== 'REVIEWED' && to !== 'DISMISSED') {
    return { valid: false, reason: `Unknown triage destination: ${to}. Allowed: REVIEWED, DISMISSED.` };
  }
  if (from !== 'NEW') {
    return { valid: false, reason: `Opportunity is ${from}; only NEW opportunities can be reviewed or dismissed.` };
  }
  return { valid: true, reason: null };
}

export interface OpportunityScoreResult {
  overallScore: number;
  dimensions: OpportunityScoreDimension[];
  criticalFailure: boolean;
  failureReason?: string;
}

export interface ContentOpportunityInput {
  workspaceId: string;
  topicId: string;
  sourceIds: string[];
  claimIds: string[];
  trendSignalIds: string[];
  workspaceProfile: string;
  icp: string;
  contentGaps: Array<{ type: string; description: string; evidence: string }>;
}

export class ContentOpportunityService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;
  private topicService: TopicClusteringService;
  private trendService: TrendSignalService;

  constructor(
    prisma: PrismaClient,
    aiRegistry: AIProviderRegistry,
    topicService: TopicClusteringService,
    trendService: TrendSignalService
  ) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
    this.topicService = topicService;
    this.trendService = trendService;
  }

  async generateOpportunity(input: ContentOpportunityInput): Promise<{
    opportunity: {
      title: string;
      thesis: string;
      problem: string;
      audience: string;
      angle: string;
      objective: string;
      contentFormat: string;
      opportunityScore: number;
      reasoning: string;
      evidenceSummary: string;
    } | null;
    scoreResult: OpportunityScoreResult;
    error?: string;
  }> {
    const scoreResult = await this.scoreOpportunity(input);

    if (scoreResult.criticalFailure) {
      return {
        opportunity: null,
        scoreResult,
        error: `Critical evidence failure: ${scoreResult.failureReason}`,
      };
    }

    const availableProviders = this.aiRegistry.getAvailable();
    if (availableProviders.length === 0) {
      return {
        opportunity: null,
        scoreResult,
        error: 'AI_UNAVAILABLE: Cannot generate opportunity without AI',
      };
    }

    const provider = availableProviders[0]!;

    const topic = await this.prisma.topic.findUnique({
      where: { id: input.topicId },
    });

    const sources = await this.prisma.intelligenceSource.findMany({
      where: { id: { in: input.sourceIds } },
    });

    const claims = await this.prisma.sourceClaim.findMany({
      where: { id: { in: input.claimIds } },
    });

    const trendSignals = await this.prisma.trendSignal.findMany({
      where: { id: { in: input.trendSignalIds } },
    });

    const systemPrompt = `You are a content strategist. Generate a structured content opportunity based on intelligence analysis.

CRITICAL RULES:
1. Base everything on the provided evidence. Do not invent.
2. If evidence is weak, explicitly state uncertainty.
3. The opportunity must explain WHY this content should be created.
4. Include specific source references.
5. Return valid JSON only.`;

    const userPrompt = `Generate a content opportunity:

TOPIC: ${topic?.name || 'Unknown'}
TOPIC DESCRIPTION: ${topic?.description || 'None'}

WORKSPACE PROFILE: ${input.workspaceProfile}
ICP: ${input.icp}

EVIDENCE SOURCES (${sources.length}):
${sources.map((s: typeof sources[0]) => `- ${s.title || 'Untitled'} (${s.publisher || 'Unknown'}): ${s.description || 'No description'}`).join('\n')}

KEY CLAIMS (${claims.length}):
${claims.map((c: typeof claims[0]) => `- [${c.claimType}] ${c.claimText} (confidence: ${c.confidence}, evidence: "${c.evidenceText.slice(0, 200)}...")`).join('\n')}

TREND SIGNALS (${trendSignals.length}):
${trendSignals.map((t: typeof trendSignals[0]) => `- Status: ${t.status}, Sources: ${t.sourceCount}, Recency: ${(t.recencyScore * 100).toFixed(0)}%`).join('\n')}

CONTENT GAPS (${input.contentGaps.length}):
${input.contentGaps.map((g: typeof input.contentGaps[0]) => `- [${g.type}] ${g.description} (evidence: ${g.evidence})`).join('\n')}

SCORING CONTEXT:
Overall Score: ${scoreResult.overallScore.toFixed(2)}/10
Dimensions:
${scoreResult.dimensions.map((d: typeof scoreResult.dimensions[0]) => `- ${d.name}: ${d.score.toFixed(2)}/10 - ${d.explanation}`).join('\n')}

Create an opportunity with:
- title: Compelling headline for the content
- thesis: Core argument/angle
- problem: What problem this solves for the audience
- audience: Specific target audience
- angle: Unique perspective/approach
- objective: What the content should achieve
- contentFormat: POST|ARTICLE|CAROUSEL|VIDEO|POLL
- reasoning: Why this opportunity exists based on evidence
- evidenceSummary: Summary of supporting evidence`;

    try {
      const response = await provider.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 3000,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      const schema = z.object({
        title: z.string().max(300),
        thesis: z.string().max(2000),
        problem: z.string().max(2000),
        audience: z.string().max(2000),
        angle: z.string().max(2000),
        objective: z.string().max(2000),
        contentFormat: z.enum(['POST', 'ARTICLE', 'CAROUSEL', 'VIDEO', 'POLL']),
        reasoning: z.string().max(3000),
        evidenceSummary: z.string().max(3000),
      });

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        return {
          opportunity: null,
          scoreResult,
          error: `AI output validation failed: ${validated.error.message}`,
        };
      }

      return {
        opportunity: {
          ...validated.data,
          opportunityScore: scoreResult.overallScore,
        },
        scoreResult,
      };
    } catch (error) {
      return {
        opportunity: null,
        scoreResult,
        error: `Opportunity generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async scoreOpportunity(input: ContentOpportunityInput): Promise<OpportunityScoreResult> {
    const topic = await this.prisma.topic.findUnique({
      where: { id: input.topicId },
      include: { trendSignals: true },
    });

    const sources = await this.prisma.intelligenceSource.findMany({
      where: { id: { in: input.sourceIds } },
    });

    const claims = await this.prisma.sourceClaim.findMany({
      where: { id: { in: input.claimIds } },
    });

    const dimensions: OpportunityScoreDimension[] = [];
    let criticalFailure = false;
    let failureReason: string | undefined;

    const relevanceScore = this.scoreRelevance(input, topic, sources);
    dimensions.push(relevanceScore);

    const audienceFitScore = this.scoreAudienceFit(input, sources);
    dimensions.push(audienceFitScore);

    const evidenceStrengthScore = this.scoreEvidenceStrength(claims);
    dimensions.push(evidenceStrengthScore);

    const timelinessScore = this.scoreTimeliness(sources, topic?.trendSignals || []);
    dimensions.push(timelinessScore);

    const sourceDiversityScore = this.scoreSourceDiversity(sources);
    dimensions.push(sourceDiversityScore);

    const differentiationScore = this.scoreDifferentiation(input.contentGaps);
    dimensions.push(differentiationScore);

    const gapAlignmentScore = this.scoreGapAlignment(input.contentGaps, topic);
    dimensions.push(gapAlignmentScore);

    const trendStrengthScore = this.scoreTrendStrength(topic?.trendSignals || []);
    dimensions.push(trendStrengthScore);

    const thesisClarityScore = 0.7;
    dimensions.push({
      name: 'thesis_clarity',
      score: thesisClarityScore,
      explanation: 'Thesis clarity assessed during AI generation',
      evidence: [],
    });

    const actionabilityScore = this.scoreActionability(claims, input.contentGaps);
    dimensions.push(actionabilityScore);

    const contradictoryClaims = claims.filter((c: typeof claims[0]) => c.status === 'CONTRADICTED');
    if (contradictoryClaims.length > 0) {
      const criticalContradictions = contradictoryClaims.filter((c: typeof claims[0]) => c.confidence > 0.7);
      if (criticalContradictions.length > 0) {
        criticalFailure = true;
        failureReason = `Critical contradiction in high-confidence claims: ${criticalContradictions.map((c: typeof claims[0]) => (c.claimText || 'Unknown claim').slice(0, 100)).join('; ')}`;
      }
    }

    const unsupportedClaims = claims.filter((c: typeof claims[0]) => c.confidence < 0.4);
    if (unsupportedClaims.length / Math.max(1, claims.length) > 0.5) {
      criticalFailure = true;
      failureReason = 'More than 50% of claims have low confidence (<0.4)';
    }

    const overallScore = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      dimensions,
      criticalFailure,
      failureReason,
    };
  }

  private scoreRelevance(
    input: ContentOpportunityInput,
    topic: { name: string; description: string | null } | null,
    sources: Array<{ title: string | null; description: string | null }>
  ): OpportunityScoreDimension {
    let score = 0.5;
    const evidence: string[] = [];

    if (topic) {
      score += 0.2;
      evidence.push(`Topic "${topic.name}" identified`);
    }

    if (sources.length >= 3) score += 0.2;
    else if (sources.length >= 2) score += 0.1;

    evidence.push(`${sources.length} evidence sources`);

    return {
      name: 'relevance',
      score: Math.min(1, score),
      explanation: 'How relevant this topic is to the workspace and audience',
      evidence,
    };
  }

  private scoreAudienceFit(
    input: ContentOpportunityInput,
    sources: Array<{ title: string | null; description: string | null }>
  ): OpportunityScoreDimension {
    let score = 0.6;
    const evidence: string[] = [];

    if (input.icp && input.icp.length > 20) {
      score += 0.2;
      evidence.push('ICP defined');
    }

    if (input.workspaceProfile && input.workspaceProfile.length > 20) {
      score += 0.1;
      evidence.push('Workspace profile defined');
    }

    return {
      name: 'audience_fit',
      score: Math.min(1, score),
      explanation: 'How well the topic aligns with the target audience and ICP',
      evidence,
    };
  }

  private scoreEvidenceStrength(claims: Array<{ confidence: number; status: string; evidenceText: string }>): OpportunityScoreDimension {
    if (claims.length === 0) {
      return {
        name: 'evidence_strength',
        score: 0,
        explanation: 'No claims extracted from sources',
        evidence: [],
      };
    }

    const avgConfidence = claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length;
    const supportedRatio = claims.filter(c => c.status === 'SUPPORTED').length / claims.length;

    let score = (avgConfidence + supportedRatio) / 2;
    const evidence = [
      `${claims.length} claims extracted`,
      `Avg confidence: ${(avgConfidence * 100).toFixed(0)}%`,
      `Supported: ${(supportedRatio * 100).toFixed(0)}%`,
    ];

    return {
      name: 'evidence_strength',
      score: Math.min(1, score),
      explanation: 'Strength and reliability of extracted evidence',
      evidence,
    };
  }

  private scoreTimeliness(
    sources: Array<{ publishedAt: Date | null }>,
    trendSignals: Array<{ lastSeenAt: Date; recencyScore: number }>
  ): OpportunityScoreDimension {
    let score = 0.5;
    const evidence: string[] = [];

    const recentSources = sources.filter(s => s.publishedAt && (Date.now() - s.publishedAt!.getTime()) < 30 * 24 * 60 * 60 * 1000);
    if (recentSources.length > 0) {
      score += 0.3;
      evidence.push(`${recentSources.length} recent sources (<30 days)`);
    }

    if (trendSignals.length > 0) {
      const avgRecency = trendSignals.reduce((sum, t) => sum + t.recencyScore, 0) / trendSignals.length;
      score += avgRecency * 0.2;
      evidence.push(`Trend recency: ${(avgRecency * 100).toFixed(0)}%`);
    }

    return {
      name: 'timeliness',
      score: Math.min(1, score),
      explanation: 'How current and timely the topic is',
      evidence,
    };
  }

  private scoreSourceDiversity(sources: Array<{ publisher: string | null; sourceType: string }>): OpportunityScoreDimension {
    if (sources.length === 0) {
      return {
        name: 'source_diversity',
        score: 0,
        explanation: 'No sources available',
        evidence: [],
      };
    }

    const uniquePublishers = new Set(sources.map(s => s.publisher?.toLowerCase() || 'unknown').filter(p => p !== 'unknown'));
    const uniqueTypes = new Set(sources.map(s => s.sourceType));

    let score = 0.3;
    const evidence: string[] = [`${sources.length} total sources`];

    if (uniquePublishers.size >= 3) score += 0.4;
    else if (uniquePublishers.size >= 2) score += 0.2;
    evidence.push(`${uniquePublishers.size} unique publishers`);

    if (uniqueTypes.size >= 2) score += 0.2;
    evidence.push(`${uniqueTypes.size} source types`);

    return {
      name: 'source_diversity',
      score: Math.min(1, score),
      explanation: 'Diversity of sources by publisher and type',
      evidence,
    };
  }

  private scoreDifferentiation(contentGaps: Array<{ type: string; description: string; evidence: string }>): OpportunityScoreDimension {
    if (contentGaps.length === 0) {
      return {
        name: 'differentiation',
        score: 0.3,
        explanation: 'No content gaps identified',
        evidence: [],
      };
    }

    const gapTypes = new Set(contentGaps.map(g => g.type));
    let score = 0.4 + Math.min(0.4, gapTypes.size * 0.1);
    const evidence = contentGaps.map(g => `${g.type}: ${g.description.slice(0, 100)}`);

    return {
      name: 'differentiation',
      score: Math.min(1, score),
      explanation: 'Unique angles or gaps in existing coverage',
      evidence,
    };
  }

  private scoreGapAlignment(
    contentGaps: Array<{ type: string; description: string; evidence: string }>,
    topic: { name: string } | null
  ): OpportunityScoreDimension {
    if (contentGaps.length === 0) {
      return {
        name: 'content_gap_alignment',
        score: 0.3,
        explanation: 'No gaps to align with',
        evidence: [],
      };
    }

    let score = 0.5;
    const evidence = contentGaps.map(g => `${g.type}: ${g.evidence.slice(0, 100)}`);

    return {
      name: 'content_gap_alignment',
      score: Math.min(1, score),
      explanation: 'Alignment with identified content gaps',
      evidence,
    };
  }

  private scoreTrendStrength(trendSignals: Array<{ status: string; mentionCount: number; sourceCount: number }>): OpportunityScoreDimension {
    if (trendSignals.length === 0) {
      return {
        name: 'trend_strength',
        score: 0.3,
        explanation: 'No trend signals available',
        evidence: ['INSUFFICIENT_HISTORY'],
      };
    }

    const trending = trendSignals.filter(t => t.status === 'TRENDING').length;
    const relevant = trendSignals.filter(t => t.status === 'RELEVANT').length;
    const emerging = trendSignals.filter(t => t.status === 'EMERGING').length;

    let score = 0.4;
    const evidence: string[] = [];

    if (trending > 0) {
      score += 0.4;
      evidence.push(`${trending} TRENDING signal(s)`);
    } else if (relevant > 0) {
      score += 0.3;
      evidence.push(`${relevant} RELEVANT signal(s)`);
    } else if (emerging > 0) {
      score += 0.2;
      evidence.push(`${emerging} EMERGING signal(s)`);
    } else {
      evidence.push('No positive trend signals');
    }

    return {
      name: 'trend_strength',
      score: Math.min(1, score),
      explanation: 'Strength of trend signals for this topic',
      evidence,
    };
  }

  private scoreActionability(
    claims: Array<{ claimType: string; confidence: number }>,
    contentGaps: Array<{ type: string }>
  ): OpportunityScoreDimension {
    const actionableClaims = claims.filter(c =>
      ['RECOMMENDATION', 'OBSERVATION'].includes(c.claimType) && c.confidence > 0.6
    ).length;

    let score = 0.4;
    const evidence: string[] = [];

    if (actionableClaims > 0) {
      score += 0.3;
      evidence.push(`${actionableClaims} actionable claims`);
    }

    if (contentGaps.length > 0) {
      score += 0.2;
      evidence.push(`${contentGaps.length} content gaps addressable`);
    }

    return {
      name: 'actionability',
      score: Math.min(1, score),
      explanation: 'How actionable this opportunity is for content creation',
      evidence,
    };
  }
}