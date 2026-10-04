import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CalendarService } from '../calendar';

const NOW = new Date('2026-10-04T12:00:00Z').getTime();
const day = (n: number) => new Date(NOW - n * 86400000);

function plan(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'APPROVED',
    objective: 'EDUCATE',
    angle: 'EDUCATIONAL',
    format: 'TEXT_POST',
    topicId: `topic-${id}`,
    thesis: `Thesis ${id}`,
    updatedAt: day(1),
    contentIdea: { id: `idea-${id}`, title: `Idea ${id}` },
    ...overrides,
  };
}

function mockPrisma(seed: {
  plans?: unknown[];
  reviews?: unknown[];
  drafts?: unknown[];
  published?: unknown[];
  experiments?: unknown[];
  policy?: unknown;
}) {
  return {
    contentPlan: { findMany: vi.fn().mockResolvedValue(seed.plans ?? []) },
    contentReview: { findMany: vi.fn().mockResolvedValue(seed.reviews ?? []) },
    contentDraft: { findMany: vi.fn().mockResolvedValue(seed.drafts ?? []) },
    publishRecord: { findMany: vi.fn().mockResolvedValue(seed.published ?? []) },
    experiment: { findMany: vi.fn().mockResolvedValue(seed.experiments ?? []) },
    autonomyPolicy: { findUnique: vi.fn().mockResolvedValue(seed.policy ?? null) },
  } as unknown as PrismaClient;
}

describe('CalendarService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an honest empty view for workspaces with nothing planned', async () => {
    const service = new CalendarService(mockPrisma({}));
    const view = await service.view('ws-1', { days: 30, now: NOW });
    expect(view.items).toEqual([]);
    expect(view.conflicts).toEqual([]);
    expect(view.counts).toEqual({ plans: 0, reviews: 0, drafts: 0, published: 0, experiments: 0 });
    expect(view.policy.schedulingNote).toMatch(/planning-only/i);
  });

  it('distributes planned work by objective, format, and angle', async () => {
    const service = new CalendarService(
      mockPrisma({ plans: [plan('a'), plan('b', { objective: 'ANALYZE' })] })
    );
    const view = await service.view('ws-1', { now: NOW });
    expect(view.counts.plans).toBe(2);
    expect(view.distribution.objective).toEqual({ EDUCATE: 1, ANALYZE: 1 });
    expect(view.distribution.format).toEqual({ TEXT_POST: 2 });
  });

  it('flags topic repetition when one topic is planned twice', async () => {
    const service = new CalendarService(
      mockPrisma({ plans: [plan('a', { topicId: 'topic-x' }), plan('b', { topicId: 'topic-x' })] })
    );
    const view = await service.view('ws-1', { now: NOW });
    const repetition = view.conflicts.filter((c) => c.type === 'topic_repetition');
    expect(repetition).toHaveLength(1);
    expect(repetition[0]!.refs).toHaveLength(2);
  });

  it('flags angle repetition at three plans and format concentration at five', async () => {
    const service = new CalendarService(
      mockPrisma({
        plans: [
          plan('a', { angle: 'EDUCATIONAL' }),
          plan('b', { angle: 'EDUCATIONAL' }),
          plan('c', { angle: 'EDUCATIONAL' }),
          plan('d', { angle: 'EDUCATIONAL' }),
          plan('e', { angle: 'EDUCATIONAL' }),
        ],
      })
    );
    const view = await service.view('ws-1', { now: NOW });
    expect(view.conflicts.some((c) => c.type === 'angle_repetition')).toBe(true);
    expect(view.conflicts.some((c) => c.type === 'format_concentration')).toBe(true);
  });

  it('flags approval bottlenecks for reviews waiting 3+ days', async () => {
    const service = new CalendarService(
      mockPrisma({
        reviews: [
          {
            id: 'rev-1',
            status: 'SUBMITTED',
            createdAt: day(5),
            draft: { contentIdea: { id: 'idea-1', title: 'Idea 1' } },
          },
        ],
      })
    );
    const view = await service.view('ws-1', { now: NOW });
    const bottleneck = view.conflicts.filter((c) => c.type === 'approval_bottleneck');
    expect(bottleneck).toHaveLength(1);
    expect(bottleneck[0]!.detail).toMatch(/5 day/);
  });

  it('flags over-posting only above the policy pace', async () => {
    const published = Array.from({ length: 9 }, (_, i) => ({
      id: `pub-${i}`,
      channel: 'manual',
      recordedAt: day(1),
    }));
    const service = new CalendarService(
      mockPrisma({ published, policy: { tier1PostingDailyCap: 1 } })
    );
    const over = await service.view('ws-1', { now: NOW });
    expect(over.conflicts.some((c) => c.type === 'over_posting')).toBe(true);

    const calm = new CalendarService(
      mockPrisma({ published: published.slice(0, 3), policy: { tier1PostingDailyCap: 1 } })
    );
    const calmView = await calm.view('ws-1', { now: NOW });
    expect(calmView.conflicts.some((c) => c.type === 'over_posting')).toBe(false);
  });

  it('scopes every read by workspaceId', async () => {
    const prisma = mockPrisma({});
    const service = new CalendarService(prisma);
    await service.view('ws-9', { now: NOW });
    for (const model of ['contentPlan', 'contentReview', 'contentDraft', 'publishRecord', 'experiment'] as const) {
      const calls = (prisma[model].findMany as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const [args] of calls) {
        expect((args as { where: { workspaceId: string } }).where.workspaceId).toBe('ws-9');
      }
    }
  });
});
