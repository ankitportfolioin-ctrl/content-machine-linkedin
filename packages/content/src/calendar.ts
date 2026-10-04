import { PrismaClient } from '@prisma/client';

/**
 * Content calendar — a planning-only read model over existing workflow rows.
 *
 * It answers: what is approved, what awaits review, what was recently
 * recorded as published, what experiments are running, and where the
 * upcoming mix conflicts (topic/angle/format repetition, approval
 * bottlenecks, over-posting vs policy). It NEVER dispatches anything: there
 * is no platform action behind scheduling, and the policy note says so on
 * every response. No schema change: it reads ContentPlan, ContentReview,
 * ContentDraft, PublishRecord, Experiment, and AutonomyPolicy.
 */

export type CalendarItemKind = 'plan' | 'review' | 'draft' | 'published' | 'experiment';

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  title: string;
  status: string;
  date: string;
  topicId: string | null;
  objective: string | null;
  angle: string | null;
  format: string | null;
  ref: string;
}

export type CalendarConflictType =
  | 'topic_repetition'
  | 'angle_repetition'
  | 'format_concentration'
  | 'approval_bottleneck'
  | 'over_posting';

export interface CalendarConflict {
  type: CalendarConflictType;
  detail: string;
  refs: string[];
}

export interface CalendarDistribution {
  objective: Record<string, number>;
  format: Record<string, number>;
  angle: Record<string, number>;
}

export interface CalendarView {
  windowDays: number;
  generatedAt: string;
  items: CalendarItem[];
  counts: { plans: number; reviews: number; drafts: number; published: number; experiments: number };
  distribution: CalendarDistribution;
  conflicts: CalendarConflict[];
  policy: { dailyCap: number; schedulingNote: string };
}

const SCHEDULING_NOTE =
  'Calendar is planning-only: it sequences and de-conflicts prepared work. No platform action is scheduled or dispatched (execution.dispatch is NOT_IMPLEMENTED).';

function countBy<T>(rows: T[], pick: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = pick(r) ?? 'unknown';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export class CalendarService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async view(workspaceId: string, options: { days?: number; now?: number } = {}): Promise<CalendarView> {
    const days = Math.min(90, Math.max(1, Math.floor(options.days ?? 30)));
    const now = options.now ?? Date.now();
    const since = new Date(now - days * 86400000);

    const [plans, reviews, drafts, published, experiments, policy] = await Promise.all([
      this.prisma.contentPlan.findMany({
        where: { workspaceId, updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: { contentIdea: { select: { id: true, title: true } } },
      }),
      this.prisma.contentReview.findMany({
        where: { workspaceId, status: 'SUBMITTED' },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: { draft: { include: { contentIdea: { select: { id: true, title: true } } } } },
      }),
      this.prisma.contentDraft.findMany({
        where: { workspaceId, updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { contentIdea: { select: { id: true, title: true } } },
      }),
      this.prisma.publishRecord.findMany({
        where: { workspaceId, recordedAt: { gte: since } },
        orderBy: { recordedAt: 'desc' },
        take: 50,
      }),
      this.prisma.experiment.findMany({
        where: { workspaceId, status: 'RUNNING' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.autonomyPolicy.findUnique({ where: { workspaceId } }),
    ]);

    const items: CalendarItem[] = [
      ...(plans as Array<Record<string, any>>).map((p) => ({
        id: String(p.id),
        kind: 'plan' as const,
        title: String(p.contentIdea?.title ?? p.thesis ?? 'Untitled plan').slice(0, 200),
        status: String(p.status),
        date: (p.updatedAt as Date).toISOString(),
        topicId: (p.topicId as string | null) ?? null,
        objective: (p.objective as string | null) ?? null,
        angle: (p.angle as string | null) ?? null,
        format: (p.format as string | null) ?? null,
        ref: `contentPlan:${p.id}`,
      })),
      ...(reviews as Array<Record<string, any>>).map((r) => ({
        id: String(r.id),
        kind: 'review' as const,
        title: `Review: ${String(r.draft?.contentIdea?.title ?? 'draft').slice(0, 160)}`,
        status: String(r.status),
        date: (r.createdAt as Date).toISOString(),
        topicId: null,
        objective: null,
        angle: null,
        format: null,
        ref: `contentReview:${r.id}`,
      })),
      ...(drafts as Array<Record<string, any>>).map((d) => ({
        id: String(d.id),
        kind: 'draft' as const,
        title: String(d.contentIdea?.title ?? 'Untitled draft').slice(0, 200),
        status: 'DRAFT',
        date: (d.updatedAt as Date).toISOString(),
        topicId: null,
        objective: null,
        angle: null,
        format: null,
        ref: `contentDraft:${d.id}`,
      })),
      ...(published as Array<Record<string, any>>).map((p) => ({
        id: String(p.id),
        kind: 'published' as const,
        title: `Recorded publication (${String(p.channel ?? 'manual').slice(0, 40)})`,
        status: 'RECORDED',
        date: (p.recordedAt as Date).toISOString(),
        topicId: null,
        objective: null,
        angle: null,
        format: null,
        ref: `publishRecord:${p.id}`,
      })),
      ...(experiments as Array<Record<string, any>>).map((e) => ({
        id: String(e.id),
        kind: 'experiment' as const,
        title: String(e.hypothesis ?? 'Experiment').slice(0, 200),
        status: String(e.status),
        date: (e.createdAt as Date).toISOString(),
        topicId: null,
        objective: null,
        angle: null,
        format: null,
        ref: `experiment:${e.id}`,
      })),
    ];

    const planned = items.filter((i) => i.kind === 'plan');
    const distribution: CalendarDistribution = {
      objective: countBy(planned, (i) => i.objective),
      format: countBy(planned, (i) => i.format),
      angle: countBy(planned, (i) => i.angle),
    };

    const conflicts: CalendarConflict[] = [];
    // Topic repetition: the same topic planned twice+ in the window.
    const byTopic = new Map<string, CalendarItem[]>();
    for (const p of planned) {
      if (!p.topicId) continue;
      const list = byTopic.get(p.topicId) ?? [];
      list.push(p);
      byTopic.set(p.topicId, list);
    }
    for (const [topicId, list] of byTopic) {
      if (list.length >= 2) {
        conflicts.push({
          type: 'topic_repetition',
          detail: `Topic ${topicId.slice(0, 8)} is planned ${list.length} time(s) in the last ${days} days — vary the angle or defer one.`,
          refs: list.map((i) => i.ref),
        });
      }
    }
    // Angle repetition: the same angle on 3+ plans.
    const byAngle = new Map<string, CalendarItem[]>();
    for (const p of planned) {
      if (!p.angle) continue;
      const list = byAngle.get(p.angle) ?? [];
      list.push(p);
      byAngle.set(p.angle, list);
    }
    for (const [angle, list] of byAngle) {
      if (list.length >= 3) {
        conflicts.push({
          type: 'angle_repetition',
          detail: `Angle "${angle}" appears on ${list.length} plans — the mix risks sameness.`,
          refs: list.map((i) => i.ref),
        });
      }
    }
    // Format concentration: one format over 60% of plans (n>=5).
    const formatTotal = Math.max(1, planned.length);
    for (const [format, count] of Object.entries(distribution.format)) {
      if (format !== 'unknown' && planned.length >= 5 && count / formatTotal > 0.6) {
        conflicts.push({
          type: 'format_concentration',
          detail: `Format "${format}" is ${Math.round((count / formatTotal) * 100)}% of planned content — protect diversity.`,
          refs: planned.filter((i) => i.format === format).map((i) => i.ref),
        });
      }
    }
    // Approval bottlenecks: reviews waiting 3+ days.
    for (const r of reviews as Array<Record<string, any>>) {
      const waiting = Math.max(0, Math.floor((now - (r.createdAt as Date).getTime()) / 86400000));
      if (waiting >= 3) {
        conflicts.push({
          type: 'approval_bottleneck',
          detail: `Review waiting ${waiting} day(s) blocks the queue — decide or dismiss.`,
          refs: [`contentReview:${r.id}`],
        });
      }
    }
    // Over-posting vs policy cap (recorded publications, advisory only).
    const dailyCap = (policy as { tier1PostingDailyCap?: unknown } | null)?.tier1PostingDailyCap;
    const cap = typeof dailyCap === 'number' && Number.isFinite(dailyCap) && dailyCap > 0 ? Math.floor(dailyCap) : 1;
    const weekAgo = new Date(now - 7 * 86400000);
    const recentPublished = (published as Array<Record<string, any>>).filter(
      (p) => (p.recordedAt as Date) >= weekAgo
    ).length;
    if (recentPublished > cap * 7) {
      conflicts.push({
        type: 'over_posting',
        detail: `${recentPublished} recorded publication(s) in 7 days exceeds the policy pace of ${cap}/day — slow down to protect the audience.`,
        refs: (published as Array<Record<string, any>>)
          .filter((p) => (p.recordedAt as Date) >= weekAgo)
          .map((p) => `publishRecord:${p.id}`),
      });
    }

    return {
      windowDays: days,
      generatedAt: new Date(now).toISOString(),
      items,
      counts: {
        plans: plans.length,
        reviews: (reviews as unknown[]).length,
        drafts: (drafts as unknown[]).length,
        published: (published as unknown[]).length,
        experiments: (experiments as unknown[]).length,
      },
      distribution,
      conflicts,
      policy: { dailyCap: cap, schedulingNote: SCHEDULING_NOTE },
    };
  }
}
