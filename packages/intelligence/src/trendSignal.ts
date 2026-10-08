import { PrismaClient } from '@prisma/client';
import { calculateFreshness } from '@growth-operator/shared';

export interface TrendCalculationInput {
  workspaceId: string;
  topicId: string;
  mentions: Array<{
    sourceId: string;
    mentionStrength: number;
    relevanceScore: number;
    createdAt: Date;
  }>;
}

export interface TrendSignalResult {
  status: 'INSUFFICIENT_HISTORY' | 'EMERGING' | 'RELEVANT' | 'TRENDING' | 'STALE';
  mentionCount: number;
  sourceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  recencyScore: number;
  sourceDiversityScore: number;
  frequencyScore: number;
  evidenceSummary: string;
}

export interface TopicTrendMentionEvidence {
  sourceId: string;
  mentionStrength: number;
  relevanceScore: number;
  createdAt: Date;
}

/**
 * G3 production evidence loader for trend calculation. Reads the persisted
 * historical TopicMentions for exactly one workspace+topic (never across
 * workspaces or topics), oldest first. Read-only: creates, updates, and
 * deletes nothing. Callers append the current cycle's mention; the service
 * keeps counting genuinely independent sourceIds and applying its own
 * freshness, diversity, frequency, and threshold rules unchanged.
 */
export async function loadTopicTrendEvidence(
  prisma: PrismaClient,
  workspaceId: string,
  topicId: string,
  excludeSourceId?: string,
): Promise<TopicTrendMentionEvidence[]> {
  const where: { workspaceId: string; topicId: string; sourceId?: { not: string } } = {
    workspaceId,
    topicId,
  };
  if (excludeSourceId) {
    where.sourceId = { not: excludeSourceId };
  }
  const rows = await prisma.topicMention.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(
    (m: { sourceId: string; mentionStrength: number; relevanceScore: number; createdAt: Date }) => ({
      sourceId: m.sourceId,
      mentionStrength: m.mentionStrength,
      relevanceScore: m.relevanceScore,
      createdAt: m.createdAt,
    }),
  );
}

export class TrendSignalService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async calculateTrend(input: TrendCalculationInput): Promise<TrendSignalResult> {
    const { mentions } = input;

    if (mentions.length === 0) {
      return this.createEmptyTrend();
    }

    const uniqueSources = new Set(mentions.map(m => m.sourceId));
    const sourceCount = uniqueSources.size;
    const mentionCount = mentions.length;

    if (sourceCount < 2) {
      return {
        status: 'INSUFFICIENT_HISTORY',
        mentionCount,
        sourceCount,
        firstSeenAt: this.getMinDate(mentions.map(m => m.createdAt)),
        lastSeenAt: this.getMaxDate(mentions.map(m => m.createdAt)),
        recencyScore: this.calculateRecencyScore(mentions.map(m => m.createdAt)),
        sourceDiversityScore: 0,
        frequencyScore: this.calculateFrequencyScore(mentions.map(m => m.createdAt)),
        evidenceSummary: `Only ${sourceCount} source(s) found. Minimum 2 independent sources required for trend detection.`,
      };
    }

    const sortedMentions = mentions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstSeenAt = sortedMentions[0]!.createdAt;
    const lastSeenAt = sortedMentions[sortedMentions.length - 1]!.createdAt;

    const daysSinceFirst = (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceLast = (Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24);

    const recencyScore = this.calculateRecencyScore(mentions.map(m => m.createdAt));
    const sourceDiversityScore = this.calculateSourceDiversityScore(mentions);
    const frequencyScore = this.calculateFrequencyScore(mentions.map(m => m.createdAt));

    let status: 'INSUFFICIENT_HISTORY' | 'EMERGING' | 'RELEVANT' | 'TRENDING' | 'STALE';

    if (daysSinceLast > 60) {
      status = 'STALE';
    } else if (daysSinceFirst < 3) {
      status = 'INSUFFICIENT_HISTORY';
    } else if (recencyScore > 0.75 && sourceDiversityScore > 0.5 && frequencyScore > 0.4 && sourceCount >= 3) {
      status = 'TRENDING';
    } else if (recencyScore > 0.75 && sourceDiversityScore > 0.4 && sourceCount >= 2) {
      status = 'RELEVANT';
    } else if (recencyScore > 0.3 && sourceCount >= 2) {
      status = 'EMERGING';
    } else {
      status = 'INSUFFICIENT_HISTORY';
    }

    const evidenceSummary = this.generateEvidenceSummary(
      status,
      mentionCount,
      sourceCount,
      daysSinceFirst,
      daysSinceLast,
      recencyScore,
      sourceDiversityScore,
      frequencyScore
    );

    return {
      status,
      mentionCount,
      sourceCount,
      firstSeenAt,
      lastSeenAt,
      recencyScore,
      sourceDiversityScore,
      frequencyScore,
      evidenceSummary,
    };
  }

  async updateTrendSignal(
    workspaceId: string,
    topicId: string,
    mentions: Array<{
      sourceId: string;
      mentionStrength: number;
      relevanceScore: number;
      createdAt: Date;
    }>
  ): Promise<void> {
    const trend = await this.calculateTrend({ workspaceId, topicId, mentions });

    await this.prisma.trendSignal.upsert({
      where: {
        workspaceId_topicId: {
          workspaceId,
          topicId,
        },
      },
      create: {
        workspaceId,
        topicId,
        status: trend.status,
        mentionCount: trend.mentionCount,
        sourceCount: trend.sourceCount,
        firstSeenAt: trend.firstSeenAt,
        lastSeenAt: trend.lastSeenAt,
        recencyScore: trend.recencyScore,
        sourceDiversityScore: trend.sourceDiversityScore,
        frequencyScore: trend.frequencyScore,
        evidenceSummary: trend.evidenceSummary,
        calculatedAt: new Date(),
      },
      update: {
        status: trend.status,
        mentionCount: trend.mentionCount,
        sourceCount: trend.sourceCount,
        firstSeenAt: trend.firstSeenAt,
        lastSeenAt: trend.lastSeenAt,
        recencyScore: trend.recencyScore,
        sourceDiversityScore: trend.sourceDiversityScore,
        frequencyScore: trend.frequencyScore,
        evidenceSummary: trend.evidenceSummary,
        calculatedAt: new Date(),
      },
    });
  }

  private createEmptyTrend(): TrendSignalResult {
    const now = new Date();
    return {
      status: 'INSUFFICIENT_HISTORY',
      mentionCount: 0,
      sourceCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      recencyScore: 0,
      sourceDiversityScore: 0,
      frequencyScore: 0,
      evidenceSummary: 'No mentions found for this topic.',
    };
  }

  private getMinDate(dates: Date[]): Date {
    return dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
  }

  private getMaxDate(dates: Date[]): Date {
    return dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date();
  }

  private calculateRecencyScore(dates: Date[]): number {
    if (dates.length === 0) return 0;
    const now = Date.now();
    const scores = dates.map(d => {
      const result = calculateFreshness(d, now, { halfLifeDays: 30 });
      return result.factor;
    });
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  private calculateSourceDiversityScore(mentions: Array<{ sourceId: string }>): number {
    if (mentions.length === 0) return 0;
    const uniqueSources = new Set(mentions.map(m => m.sourceId));
    return Math.min(1, uniqueSources.size / Math.max(1, mentions.length));
  }

  private calculateFrequencyScore(dates: Date[]): number {
    if (dates.length < 2) return 0;
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push((sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / (1000 * 60 * 60 * 24));
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.max(0, 1 - avgInterval / 14);
  }

  private generateEvidenceSummary(
    status: string,
    mentionCount: number,
    sourceCount: number,
    daysSinceFirst: number,
    daysSinceLast: number,
    recencyScore: number,
    sourceDiversityScore: number,
    frequencyScore: number
  ): string {
    const parts: string[] = [
      `Status: ${status}`,
      `Mentions: ${mentionCount}`,
      `Sources: ${sourceCount}`,
      `First seen: ${daysSinceFirst.toFixed(1)} days ago`,
      `Last seen: ${daysSinceLast.toFixed(1)} days ago`,
      `Recency: ${(recencyScore * 100).toFixed(0)}%`,
      `Source diversity: ${(sourceDiversityScore * 100).toFixed(0)}%`,
      `Frequency: ${(frequencyScore * 100).toFixed(0)}%`,
    ];

    if (status === 'TRENDING') {
      parts.push('Strong recent activity across multiple independent sources with consistent frequency.');
    } else if (status === 'RELEVANT') {
      parts.push('Recent activity with multiple sources, but not yet trending.');
    } else if (status === 'EMERGING') {
      parts.push('Early signals detected, monitoring for sustained activity.');
    } else if (status === 'INSUFFICIENT_HISTORY') {
      parts.push('Insufficient historical data to determine trend status.');
    } else if (status === 'STALE') {
      parts.push('No recent activity detected for 60+ days.');
    }

    return parts.join('; ');
  }
}