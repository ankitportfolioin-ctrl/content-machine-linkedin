import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const ContentDNAInputSchema = z.object({
  contentIdeaId: z.string().uuid().optional(),
  contentDraftId: z.string().uuid().optional(),
  contentVersionId: z.string().uuid().optional(),
  topic: z.string().max(200).optional(),
  subtopic: z.string().max(200).optional(),
  audienceSegmentId: z.string().uuid().optional(),
  skillLevel: z.string().max(50).optional(),
  pillar: z.string().max(100).optional(),
  format: z.enum([
    'TEXT_POST','CAROUSEL','DOCUMENT','IMAGE','VIDEO_SCRIPT','TUTORIAL',
    'NEWS_EXPLANATION','HOW_TO','LIST','COMPARISON','CASE_STUDY','EXPERIMENT',
    'MYTH_VS_FACT','TOOL_BREAKDOWN','PROJECT_WALKTHROUGH',
  ]).optional(),
  angle: z.string().optional(),
  hookType: z.enum(['PROBLEM','QUESTION','STATEMENT','STORY','STATISTIC','CONTRARIAN','PREDICTION','FRAMEWORK']).optional(),
  hook: z.string().optional(),
  hookLength: z.number().int().nonnegative().optional(),
  title: z.string().max(300).optional(),
  structure: z.record(z.unknown()).optional(),
  bodyLength: z.number().int().nonnegative().optional(),
  visualType: z.string().max(50).optional(),
  visualConcept: z.string().optional(),
  ctaType: z.enum(['COMMENT','SHARE','FOLLOW','DOWNLOAD','SIGNUP','BUY','LEARN_MORE','DM','SAVE']).optional(),
  cta: z.string().optional(),
  hashtags: z.array(z.string().max(100)).default([]),
  sourceIds: z.array(z.string().uuid()).default([]),
  freshness: z.string().max(50).optional(),
  publishTime: z.string().datetime({ offset: true }).optional(),
  stage: z.enum([
    'RESEARCH','OPPORTUNITY','IDEA','ANGLE','HOOK','SCRIPT','VISUAL_CONCEPT',
    'CAPTION','HASHTAGS','FACT_CHECK','ORIGINALITY_CHECK','QUALITY_CHECK','HUMAN_APPROVAL','PUBLISHING',
  ]).default('RESEARCH'),
});

export type ContentDNAInput = z.infer<typeof ContentDNAInputSchema>;

export const PerformanceMetricsSchema = z.object({
  impressions: z.number().int().nonnegative().optional(),
  reach: z.number().int().nonnegative().optional(),
  reactions: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  reposts: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative().optional(),
  sends: z.number().int().nonnegative().optional(),
  linkClicks: z.number().int().nonnegative().optional(),
  profileViews: z.number().int().nonnegative().optional(),
  followerGain: z.number().int().optional(),
  businessActions: z.number().int().nonnegative().optional(),
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

export function attentionValue(m: PerformanceMetrics): number | null {
  const parts = [m.reactions ?? 0, m.comments ?? 0, m.reposts ?? 0, m.saves ?? 0, m.sends ?? 0];
  const total = parts.reduce((a, b) => a + b, 0);
  const reach = m.reach ?? m.impressions ?? 0;
  if (!reach) return null;
  return Math.round((total / Math.max(1, reach)) * 10000) / 10000;
}

export function businessValue(m: PerformanceMetrics): number | null {
  const actions = (m.linkClicks ?? 0) + (m.businessActions ?? 0) + (m.profileViews ?? 0);
  const reach = m.reach ?? m.impressions ?? 0;
  if (!reach) return null;
  return Math.round((actions / Math.max(1, reach)) * 10000) / 10000;
}

export class ContentDNAService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async upsert(workspaceId: string, input: ContentDNAInput) {
    const validated = ContentDNAInputSchema.parse(input);
    const { publishTime, ...rest } = validated;

    const whereUnique =
      rest.contentIdeaId ? { contentIdeaId: rest.contentIdeaId } :
      rest.contentDraftId ? { contentDraftId: rest.contentDraftId } :
      rest.contentVersionId ? { contentVersionId: rest.contentVersionId } : null;

    if (!whereUnique) throw new Error('ContentDNA requires one of contentIdeaId, contentDraftId, contentVersionId.');

    const data = {
      workspaceId,
      ...rest,
      publishTime: publishTime ? new Date(publishTime) : undefined,
    };

    const existing = await (this.prisma as any).contentDNA.findUnique({ where: whereUnique });
    if (existing) {
      if (existing.workspaceId !== workspaceId) throw new Error('ContentDNA not found in this workspace.');
      return (this.prisma as any).contentDNA.update({ where: { id: existing.id }, data });
    }
    const created = await (this.prisma as any).contentDNA.create({ data });
    await (this.prisma as any).contentStageHistory.create({
      data: { workspaceId, contentDNAId: created.id, fromStage: null, toStage: created.stage, notes: 'DNA created' },
    });
    return created;
  }

  async recordPerformance(workspaceId: string, dnaId: string, metrics: PerformanceMetrics) {
    const validated = PerformanceMetricsSchema.parse(metrics);
    const existing = await (this.prisma as any).contentDNA.findFirst({ where: { id: dnaId, workspaceId } });
    if (!existing) throw new Error('ContentDNA not found in this workspace.');
    return (this.prisma as any).contentDNA.update({ where: { id: dnaId }, data: validated });
  }

  async comparableGroup(workspaceId: string, filter: { pillar?: string; format?: string; audienceSegmentId?: string; topic?: string }, take = 50) {
    return (this.prisma as any).contentDNA.findMany({
      where: { workspaceId, ...Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined)) },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async baseline(workspaceId: string, filter: { pillar?: string; format?: string; audienceSegmentId?: string }) {
    const rows = await this.comparableGroup(workspaceId, filter, 200);
    const reaches = rows.map((r: any) => r.reach ?? r.impressions ?? 0).filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
    if (reaches.length === 0) return { medianReach: null, sampleSize: 0, note: 'Insufficient data.' };
    const mid = Math.floor(reaches.length / 2);
    const median = reaches.length % 2 === 0 ? ((reaches[mid - 1]! + reaches[mid]!) / 2) : reaches[mid]!;
    return { medianReach: median, sampleSize: reaches.length, note: reaches.length < 5 ? 'Low sample; treat as LOW confidence.' : 'Sufficient sample.' };
  }
}
