import { prisma } from '@growth-operator/db';
import { STAGE_ORDER, STAGES, type StageName } from './stages';
import { assertRunAllowed, getWorkspaceSettings } from './settings';
import { RunBudget } from './budget';

export interface RunResult {
  runId: string;
  status: string;
  stages: Array<{ stage: string; status: string }>;
  resumed: boolean;
}

const TERMINAL_RUN = new Set([
  'COMPLETED',
  'COMPLETED_WITH_FAILURES',
  'FAILED',
  'SKIPPED_PAUSED',
  'SKIPPED_KILLED',
]);

function parseRunDate(input?: string): Date {
  if (input !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error(`runDate must be YYYY-MM-DD, got "${input}".`);
  }
  const day = input ?? new Date().toISOString().slice(0, 10);
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unparseable runDate "${day}".`);
  }
  return parsed;
}

/**
 * Runs one workspace's daily loop. Idempotent: re-running the same
 * (workspaceId, runDate) returns the existing terminal run untouched, or
 * resumes a non-terminal run by executing only its pending stages.
 * A FAILED stage is recorded and never blocks later independent stages.
 */
export async function runDailyLoop(
  workspaceId: string,
  runDateInput?: string
): Promise<RunResult> {
  const runDate = parseRunDate(runDateInput);

  const existing = await prisma.dailyRun.findUnique({
    where: { workspaceId_runDate: { workspaceId, runDate } },
    include: { stages: true },
  });
  if (existing && TERMINAL_RUN.has(existing.status)) {
    return {
      runId: existing.id,
      status: existing.status,
      stages: existing.stages.map((s) => ({ stage: s.stage, status: s.status })),
      resumed: false,
    };
  }

  // Kill switch / pause honored at the start of the run. Blocked runs are
  // still recorded (audit trail) but execute zero stages.
  const gate = await assertRunAllowed(workspaceId);
  if (!gate.allowed) {
    const blocked = await prisma.dailyRun.upsert({
      where: { workspaceId_runDate: { workspaceId, runDate } },
      create: {
        workspaceId,
        runDate,
        status: gate.reason === 'KILL_SWITCH' ? 'SKIPPED_KILLED' : 'SKIPPED_PAUSED',
        finishedAt: new Date(),
        summary: { reason: gate.reason, stagesRun: 0 },
      },
      update: {
        status: gate.reason === 'KILL_SWITCH' ? 'SKIPPED_KILLED' : 'SKIPPED_PAUSED',
        finishedAt: new Date(),
        summary: { reason: gate.reason, stagesRun: 0 },
      },
      include: { stages: true },
    });
    return {
      runId: blocked.id,
      status: blocked.status,
      stages: blocked.stages.map((s) => ({ stage: s.stage, status: s.status })),
      resumed: existing !== null,
    };
  }

  const run = existing
    ?? (await prisma.dailyRun.create({
      data: { workspaceId, runDate, status: 'RUNNING' },
    }));
  if (existing) {
    await prisma.dailyRun.update({
      where: { id: run.id },
      data: { status: 'RUNNING', finishedAt: null, error: null },
    });
  }
  const resumed = existing !== null;

  const settings = await getWorkspaceSettings(workspaceId);
  const budget = new RunBudget({
    llmCalls: settings.dailyLlmCallCap,
    fetches: settings.dailyFetchCap,
    preparations: settings.dailyPreparationCap,
  });

  const doneStages = new Set(
    (existing?.stages ?? [])
      .filter((s) => ['SUCCEEDED', 'FAILED', 'SKIPPED'].includes(s.status))
      .map((s) => s.stage)
  );

  let failed = 0;
  const summary: Record<string, string> = {};

  for (const stage of STAGE_ORDER) {
    if (doneStages.has(stage)) {
      const prior = existing?.stages.find((s) => s.stage === stage);
      summary[stage] = prior?.status ?? 'SUCCEEDED';
      continue;
    }
    const started = Date.now();
    await prisma.runStage.upsert({
      where: {
        workspaceId_dailyRunId_stage_attempt: {
          workspaceId,
          dailyRunId: run.id,
          stage: stage as StageName,
          attempt: 1,
        },
      },
      create: {
        workspaceId,
        dailyRunId: run.id,
        stage: stage as StageName,
        status: 'RUNNING',
        startedAt: new Date(),
      },
      update: { status: 'RUNNING', startedAt: new Date(), error: null },
    });
    try {
      // RunStage has a single message column (`error`): real errors land
      // there on FAILED, honest notes on SUCCEEDED/SKIPPED. Counts carry
      // the numbers either way.
      const result = await STAGES[stage]({
        workspaceId,
        runDate: runDate.toISOString().slice(0, 10),
        budget,
      });
      await prisma.runStage.update({
        where: {
          workspaceId_dailyRunId_stage_attempt: {
            workspaceId,
            dailyRunId: run.id,
            stage: stage as StageName,
            attempt: 1,
          },
        },
        data: {
          status: result.status,
          counts: (result.counts ?? {}) as object,
          error: result.error ?? result.note ?? null,
          finishedAt: new Date(),
          durationMs: Date.now() - started,
        },
      });
      summary[stage] = result.status;
      if (result.status === 'FAILED') failed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown stage error';
      await prisma.runStage.update({
        where: {
          workspaceId_dailyRunId_stage_attempt: {
            workspaceId,
            dailyRunId: run.id,
            stage: stage as StageName,
            attempt: 1,
          },
        },
        data: {
          status: 'FAILED',
          error: message,
          finishedAt: new Date(),
          durationMs: Date.now() - started,
        },
      });
      summary[stage] = 'FAILED';
      failed += 1;
    }
  }

  const finalStatus = failed > 0 ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED';
  const finished = await prisma.dailyRun.update({
    where: { id: run.id },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      summary: { stages: summary, budget: budget.remaining() } as object,
    },
    include: { stages: true },
  });

  return {
    runId: finished.id,
    status: finished.status,
    stages: finished.stages.map((s) => ({ stage: s.stage, status: s.status })),
    resumed,
  };
}

export async function getLatestRuns(workspaceId: string, take = 20) {
  return prisma.dailyRun.findMany({
    where: { workspaceId },
    orderBy: { runDate: 'desc' },
    take: Math.min(50, Math.max(1, take)),
    include: { _count: { select: { stages: true } } },
  });
}

export async function getRunWithStages(workspaceId: string, runId: string) {
  return prisma.dailyRun.findFirst({
    where: { id: runId, workspaceId },
    include: { stages: { orderBy: { createdAt: 'asc' } } },
  });
}
