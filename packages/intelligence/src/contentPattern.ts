import { PrismaClient } from '@prisma/client';
import { ContentPattern } from './aiOutputValidation';

export interface PatternPersistenceOptions {
  workspaceId: string;
  documentId: string;
  sourceId: string;
  pattern: ContentPattern;
}

export class ContentPatternService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async persistPattern(options: PatternPersistenceOptions): Promise<string | null> {
    const { workspaceId, documentId, sourceId, pattern } = options;
    
    if (!pattern) return null;

    try {
      const formatPrimary = pattern.format?.primary || null;
      const formatSecondary = pattern.format?.secondary || [];
      const formatConfidence = pattern.format?.confidence ?? null;
      const formatEvidence = pattern.format?.evidence || [];

      const hookType = pattern.hook?.type || null;
      const hookText = pattern.hook?.text || null;
      const hookConfidence = pattern.hook?.confidence ?? null;
      const hookEvidence = pattern.hook?.evidence || [];

      const structureSequence = pattern.structure?.sequence || [];
      const structureConfidence = pattern.structure?.confidence ?? null;
      const structureEvidence = pattern.structure?.evidence || [];

      const ctaType = pattern.cta?.type || null;
      const ctaConfidence = pattern.cta?.confidence ?? null;
      const ctaEvidence = pattern.cta?.evidence || [];

      const extractionMethod = pattern.metadata?.extractionMethod || 'ai';
      const extractionModel = pattern.metadata?.model || null;
      const overallConfidence = this.calculateOverallConfidence(pattern);

      const contentPattern = await this.prisma.contentPattern.create({
        data: {
          workspaceId,
          documentId,
          sourceId,
          formatPrimary,
          formatSecondary,
          formatConfidence,
          formatEvidence,
          hookType,
          hookText,
          hookConfidence,
          hookEvidence,
          structureSequence,
          structureConfidence,
          structureEvidence,
          ctaType,
          ctaConfidence,
          ctaEvidence,
          extractionMethod,
          extractionModel,
          confidence: overallConfidence,
        },
      });

      return contentPattern.id;
    } catch (error) {
      console.error('Failed to persist content pattern:', error);
      return null;
    }
  }

  private calculateOverallConfidence(pattern: ContentPattern): number {
    const confidences = [
      pattern.format?.confidence,
      pattern.hook?.confidence,
      pattern.structure?.confidence,
      pattern.cta?.confidence,
    ].filter((c): c is number => c !== undefined && c !== null);

    if (confidences.length === 0) return 0;
    
    // Weighted average: format 30%, hook 30%, structure 30%, cta 10%
    const weights = [0.3, 0.3, 0.3, 0.1];
    let weightedSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < confidences.length; i++) {
      const c = confidences[i];
      const w = weights[i];
      if (c !== undefined && w !== undefined) {
        weightedSum += c * w;
        weightSum += w;
      }
    }
    
    return weightSum > 0 ? weightedSum / weightSum : 0;
  }

  async getPatternsByWorkspace(workspaceId: string, options: {
    formatPrimary?: string;
    hookType?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { formatPrimary, hookType, limit = 50, offset = 0 } = options;

    return this.prisma.contentPattern.findMany({
      where: {
        workspaceId,
        ...(formatPrimary ? { formatPrimary } : {}),
        ...(hookType ? { hookType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        document: {
          select: { id: true, sourceId: true, cleanContent: true, wordCount: true },
        },
        source: {
          select: { id: true, url: true, title: true, sourceType: true },
        },
      },
    });
  }

  async getPatternCountsByWorkspace(workspaceId: string) {
    const [formatCounts, hookCounts, structureCounts] = await Promise.all([
      this.prisma.contentPattern.groupBy({
        by: ['formatPrimary'],
        where: { workspaceId, formatPrimary: { not: null } },
        _count: { formatPrimary: true },
        orderBy: { _count: { formatPrimary: 'desc' } },
      }),
      this.prisma.contentPattern.groupBy({
        by: ['hookType'],
        where: { workspaceId, hookType: { not: null } },
        _count: { hookType: true },
        orderBy: { _count: { hookType: 'desc' } },
      }),
      this.prisma.contentPattern.groupBy({
        by: ['structureSequence'],
        where: { workspaceId },
        _count: { structureSequence: true },
        orderBy: { _count: { structureSequence: 'desc' } },
        take: 20,
      }),
    ]);

    type FormatCountResult = { formatPrimary: string | null; _count: { formatPrimary: number } };
    type HookCountResult = { hookType: string | null; _count: { hookType: number } };
    type StructureCountResult = { structureSequence: string[]; _count: { structureSequence: number } };

    return {
      formats: formatCounts.map((f: FormatCountResult) => ({ format: f.formatPrimary ?? '', count: f._count.formatPrimary })),
      hooks: hookCounts.map((h: HookCountResult) => ({ hook: h.hookType ?? '', count: h._count.hookType })),
      structures: structureCounts.map((s: StructureCountResult) => ({ sequence: s.structureSequence, count: s._count.structureSequence })),
    };
  }

  async getPatternGrowth(workspaceId: string, days: number = 7): Promise<{
    formats: Array<{ format: string; current: number; previous: number; growth: number }>;
    hooks: Array<{ hook: string; current: number; previous: number; growth: number }>;
  }> {
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);
    const previousEnd = currentStart;

    const [currentFormats, previousFormats, currentHooks, previousHooks] = await Promise.all([
      this.prisma.contentPattern.groupBy({
        by: ['formatPrimary'],
        where: { workspaceId, formatPrimary: { not: null }, createdAt: { gte: currentStart } },
        _count: { formatPrimary: true },
      }),
      this.prisma.contentPattern.groupBy({
        by: ['formatPrimary'],
        where: { workspaceId, formatPrimary: { not: null }, createdAt: { gte: previousStart, lt: previousEnd } },
        _count: { formatPrimary: true },
      }),
      this.prisma.contentPattern.groupBy({
        by: ['hookType'],
        where: { workspaceId, hookType: { not: null }, createdAt: { gte: currentStart } },
        _count: { hookType: true },
      }),
      this.prisma.contentPattern.groupBy({
        by: ['hookType'],
        where: { workspaceId, hookType: { not: null }, createdAt: { gte: previousStart, lt: previousEnd } },
        _count: { hookType: true },
      }),
    ]);

    const previousFormatMap = new Map<string, number>();
    previousFormats.forEach((f: { formatPrimary: string | null; _count: { formatPrimary: number } }) => { if (f.formatPrimary) previousFormatMap.set(f.formatPrimary, f._count.formatPrimary); });
    const previousHookMap = new Map<string, number>();
    previousHooks.forEach((h: { hookType: string | null; _count: { hookType: number } }) => { if (h.hookType) previousHookMap.set(h.hookType, h._count.hookType); });

    const formats = currentFormats.map((f: { formatPrimary: string | null; _count: { formatPrimary: number } }) => {
      if (!f.formatPrimary) return null;
      const current = f._count.formatPrimary;
      const previous = previousFormatMap.get(f.formatPrimary) || 0;
      const growth = previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
      return { format: f.formatPrimary, current, previous, growth };
    }).filter((x: { format: string; current: number; previous: number; growth: number } | null): x is { format: string; current: number; previous: number; growth: number } => x !== null);

    const hooks = currentHooks.map((h: { hookType: string | null; _count: { hookType: number } }) => {
      if (!h.hookType) return null;
      const current = h._count.hookType;
      const previous = previousHookMap.get(h.hookType) || 0;
      const growth = previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
      return { hook: h.hookType, current, previous, growth };
    }).filter((x: { hook: string; current: number; previous: number; growth: number } | null): x is { hook: string; current: number; previous: number; growth: number } => x !== null);

    return { formats, hooks };
  }
}