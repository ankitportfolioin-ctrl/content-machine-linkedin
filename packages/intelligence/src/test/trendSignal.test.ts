import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TrendSignalService, loadTopicTrendEvidence } from '../trendSignal';

const mockPrisma = {} as unknown as PrismaClient;

describe('TrendSignalService', () => {
  let service: TrendSignalService;

  beforeEach(() => {
    service = new TrendSignalService(mockPrisma);
  });

  describe('calculateTrend', () => {
    it('returns INSUFFICIENT_HISTORY for empty mentions', async () => {
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [],
      });

      expect(result.status).toBe('INSUFFICIENT_HISTORY');
      expect(result.mentionCount).toBe(0);
      expect(result.sourceCount).toBe(0);
    });

    it('returns INSUFFICIENT_HISTORY for single source', async () => {
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(),
          },
        ],
      });

      expect(result.status).toBe('INSUFFICIENT_HISTORY');
      expect(result.mentionCount).toBe(1);
      expect(result.sourceCount).toBe(1);
      expect(result.evidenceSummary).toContain('Minimum 2 independent sources required');
    });

    it('returns INSUFFICIENT_HISTORY for recent sources with insufficient history', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.status).toBe('INSUFFICIENT_HISTORY');
      expect(result.sourceCount).toBe(2);
    });

    it('returns EMERGING for low recency with sufficient sources', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.status).toBe('EMERGING');
    });

    it('returns RELEVANT for medium recency and diversity', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.status).toBe('RELEVANT');
    });

    it('returns TRENDING for high recency, diversity, and frequency with 3+ sources', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.9,
            relevanceScore: 0.95,
            createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.85,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-3',
            mentionStrength: 0.8,
            relevanceScore: 0.85,
            createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.status).toBe('TRENDING');
      expect(result.sourceCount).toBe(3);
      expect(result.recencyScore).toBeGreaterThan(0.7);
      expect(result.sourceDiversityScore).toBeGreaterThan(0.5);
    });

    it('returns STALE for old evidence', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 70 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 65 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.status).toBe('STALE');
    });

    it('calculates recency score correctly', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.recencyScore).toBeGreaterThan(0);
      expect(result.recencyScore).toBeLessThanOrEqual(1);
    });

    it('calculates source diversity score', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.sourceDiversityScore).toBe(1);
    });

    it('calculates frequency score', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.frequencyScore).toBeGreaterThanOrEqual(0);
    });

    it('generates evidence summary', async () => {
      const now = new Date();
      const result = await service.calculateTrend({
        workspaceId: 'workspace-1',
        topicId: 'topic-1',
        mentions: [
          {
            sourceId: 'source-1',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            sourceId: 'source-2',
            mentionStrength: 0.7,
            relevanceScore: 0.8,
            createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          },
        ],
      });

      expect(result.evidenceSummary).toContain('Status:');
      expect(result.evidenceSummary).toContain('Mentions:');
      expect(result.evidenceSummary).toContain('Sources:');
    });
  });

  describe('updateTrendSignal', () => {
    it('upserts trend signal in database', async () => {
      const mockPrisma = {
        trendSignal: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      } as any;

      const service = new TrendSignalService(mockPrisma);

      await service.updateTrendSignal('workspace-1', 'topic-1', [
        {
          sourceId: 'source-1',
          mentionStrength: 0.8,
          relevanceScore: 0.9,
          createdAt: new Date(),
        },
      ]);

      expect(mockPrisma.trendSignal.upsert).toHaveBeenCalled();
    });
  });

  /**
   * G3 regression: production trend calculation must receive persisted
   * historical TopicMention evidence — not just the current mention — while
   * the service's own source/freshness/threshold rules stay authoritative.
   */
  describe('loadTopicTrendEvidence (G3 production wiring)', () => {
    const DAY = 24 * 60 * 60 * 1000;

    function mockPrismaWithMentions(
      rows: Array<{
        sourceId: string;
        mentionStrength: number;
        relevanceScore: number;
        createdAt: Date;
        ws?: string;
        topic?: string;
      }>,
      capture?: { where?: unknown },
    ) {
      return {
        topicMention: {
          // Faithful miniature of Prisma filtering for the clauses the
          // loader uses: workspace/topic scoping plus sourceId exclusion.
          findMany: vi.fn().mockImplementation(async (args: unknown) => {
            const where = (args as { where?: Record<string, unknown> }).where ?? {};
            if (capture) capture.where = where;
            const notSource = (where.sourceId as { not?: string } | undefined)?.not;
            return rows
              .filter((r) => (r.ws ?? 'ws-1') === (where.workspaceId ?? 'ws-1'))
              .filter((r) => (r.topic ?? 'topic-1') === (where.topicId ?? 'topic-1'))
              .filter((r) => r.sourceId !== notSource)
              .map((r) => ({
                sourceId: r.sourceId,
                mentionStrength: r.mentionStrength,
                relevanceScore: r.relevanceScore,
                createdAt: r.createdAt,
              }));
          }),
        },
      } as unknown as PrismaClient;
    }

    it('TEST 1 single independent source stays INSUFFICIENT_HISTORY', async () => {
      const now = new Date();
      const prisma = mockPrismaWithMentions([
        { sourceId: 'source-1', mentionStrength: 0.8, relevanceScore: 0.9, createdAt: now },
      ]);
      // Production call shape: history (excluding current) + current mention.
      const history = await loadTopicTrendEvidence(prisma, 'ws-1', 'topic-1', 'source-1');
      const result = await service.calculateTrend({
        workspaceId: 'ws-1',
        topicId: 'topic-1',
        mentions: [
          ...history,
          { sourceId: 'source-1', mentionStrength: 0.8, relevanceScore: 0.9, createdAt: now },
        ],
      });
      expect(result.status).toBe('INSUFFICIENT_HISTORY');
      expect(result.sourceCount).toBe(1);
    });

    it('TEST 2 two independent sources both reach the service', async () => {
      const now = new Date();
      const prisma = mockPrismaWithMentions([
        {
          sourceId: 'source-hn',
          mentionStrength: 0.8,
          relevanceScore: 0.9,
          createdAt: new Date(now.getTime() - 5 * DAY),
        },
      ]);
      const history = await loadTopicTrendEvidence(prisma, 'ws-1', 'topic-1', 'source-gh');
      const mentions = [
        ...history,
        {
          sourceId: 'source-gh',
          mentionStrength: 0.7,
          relevanceScore: 0.8,
          createdAt: new Date(now.getTime() - 3 * DAY),
        },
      ];
      // The historical source is genuinely present in the evidence array.
      expect(mentions.map((m) => m.sourceId).sort()).toEqual(['source-gh', 'source-hn']);
      const result = await service.calculateTrend({
        workspaceId: 'ws-1',
        topicId: 'topic-1',
        mentions,
      });
      expect(result.sourceCount).toBe(2);
      // 5d + 3d old evidence: existing algorithm resolves RELEVANT.
      expect(result.status).toBe('RELEVANT');
    });

    it('TEST 3 two mentions from the same source count as one source', async () => {
      const now = new Date();
      const prisma = mockPrismaWithMentions([
        {
          sourceId: 'source-1',
          mentionStrength: 0.8,
          relevanceScore: 0.9,
          createdAt: new Date(now.getTime() - 5 * DAY),
        },
        {
          sourceId: 'source-1',
          mentionStrength: 0.6,
          relevanceScore: 0.7,
          createdAt: new Date(now.getTime() - 4 * DAY),
        },
      ]);
      const history = await loadTopicTrendEvidence(prisma, 'ws-1', 'topic-1');
      expect(history).toHaveLength(2);
      const result = await service.calculateTrend({
        workspaceId: 'ws-1',
        topicId: 'topic-1',
        mentions: history,
      });
      expect(result.sourceCount).toBe(1);
      expect(result.status).toBe('INSUFFICIENT_HISTORY');
    });

    it('TEST 4 loader is scoped to one workspace and one topic', async () => {
      const capture: { where?: unknown } = {};
      const prisma = mockPrismaWithMentions(
        [
          {
            sourceId: 'source-a',
            mentionStrength: 0.8,
            relevanceScore: 0.9,
            createdAt: new Date(),
            ws: 'ws-A',
            topic: 'topic-1',
          },
          {
            sourceId: 'source-b-foreign',
            mentionStrength: 0.9,
            relevanceScore: 0.9,
            createdAt: new Date(),
            ws: 'ws-B',
            topic: 'topic-1',
          },
          {
            sourceId: 'source-c-other-topic',
            mentionStrength: 0.9,
            relevanceScore: 0.9,
            createdAt: new Date(),
            ws: 'ws-A',
            topic: 'topic-9',
          },
        ],
        capture,
      );
      const evidence = await loadTopicTrendEvidence(prisma, 'ws-A', 'topic-1');
      // Workspace B's mentions can never leak in: the query itself is scoped.
      expect(capture.where).toMatchObject({ workspaceId: 'ws-A', topicId: 'topic-1' });
      expect(evidence.map((m) => m.sourceId)).toEqual(['source-a']);
    });

    it('TEST 5 a persisted historical mention is usable by the next cycle', async () => {
      const now = new Date();
      const prisma = mockPrismaWithMentions([
        {
          sourceId: 'source-old',
          mentionStrength: 0.85,
          relevanceScore: 0.9,
          createdAt: new Date(now.getTime() - 10 * DAY),
        },
      ]);
      // Exact production defect scenario: previously only the current mention
      // was supplied; now history loads and joins it.
      const history = await loadTopicTrendEvidence(prisma, 'ws-1', 'topic-1', 'source-new');
      const current = {
        sourceId: 'source-new',
        mentionStrength: 0.8,
        relevanceScore: 0.9,
        createdAt: now,
      };
      const result = await service.calculateTrend({
        workspaceId: 'ws-1',
        topicId: 'topic-1',
        mentions: [...history, current],
      });
      expect(result.sourceCount).toBe(2);
      expect(result.mentionCount).toBe(2);
      expect(result.status).not.toBe('INSUFFICIENT_HISTORY');
    });

    it('TEST 6 no history and only the current mention means no fake trend', async () => {
      const now = new Date();
      const prisma = mockPrismaWithMentions([]);
      const history = await loadTopicTrendEvidence(prisma, 'ws-1', 'topic-1', 'source-1');
      expect(history).toHaveLength(0);
      const result = await service.calculateTrend({
        workspaceId: 'ws-1',
        topicId: 'topic-1',
        mentions: [
          ...history,
          { sourceId: 'source-1', mentionStrength: 0.9, relevanceScore: 0.95, createdAt: now },
        ],
      });
      expect(result.status).toBe('INSUFFICIENT_HISTORY');
      expect(result.sourceCount).toBe(1);
    });

    it('excludes the current source so it is never double-counted', async () => {
      const now = new Date();
      const prisma = mockPrismaWithMentions([
        { sourceId: 'source-1', mentionStrength: 0.5, relevanceScore: 0.5, createdAt: now },
        { sourceId: 'source-2', mentionStrength: 0.8, relevanceScore: 0.9, createdAt: now },
      ]);
      const history = await loadTopicTrendEvidence(prisma, 'ws-1', 'topic-1', 'source-1');
      expect(history.map((m) => m.sourceId)).toEqual(['source-2']);
    });
  });
});