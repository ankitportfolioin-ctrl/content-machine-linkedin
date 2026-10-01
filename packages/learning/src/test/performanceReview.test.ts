import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AIProviderRegistry } from '@growth-operator/ai';
import { PerformanceReviewService } from '../performanceReview';

const mockRegistry = {
  getAvailable: vi.fn().mockReturnValue([]),
} as unknown as AIProviderRegistry;

function versionRow(i: number) {
  const format = i < 5 ? 'CAROUSEL' : 'POST';
  return {
    id: `v${i}`,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    contentDraft: {
      body: `Draft body ${i}`,
      plan: { format, angle: 'PRACTICAL', objective: 'EDUCATE' },
      contentIdea: {
        id: `idea${i}`,
        title: `Idea ${i}`,
        format,
        angle: 'PRACTICAL',
        objective: 'EDUCATE',
        topicId: 'topic-1',
        topic: { name: 'AI automation' },
      },
    },
    outcomeMetrics: [
      { metricName: 'impressions', metricValue: i < 5 ? 100 : 10, recordedAt: new Date('2026-09-02T00:00:00Z') },
    ],
    contentDNA: { format, angle: 'PRACTICAL' },
  };
}

describe('PerformanceReviewService', () => {
  it('does not trigger a review with fewer than 10 published posts', async () => {
    const mockPrisma = {
      contentVersion: { findMany: vi.fn().mockResolvedValue([versionRow(0), versionRow(5)]) },
      intelligenceReport: { create: vi.fn() },
    } as unknown as PrismaClient;
    const service = new PerformanceReviewService(mockPrisma, mockRegistry);
    const result = await service.checkAndRunReview('ws-1');
    expect(result.reviewTriggered).toBe(false);
    expect(result.postsAnalyzed).toBe(2);
    expect(mockPrisma.intelligenceReport.create).not.toHaveBeenCalled();
  });

  it('detects format patterns after 10 published posts and records a review', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => versionRow(i));
    const create = vi.fn().mockResolvedValue({ id: 'report-1' });
    const mockPrisma = {
      contentVersion: { findMany: vi.fn().mockResolvedValue(rows) },
      intelligenceReport: { create, findMany: vi.fn(), findFirst: vi.fn() },
    } as unknown as PrismaClient;
    const service = new PerformanceReviewService(mockPrisma, mockRegistry);
    const result = await service.checkAndRunReview('ws-1');
    expect(result.reviewTriggered).toBe(true);
    expect(result.postsAnalyzed).toBe(10);
    const carousel = result.patterns.find((p) => p.type === 'FORMAT' && p.pattern.includes('CAROUSEL'));
    expect(carousel).toBeDefined();
    expect(carousel?.vsBaseline).toBeGreaterThan(15);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(create).toHaveBeenCalledOnce();
  });

  it('returns review history honestly', async () => {
    const mockPrisma = {
      contentVersion: { findMany: vi.fn() },
      intelligenceReport: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaClient;
    const service = new PerformanceReviewService(mockPrisma, mockRegistry);
    await expect(service.getReviewHistory('ws-1')).resolves.toEqual([]);
    await expect(service.getLatestReview('ws-1')).resolves.toBeNull();
  });
});
