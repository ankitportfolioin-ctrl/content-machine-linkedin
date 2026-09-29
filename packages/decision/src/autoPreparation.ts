import { PrismaClient } from '@prisma/client';
import { DecisionError } from './errors';
import { OperatorActionService } from './actions';

/**
 * Batch 2 (B): prior-human-judgment auto-preparation.
 *
 * Product rule: preparation may happen automatically ONLY when justified by
 * prior human judgment. Importing a lead, triaging an opportunity, approving
 * a strategy/plan, or explicitly accepting a recommendation are all recorded
 * human authorizations — the system may then do the internal preparation
 * work so the operator wakes up to useful work already prepared.
 *
 * Cold preparation (untouched NEW opportunities/prospects, recommendations
 * without prior judgment) requires explicit acceptance by default, unless
 * the workspace enabled it through an explicit, persisted, auditable,
 * quota-limited policy.
 *
 * Preparation is NEVER execution: every artifact created here is an
 * internal draft/scaffold for human review. Nothing is sent, published,
 * or used to contact anyone.
 */

export type AuthorizationSource =
  | 'IMPORT_ACCEPTANCE'
  | 'PRIOR_TRIAGE'
  | 'PRIOR_APPROVAL'
  | 'EXISTING_STRATEGY'
  | 'EXPLICIT_ACCEPTANCE'
  | 'POLICY_AUTO_PREP';

export interface AutoPrepPolicy {
  autoPrepareApprovedWork: boolean;
  autoPrepareColdWork: boolean;
  dailyAutoPreparationQuota: number;
}

export const DEFAULT_AUTO_PREP_POLICY: AutoPrepPolicy = {
  autoPrepareApprovedWork: true,
  autoPrepareColdWork: false,
  dailyAutoPreparationQuota: 10,
};

interface Candidate {
  kind: string;
  subjectType: string;
  subjectId: string;
  authorizationSource: AuthorizationSource;
  authorizationReason: string;
  cold: boolean;
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// The Batch 2 migration adds auto-prep fields to AutonomyPolicy and the
// PreparationLog table. Until the checked-in generated client refreshes,
// access them through this minimal structural delegate.
interface PrepLogRow {
  id: string;
  kind: string;
  skipReason: string | null;
}

interface Batch2Store {
  preparationLog: {
    count(args: unknown): Promise<number>;
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<PrepLogRow>;
  };
}

export class AutoPreparationService {
  private prisma: PrismaClient;
  private store: Batch2Store;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.store = prisma as unknown as Batch2Store;
  }

  async getPolicy(workspaceId: string): Promise<AutoPrepPolicy> {
    const row = (await this.prisma.autonomyPolicy.findUnique({ where: { workspaceId } })) as unknown as {
      autoPrepareApprovedWork?: unknown;
      autoPrepareColdWork?: unknown;
      dailyAutoPreparationQuota?: unknown;
    } | null;
    return {
      autoPrepareApprovedWork:
        typeof row?.autoPrepareApprovedWork === 'boolean'
          ? row.autoPrepareApprovedWork
          : DEFAULT_AUTO_PREP_POLICY.autoPrepareApprovedWork,
      autoPrepareColdWork:
        typeof row?.autoPrepareColdWork === 'boolean'
          ? row.autoPrepareColdWork
          : DEFAULT_AUTO_PREP_POLICY.autoPrepareColdWork,
      dailyAutoPreparationQuota:
        typeof row?.dailyAutoPreparationQuota === 'number'
          ? row.dailyAutoPreparationQuota
          : DEFAULT_AUTO_PREP_POLICY.dailyAutoPreparationQuota,
    };
  }

  async quotaStatus(workspaceId: string): Promise<{
    policy: AutoPrepPolicy;
    usedToday: number;
    remaining: number;
    quotaReached: boolean;
  }> {
    const policy = await this.getPolicy(workspaceId);
    const usedToday = await this.store.preparationLog.count({
      where: { workspaceId, status: 'PREPARED', createdAt: { gte: startOfTodayUtc() } },
    });
    const remaining = Math.max(0, policy.dailyAutoPreparationQuota - usedToday);
    return { policy, usedToday, remaining, quotaReached: remaining <= 0 };
  }

  /**
   * Evaluates every auto-preparation candidate in a fixed priority order,
   * prepares what is authorized and within quota, and records a
   * PreparationLog row for every decision (PREPARED or SKIPPED).
   * Quota exhaustion stops the run gracefully — remaining candidates stay
   * untouched as backlog for future runs.
   */
  async run(
    workspaceId: string,
    opts: { actorId?: string; limit?: number } = {}
  ): Promise<{
    prepared: Array<{ id: string; kind: string; subjectId: string; authorizationReason: string }>;
    skipped: Array<{ id: string; kind: string; subjectId: string; skipReason: string }>;
    quotaReached: boolean;
    usedToday: number;
  }> {
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const status = await this.quotaStatus(workspaceId);
    const prepared: Array<{ id: string; kind: string; subjectId: string; authorizationReason: string }> = [];
    const skipped: Array<{ id: string; kind: string; subjectId: string; skipReason: string }> = [];
    let usedToday = status.usedToday;
    let quotaReached = status.quotaReached;

    if (quotaReached) {
      const row = await this.store.preparationLog.create({
        data: {
          workspaceId,
          kind: 'QUOTA_CHECK',
          subjectType: 'WORKSPACE',
          subjectId: workspaceId,
          authorizationSource: 'POLICY_AUTO_PREP',
          authorizationReason: `Auto-preparation run started with no remaining quota (${usedToday}/${status.policy.dailyAutoPreparationQuota} used today).`,
          status: 'SKIPPED',
          skipReason: `Skipped because the daily auto-preparation quota (${status.policy.dailyAutoPreparationQuota}) was reached.`,
        },
      });
      skipped.push({ id: row.id, kind: row.kind, subjectId: workspaceId, skipReason: row.skipReason ?? '' });
      return { prepared, skipped, quotaReached, usedToday };
    }

    const candidates = await this.collectCandidates(workspaceId);
    for (const candidate of candidates.slice(0, limit)) {
      const gate = this.checkGate(candidate, status.policy);
      if (!gate.allowed) {
        const row = await this.store.preparationLog.create({
          data: {
            workspaceId,
            kind: candidate.kind,
            subjectType: candidate.subjectType,
            subjectId: candidate.subjectId,
            authorizationSource: candidate.authorizationSource,
            authorizationReason: candidate.authorizationReason,
            status: 'SKIPPED',
            skipReason: gate.reason,
          },
        });
        skipped.push({ id: row.id, kind: row.kind, subjectId: candidate.subjectId, skipReason: gate.reason });
        continue;
      }
      if (usedToday >= status.policy.dailyAutoPreparationQuota) {
        quotaReached = true;
        const reason = `Skipped because the daily auto-preparation quota (${status.policy.dailyAutoPreparationQuota}) was reached.`;
        const row = await this.store.preparationLog.create({
          data: {
            workspaceId,
            kind: candidate.kind,
            subjectType: candidate.subjectType,
            subjectId: candidate.subjectId,
            authorizationSource: candidate.authorizationSource,
            authorizationReason: candidate.authorizationReason,
            status: 'SKIPPED',
            skipReason: reason,
          },
        });
        skipped.push({ id: row.id, kind: row.kind, subjectId: candidate.subjectId, skipReason: reason });
        break;
      }
      const already = await this.store.preparationLog.findFirst({
        where: {
          workspaceId,
          status: 'PREPARED',
          subjectType: candidate.subjectType,
          subjectId: candidate.subjectId,
          kind: candidate.kind,
        },
      });
      if (already) continue;
      try {
        const result = await this.prepareOne(workspaceId, candidate, opts.actorId);
        usedToday += 1;
        prepared.push({
          id: result.logId,
          kind: candidate.kind,
          subjectId: candidate.subjectId,
          authorizationReason: candidate.authorizationReason,
        });
      } catch (error) {
        const reason =
          error instanceof DecisionError
            ? error.message
            : 'Preparation failed; nothing was created.';
        const row = await this.store.preparationLog.create({
          data: {
            workspaceId,
            kind: candidate.kind,
            subjectType: candidate.subjectType,
            subjectId: candidate.subjectId,
            authorizationSource: candidate.authorizationSource,
            authorizationReason: candidate.authorizationReason,
            status: 'SKIPPED',
            skipReason: reason,
          },
        });
        skipped.push({ id: row.id, kind: row.kind, subjectId: candidate.subjectId, skipReason: reason });
      }
    }

    return { prepared, skipped, quotaReached, usedToday };
  }

  private checkGate(
    candidate: Candidate,
    policy: AutoPrepPolicy
  ): { allowed: boolean; reason: string } {
    if (!candidate.cold && !policy.autoPrepareApprovedWork) {
      return {
        allowed: false,
        reason: 'Skipped because the workspace policy disables auto-preparation of approved work.',
      };
    }
    if (candidate.cold && !policy.autoPrepareColdWork) {
      return {
        allowed: false,
        reason: 'Cold preparation skipped because no acceptance was recorded.',
      };
    }
    return { allowed: true, reason: '' };
  }

  private async collectCandidates(workspaceId: string): Promise<Candidate[]> {
    const out: Candidate[] = [];

    // 1. Imported leads lacking research (IMPORT_ACCEPTANCE). A completed
    // import batch is the recorded human authorization; without one, an
    // untouched lead is cold (see candidate 6).
    const completedBatch = await this.prisma.leadImportBatch.findFirst({
      where: { workspaceId, status: { in: ['COMPLETED', 'COMPLETED_WITH_SKIPS'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (completedBatch) {
      const leads = await this.prisma.lead.findMany({
        where: { workspaceId },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      const researched = await this.prisma.prospectResearch.findMany({
        where: { workspaceId, leadId: { in: leads.map((l: { id: string }) => l.id) } },
        select: { leadId: true },
      });
      const researchedIds = new Set(
        researched
          .map((r: { leadId: string | null }) => r.leadId)
          .filter((v: unknown): v is string => typeof v === 'string')
      );
      for (const lead of leads) {
        if (researchedIds.has(lead.id)) continue;
        out.push({
          kind: 'LEAD_RESEARCH',
          subjectType: 'LEAD',
          subjectId: lead.id,
          authorizationSource: 'IMPORT_ACCEPTANCE',
          authorizationReason: `Prepared because this lead ("${lead.name}") was imported (batch ${completedBatch.id} completed) and has no research yet.`,
          cold: false,
        });
      }
    }

    // 2. Triaged (REVIEWED) content opportunities lacking a prepared idea.
    const reviewed = await this.prisma.contentOpportunity.findMany({
      where: { workspaceId, status: 'REVIEWED' },
      select: { id: true, title: true },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });
    for (const opp of reviewed) {
      out.push({
        kind: 'OPPORTUNITY_IDEA',
        subjectType: 'CONTENT_OPPORTUNITY',
        subjectId: opp.id,
        authorizationSource: 'PRIOR_TRIAGE',
        authorizationReason: `Prepared because opportunity "${opp.title}" was marked REVIEWED by the workspace.`,
        cold: false,
      });
    }

    // 3. APPROVED content plans lacking a draft.
    const approvedPlans = await this.prisma.contentPlan.findMany({
      where: { workspaceId, status: 'APPROVED' },
      select: { id: true, contentIdeaId: true, thesis: true },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });
    for (const plan of approvedPlans) {
      const draftCount = await this.prisma.contentDraft.count({
        where: { workspaceId, contentIdeaId: plan.contentIdeaId ?? '__none__' },
      });
      if (plan.contentIdeaId && draftCount > 0) continue;
      out.push({
        kind: 'PLAN_DRAFT',
        subjectType: 'CONTENT_PLAN',
        subjectId: plan.id,
        authorizationSource: 'PRIOR_APPROVAL',
        authorizationReason: `Prepared because content plan ${plan.id} was previously approved.`,
        cold: false,
      });
    }

    // 4. APPROVED outreach strategies lacking a draft.
    const approvedStrategies = await this.prisma.outreachStrategy.findMany({
      where: { workspaceId, status: 'APPROVED' },
      select: { id: true, leadId: true, objective: true },
      orderBy: { updatedAt: 'asc' },
      take: 20,
    });
    for (const strategy of approvedStrategies) {
      const draftCount = await this.prisma.outreachDraft.count({
        where: { workspaceId, strategyId: strategy.id },
      });
      if (draftCount > 0) continue;
      out.push({
        kind: 'STRATEGY_DRAFT',
        subjectType: 'OUTREACH_STRATEGY',
        subjectId: strategy.id,
        authorizationSource: 'EXISTING_STRATEGY',
        authorizationReason: `Prepared because outreach strategy ${strategy.id} was previously approved.`,
        cold: false,
      });
    }

    // 5. Explicitly ACCEPTED operator actions (EXPLICIT_ACCEPTANCE).
    // acceptedBy/acceptedAt ride on the Batch 2 migration; order by
    // createdAt and read the acceptor through a cast.
    const accepted = (await this.prisma.operatorAction.findMany({
      where: { workspaceId, status: 'ACCEPTED' },
      select: { id: true, kind: true, title: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })) as unknown as Array<{ id: string; kind: string; title: string; acceptedBy?: unknown }>;
    for (const action of accepted) {
      if (action.kind !== 'objection_pattern' && action.kind !== 'prospect_relevance' && action.kind !== 'sales_content_signal') {
        continue;
      }
      out.push({
        kind: action.kind === 'prospect_relevance' ? 'ACTION_RESEARCH' : 'ACTION_IDEA',
        subjectType: 'OPERATOR_ACTION',
        subjectId: action.id,
        authorizationSource: 'EXPLICIT_ACCEPTANCE',
        authorizationReason: `Prepared because recommendation "${action.title}" was explicitly accepted by ${typeof action.acceptedBy === 'string' ? action.acceptedBy : 'the operator'}.`,
        cold: false,
      });
    }

    // 6. Cold: untouched NEW opportunities (no triage, no acceptance).
    const fresh = await this.prisma.contentOpportunity.findMany({
      where: { workspaceId, status: 'NEW' },
      select: { id: true, title: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const opp of fresh) {
      out.push({
        kind: 'COLD_OPPORTUNITY_IDEA',
        subjectType: 'CONTENT_OPPORTUNITY',
        subjectId: opp.id,
        authorizationSource: 'POLICY_AUTO_PREP',
        authorizationReason: `Prepared under workspace auto-preparation policy (cold preparation enabled) for untouched opportunity "${opp.title}".`,
        cold: true,
      });
    }

    // 7. Cold: untouched prospects (status NEW, no research, no signals) when
    // there is no completed import batch justifying IMPORT_ACCEPTANCE.
    if (!completedBatch) {
      const newLeads = await this.prisma.lead.findMany({
        where: { workspaceId, status: 'NEW' },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const lead of newLeads) {
        const [researchCount, signalCount] = await Promise.all([
          this.prisma.prospectResearch.count({ where: { workspaceId, leadId: lead.id } }),
          this.prisma.prospectSignal.count({ where: { workspaceId, leadId: lead.id } }),
        ]);
        if (researchCount > 0 || signalCount > 0) continue;
        out.push({
          kind: 'COLD_PROSPECT_RESEARCH',
          subjectType: 'LEAD',
          subjectId: lead.id,
          authorizationSource: 'POLICY_AUTO_PREP',
          authorizationReason: `Prepared under workspace auto-preparation policy (cold preparation enabled) for untouched prospect "${lead.name}".`,
          cold: true,
        });
      }
    }

    return out;
  }

  private async resolveAuthorId(workspaceId: string, preferred?: string | null): Promise<string> {
    if (preferred) {
      const user = await this.prisma.user.findUnique({ where: { id: preferred } });
      if (user) return user.id;
    }
    const owner = await this.prisma.workspaceMembership.findFirst({
      where: { workspaceId, role: 'OWNER' },
      select: { userId: true },
      orderBy: { joinedAt: 'asc' },
    });
    if (owner) return owner.userId;
    const member = await this.prisma.workspaceMembership.findFirst({
      where: { workspaceId },
      select: { userId: true },
      orderBy: { joinedAt: 'asc' },
    });
    if (!member) {
      throw new DecisionError('EVIDENCE_MISSING', 'Cannot auto-prepare: workspace has no members to attribute authorship to.');
    }
    return member.userId;
  }

  private async prepareOne(
    workspaceId: string,
    candidate: Candidate,
    actorId?: string
  ): Promise<{ logId: string }> {
    let resultType: string | null = null;
    let resultId: string | null = null;

    if (candidate.kind === 'LEAD_RESEARCH' || candidate.kind === 'COLD_PROSPECT_RESEARCH') {
      const lead = await this.prisma.lead.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!lead) {
        throw new DecisionError('EVIDENCE_MISSING', 'The lead no longer exists in this workspace; nothing was created.');
      }
      const existing = await this.prisma.prospectResearch.findFirst({
        where: { workspaceId, leadId: lead.id },
      });
      if (existing) {
        throw new DecisionError('CONFLICT', 'Research already exists for this lead; nothing was created.');
      }
      const unknowns: string[] = [];
      if (!lead.headline) unknowns.push('headline');
      if (!lead.company) unknowns.push('company');
      if (!lead.location) unknowns.push('location');
      const created = await this.prisma.prospectResearch.create({
        data: {
          workspaceId,
          leadId: lead.id,
          name: lead.name,
          facts: {
            leadId: lead.id,
            name: lead.name,
            linkedinUrl: lead.linkedinUrl,
            headline: lead.headline,
            company: lead.company,
            location: lead.location,
            autoPrepared: true,
            authorizationSource: candidate.authorizationSource,
          },
          unknowns,
          confidence: null,
        },
      });
      resultType = 'PROSPECT_RESEARCH';
      resultId = created.id;
    } else if (candidate.kind === 'OPPORTUNITY_IDEA' || candidate.kind === 'COLD_OPPORTUNITY_IDEA') {
      const opp = await this.prisma.contentOpportunity.findFirst({
        where: { id: candidate.subjectId, workspaceId },
      });
      if (!opp) {
        throw new DecisionError('EVIDENCE_MISSING', 'The opportunity no longer exists in this workspace; nothing was created.');
      }
      const authorId = await this.resolveAuthorId(workspaceId, actorId);
      const created = await this.prisma.contentIdea.create({
        data: {
          workspaceId,
          authorId,
          title: opp.title,
          description: `Auto-prepared from opportunity: ${opp.thesis}`,
          tags: [],
        },
      });
      resultType = 'CONTENT_IDEA';
      resultId = created.id;
    } else if (candidate.kind === 'PLAN_DRAFT') {
      const plan = await this.prisma.contentPlan.findFirst({
        where: { id: candidate.subjectId, workspaceId },
      });
      if (!plan) {
        throw new DecisionError('EVIDENCE_MISSING', 'The content plan no longer exists in this workspace; nothing was created.');
      }
      if (plan.status !== 'APPROVED') {
        throw new DecisionError('CONFLICT', 'The content plan is no longer APPROVED; nothing was created.');
      }
      if (!plan.contentIdeaId) {
        throw new DecisionError('CONFLICT', 'The approved plan has no content idea attached; a draft cannot be scaffolded.');
      }
      const authorId = await this.resolveAuthorId(workspaceId, actorId ?? plan.createdBy);
      const keyPoints = Array.isArray(plan.keyPoints) ? plan.keyPoints.map((k: unknown) => String(k)) : [];
      const created = await this.prisma.contentDraft.create({
        data: {
          workspaceId,
          contentIdeaId: plan.contentIdeaId,
          authorId,
          body: `[Auto-prepared scaffold — human review required]\nThesis: ${plan.thesis}\nAudience: ${plan.audience}\nKey points:\n${keyPoints.map((k: string) => `- ${k}`).join('\n')}`,
          version: 1,
        },
      });
      resultType = 'CONTENT_DRAFT';
      resultId = created.id;
    } else if (candidate.kind === 'STRATEGY_DRAFT') {
      const strategy = await this.prisma.outreachStrategy.findFirst({
        where: { id: candidate.subjectId, workspaceId },
      });
      if (!strategy) {
        throw new DecisionError('EVIDENCE_MISSING', 'The outreach strategy no longer exists in this workspace; nothing was created.');
      }
      if (strategy.status !== 'APPROVED') {
        throw new DecisionError('CONFLICT', 'The outreach strategy is no longer APPROVED; nothing was created.');
      }
      const created = await this.prisma.outreachDraft.create({
        data: {
          workspaceId,
          strategyId: strategy.id,
          leadId: strategy.leadId,
          draftType: 'FIRST_MESSAGE',
          opening: `[Auto-prepared scaffold — human review required] Re: ${strategy.reasonForContact.slice(0, 200)}`,
          relevance: strategy.audience.slice(0, 500),
          value: strategy.angle.slice(0, 500),
          body: `[Auto-prepared scaffold — human review required]\nObjective: ${strategy.objective}\nAudience: ${strategy.audience}\nReason for contact: ${strategy.reasonForContact}`,
          version: 1,
          createdBy: actorId ?? strategy.createdBy,
        },
      });
      resultType = 'OUTREACH_DRAFT';
      resultId = created.id;
    } else if (candidate.kind === 'ACTION_IDEA' || candidate.kind === 'ACTION_RESEARCH') {
      // EXPLICIT_ACCEPTANCE delegates to the existing human-initiated
      // scaffolding so accepted recommendations prepare exactly what a
      // manual Start-idea / Research-prospect click would create.
      const svc = new OperatorActionService(this.prisma);
      const authorId = await this.resolveAuthorId(workspaceId, actorId);
      if (candidate.kind === 'ACTION_IDEA') {
        const { idea } = await svc.initiateIdea(workspaceId, candidate.subjectId, authorId);
        resultType = 'CONTENT_IDEA';
        resultId = (idea as { id: string }).id;
      } else {
        const { research } = await svc.initiateSalesResearch(workspaceId, candidate.subjectId);
        resultType = 'PROSPECT_RESEARCH';
        resultId = (research as { id: string }).id;
      }
    } else {
      throw new DecisionError('CONFLICT', `Unknown preparation kind: ${candidate.kind}.`);
    }

    const log = await this.store.preparationLog.create({
      data: {
        workspaceId,
        kind: candidate.kind,
        subjectType: candidate.subjectType,
        subjectId: candidate.subjectId,
        resultType,
        resultId,
        authorizationSource: candidate.authorizationSource,
        authorizationReason: candidate.authorizationReason,
        status: 'PREPARED',
      },
    });
    return { logId: log.id };
  }
}
