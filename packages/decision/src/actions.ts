import { PrismaClient } from '@prisma/client';
import { LearningDerivationService } from '@growth-operator/learning';
import { DecisionError } from './errors';
import { ActionStatus, ScoredAction } from './types';
import { collectCandidates } from './collectors';
import { checkEligibility } from './eligibility';
import { rankScored, scoreCandidate } from './scoring';
import { explainAction } from './explain';

export class OperatorActionService {
  private prisma: PrismaClient;
  private learning: LearningDerivationService;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.learning = new LearningDerivationService(prisma);
  }

  /**
   * Refreshes the workspace action queue: collects candidates, filters by
   * live eligibility, scores and ranks deterministically, upserts PENDING
   * rows, and removes PENDING rows whose artifacts stopped being eligible.
   * DISMISSED/COMPLETED rows are never touched (they suppress recurrence).
   * Dismissing/completing records the operator's decision only — it never
   * executes the underlying business action.
   */
  async refreshWorkspace(workspaceId: string, limit = 20): Promise<ScoredAction[]> {
    const now = Date.now();
    const candidates = await collectCandidates(this.prisma, workspaceId, now);

    const existing = await this.prisma.operatorAction.findMany({ where: { workspaceId } });
    const suppressed = new Map(
      existing
        .filter((r: { status: string }) => r.status !== 'PENDING')
        .map((r: { identityKey: string; status: string }) => [r.identityKey, r.status] as [string, string])
    );

    const eligibleKeys = new Set<string>();
    const scored: ScoredAction[] = [];
    const confirmed = await this.learning.confirmedInfluences(workspaceId);

    for (const candidate of candidates) {
      if (suppressed.has(candidate.identityKey)) continue;
      const verdict = await checkEligibility(this.prisma, workspaceId, candidate);
      if (!verdict.eligible) continue;
      eligibleKeys.add(candidate.identityKey);
      scored.push(scoreCandidate({ candidate, confirmedLearning: confirmed, now }));
    }

    const ranked = rankScored(scored);

    for (const action of ranked) {
      await this.prisma.operatorAction.upsert({
        where: { workspaceId_identityKey: { workspaceId, identityKey: action.identityKey } },
        create: {
          workspaceId,
          identityKey: action.identityKey,
          kind: action.kind,
          subjectId: action.subjectId,
          title: action.title,
          score: action.score,
          reasons: action.reasons,
          evidenceLinks: action.evidenceLinks as object,
          subjectMeta: (action.facts.subjectMeta ?? {}) as object,
          status: 'PENDING',
        },
        update: {
          title: action.title,
          score: action.score,
          reasons: action.reasons,
          evidenceLinks: action.evidenceLinks as object,
          subjectMeta: (action.facts.subjectMeta ?? {}) as object,
        },
      });
    }

    await this.prisma.operatorAction.deleteMany({
      where: { workspaceId, status: 'PENDING', identityKey: { notIn: [...eligibleKeys] } },
    });

    return ranked.slice(0, limit);
  }

  async listWorkspace(workspaceId: string, status: ActionStatus = 'PENDING', limit = 20) {
    return this.prisma.operatorAction.findMany({
      where: { workspaceId, status },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  async transition(workspaceId: string, actionId: string, to: 'DISMISSED' | 'COMPLETED') {
    const row = await this.prisma.operatorAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!row) {
      throw new DecisionError('NOT_FOUND', 'Operator action not found in this workspace.');
    }
    if (row.status !== 'PENDING') {
      throw new DecisionError(
        'INVALID_TRANSITION',
        `Only PENDING actions can transition (current: ${row.status}). DISMISSED actions cannot become COMPLETED.`
      );
    }
    return this.prisma.operatorAction.update({
      where: { id: row.id },
      data: {
        status: to,
        ...(to === 'DISMISSED' ? { dismissedAt: new Date() } : { completedAt: new Date() }),
      },
    });
  }

  async explain(workspaceId: string, actionId: string) {
    const row = await this.prisma.operatorAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!row) {
      throw new DecisionError('NOT_FOUND', 'Operator action not found in this workspace.');
    }
    const candidates = await collectCandidates(this.prisma, workspaceId, Date.now());
    const candidate = candidates.find((c) => c.identityKey === row.identityKey);
    const confirmed = await this.learning.confirmedInfluences(workspaceId);
    if (!candidate) {
      return explainAction(
        {
          kind: row.kind as ScoredAction['kind'],
          identityKey: row.identityKey,
          subjectId: row.subjectId,
          title: row.title,
          createdAt: row.createdAt,
          facts: {},
          reasons: row.reasons,
          evidenceLinks: (row.evidenceLinks as ScoredAction['evidenceLinks']) ?? [],
          score: row.score,
          dimensions: [],
          learningApplied: [],
        },
        row.status
      );
    }
    const verdict = await checkEligibility(this.prisma, workspaceId, candidate);
    const scored = scoreCandidate({ candidate, confirmedLearning: confirmed });
    void verdict;
    return explainAction(scored, row.status);
  }
}
