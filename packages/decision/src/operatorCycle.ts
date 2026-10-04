import { PrismaClient } from '@prisma/client';
import {
  StageName,
  STAGE_ORDER,
  StageContext,
  StageResult,
  StageFn,
  RunBudget,
  BudgetCaps,
  BudgetCategory,
} from '@growth-operator/shared';

export enum OperatorCycleStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum OperatorCycleStageName {
  RESEARCH = 'RESEARCH',
  DECISION = 'DECISION',
  CONTENT = 'CONTENT',
  SALES = 'SALES',
  APPROVAL = 'APPROVAL',
  EXECUTION = 'EXECUTION',
  OBSERVE = 'OBSERVE',
  LEARN = 'LEARN',
  FINALIZE = 'FINALIZE',
}

export enum OperatorCycleStageStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

export interface OperatorCycleResult {
  cycleId: string;
  workspaceId: string;
  status: OperatorCycleStatus;
  requestedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  errorStage: OperatorCycleStageName | null;
  correlationId: string | null;
  stages: Array<{
    stage: OperatorCycleStageName;
    status: OperatorCycleStageStatus;
    counts?: Record<string, number>;
    durationMs?: number;
    error?: string | null;
  }>;
  totals: {
    opportunities: number;
    contentIdeas: number;
    plans: number;
    drafts: number;
    salesSignals: number;
    preparedActions: number;
    observations: number;
    learningSignals: number;
  };
  blocked: string[];
  skipped: string[];
  failures: string[];
  approvalsRequired: string[];
}

export interface RunOperatorCycleOptions {
  workspaceId: string;
  idempotencyKey: string;
  correlationId?: string;
  actorId?: string;
}

function mapStageName(stage: StageName): OperatorCycleStageName {
  const mapping: Record<StageName, OperatorCycleStageName> = {
    INTELLIGENCE: OperatorCycleStageName.RESEARCH,
    DECISION: OperatorCycleStageName.DECISION,
    CONTENT: OperatorCycleStageName.CONTENT,
    SALES: OperatorCycleStageName.SALES,
    APPROVAL_SNAPSHOT: OperatorCycleStageName.APPROVAL,
    EXECUTION: OperatorCycleStageName.EXECUTION,
    OBSERVE_LEARN: OperatorCycleStageName.OBSERVE,
    DIGEST: OperatorCycleStageName.LEARN,
  };
  return mapping[stage];
}

function mapStageStatus(status: StageResult['status']): OperatorCycleStageStatus {
  return status as OperatorCycleStageStatus;
}

/** Lazy-loaded stage functions to avoid circular dependency with api package. */
let cachedStages: Record<StageName, StageFn> = {} as Record<StageName, StageFn>;
let stagesLoaded = false;

async function getStages(): Promise<Record<StageName, StageFn>> {
  if (!stagesLoaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STAGES } = require('@growth-operator/api/src/worker/stages');
    Object.assign(cachedStages, STAGES);
    stagesLoaded = true;
  }
  return cachedStages;
}

async function getWorkspaceSettings(workspaceId: string) {
  const { getWorkspaceSettings } = await import('@growth-operator/shared');
  return getWorkspaceSettings(workspaceId);
}

async function assertRunAllowed(workspaceId: string) {
  const { assertRunAllowed } = await import('@growth-operator/shared');
  return assertRunAllowed(workspaceId);
}

export class OperatorCycleService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Run a single operator cycle for a workspace.
   * Idempotent: re-running with the same (workspaceId, idempotencyKey) returns
   * the existing terminal cycle untouched, or resumes a non-terminal cycle.
   */
  async runCycle(options: RunOperatorCycleOptions): Promise<OperatorCycleResult> {
    const { workspaceId, idempotencyKey, correlationId, actorId } = options;

    // Check if a cycle with this idempotency key already exists
    const existing = await this.prisma.operatorCycle.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
      include: { stages: true },
    });

    const terminalStatuses = new Set([
      OperatorCycleStatus.COMPLETED,
      OperatorCycleStatus.PARTIAL,
      OperatorCycleStatus.FAILED,
      OperatorCycleStatus.CANCELLED,
    ]);

    if (existing && terminalStatuses.has(existing.status as OperatorCycleStatus)) {
      return this.buildResult(existing);
    }

    // Kill switch / pause honored at the start of the run
    const gate = await assertRunAllowed(workspaceId);
    if (!gate.allowed) {
      const blocked = await this.prisma.operatorCycle.upsert({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
        create: {
          workspaceId,
          idempotencyKey,
          status: OperatorCycleStatus.CANCELLED,
          error: `Blocked at start: ${gate.reason}`,
          correlationId,
        },
        update: {
          status: OperatorCycleStatus.CANCELLED,
          error: `Blocked at start: ${gate.reason}`,
          correlationId,
        },
        include: { stages: true },
      });
      return this.buildResult(blocked);
    }

    const settings = await getWorkspaceSettings(workspaceId);
    const budget = new RunBudget({
      llmCalls: settings.dailyLlmCallCap,
      fetches: settings.dailyFetchCap,
      preparations: settings.dailyPreparationCap,
      executions: settings.dailyExecutionCap ?? 0,
    });

    const cycle = existing
      ?? (await this.prisma.operatorCycle.create({
        data: {
          workspaceId,
          idempotencyKey,
          status: OperatorCycleStatus.RUNNING,
          correlationId,
          startedAt: new Date(),
        },
      }));

    if (existing) {
      await this.prisma.operatorCycle.update({
        where: { id: cycle.id },
        data: { status: OperatorCycleStatus.RUNNING, startedAt: new Date(), error: null },
      });
    }

    const doneStages = new Set<string>(
      (existing?.stages ?? [])
        .filter((s: { stage: string; status: string }) => ['SUCCEEDED', 'FAILED', 'SKIPPED'].includes(s.status))
        .map((s: { stage: string }) => s.stage)
    );

    let failed = 0;
    const stageSummaries: Record<string, { status: string; counts?: Record<string, number>; error?: string }> = {};

    const stages = await getStages();

    for (const stage of STAGE_ORDER) {
      if (doneStages.has(stage)) {
        const prior = existing?.stages.find((s: { stage: string }) => s.stage === stage);
        stageSummaries[stage] = {
          status: prior?.status ?? 'SUCCEEDED',
          counts: prior?.counts as Record<string, number> | undefined,
          error: prior?.error ?? undefined,
        };
        continue;
      }

      // Create or update stage checkpoint
      await this.prisma.operatorCycleStage.upsert({
        where: {
          workspaceId_cycleId_stage_attempt: {
            workspaceId,
            cycleId: cycle.id,
            stage: mapStageName(stage),
            attempt: 1,
          },
        },
        create: {
          workspaceId,
          cycleId: cycle.id,
          stage: mapStageName(stage),
          status: OperatorCycleStageStatus.RUNNING,
          startedAt: new Date(),
        },
        update: { status: OperatorCycleStageStatus.RUNNING, startedAt: new Date(), error: null },
      });

      const started = Date.now();
      try {
        const ctx: StageContext = {
          workspaceId,
          runDate: new Date().toISOString().slice(0, 10),
          budget,
        };
        const result = await stages[stage](ctx);
        await this.prisma.operatorCycleStage.update({
          where: {
            workspaceId_cycleId_stage_attempt: {
              workspaceId,
              cycleId: cycle.id,
              stage: mapStageName(stage),
              attempt: 1,
            },
          },
          data: {
            status: mapStageStatus(result.status),
            counts: (result.counts ?? {}) as object,
            error: result.error ?? result.note ?? null,
            finishedAt: new Date(),
            durationMs: Date.now() - started,
          },
        });
        stageSummaries[stage] = {
          status: result.status,
          counts: result.counts,
          error: result.error,
        };
        if (result.status === 'FAILED') failed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown stage error';
        await this.prisma.operatorCycleStage.update({
          where: {
            workspaceId_cycleId_stage_attempt: {
              workspaceId,
              cycleId: cycle.id,
              stage: mapStageName(stage),
              attempt: 1,
            },
          },
          data: {
            status: OperatorCycleStageStatus.FAILED,
            error: message,
            finishedAt: new Date(),
            durationMs: Date.now() - started,
          },
        });
        stageSummaries[stage] = {
          status: 'FAILED',
          error: message,
        };
        failed += 1;
      }
    }

    const finalStatus = failed > 0 ? OperatorCycleStatus.PARTIAL : OperatorCycleStatus.COMPLETED;
    const finished = await this.prisma.operatorCycle.update({
      where: { id: cycle.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        error: failed > 0 ? `${failed} stage(s) failed` : null,
      },
      include: { stages: true },
    });

    return this.buildResult(finished);
  }

  /**
   * Resume a cycle from its last checkpoint.
   * Only executes stages that are not SUCCEEDED/FAILED/SKIPPED.
   */
  async resumeCycle(workspaceId: string, idempotencyKey: string): Promise<OperatorCycleResult> {
    return this.runCycle({ workspaceId, idempotencyKey });
  }

  /**
   * Get cycle by idempotency key.
   */
  async getCycle(workspaceId: string, idempotencyKey: string): Promise<OperatorCycleResult | null> {
    const cycle = await this.prisma.operatorCycle.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
      include: { stages: true },
    });
    if (!cycle) return null;
    return this.buildResult(cycle);
  }

  /**
   * Get cycle by ID.
   */
  async getCycleById(workspaceId: string, cycleId: string): Promise<OperatorCycleResult | null> {
    const cycle = await this.prisma.operatorCycle.findFirst({
      where: { id: cycleId, workspaceId },
      include: { stages: true },
    });
    if (!cycle) return null;
    return this.buildResult(cycle);
  }

  /**
   * List cycles for a workspace.
   */
  async listCycles(workspaceId: string, limit = 20): Promise<OperatorCycleResult[]> {
    const cycles = await this.prisma.operatorCycle.findMany({
      where: { workspaceId },
      orderBy: { requestedAt: 'desc' },
      take: limit,
      include: { stages: true },
    });
    return cycles.map((c: {
      id: string;
      workspaceId: string;
      status: string;
      requestedAt: Date;
      startedAt: Date | null;
      completedAt: Date | null;
      error: string | null;
      errorStage: string | null;
      correlationId: string | null;
      stages: Array<{
        stage: string;
        status: string;
        counts?: Record<string, number> | null;
        durationMs?: number | null;
        error?: string | null;
      }>;
    }) => this.buildResult(c));
  }

  private buildResult(cycle: {
    id: string;
    workspaceId: string;
    status: string;
    requestedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    error: string | null;
    errorStage: string | null;
    correlationId: string | null;
    stages: Array<{
      stage: string;
      status: string;
      counts?: Record<string, number> | null;
      durationMs?: number | null;
      error?: string | null;
    }>;
  }): OperatorCycleResult {
    const totals = cycle.stages.reduce(
      (acc, s) => {
        const counts = s.counts as Record<string, number> | undefined;
        if (!counts) return acc;
        return {
          opportunities: acc.opportunities + (counts.opportunitiesCreated ?? 0),
          contentIdeas: acc.contentIdeas + (counts.ideasCreated ?? 0),
          plans: acc.plans + (counts.plansCreated ?? 0),
          drafts: acc.drafts + (counts.draftsComposed ?? 0),
          salesSignals: acc.salesSignals + (counts.researched ?? 0) + (counts.qualified ?? 0),
          preparedActions: acc.preparedActions + (counts.executedActions ?? 0),
          observations: acc.observations + (counts.metricsAnalyzed ?? 0),
          learningSignals: acc.learningSignals + (counts.proposalsCreated ?? 0),
        };
      },
      {
        opportunities: 0,
        contentIdeas: 0,
        plans: 0,
        drafts: 0,
        salesSignals: 0,
        preparedActions: 0,
        observations: 0,
        learningSignals: 0,
      }
    );

    const blocked: string[] = [];
    const skipped: string[] = [];
    const failures: string[] = [];
    const approvalsRequired: string[] = [];

    for (const s of cycle.stages) {
      if (s.status === 'FAILED') {
        failures.push(`${s.stage}: ${s.error ?? 'unknown'}`);
      }
      if (s.status === 'SKIPPED') {
        skipped.push(`${s.stage}: ${s.error ?? 'no reason'}`);
      }
      if (s.stage === 'EXECUTION' || s.stage === 'APPROVAL_SNAPSHOT') {
        const counts = s.counts as Record<string, number> | undefined;
        if (counts && (counts.pendingActions ?? 0) > 0) {
          approvalsRequired.push(`${s.stage}: ${counts.pendingActions} actions pending`);
        }
        if (counts && (counts.submittedContentReviews ?? 0) > 0) {
          approvalsRequired.push(`${s.stage}: ${counts.submittedContentReviews} content reviews pending`);
        }
        if (counts && (counts.submittedOutreachReviews ?? 0) > 0) {
          approvalsRequired.push(`${s.stage}: ${counts.submittedOutreachReviews} outreach reviews pending`);
        }
      }
    }

    return {
      cycleId: cycle.id,
      workspaceId: cycle.workspaceId,
      status: cycle.status as OperatorCycleStatus,
      requestedAt: cycle.requestedAt,
      startedAt: cycle.startedAt,
      completedAt: cycle.completedAt,
      error: cycle.error,
      errorStage: cycle.errorStage as OperatorCycleStageName | null,
      correlationId: cycle.correlationId,
      stages: cycle.stages.map((s) => ({
        stage: s.stage as OperatorCycleStageName,
        status: s.status as OperatorCycleStageStatus,
        counts: s.counts ?? undefined,
        durationMs: s.durationMs ?? undefined,
        error: s.error ?? undefined,
      })),
      totals,
      blocked,
      skipped,
      failures,
      approvalsRequired,
    };
  }
}