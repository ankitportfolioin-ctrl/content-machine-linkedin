import { PrismaClient } from '@prisma/client';

/**
 * Batch 2 (D): provenance-based attribution.
 *
 * Chain: CONTENT -> AUDIENCE RESPONSE -> PERSON -> CONVERSATION -> LEAD ->
 * OPPORTUNITY -> BUSINESS OUTCOME. Links reference records that actually
 * exist in the workspace — never invented.
 *
 * DIRECT   = authoritative evidence explicitly connects the records.
 * INFERRED = documented logical connection, but no direct proof.
 * UNKNOWN  = no defensible connection exists.
 *
 * The system never upgrades UNKNOWN -> INFERRED -> DIRECT without new
 * evidence. Reach/impressions alone never become direct revenue
 * attribution: DIRECT requires at least one evidence reference.
 */

export const ATTRIBUTION_TYPES = ['DIRECT', 'INFERRED', 'UNKNOWN'] as const;
export type AttributionType = (typeof ATTRIBUTION_TYPES)[number];

const RANK: Record<AttributionType, number> = { UNKNOWN: 0, INFERRED: 1, DIRECT: 2 };

export class AttributionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AttributionError';
    this.code = code;
  }
}

// Endpoint types that may participate in an attribution link. Each maps to
// a workspace-scoped existence check so links can never point at records
// from another workspace (or at records that do not exist).
const KNOWN_ENDPOINTS = new Set([
  'contentVersion',
  'contentIdea',
  'contentDraft',
  'comment',
  'audienceSignal',
  'conversation',
  'lead',
  'pipelineOpportunity',
  'outcomeMetric',
  'publishRecord',
  'outreachDraft',
]);

interface AttributionRow {
  id: string;
  workspaceId: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  attributionType: string;
  evidenceRefs: string[];
  reason: string | null;
  recordedBy: string | null;
  recordedAt: Date;
}

function assertType(value: string, role: string): void {
  if (!KNOWN_ENDPOINTS.has(value)) {
    throw new AttributionError(
      'EVIDENCE_MISSING',
      `Unknown attribution endpoint ${role}: "${value}". Links may only connect recorded workspace records.`
    );
  }
}

function assertAttributionType(value: string): asserts value is AttributionType {
  if (!(ATTRIBUTION_TYPES as readonly string[]).includes(value)) {
    throw new AttributionError(
      'EVIDENCE_MISSING',
      `Unknown attribution type: "${value}". Use DIRECT, INFERRED, or UNKNOWN.`
    );
  }
}

export class AttributionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private get links() {
    return this.prisma.attributionLink;
  }

  private async assertEndpointInWorkspace(
    workspaceId: string,
    type: string,
    id: string,
    role: string
  ): Promise<void> {
    assertType(type, role);
    // Dynamic dispatch over the known endpoint set (validated above): the
    // generated client carries every delegate; the index is the only cast.
    const db = this.prisma as unknown as Record<string, { findFirst(a: unknown): Promise<unknown> }>;
    const delegate = db[type];
    if (!delegate) {
      throw new AttributionError('EVIDENCE_MISSING', `Cannot verify endpoint ${role} of type "${type}".`);
    }
    const row = await delegate.findFirst({ where: { id, workspaceId } });
    if (!row) {
      throw new AttributionError(
        'EVIDENCE_MISSING',
        `Attribution ${role} not found in this workspace: ${type} ${id}. Links are never fabricated.`
      );
    }
  }

  private assertDirectEvidence(attributionType: AttributionType, evidenceRefs: string[]): void {
    if (attributionType === 'DIRECT' && evidenceRefs.length === 0) {
      throw new AttributionError(
        'EVIDENCE_MISSING',
        'DIRECT attribution requires at least one evidence reference explicitly connecting the records.'
      );
    }
  }

  async link(input: {
    workspaceId: string;
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    attributionType: AttributionType | string;
    evidenceRefs?: string[];
    reason?: string;
    recordedBy?: string;
  }): Promise<AttributionRow> {
    assertAttributionType(input.attributionType);
    if (input.sourceType === input.targetType && input.sourceId === input.targetId) {
      throw new AttributionError('EVIDENCE_MISSING', 'A record cannot attribute to itself.');
    }
    const evidenceRefs = (input.evidenceRefs ?? []).filter((r) => typeof r === 'string' && r.length > 0);
    this.assertDirectEvidence(input.attributionType, evidenceRefs);
    if (input.attributionType === 'INFERRED' && !input.reason?.trim()) {
      throw new AttributionError(
        'EVIDENCE_MISSING',
        'INFERRED attribution requires a documented reason describing the logical connection.'
      );
    }
    await this.assertEndpointInWorkspace(input.workspaceId, input.sourceType, input.sourceId, 'source');
    await this.assertEndpointInWorkspace(input.workspaceId, input.targetType, input.targetId, 'target');

    const existing = await this.links.findFirst({
      where: {
        workspaceId: input.workspaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });
    if (existing) {
      return this.applyUpdate(input.workspaceId, existing, {
        attributionType: input.attributionType,
        evidenceRefs,
        reason: input.reason,
        recordedBy: input.recordedBy,
      });
    }
    return this.links.create({
      data: {
        workspaceId: input.workspaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        targetType: input.targetType,
        targetId: input.targetId,
        attributionType: input.attributionType,
        evidenceRefs,
        reason: input.reason?.trim() ? input.reason.trim() : null,
        recordedBy: input.recordedBy ?? null,
      },
    });
  }

  async update(
    workspaceId: string,
    linkId: string,
    patch: { attributionType?: AttributionType | string; evidenceRefs?: string[]; reason?: string; recordedBy?: string }
  ): Promise<AttributionRow> {
    const existing = await this.links.findFirst({ where: { id: linkId, workspaceId } });
    if (!existing) {
      throw new AttributionError('EVIDENCE_MISSING', 'Attribution link not found in this workspace.');
    }
    return this.applyUpdate(workspaceId, existing, patch);
  }

  private async applyUpdate(
    _workspaceId: string,
    existing: AttributionRow,
    patch: { attributionType?: AttributionType | string; evidenceRefs?: string[]; reason?: string; recordedBy?: string }
  ): Promise<AttributionRow> {
    const nextType = patch.attributionType ?? existing.attributionType;
    assertAttributionType(nextType);
    const nextRefs = patch.evidenceRefs ?? existing.evidenceRefs;
    this.assertDirectEvidence(nextType, nextRefs);
    // No silent upgrades: moving to a stronger level requires at least one
    // NEW evidence reference beyond what the link already recorded.
    if (RANK[nextType] > RANK[existing.attributionType as AttributionType]) {
      const prior = new Set(existing.evidenceRefs);
      const fresh = nextRefs.filter((r) => !prior.has(r));
      if (fresh.length === 0) {
        throw new AttributionError(
          'EVIDENCE_MISSING',
          `Cannot upgrade ${existing.attributionType} -> ${nextType} without new evidence. Supply an evidence reference not already recorded on this link.`
        );
      }
    }
    if (nextType === 'INFERRED' && !(patch.reason ?? existing.reason)?.trim()) {
      throw new AttributionError(
        'EVIDENCE_MISSING',
        'INFERRED attribution requires a documented reason describing the logical connection.'
      );
    }
    return this.links.update({
      where: { id: existing.id },
      data: {
        attributionType: nextType,
        evidenceRefs: nextRefs,
        ...(patch.reason !== undefined ? { reason: patch.reason?.trim() ? patch.reason.trim() : null } : {}),
        ...(patch.recordedBy !== undefined ? { recordedBy: patch.recordedBy } : {}),
      },
    });
  }

  async listForTarget(
    workspaceId: string,
    targetType: string,
    targetId: string,
    take = 50
  ): Promise<AttributionRow[]> {
    assertType(targetType, 'target');
    return this.links.findMany({
      where: { workspaceId, targetType, targetId },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
    });
  }

  async listForSource(
    workspaceId: string,
    sourceType: string,
    sourceId: string,
    take = 50
  ): Promise<AttributionRow[]> {
    assertType(sourceType, 'source');
    return this.links.findMany({
      where: { workspaceId, sourceType, sourceId },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(100, Math.max(1, take)),
    });
  }

  /** Strongest defensible level across links, for honest UI display. */
  static strongest(links: Array<{ attributionType: string }>): AttributionType {
    let best: AttributionType = 'UNKNOWN';
    for (const link of links) {
      const t = link.attributionType as AttributionType;
      if (RANK[t] !== undefined && RANK[t] > RANK[best]) best = t;
    }
    return best;
  }
}
