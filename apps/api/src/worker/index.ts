import { getEnv } from '../config/env';
import { prisma } from '@growth-operator/db';
import { createBoss, TICK_QUEUE, RUN_QUEUE, type RunJobData, type TickJobData } from './queue';
import { resolveDueRuns } from './tick';
import { runDailyLoop } from './dailyRun';

async function main(): Promise<void> {
  getEnv();
  const boss = createBoss();

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, stopping pg-boss...`);
    try {
      await boss.stop();
    } catch (error) {
      console.error('[worker] error during boss.stop()', error);
    }
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await boss.start();
  await boss.createQueue(TICK_QUEUE);
  await boss.createQueue(RUN_QUEUE);
  // Re-entrant: schedule() upserts the cron entry by (name, key).
  await boss.schedule(TICK_QUEUE, '*/15 * * * *', {}, { key: 'daily-loop-tick', tz: 'UTC' });

  await boss.work<TickJobData>(TICK_QUEUE, async () => {
    const result = await resolveDueRuns(boss, new Date());
    console.log(
      `[worker] tick checked=${result.checked} enqueuedToday=${result.enqueuedToday} ` +
        `enqueuedBackfill=${result.enqueuedBackfill} skipped=${result.skipped} errors=${result.errors.length}`
    );
  });

  await boss.work<RunJobData>(RUN_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { workspaceId, runDate } = job.data;
      console.log(`[worker] daily-run workspace=${workspaceId} date=${runDate}`);
      const result = await runDailyLoop(workspaceId, runDate);
      console.log(`[worker] daily-run done status=${result.status} resumed=${result.resumed}`);
    }
  });

  console.log('[worker] pg-boss started: tick every 15 min, daily-run queue ready.');
}

void main().catch(async (error: unknown) => {
  console.error('[worker] fatal startup error', error);
  await prisma.$disconnect();
  process.exit(1);
});
