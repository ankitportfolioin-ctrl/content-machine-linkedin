import { PrismaClient } from '@prisma/client';

export interface DiversityDistribution { [key: string]: number }

function distribute<T>(rows: T[], pick: (r: T) => string | null | undefined): DiversityDistribution {
  const counts: DiversityDistribution = {};
  for (const r of rows) {
    const k = pick(r) ?? 'unknown';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export class DiversityService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async snapshot(workspaceId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await (this.prisma as any).contentDNA.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
    const pillarDist = distribute(rows, (r: any) => r.pillar);
    const formatDist = distribute(rows, (r: any) => r.format);
    const audienceDist = distribute(rows, (r: any) => r.audienceSegmentId ?? r.topic);
    const angleDist = distribute(rows, (r: any) => (r.angle ?? '').slice(0, 60) || 'unknown');
    const topicDist = distribute(rows, (r: any) => r.topic);

    const warnings: string[] = [];
    const total = Math.max(1, rows.length);
    for (const [k, v] of Object.entries(pillarDist)) {
      if (v / total > 0.5 && total >= 5) warnings.push(`Pillar "${k}" is ${(Math.round((v / total) * 100))}% of recent content — repetition risk.`);
    }
    for (const [k, v] of Object.entries(formatDist)) {
      if (v / total > 0.6 && total >= 5) warnings.push(`Format "${k}" dominates recent mix.`);
    }

    const saved = await this.prisma.contentDiversitySnapshot.create({
      data: {
        workspaceId,
        periodStart: since,
        periodEnd: new Date(),
        pillarDist, topicDist, formatDist, audienceDist, angleDist,
      },
    });
    return { snapshot: saved, warnings, sampleSize: rows.length };
  }

  async latest(workspaceId: string) {
    return this.prisma.contentDiversitySnapshot.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export interface TodayBrain {
  newSignals: number;
  highPotentialOpportunities: number;
  readyForApproval: number;
  awaitingAnalytics: number;
  newAudienceSignals: number;
  runningExperiments: number;
  newLearnedPatterns: number;
  recommendation: { text: string; why: string[]; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT DATA' } | null;
}

export class BrainReportService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async today(workspaceId: string): Promise<TodayBrain> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      newSignals,
      highPotentialOpportunities,
      readyForApproval,
      awaitingAnalytics,
      newAudienceSignals,
      runningExperiments,
      newLearnedPatterns,
    ] = await Promise.all([
      this.prisma.intelligenceSource.count({ where: { workspaceId, createdAt: { gte: dayAgo } } }),
      this.prisma.contentOpportunity.count({ where: { workspaceId, status: 'NEW' as any, opportunityScore: { gte: 7 } } }),
      this.prisma.contentReview.count({ where: { workspaceId, status: 'SUBMITTED' as any } }),
      this.prisma.publishRecord.count({ where: { workspaceId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      this.prisma.audienceSignal.count({ where: { workspaceId, createdAt: { gte: dayAgo } } }),
      this.prisma.experiment.count({ where: { workspaceId, status: 'RUNNING' as any } }),
      this.prisma.learningProposal.count({ where: { workspaceId, createdAt: { gte: dayAgo } } }),
    ]);

    const topOpportunity = await this.prisma.contentOpportunity.findFirst({
      where: { workspaceId, status: 'NEW' as any },
      orderBy: { opportunityScore: 'desc' },
    });

    let recommendation: TodayBrain['recommendation'] = null;
    if (!topOpportunity) {
      recommendation = { text: 'Insufficient data: ingest research sources to generate opportunities.', why: ['No NEW opportunities found.'], confidence: 'INSUFFICIENT DATA' };
    } else {
      const recentTutorialCount = await (this.prisma as any).contentDNA.count({
        where: { workspaceId, pillar: { contains: 'tutorial', mode: 'insensitive' }, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }).catch(() => 0);
      recommendation = {
        text: `Review "${topOpportunity.title}" for ${topOpportunity.audience?.slice(0, 80) ?? 'target audience'}.`,
        why: [
          `Opportunity score ${topOpportunity.opportunityScore.toFixed(1)} with evidence summary present.`,
          `Audience: ${(topOpportunity.audience ?? 'unknown').slice(0, 120)}`,
          recentTutorialCount >= 3 ? 'Caution: recent mix already heavy on tutorials — consider a different angle to protect diversity.' : 'Current mix has room for practical tutorials.',
        ],
        confidence: topOpportunity.opportunityScore >= 8 ? 'MEDIUM' : 'LOW',
      };
    }

    return { newSignals, highPotentialOpportunities, readyForApproval, awaitingAnalytics, newAudienceSignals, runningExperiments, newLearnedPatterns, recommendation };
  }

  async weekly(workspaceId: string, periodStart: Date, periodEnd: Date) {
    return this.buildPeriodReport(workspaceId, 'WEEKLY', periodStart, periodEnd);
  }

  /**
   * Step E: DAILY digest writer. Idempotent via upsert on the
   * (workspaceId, frequency, periodStart, periodEnd) unique key, so loop
   * re-runs never duplicate the digest.
   */
  async daily(workspaceId: string, periodStart: Date, periodEnd: Date) {
    return this.buildPeriodReport(workspaceId, 'DAILY', periodStart, periodEnd);
  }

  private async buildPeriodReport(
    workspaceId: string,
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    periodStart: Date,
    periodEnd: Date
  ) {
    const [dnas, comments, experiments, proposals, opportunities] = await Promise.all([
      (this.prisma as any).contentDNA.findMany({ where: { workspaceId, createdAt: { gte: periodStart, lte: periodEnd } }, take: 200 }),
      this.prisma.comment.findMany({ where: { workspaceId, createdAt: { gte: periodStart, lte: periodEnd } }, take: 200 }),
      this.prisma.experiment.findMany({ where: { workspaceId, createdAt: { gte: periodStart, lte: periodEnd } }, take: 50 }),
      this.prisma.learningProposal.findMany({ where: { workspaceId, createdAt: { gte: periodStart, lte: periodEnd } }, take: 50 }),
      this.prisma.contentOpportunity.findMany({ where: { workspaceId, createdAt: { gte: periodStart, lte: periodEnd } }, take: 100, orderBy: { opportunityScore: 'desc' } }),
    ]);

    const withMetrics = (dnas as any[]).filter((d) => (d.reach ?? d.impressions ?? 0) > 0);
    const strong = withMetrics.filter((d) => (d.saves ?? 0) >= 5 || (d.reactions ?? 0) >= 20).slice(0, 5);
    const weak = withMetrics.filter((d) => (d.reactions ?? 0) <= 2 && (d.saves ?? 0) <= 1).slice(0, 5);

    const sections = {
      audienceCaredAbout: comments.filter((c: any) => c.isRequest || c.isQuestion).slice(0, 10).map((c: any) => ({ id: c.id, text: c.text.slice(0, 200), type: c.type })),
      emergingTopics: opportunities.slice(0, 10).map((o: any) => ({ id: o.id, title: o.title, score: o.opportunityScore })),
      strongSignals: strong.map((d: any) => ({ id: d.id, title: d.title, saves: d.saves, reactions: d.reactions })),
      weakSignals: weak.map((d: any) => ({ id: d.id, title: d.title })),
      hookObservations: [],
      formatObservations: [],
      audienceObservations: [],
      businessSignals: [],
      experiments: experiments.map((e: any) => ({ id: e.id, hypothesis: e.hypothesis, status: e.status, result: e.result })),
      learnedPatterns: proposals.map((p: any) => ({ id: p.id, dimension: p.dimension, pattern: p.observedPattern, status: p.status })),
      contradictoryEvidence: [],
      recommendedExperiments: [],
      recommendedTopics: opportunities.slice(0, 5).map((o: any) => ({ id: o.id, title: o.title })),
      topicsToAvoid: [],
      confidenceLevel: withMetrics.length >= 10 ? 'MEDIUM' : withMetrics.length >= 3 ? 'LOW' : 'INSUFFICIENT DATA',
    };
    const report = await this.prisma.intelligenceReport.upsert({
      where: {
        workspaceId_frequency_periodStart_periodEnd: {
          workspaceId,
          frequency: frequency as any,
          periodStart,
          periodEnd,
        },
      },
      create: {
        workspaceId,
        frequency: frequency as any,
        periodStart,
        periodEnd,
        ...sections,
      },
      update: {
        ...sections,
        generatedAt: new Date(),
      },
    });
    return report;
  }

  async learningDashboard(workspaceId: string) {
    const proposals = await this.prisma.learningProposal.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, take: 50 });
    const confirmed = proposals.filter((p: any) => p.status === 'CONFIRMED');
    const running = await this.prisma.experiment.findMany({ where: { workspaceId, status: 'RUNNING' as any }, take: 20 });
    return {
      whatWeKnow: confirmed.map((p: any) => ({ id: p.id, dimension: p.dimension, pattern: p.observedPattern, sample: p.sampleSize, confidence: p.confidence })),
      whatWeThink: proposals.filter((p: any) => p.status === 'PROPOSED').map((p: any) => ({ id: p.id, dimension: p.dimension, pattern: p.observedPattern, confidence: p.confidence })),
      whatWeAreTesting: running.map((e: any) => ({ id: e.id, hypothesis: e.hypothesis, variable: e.variable, metric: e.metricName })),
      whatWeDontKnow: [
        'Whether posting time materially affects reach (no timing experiment yet).',
        'Whether carousel vs text holds within comparable beginner groups (sample too small until n>=5 per arm).',
      ],
    };
  }
}
