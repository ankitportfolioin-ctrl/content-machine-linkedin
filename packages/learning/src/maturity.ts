import { PrismaClient } from '@prisma/client';
import { LearningError } from './errors';

/**
 * Batch 2 (C): evidence maturity ladder.
 *
 * UNKNOWN -> OBSERVED -> REPEATED_SIGNAL -> HYPOTHESIS -> EXPERIMENT ->
 * SUPPORTED_PATTERN -> CONFIRMED
 *
 * Semantics:
 * - UNKNOWN: no meaningful evidence.
 * - OBSERVED: one recorded occurrence.
 * - REPEATED_SIGNAL: the signal appeared repeatedly (>=3 occurrences).
 * - HYPOTHESIS: a possible explanation is being considered (a proposal).
 * - EXPERIMENT: the hypothesis is being explicitly tested.
 * - SUPPORTED_PATTERN: evidence supports the pattern, not yet confirmed.
 * - CONFIRMED: a human confirmed the pattern via the existing learning
 *   confirm transition (OWNER/ADMIN). Never automatic.
 *
 * Invariants: one strong post must NOT create CONFIRMED learning; maturity
 * never moves backward except through the existing revoke path; every
 * forward step requires recorded evidence (evidenceCount).
 */
export const EVIDENCE_MATURITY_ORDER = [
  'UNKNOWN',
  'OBSERVED',
  'REPEATED_SIGNAL',
  'HYPOTHESIS',
  'EXPERIMENT',
  'SUPPORTED_PATTERN',
  'CONFIRMED',
] as const;

export type EvidenceMaturity = (typeof EVIDENCE_MATURITY_ORDER)[number];

export const REPEAT_THRESHOLD = 3;
export const SUPPORT_THRESHOLD = 5;

export function isMaturity(value: unknown): value is EvidenceMaturity {
  return typeof value === 'string' && (EVIDENCE_MATURITY_ORDER as readonly string[]).includes(value);
}

// The Batch 2 migration adds maturity/evidenceCount to LearningProposal.
// Until the checked-in generated client refreshes, access them through
// this minimal structural delegate instead of the stale generated types.
interface MaturityRow {
  id: string;
  maturity?: unknown;
  evidenceCount?: unknown;
  sourceMetricIds?: unknown;
}

interface MaturityStore {
  learningProposal: {
    findFirst(args: unknown): Promise<MaturityRow | null>;
    update(args: unknown): Promise<MaturityRow>;
  };
  outcomeMetric: {
    count(args: unknown): Promise<number>;
  };
}

function store(prisma: PrismaClient): MaturityStore {
  return prisma as unknown as MaturityStore;
}

function readMaturity(row: MaturityRow): EvidenceMaturity {
  const current = row.maturity ?? 'HYPOTHESIS';
  if (!isMaturity(current)) {
    throw new LearningError('EVIDENCE_MISSING', `Unknown maturity state: ${String(current)}.`);
  }
  return current;
}

function readCount(row: MaturityRow): number {
  return typeof row.evidenceCount === 'number' ? row.evidenceCount : 1;
}

export function nextMaturity(current: EvidenceMaturity): EvidenceMaturity | null {
  const idx = EVIDENCE_MATURITY_ORDER.indexOf(current);
  if (idx < 0 || idx >= EVIDENCE_MATURITY_ORDER.length - 1) return null;
  return EVIDENCE_MATURITY_ORDER[idx + 1]!;
}

/**
 * Records one occurrence of evidence against a proposal and advances the
 * early ladder honestly: UNKNOWN -> OBSERVED on the first occurrence,
 * OBSERVED -> REPEATED_SIGNAL once occurrences reach REPEAT_THRESHOLD.
 * Anything beyond REPEATED_SIGNAL requires an explicit promotion call with
 * its own evidence — a single strong observation can never jump further.
 */
export async function recordObservation(
  prisma: PrismaClient,
  workspaceId: string,
  proposalId: string
): Promise<{ id: string; maturity: string; evidenceCount: number }> {
  const db = store(prisma);
  const proposal = await db.learningProposal.findFirst({ where: { id: proposalId, workspaceId } });
  if (!proposal) {
    throw new LearningError('EVIDENCE_MISSING', 'Learning proposal not found in this workspace.');
  }
  const current = readMaturity(proposal);
  if (current !== 'UNKNOWN' && current !== 'OBSERVED') {
    throw new LearningError(
      'EVIDENCE_MISSING',
      `recordObservation only advances UNKNOWN -> OBSERVED -> REPEATED_SIGNAL (current: ${current}). Use explicit promotion with evidence for later stages.`
    );
  }
  const nextCount = readCount(proposal) + 1;
  let maturity: EvidenceMaturity = current;
  if (current === 'UNKNOWN') maturity = 'OBSERVED';
  else if (current === 'OBSERVED' && nextCount >= REPEAT_THRESHOLD) maturity = 'REPEATED_SIGNAL';
  const updated = await db.learningProposal.update({
    where: { id: proposal.id },
    data: { evidenceCount: nextCount, maturity },
  });
  return { id: updated.id, maturity: String(updated.maturity ?? maturity), evidenceCount: readCount(updated) };
}

/**
 * Explicit single-step promotion along the ladder. Requires the caller to
 * supply recorded evidence (source metric ids that exist in the workspace).
 * Skipping stages is rejected, and CONFIRMED can only be reached through
 * the existing human confirm transition — never through this function.
 */
export async function promoteMaturity(
  prisma: PrismaClient,
  workspaceId: string,
  proposalId: string,
  to: EvidenceMaturity,
  evidence: { sourceMetricIds: string[]; reason: string }
): Promise<{ id: string; maturity: string; evidenceCount: number }> {
  const db = store(prisma);
  const proposal = await db.learningProposal.findFirst({ where: { id: proposalId, workspaceId } });
  if (!proposal) {
    throw new LearningError('EVIDENCE_MISSING', 'Learning proposal not found in this workspace.');
  }
  if (to === 'CONFIRMED') {
    throw new LearningError(
      'APPROVAL_NOT_ALLOWED',
      'CONFIRMED requires explicit human confirmation (OWNER/ADMIN) via the confirm transition — never automatic promotion.'
    );
  }
  const current = readMaturity(proposal);
  const expected = nextMaturity(current);
  if (expected !== to) {
    throw new LearningError(
      'EVIDENCE_MISSING',
      `Invalid maturity transition ${current} -> ${to}. Only the next stage (${expected ?? 'none'}) is allowed, with recorded evidence.`
    );
  }
  if (!evidence.reason?.trim()) {
    throw new LearningError('EVIDENCE_MISSING', 'Maturity promotion requires a reason grounded in recorded evidence.');
  }
  if (to === 'SUPPORTED_PATTERN') {
    const count = readCount(proposal);
    if (count < SUPPORT_THRESHOLD) {
      throw new LearningError(
        'EVIDENCE_MISSING',
        `SUPPORTED_PATTERN requires at least ${SUPPORT_THRESHOLD} recorded occurrences (current: ${count}). One strong post is not enough.`
      );
    }
  }
  if (evidence.sourceMetricIds.length > 0) {
    const count = await db.outcomeMetric.count({
      where: { id: { in: evidence.sourceMetricIds }, workspaceId },
    });
    if (count !== evidence.sourceMetricIds.length) {
      throw new LearningError('EVIDENCE_MISSING', 'One or more promotion evidence metrics were not found in this workspace.');
    }
  } else if (to === 'EXPERIMENT' || to === 'SUPPORTED_PATTERN') {
    throw new LearningError('EVIDENCE_MISSING', `${to} promotion requires recorded source metric ids.`);
  }
  const priorIds = Array.isArray(proposal.sourceMetricIds) ? (proposal.sourceMetricIds as unknown[]) : [];
  const mergedIds = Array.from(new Set([...priorIds.filter((v): v is string => typeof v === 'string'), ...evidence.sourceMetricIds]));
  const updated = await db.learningProposal.update({
    where: { id: proposal.id },
    data: { maturity: to, sourceMetricIds: mergedIds },
  });
  return { id: updated.id, maturity: String(updated.maturity ?? to), evidenceCount: readCount(updated) };
}
