import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { z } from 'zod';

export interface PostPerformanceSnapshot {
  contentVersionId: string;
  contentIdeaId: string;
  title: string;
  format: string;
  angle: string | null;
  objective: string | null;
  topicId: string | null;
  topicName: string | null;
  publishedAt: Date | null;
  metrics: Array<{
    metricName: string;
    value: number;
    recordedAt: Date;
  }>;
}

export interface PerformancePattern {
  pattern: string;
  type: 'TOPIC' | 'FORMAT' | 'ANGLE' | 'HOOK' | 'OBJECTIVE' | 'CATEGORY';
  supportingPosts: string[];
  metricName: string;
  avgPerformance: number;
  vsBaseline: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: string;
}

export interface PerformanceReviewResult {
  postsAnalyzed: number;
  reviewTriggered: boolean;
  reason: string;
  patterns: PerformancePattern[];
  recommendations: PerformanceRecommendation[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  nextReviewAt: number;
}

export interface PerformanceRecommendation {
  type: 'TEST_MORE' | 'CONTINUE' | 'AVOID' | 'EXPERIMENT';
  description: string;
  reasoning: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction: string;
}

export interface TenPostReviewConfig {
  enabled: boolean;
  minPostsForReview: number;
  metricsToAnalyze: string[];
  attributesToCompare: Array<'format' | 'angle' | 'objective' | 'topic'>;
  minSamplePerGroup: number;
}

const DEFAULT_CONFIG: TenPostReviewConfig = {
  enabled: true,
  minPostsForReview: 10,
  metricsToAnalyze: ['impressions', 'reactions', 'comments', 'reposts', 'saves', 'linkClicks', 'profileViews'],
  attributesToCompare: ['format', 'angle', 'objective', 'topic'],
  minSamplePerGroup: 2,
};

export class PerformanceReviewService {
  private prisma: PrismaClient;
  private aiRegistry: AIProviderRegistry;
  private config: TenPostReviewConfig;

  constructor(prisma: PrismaClient, aiRegistry: AIProviderRegistry, config?: Partial<TenPostReviewConfig>) {
    this.prisma = prisma;
    this.aiRegistry = aiRegistry;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async checkAndRunReview(workspaceId: string): Promise<PerformanceReviewResult> {
    if (!this.config.enabled) {
      return {
        postsAnalyzed: 0,
        reviewTriggered: false,
        reason: 'Performance review is disabled',
        patterns: [],
        recommendations: [],
        confidence: 'LOW',
        nextReviewAt: this.config.minPostsForReview,
      };
    }

    const publishedVersions = await this.prisma.contentVersion.findMany({
      where: {
        workspaceId,
        isFinal: true,
        publishRecords: { some: {} },
      },
      include: {
        contentDraft: {
          include: {
            plan: true,
            contentIdea: {
              include: { topic: true },
            },
          },
        },
        outcomeMetrics: {
          where: {
            metricName: { in: this.config.metricsToAnalyze },
          },
          orderBy: { recordedAt: 'asc' },
        },
        contentDNA: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (publishedVersions.length < this.config.minPostsForReview) {
      return {
        postsAnalyzed: publishedVersions.length,
        reviewTriggered: false,
        reason: `Only ${publishedVersions.length} published posts; need ${this.config.minPostsForReview} for review`,
        patterns: [],
        recommendations: [],
        confidence: 'LOW',
        nextReviewAt: this.config.minPostsForReview - publishedVersions.length,
      };
    }

    const recentPosts = publishedVersions.slice(0, this.config.minPostsForReview);
    const snapshots = await this.buildSnapshots(recentPosts);

    const patterns = await this.analyzePatterns(snapshots);
    const recommendations = this.generateRecommendations(patterns, snapshots);

    await this.recordReview(workspaceId, {
      postsAnalyzed: recentPosts.length,
      patterns,
      recommendations,
      confidence: this.assessConfidence(patterns),
    });

    return {
      postsAnalyzed: recentPosts.length,
      reviewTriggered: true,
      reason: `Analyzed ${recentPosts.length} most recent published posts`,
      patterns,
      recommendations,
      confidence: this.assessConfidence(patterns),
      nextReviewAt: this.config.minPostsForReview,
    };
  }

  private async buildSnapshots(versions: any[]): Promise<PostPerformanceSnapshot[]> {
    return versions.map(v => {
      const plan = v.contentDraft?.plan;
      const idea = v.contentDraft?.contentIdea;
      const dna = v.contentDNA;

      return {
        contentVersionId: v.id,
        contentIdeaId: idea?.id || '',
        title: v.contentDraft?.body?.slice(0, 100) || idea?.title || 'Untitled',
        format: plan?.format || idea?.format || dna?.format || 'UNKNOWN',
        angle: plan?.angle || idea?.angle || dna?.angle || null,
        objective: plan?.objective || idea?.objective || null,
        topicId: idea?.topicId || null,
        topicName: idea?.topic?.name || null,
        publishedAt: v.publishRecords?.[0]?.publishedAt || v.createdAt,
        metrics: v.outcomeMetrics.map((m: any) => ({
          metricName: m.metricName,
          value: m.metricValue,
          recordedAt: m.recordedAt,
        })),
      };
    });
  }

  private async analyzePatterns(snapshots: PostPerformanceSnapshot[]): Promise<PerformancePattern[]> {
    const patterns: PerformancePattern[] = [];

    for (const metricName of this.config.metricsToAnalyze) {
      const metricPatterns = this.analyzeMetricPatterns(snapshots, metricName);
      patterns.push(...metricPatterns);
    }

    return patterns.sort((a, b) => Math.abs(b.vsBaseline) - Math.abs(a.vsBaseline));
  }

  private analyzeMetricPatterns(snapshots: PostPerformanceSnapshot[], metricName: string): PerformancePattern[] {
    const patterns: PerformancePattern[] = [];

    const postsWithMetric = snapshots.filter(s =>
      s.metrics.some(m => m.metricName === metricName)
    );

    if (postsWithMetric.length < this.config.minSamplePerGroup * 2) {
      return patterns;
    }

    const baseline = postsWithMetric.reduce((sum, s) => {
      const m = s.metrics.find(m => m.metricName === metricName);
      return sum + (m?.value || 0);
    }, 0) / postsWithMetric.length;

    // Analyze by format
    const formatGroups = this.groupBy(postsWithMetric, s => s.format);
    for (const [format, posts] of Object.entries(formatGroups)) {
      if (posts.length >= this.config.minSamplePerGroup) {
        const avg = posts.reduce((sum, s) => sum + (s.metrics.find(m => m.metricName === metricName)?.value || 0), 0) / posts.length;
        const vsBaseline = ((avg - baseline) / Math.max(1, baseline)) * 100;
        if (Math.abs(vsBaseline) > 15) {
          patterns.push({
            pattern: `Format "${format}" ${vsBaseline > 0 ? 'outperforms' : 'underperforms'} baseline by ${Math.abs(vsBaseline).toFixed(0)}% on ${metricName}`,
            type: 'FORMAT',
            supportingPosts: posts.map(p => p.contentVersionId),
            metricName,
            avgPerformance: avg,
            vsBaseline,
            confidence: posts.length >= 3 ? 'HIGH' : 'MEDIUM',
            evidence: `${posts.length} posts with format "${format}" averaged ${avg.toFixed(1)} vs baseline ${baseline.toFixed(1)}`,
          });
        }
      }
    }

    // Analyze by angle
    const angleGroups = this.groupBy(postsWithMetric, s => s.angle || 'NO_ANGLE');
    for (const [angle, posts] of Object.entries(angleGroups)) {
      if (angle !== 'NO_ANGLE' && posts.length >= this.config.minSamplePerGroup) {
        const avg = posts.reduce((sum, s) => sum + (s.metrics.find(m => m.metricName === metricName)?.value || 0), 0) / posts.length;
        const vsBaseline = ((avg - baseline) / Math.max(1, baseline)) * 100;
        if (Math.abs(vsBaseline) > 20) {
          patterns.push({
            pattern: `Angle "${angle}" ${vsBaseline > 0 ? 'outperforms' : 'underperforms'} baseline by ${Math.abs(vsBaseline).toFixed(0)}% on ${metricName}`,
            type: 'ANGLE',
            supportingPosts: posts.map(p => p.contentVersionId),
            metricName,
            avgPerformance: avg,
            vsBaseline,
            confidence: posts.length >= 3 ? 'HIGH' : 'MEDIUM',
            evidence: `${posts.length} posts with angle "${angle}" averaged ${avg.toFixed(1)} vs baseline ${baseline.toFixed(1)}`,
          });
        }
      }
    }

    // Analyze by topic
    const topicGroups = this.groupBy(postsWithMetric, s => s.topicName || 'NO_TOPIC');
    for (const [topic, posts] of Object.entries(topicGroups)) {
      if (topic !== 'NO_TOPIC' && posts.length >= this.config.minSamplePerGroup) {
        const avg = posts.reduce((sum, s) => sum + (s.metrics.find(m => m.metricName === metricName)?.value || 0), 0) / posts.length;
        const vsBaseline = ((avg - baseline) / Math.max(1, baseline)) * 100;
        if (Math.abs(vsBaseline) > 20) {
          patterns.push({
            pattern: `Topic "${topic}" ${vsBaseline > 0 ? 'outperforms' : 'underperforms'} baseline by ${Math.abs(vsBaseline).toFixed(0)}% on ${metricName}`,
            type: 'TOPIC',
            supportingPosts: posts.map(p => p.contentVersionId),
            metricName,
            avgPerformance: avg,
            vsBaseline,
            confidence: posts.length >= 3 ? 'HIGH' : 'MEDIUM',
            evidence: `${posts.length} posts on topic "${topic}" averaged ${avg.toFixed(1)} vs baseline ${baseline.toFixed(1)}`,
          });
        }
      }
    }

    // Analyze by objective
    const objectiveGroups = this.groupBy(postsWithMetric, s => s.objective || 'NO_OBJECTIVE');
    for (const [objective, posts] of Object.entries(objectiveGroups)) {
      if (objective !== 'NO_OBJECTIVE' && posts.length >= this.config.minSamplePerGroup) {
        const avg = posts.reduce((sum, s) => sum + (s.metrics.find(m => m.metricName === metricName)?.value || 0), 0) / posts.length;
        const vsBaseline = ((avg - baseline) / Math.max(1, baseline)) * 100;
        if (Math.abs(vsBaseline) > 20) {
          patterns.push({
            pattern: `Objective "${objective}" ${vsBaseline > 0 ? 'outperforms' : 'underperforms'} baseline by ${Math.abs(vsBaseline).toFixed(0)}% on ${metricName}`,
            type: 'OBJECTIVE',
            supportingPosts: posts.map(p => p.contentVersionId),
            metricName,
            avgPerformance: avg,
            vsBaseline,
            confidence: posts.length >= 3 ? 'HIGH' : 'MEDIUM',
            evidence: `${posts.length} posts with objective "${objective}" averaged ${avg.toFixed(1)} vs baseline ${baseline.toFixed(1)}`,
          });
        }
      }
    }

    return patterns;
  }

  private groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const key = keyFn(item);
      (groups[key] = groups[key] || []).push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private generateRecommendations(patterns: PerformancePattern[], snapshots: PostPerformanceSnapshot[]): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];

    const positiveFormats = patterns.filter(p => p.type === 'FORMAT' && p.vsBaseline > 15);
    const negativeFormats = patterns.filter(p => p.type === 'FORMAT' && p.vsBaseline < -15);
    const positiveAngles = patterns.filter(p => p.type === 'ANGLE' && p.vsBaseline > 20);
    const negativeAngles = patterns.filter(p => p.type === 'ANGLE' && p.vsBaseline < -20);
    const positiveTopics = patterns.filter(p => p.type === 'TOPIC' && p.vsBaseline > 20);
    const negativeTopics = patterns.filter(p => p.type === 'TOPIC' && p.vsBaseline < -20);

    if (positiveFormats.length > 0) {
      recommendations.push({
        type: 'TEST_MORE',
        description: `Test more content in ${positiveFormats.map(f => f.pattern.split('"')[1]).join(', ')} format`,
        reasoning: `These formats consistently outperform baseline across metrics`,
        confidence: positiveFormats.some(f => f.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM',
        suggestedAction: 'Create 2-3 more posts using these high-performing formats',
      });
    }

    if (negativeFormats.length > 0) {
      recommendations.push({
        type: 'AVOID',
        description: `Reconsider ${negativeFormats.map(f => f.pattern.split('"')[1]).join(', ')} format`,
        reasoning: `These formats consistently underperform baseline`,
        confidence: negativeFormats.some(f => f.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM',
        suggestedAction: 'Pause or redesign content using these formats',
      });
    }

    if (positiveAngles.length > 0) {
      recommendations.push({
        type: 'CONTINUE',
        description: `Continue using high-performing angles: ${positiveAngles.map(a => a.pattern.split('"')[1]).join(', ')}`,
        reasoning: `These angles resonate with audience`,
        confidence: 'HIGH',
        suggestedAction: 'Apply these angles to new topics',
      });
    }

    if (positiveTopics.length > 0) {
      recommendations.push({
        type: 'TEST_MORE',
        description: `Explore more content on ${positiveTopics.map(t => t.pattern.split('"')[1]).join(', ')}`,
        reasoning: `These topics generate above-average engagement`,
        confidence: 'HIGH',
        suggestedAction: 'Generate 3-5 new opportunities for these topics',
      });
    }

    // Default recommendation if no strong patterns
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'EXPERIMENT',
        description: 'No strong patterns detected; continue experimenting with formats and angles',
        reasoning: 'Insufficient data or high variance in performance',
        confidence: 'LOW',
        suggestedAction: 'Run A/B tests with different formats/angles on similar topics',
      });
    }

    return recommendations;
  }

  private assessConfidence(patterns: PerformancePattern[]): 'LOW' | 'MEDIUM' | 'HIGH' {
    const highConfidence = patterns.filter(p => p.confidence === 'HIGH').length;
    const totalPatterns = patterns.length;

    if (totalPatterns === 0) return 'LOW';
    if (highConfidence / totalPatterns > 0.5) return 'HIGH';
    if (highConfidence > 0) return 'MEDIUM';
    return 'LOW';
  }

  private async recordReview(
    workspaceId: string,
    data: {
      postsAnalyzed: number;
      patterns: PerformancePattern[];
      recommendations: PerformanceRecommendation[];
      confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    }
  ): Promise<void> {
    await this.prisma.intelligenceReport.create({
      data: {
        workspaceId,
        frequency: 'MONTHLY',
        periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        audienceCaredAbout: data.patterns.filter(p => p.vsBaseline > 0).map(p => p.pattern),
        emergingTopics: data.patterns.filter(p => p.type === 'TOPIC' && p.vsBaseline > 0).map(p => p.pattern),
        strongSignals: data.patterns.filter(p => p.vsBaseline > 15).map(p => p.pattern),
        weakSignals: data.patterns.filter(p => p.vsBaseline < -15).map(p => p.pattern),
        hookObservations: data.patterns.filter(p => p.type === 'ANGLE').map(p => p.pattern),
        formatObservations: data.patterns.filter(p => p.type === 'FORMAT').map(p => p.pattern),
        audienceObservations: data.recommendations.map(r => r.description),
        businessSignals: data.recommendations.filter(r => r.type === 'TEST_MORE' || r.type === 'CONTINUE').map(r => r.suggestedAction),
        experiments: data.recommendations.filter(r => r.type === 'EXPERIMENT').map(r => r.suggestedAction),
        learnedPatterns: data.patterns.map(p => `${p.type}: ${p.pattern}`),
        contradictoryEvidence: data.patterns.filter(p => p.vsBaseline < 0).map(p => p.pattern),
        recommendedExperiments: data.recommendations.filter(r => r.type === 'EXPERIMENT').map(r => r.suggestedAction),
        recommendedTopics: data.patterns.filter(p => p.type === 'TOPIC' && p.vsBaseline > 0).map(p => p.pattern.split('"')[1]),
        topicsToAvoid: data.patterns.filter(p => p.type === 'TOPIC' && p.vsBaseline < 0).map(p => p.pattern.split('"')[1]),
        confidenceLevel: data.confidence,
      },
    });
  }

  async getReviewHistory(workspaceId: string, limit = 10): Promise<any[]> {
    return this.prisma.intelligenceReport.findMany({
      where: { workspaceId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }

  async getLatestReview(workspaceId: string): Promise<any | null> {
    return this.prisma.intelligenceReport.findFirst({
      where: { workspaceId },
      orderBy: { generatedAt: 'desc' },
    });
  }
}