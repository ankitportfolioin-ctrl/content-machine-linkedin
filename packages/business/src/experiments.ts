import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export class ExperimentNotFoundError extends Error {
  constructor(message = 'Experiment not found') {
    super(message);
    this.name = 'ExperimentNotFoundError';
  }
}

export class ExperimentInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExperimentInvalidStateError';
  }
}

export class ExperimentNotRunningError extends Error {
  constructor(message = 'Experiment is not in RUNNING state') {
    super(message);
    this.name = 'ExperimentNotRunningError';
  }
}

export const ExperimentCreateSchema = z.object({
  hypothesis: z.string().min(10).max(2000),
  variable: z.string().min(1).max(100),
  controlDescription: z.string().min(1).max(2000),
  variantDescription: z.string().min(1).max(2000),
  controlContentDNAId: z.string().uuid().optional(),
  variantContentDNAId: z.string().uuid().optional(),
  metricName: z.string().min(1).max(100).default('saves'),
});

export type ExperimentCreate = z.infer<typeof ExperimentCreateSchema>;

export const ExperimentCompleteSchema = z.object({
  controlMetrics: z.record(z.number()).default({}),
  variantMetrics: z.record(z.number()).default({}),
  sampleSize: z.number().int().min(2),
  conclusion: z.string().max(2000).optional(),
  nextTest: z.string().max(2000).optional(),
});

export type ExperimentComplete = z.infer<typeof ExperimentCompleteSchema>;

export function analyzeExperiment(control: Record<string, number>, variant: Record<string, number>, metric: string) {
  const c = control[metric] ?? 0;
  const v = variant[metric] ?? 0;
  if (c === 0 && v === 0) {
    return { result: 'INCONCLUSIVE', confidence: 0, delta: 0, note: 'Insufficient data: both arms recorded zero.' };
  }
  const delta = c === 0 ? 1 : (v - c) / Math.abs(c);
  const confidence = Math.min(0.85, 0.3 + Math.abs(delta));
  const result = Math.abs(delta) < 0.1 ? 'NO_DIFFERENCE' : delta > 0 ? 'VARIANT_WINS' : 'CONTROL_WINS';
  return {
    result,
    confidence: Math.round(confidence * 100) / 100,
    delta: Math.round(delta * 1000) / 1000,
    note: 'Observed difference, not causal proof. Replicate before changing strategy.',
  };
}

export class ExperimentEngineService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async create(workspaceId: string, input: ExperimentCreate) {
    const validated = ExperimentCreateSchema.parse(input);
    return this.prisma.experiment.create({ data: { workspaceId, ...validated, status: 'DESIGNED' as any } });
  }

  async start(workspaceId: string, id: string) {
    const exp = await this.prisma.experiment.findFirst({ where: { id, workspaceId } });
    if (!exp) throw new ExperimentNotFoundError();
    if ((exp.status as string) !== 'DESIGNED') throw new ExperimentInvalidStateError(`Only DESIGNED experiments can start (current: ${exp.status}).`);
    return this.prisma.experiment.update({ where: { id }, data: { status: 'RUNNING' as any, startedAt: new Date() } });
  }

  async complete(workspaceId: string, id: string, input: ExperimentComplete) {
    const validated = ExperimentCompleteSchema.parse(input);
    const exp = await this.prisma.experiment.findFirst({ where: { id, workspaceId } });
    if (!exp) throw new ExperimentNotFoundError();
    if ((exp.status as string) !== 'RUNNING') throw new ExperimentNotRunningError();
    const analysis = analyzeExperiment(
      validated.controlMetrics as Record<string, number>,
      validated.variantMetrics as Record<string, number>,
      exp.metricName,
    );
    return this.prisma.experiment.update({
      where: { id },
      data: {
        status: 'COMPLETED' as any,
        controlMetrics: validated.controlMetrics,
        variantMetrics: validated.variantMetrics,
        sampleSize: validated.sampleSize,
        result: analysis.result,
        confidence: analysis.confidence,
        conclusion: validated.conclusion ?? `${analysis.result} on ${exp.metricName} (delta ${analysis.delta}). ${analysis.note}`,
        nextTest: validated.nextTest ?? null,
        completedAt: new Date(),
      },
    });
  }

  async list(workspaceId: string, status?: string) {
    return this.prisma.experiment.findMany({
      where: { workspaceId, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
