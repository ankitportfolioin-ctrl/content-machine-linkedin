import { PgBoss, type Job } from 'pg-boss';

/**
 * Step C: pg-boss wiring (Postgres-backed, no Redis, no paid services).
 * pg-boss auto-creates its own `pgboss.*` tables on start(); it never
 * touches application tables. All application state lives in DailyRun /
 * RunStage rows, which are the authoritative RunLog.
 */

export const TICK_QUEUE = 'daily-loop-tick';
export const RUN_QUEUE = 'daily-run';

export interface RunJobData {
  workspaceId: string;
  /** Calendar day in the workspace's timezone, YYYY-MM-DD. */
  runDate: string;
}

export function createBoss(connectionString?: string): PgBoss {
  const boss = new PgBoss(connectionString ?? process.env.DATABASE_URL ?? '');
  boss.on('error', (error: unknown) => {
    // Worker log only; per-stage failures are recorded on RunStage rows.
    console.error('[worker] pg-boss error', error);
  });
  return boss;
}

/**
 * Enqueues one daily-run job. Idempotent at the queue level: jobs sharing a
 * singletonKey are deduplicated by pg-boss (send resolves null when a live
 * job with the same key already exists). The DailyRun unique constraint is
 * the second, authoritative guard.
 */
export async function sendRunJob(
  boss: PgBoss,
  data: RunJobData
): Promise<{ jobId: string | null; deduped: boolean }> {
  const jobId = await boss.send(RUN_QUEUE, { ...data }, {
    singletonKey: `${data.workspaceId}:${data.runDate}`,
    singletonSeconds: 60 * 60 * 24,
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
  });
  return { jobId, deduped: jobId === null };
}

export type TickJobData = Record<string, never>;
export type BossJob<T = object> = Job<T>;
