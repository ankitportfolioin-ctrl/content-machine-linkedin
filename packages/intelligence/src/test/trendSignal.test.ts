import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TrendSignalService } from '../trendSignal';

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
});