import { PrismaClient } from '@prisma/client';
import { deriveProposal } from './derivation';

export type ContentOutcomeAttribute = 'format' | 'angle' | 'objective';

/**
 * Fixed, documented mapping from a content attribute to the opportunity
 * scoring dimension it may influence. This mapping is a judgment call and
 * is stated here so every derived proposal can name it:
 * - format -> actionability (the format bounds how actionable a piece can be)
 * - angle -> differentiation (the angle is the differentiator)
 * - objective -> audience_fit (the objective states what the content must do
 *   for the audience)
 * Adjustments stay bounded by derivation rules and only ever apply after
 * explicit OWNER/ADMIN confirmation.
 */
const ATTRIBUTE_DIMENSIONS: Record<ContentOutcomeAttribute, string> = {
  format: 'actionability',
  angle: 'differentiation',
  objective: 'audience_fit',
};

export function dimensionForAttribute(attribute: ContentOutcomeAttribute): string {
  return ATTRIBUTE_DIMENSIONS[attribute];
}

export interface ContentOutcomeRow {
  metricId: string;
  metricValue: number;
  attributeValue: string | null;
}

export interface ContentOutcomeGroup {
  label: string;
  avg: number;
  count: number;
  metricIds: string[];
}

export interface ContentOutcomeSummary {
  attribute: ContentOutcomeAttribute;
  metricName: string;
  groups: ContentOutcomeGroup[];
  totalMetrics: number;
  skippedWithoutAttribute: number;
}

/**
 * Pure grouping of recorded outcome values by a content attribute.
 * Rows without the attribute are skipped and counted — never imputed.
 */
export function groupContentOutcomes(
  rows: ContentOutcomeRow[],
  attribute: ContentOutcomeAttribute,
  metricName: string
): ContentOutcomeSummary {
  const groups = new Map<string, Array<{ value: number; id: string }>>();
  let skippedWithoutAttribute = 0;
  for (const row of rows) {
    if (!row.attributeValue) {
      skippedWithoutAttribute += 1;
      continue;
    }
    const list = groups.get(row.attributeValue) ?? [];
    list.push({ value: row.metricValue, id: row.metricId });
    groups.set(row.attributeValue, list);
  }
  const groupList: ContentOutcomeGroup[] = [...groups.entries()].map(([label, items]) => ({
    label: `${attribute}:${label}`,
    avg: Math.round((items.reduce((a, b) => a + b.value, 0) / items.length) * 100) / 100,
    count: items.length,
    metricIds: items.map((i) => i.id),
  }));
  return { attribute, metricName, groups: groupList, totalMetrics: rows.length, skippedWithoutAttribute };
}

function pickAttribute(
  plan: { format?: string | null; angle?: string | null; objective?: string | null } | null,
  idea: { format?: string | null; objective?: string | null } | null,
  attribute: ContentOutcomeAttribute
): string | null {
  const fromPlan = plan?.[attribute];
  if (typeof fromPlan === 'string' && fromPlan.trim()) return fromPlan;
  if (attribute === 'angle') return null;
  const fromIdea = idea?.[attribute];
  if (typeof fromIdea === 'string' && fromIdea.trim()) return fromIdea;
  return null;
}

export class ContentOutcomeService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async summarize(
    workspaceId: string,
    input: { metricName: string; attribute: ContentOutcomeAttribute }
  ): Promise<ContentOutcomeSummary> {
    const rows = await this.prisma.outcomeMetric.findMany({
      where: {
        workspaceId,
        metricName: input.metricName,
        contentVersionId: { not: null },
      },
      include: {
        contentVersion: {
          include: {
            contentDraft: {
              include: { plan: true, contentIdea: true },
            },
          },
        },
      },
      orderBy: { recordedAt: 'asc' },
      take: 2000,
    });

    const flat: ContentOutcomeRow[] = rows.map((row: {
      id: string;
      metricValue: number;
      contentVersion: {
        contentDraft: {
          plan: { format?: string | null; angle?: string | null; objective?: string | null } | null;
          contentIdea: { format?: string | null; objective?: string | null } | null;
        } | null;
      } | null;
    }) => ({
      metricId: row.id,
      metricValue: row.metricValue,
      attributeValue: row.contentVersion?.contentDraft
        ? pickAttribute(
            row.contentVersion.contentDraft.plan,
            row.contentVersion.contentDraft.contentIdea,
            input.attribute
          )
        : null,
    }));

    return groupContentOutcomes(flat, input.attribute, input.metricName);
  }

  /**
   * Derives a PROPOSED (never auto-confirmed) learning proposal from a
   * content-outcome summary. Returns null with a reason when the recorded
   * data cannot support a proposal.
   */
  deriveFromSummary(
    summary: ContentOutcomeSummary,
    minSampleSize = 3
  ): { derived: NonNullable<ReturnType<typeof deriveProposal>>; dimension: string } | { derived: null; reason: string } {
    const dimension = dimensionForAttribute(summary.attribute);
    const derived = deriveProposal({
      dimension,
      groupAverages: summary.groups,
      reason: `Derived from ${summary.totalMetrics} recorded "${summary.metricName}" measurement(s) grouped by content ${summary.attribute} (plan preferred, idea fallback; ${summary.skippedWithoutAttribute} skipped without the attribute). Attribute-to-dimension mapping: ${summary.attribute} -> ${dimension}.`,
      minSampleSize,
    });
    if (!derived) {
      return { derived: null, reason: 'Recorded measurements do not support a learning proposal (need 2+ attribute groups at minimum sample with a sufficient gap).' };
    }
    return { derived, dimension };
  }
}
