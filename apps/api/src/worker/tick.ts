import type { PgBoss } from 'pg-boss';
import { prisma } from '@growth-operator/db';
import { sendRunJob } from './queue';
import { getWorkspaceSettings, isRunDue, workspaceLocalDate } from './settings';

/**
 * Step C: tick handler (runs every 15 min). For each active workspace it
 * resolves the local calendar day and enqueues a daily-run job only when:
 * - local time has reached the workspace's dailyRunTime, and
 * - no DailyRun exists for the local day yet.
 * Missed days catch up without flooding: at most ONE backfill (the most
 * recent missing day) is enqueued per tick per workspace, and only when
 * today is already covered or not yet due is irrelevant — backfill is
 * independent of today's due state but still capped to one.
 */
export interface TickResult {
  checked: number;
  enqueuedToday: number;
  enqueuedBackfill: number;
  skipped: number;
  /** Per-workspace failures that did not stop the tick (e.g. a workspace
   * deleted by another process mid-tick). Recorded, never thrown. */
  errors: string[];
}

export async function resolveDueRuns(
  boss: PgBoss,
  now: Date = new Date()
): Promise<TickResult> {
  const workspaces = await prisma.workspace.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let enqueuedToday = 0;
  let enqueuedBackfill = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ws of workspaces) {
    try {
      if (await processWorkspace(ws.id)) continue;
    } catch (error) {
      errors.push(`${ws.id}: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
    }
    skipped += 1;
  }

  async function processWorkspace(workspaceId: string): Promise<boolean> {
    let enqueued = false;
    const settings = await getWorkspaceSettings(workspaceId);
    const local = workspaceLocalDate(settings.timezone, now);

    const todayRun = await prisma.dailyRun.findUnique({
      where: { workspaceId_runDate: { workspaceId, runDate: new Date(`${local.date}T00:00:00.000Z`) } },
      select: { id: true },
    });

    if (!todayRun && isRunDue(settings.timezone, settings.dailyRunTime, now)) {
      const { deduped } = await sendRunJob(boss, { workspaceId, runDate: local.date });
      if (!deduped) {
        enqueuedToday += 1;
        enqueued = true;
      }
    }

    // Capped catch-up: the single most recent missing day before today.
    const latest = await prisma.dailyRun.findFirst({
      where: { workspaceId },
      orderBy: { runDate: 'desc' },
      select: { runDate: true },
    });
    if (latest) {
      const latestDay = latest.runDate.toISOString().slice(0, 10);
      const missing = previousDay(local.date);
      if (missing > latestDay && missing !== local.date) {
        const { deduped } = await sendRunJob(boss, { workspaceId, runDate: missing });
        if (!deduped) {
          enqueuedBackfill += 1;
          enqueued = true;
        }
      }
    }

    return enqueued;
  }

  return { checked: workspaces.length, enqueuedToday, enqueuedBackfill, skipped, errors };
}

function previousDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
