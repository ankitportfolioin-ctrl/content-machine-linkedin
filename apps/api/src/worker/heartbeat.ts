import os from 'os';
import { prisma } from '@growth-operator/db';

/**
 * Worker liveness heartbeat (release gate).
 *
 * The unattended worker proves it is alive by upserting one tiny row per
 * process (workerId = hostname:pid, so restarts are distinguishable) on boot
 * and after every unit of work. `GET /api/v1/worker/health` reads the
 * freshest row: HEALTHY means a beat within the tick cadence plus margin,
 * STALE means the worker stopped beating, DOWN means no beat was ever
 * recorded. Rows older than 24h are pruned on every beat so the table stays
 * small. No credentials, payloads, or tenant data are ever stored here.
 */

// Tick cadence is 15 min (`daily-loop-tick` cron); a live worker therefore
// beats at least that often. 20 min tolerates one slow tick, not a dead one.
export const HEARTBEAT_HEALTHY_MS = 20 * 60 * 1000;
export const HEARTBEAT_PRUNE_MS = 24 * 60 * 60 * 1000;

export function workerId(): string {
  return `${os.hostname()}:${process.pid}`;
}

export async function recordHeartbeat(now: Date = new Date()) {
  const id = workerId();
  const beat = await prisma.workerHeartbeat.upsert({
    where: { workerId: id },
    create: { workerId: id, startedAt: now, lastBeatAt: now },
    update: { lastBeatAt: now },
  });
  await prisma.workerHeartbeat.deleteMany({
    where: { lastBeatAt: { lt: new Date(now.getTime() - HEARTBEAT_PRUNE_MS) } },
  });
  return beat;
}

export type WorkerHealthStatus = 'healthy' | 'stale' | 'down';

export interface WorkerHealth {
  status: WorkerHealthStatus;
  workerId: string | null;
  startedAt: string | null;
  lastBeatAt: string | null;
  ageMs: number | null;
  checkedAt: string;
}

export async function readWorkerHealth(now: Date = new Date()): Promise<WorkerHealth> {
  const latest = await prisma.workerHeartbeat.findFirst({
    orderBy: { lastBeatAt: 'desc' },
  });
  if (!latest) {
    return { status: 'down', workerId: null, startedAt: null, lastBeatAt: null, ageMs: null, checkedAt: now.toISOString() };
  }
  const ageMs = now.getTime() - latest.lastBeatAt.getTime();
  return {
    status: ageMs <= HEARTBEAT_HEALTHY_MS ? 'healthy' : 'stale',
    workerId: latest.workerId,
    startedAt: latest.startedAt.toISOString(),
    lastBeatAt: latest.lastBeatAt.toISOString(),
    ageMs,
    checkedAt: now.toISOString(),
  };
}
