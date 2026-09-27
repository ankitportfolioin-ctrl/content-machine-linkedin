import { PrismaClient } from '@prisma/client';

export interface MetricAggregate {
  metricName: string;
  count: number;
  sum: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  sources: string[];
  sampleSize: number;
  period: { from: string | null; to: string | null };
  metricIds: string[];
}

export interface RateDefinition {
  name: string;
  numeratorMetric: string;
  denominatorMetric: string;
}

export interface ComputedRate {
  name: string;
  numerator: number;
  denominator: number;
  value: number;
  numeratorMetricIds: string[];
  denominatorMetricIds: string[];
}

export interface AnalyticsSummary {
  aggregates: MetricAggregate[];
  rates: ComputedRate[];
  omittedRates: Array<{ name: string; reason: string }>;
  totalMetrics: number;
}

/**
 * Pure deterministic aggregation over recorded OutcomeMetric rows only.
 * - Averages always carry their denominator (count).
 * - Rates are computed only for explicitly defined metric pairs present in
 *   the data; otherwise they are omitted with a reason.
 * - Empty datasets return explicit empty states — never zero-filled estimates.
 */
export function aggregateMetrics(
  rows: Array<{ id: string; metricName: string; metricValue: number; source: string; recordedAt: Date }>,
  rates: RateDefinition[] = []
): AnalyticsSummary {
  const byName = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byName.get(row.metricName) ?? [];
    list.push(row);
    byName.set(row.metricName, list);
  }

  const aggregates: MetricAggregate[] = [];
  for (const [metricName, group] of byName) {
    const values = group.map((g) => g.metricValue);
    const sum = values.reduce((a, b) => a + b, 0);
    const times = group.map((g) => g.recordedAt.getTime()).sort((a, b) => a - b);
    aggregates.push({
      metricName,
      count: group.length,
      sum: Math.round(sum * 100) / 100,
      avg: group.length > 0 ? Math.round((sum / group.length) * 100) / 100 : null,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      sources: [...new Set(group.map((g) => g.source))],
      sampleSize: group.length,
      period: {
        from: times.length > 0 ? new Date(times[0] as number).toISOString() : null,
        to: times.length > 0 ? new Date(times[times.length - 1] as number).toISOString() : null,
      },
      metricIds: group.map((g) => g.id),
    });
  }

  const computedRates: ComputedRate[] = [];
  const omittedRates: Array<{ name: string; reason: string }> = [];
  for (const rate of rates) {
    const numerator = byName.get(rate.numeratorMetric) ?? [];
    const denominator = byName.get(rate.denominatorMetric) ?? [];
    if (numerator.length === 0 || denominator.length === 0) {
      omittedRates.push({
        name: rate.name,
        reason: `Insufficient data: "${rate.numeratorMetric}" has ${numerator.length} recorded value(s), "${rate.denominatorMetric}" has ${denominator.length}. Rates are omitted, never estimated.`,
      });
      continue;
    }
    const numSum = numerator.reduce((a, r) => a + r.metricValue, 0);
    const denSum = denominator.reduce((a, r) => a + r.metricValue, 0);
    if (denSum === 0) {
      omittedRates.push({ name: rate.name, reason: 'Denominator sums to zero; no rate computed.' });
      continue;
    }
    computedRates.push({
      name: rate.name,
      numerator: Math.round(numSum * 100) / 100,
      denominator: Math.round(denSum * 100) / 100,
      value: Math.round((numSum / denSum) * 10000) / 10000,
      numeratorMetricIds: numerator.map((r) => r.id),
      denominatorMetricIds: denominator.map((r) => r.id),
    });
  }

  return { aggregates, rates: computedRates, omittedRates, totalMetrics: rows.length };
}

export class AggregationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async summarize(
    workspaceId: string,
    input: { metricName?: string; from?: Date; to?: Date; rates?: RateDefinition[] } = {}
  ): Promise<AnalyticsSummary> {
    const rows = await this.prisma.outcomeMetric.findMany({
      where: {
        workspaceId,
        ...(input.metricName ? { metricName: input.metricName } : {}),
        ...(input.from || input.to
          ? { recordedAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
          : {}),
      },
      orderBy: { recordedAt: 'asc' },
      take: 5000,
    });
    return aggregateMetrics(rows, input.rates ?? []);
  }
}
