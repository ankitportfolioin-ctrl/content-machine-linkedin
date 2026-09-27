import { PrismaClient } from '@prisma/client';

export interface ObjectionPattern {
  normalizedObjection: string;
  count: number;
  sampleEvidence: string[];
  conversationIds: string[];
  classificationIds: string[];
}

export interface ObjectionAggregation {
  patterns: ObjectionPattern[];
  rawEvidence: Array<{ conversationId: string; classificationId: string; evidence: string }>;
  totalObjections: number;
  minSampleSize: number;
}

function normalizeEvidence(evidence: string): string {
  const quoted = evidence.match(/"([^"]{4,})"/);
  const source = quoted ? quoted[1] as string : evidence;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Aggregates recorded OBJECTION classifications into evidence-backed
 * patterns. Deterministic and read-only: it never creates opportunities,
 * plans, drafts, or any other artifact. Groups below `minSampleSize` stay
 * visible as raw evidence but are never presented as patterns.
 */
export async function aggregateObjectionPatterns(
  prisma: PrismaClient,
  workspaceId: string,
  minSampleSize = 2
): Promise<ObjectionAggregation> {
  const rows = await prisma.conversationClassificationResult.findMany({
    where: { workspaceId, classification: 'OBJECTION' },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const groups = new Map<string, { evidence: string[]; conversationIds: string[]; classificationIds: string[] }>();
  const rawEvidence: ObjectionAggregation['rawEvidence'] = [];

  for (const row of rows as Array<{ id: string; conversationId: string; evidence: string | null }>) {
    const evidence = (row.evidence ?? '').trim();
    if (!evidence) continue;
    const key = normalizeEvidence(evidence);
    if (!key) continue;
    rawEvidence.push({ conversationId: row.conversationId, classificationId: row.id, evidence });
    const group = groups.get(key) ?? { evidence: [], conversationIds: [], classificationIds: [] };
    if (!group.evidence.includes(evidence)) group.evidence.push(evidence);
    if (!group.conversationIds.includes(row.conversationId)) group.conversationIds.push(row.conversationId);
    group.classificationIds.push(row.id);
    groups.set(key, group);
  }

  const patterns: ObjectionPattern[] = [];
  for (const [normalizedObjection, group] of groups) {
    if (group.conversationIds.length < minSampleSize) continue;
    patterns.push({
      normalizedObjection,
      count: group.conversationIds.length,
      sampleEvidence: group.evidence.slice(0, 5),
      conversationIds: group.conversationIds,
      classificationIds: group.classificationIds,
    });
  }
  patterns.sort((a, b) => b.count - a.count || a.normalizedObjection.localeCompare(b.normalizedObjection));

  return { patterns, rawEvidence, totalObjections: rawEvidence.length, minSampleSize };
}
