import { prisma } from '@growth-operator/db';
import { OperatorActionService } from '@growth-operator/decision';
import {
  ClaimLedgerService,
  ContentGapService,
  ContentOpportunityService,
  SourceIngestionService,
  SourceUnderstandingService,
  TopicClusteringService,
  TrendSignalService,
} from '@growth-operator/intelligence';
import { ContentPlanService, DraftComposer } from '@growth-operator/content';
import {
  BriefService,
  ClassificationService,
  OutreachComposer,
  ProspectResearchService,
  QualificationService,
  suggestRelevantContent,
} from '@growth-operator/sales';
import { ContentOutcomeService, LearningDerivationService } from '@growth-operator/learning';
import { BrainReportService } from '@growth-operator/business';
import { createDefaultRegistry } from '@growth-operator/ai';
import { getEnv } from '../config/env';
import { assertRunAllowed } from './settings';
import type { RunBudget } from './budget';

export type StageName =
  | 'INTELLIGENCE'
  | 'DECISION'
  | 'CONTENT'
  | 'SALES'
  | 'APPROVAL_SNAPSHOT'
  | 'EXECUTION'
  | 'OBSERVE_LEARN'
  | 'DIGEST';

export const STAGE_ORDER: StageName[] = [
  'INTELLIGENCE',
  'DECISION',
  'CONTENT',
  'SALES',
  'APPROVAL_SNAPSHOT',
  'EXECUTION',
  'OBSERVE_LEARN',
  'DIGEST',
];

export interface StageContext {
  workspaceId: string;
  /** Calendar day YYYY-MM-DD this run covers (UTC). */
  runDate: string;
  budget: RunBudget;
}

export interface StageResult {
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  counts?: Record<string, number>;
  /** Honest machine-readable note (e.g. why skipped, what was deferred). */
  note?: string;
  error?: string;
}

type StageFn = (ctx: StageContext) => Promise<StageResult>;

/** Hard per-run safety caps on top of the user's budget caps. Documented, never silent. */
const MAX_FEEDS_PER_RUN = 25;
const MAX_ITEMS_PER_FEED = 5;
const MAX_NEW_DOCS_PER_RUN = 10;
const MAX_TOPICS_PER_DOC = 2;
const MAX_IDEAS_PER_RUN = 5;
const MAX_LEADS_PER_RUN = 10;
const MAX_METRICS_ANALYZED = 3;

function aiRegistry() {
  const env = getEnv();
  return createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY);
}

async function gate(ctx: StageContext): Promise<StageResult | null> {
  const verdict = await assertRunAllowed(ctx.workspaceId);
  if (!verdict.allowed) {
    return { status: 'SKIPPED', note: `Blocked mid-run: ${verdict.reason}` };
  }
  return null;
}

async function workspaceOwnerId(workspaceId: string): Promise<string | null> {
  const membership = await prisma.workspaceMembership.findFirst({
    where: { workspaceId, role: 'OWNER' },
    orderBy: { joinedAt: 'asc' },
  });
  return membership?.userId ?? null;
}

const intelligence: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const { workspaceId } = ctx;

  const feeds = await prisma.feedSource.findMany({
    where: { workspaceId, active: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_FEEDS_PER_RUN,
  });
  const counts = {
    activeFeedSources: feeds.length,
    sourcesAttempted: 0,
    fetched: 0,
    failed: 0,
    documentsNew: 0,
    claimsPersisted: 0,
    topicsNormalized: 0,
    opportunitiesCreated: 0,
  };
  if (feeds.length === 0) {
    return { status: 'SUCCEEDED', counts, note: 'No active feed sources configured; nothing to fetch.' };
  }

  const registry = aiRegistry();
  const aiAvailable = registry.getAvailable().length > 0;
  const ingestion = new SourceIngestionService(prisma);
  const understanding = new SourceUnderstandingService(registry);
  const claims = new ClaimLedgerService(prisma);
  const topics = new TopicClusteringService(prisma, registry);
  const trends = new TrendSignalService(prisma);
  const gaps = new ContentGapService(prisma, registry);
  const opportunities = new ContentOpportunityService(prisma, registry, topics, trends);
  const notes: string[] = [];
  if (!aiAvailable) {
    notes.push('AI unavailable: fetch-only path; understanding, topics, gaps and opportunities deferred (no output invented).');
  }

  const mapFeedType = (t: string): 'RSS' | 'ATOM' | undefined =>
    t === 'RSS' ? 'RSS' : t === 'ATOM' ? 'ATOM' : undefined;

  let docsProcessed = 0;
  for (const feed of feeds) {
    if (!ctx.budget.spendFetch()) {
      notes.push('Fetch budget exhausted; remaining feeds deferred to the next run.');
      break;
    }
    counts.sourcesAttempted += 1;
    let result;
    try {
      result = await ingestion.ingest(workspaceId, feed.url, { sourceType: mapFeedType(feed.type) });
    } catch (error) {
      counts.failed += 1;
      await prisma.feedSource.update({
        where: { id: feed.id },
        data: { lastFetchedAt: new Date(), lastError: error instanceof Error ? error.message : 'Unknown ingestion error' },
      });
      continue;
    }
    const newestItem = result.feedItems.find((i) => i.publishedAt) ?? result.feedItems[0] ?? null;
    await prisma.feedSource.update({
      where: { id: feed.id },
      data: {
        lastFetchedAt: new Date(),
        lastError: result.error ?? null,
        lastCursor: newestItem ? newestItem.url : null,
      },
    });
    if (result.status === 'FAILED' || !result.documentId) {
      counts.failed += 1;
      continue;
    }
    counts.fetched += 1;

    // Candidate documents: the feed document itself (articles/sites) plus top
    // feed items / sitemap urls for aggregators. Only NEW documents (ingest
    // returns null documentId for duplicates) flow downstream.
    const candidateUrls: string[] = [];
    if (result.sourceType === 'RSS' || result.sourceType === 'ATOM') {
      for (const item of result.feedItems.slice(0, MAX_ITEMS_PER_FEED)) {
        candidateUrls.push(item.url);
      }
    } else if (result.sourceType === 'SITEMAP') {
      for (const url of result.sitemapUrls.slice(0, MAX_ITEMS_PER_FEED)) {
        candidateUrls.push(url);
      }
    }
    const newDocs: Array<{ sourceId: string; documentId: string }> = [];
    if (candidateUrls.length === 0) {
      newDocs.push({ sourceId: result.sourceId, documentId: result.documentId });
    } else {
      for (const url of candidateUrls) {
        if (!ctx.budget.spendFetch()) {
          notes.push('Fetch budget exhausted; remaining items deferred.');
          break;
        }
        try {
          const itemResult = await ingestion.ingest(workspaceId, url, {});
          if (itemResult.status !== 'FAILED' && itemResult.documentId) {
            newDocs.push({ sourceId: itemResult.sourceId, documentId: itemResult.documentId });
          }
        } catch {
          counts.failed += 1;
        }
      }
    }

    if (!aiAvailable) continue;

    for (const doc of newDocs) {
      if (docsProcessed >= MAX_NEW_DOCS_PER_RUN) {
        notes.push(`New-document cap (${MAX_NEW_DOCS_PER_RUN}) reached; remainder deferred.`);
        break;
      }
      const document = await prisma.sourceDocument.findUnique({ where: { id: doc.documentId } });
      const source = await prisma.intelligenceSource.findUnique({ where: { id: doc.sourceId } });
      if (!document?.cleanContent || !source) continue;
      if (!ctx.budget.spendLlm()) {
        notes.push('LLM budget exhausted; remaining documents deferred.');
        break;
      }
      let u;
      try {
        u = await understanding.understand(document.cleanContent, source.title, source.url);
      } catch {
        continue;
      }
      if (!u.understanding) continue;
      docsProcessed += 1;
      counts.documentsNew += 1;

      let entries: Array<{ id: string }> = [];
      try {
        entries = await claims.persistClaims(workspaceId, source.id, document.id, u.understanding);
        counts.claimsPersisted += entries.length;
      } catch {
        continue;
      }

      let topicResult;
      try {
        topicResult = await topics.normalizeTopics(workspaceId, [{ sourceId: source.id, understanding: u.understanding }]);
        counts.topicsNormalized += topicResult.topics.length;
      } catch {
        continue;
      }

      const trendIds: string[] = [];
      const resolvedTopics: Array<{ id: string }> = [];
      for (const mention of topicResult.topicMentions.slice(0, MAX_TOPICS_PER_DOC)) {
        const topic = await prisma.topic.findUnique({
          where: { workspaceId_canonicalName: { workspaceId, canonicalName: mention.topicCanonicalName } },
        });
        if (!topic) continue;
        resolvedTopics.push({ id: topic.id });
        try {
          await trends.updateTrendSignal(workspaceId, topic.id, [{
            sourceId: source.id,
            mentionStrength: mention.mentionStrength,
            relevanceScore: mention.relevanceScore,
            createdAt: new Date(),
          }]);
          const trend = await prisma.trendSignal.findUnique({
            where: { workspaceId_topicId: { workspaceId, topicId: topic.id } },
          });
          if (trend) trendIds.push(trend.id);
        } catch {
          continue;
        }
      }
      if (resolvedTopics.length === 0) continue;

      const [profile, icp] = await Promise.all([
        prisma.profile.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } }),
        prisma.iCP.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } }),
      ]);
      const workspaceProfile = profile
        ? `${profile.role ?? ''} ${profile.headline ?? ''}`.trim()
        : '';
      const icpText = icp?.description ?? '';
      const existingTopics = (
        await prisma.topic.findMany({ where: { workspaceId }, select: { name: true }, take: 20 })
      ).map((t) => t.name);

      for (const topic of resolvedTopics) {
        if (!ctx.budget.spendLlm()) {
          notes.push('LLM budget exhausted; remaining opportunities deferred.');
          break;
        }
        let detected: Array<{ gapType: string; description: string; importanceScore: number; evidence: string }> = [];
        try {
          detected = await gaps.detectGaps({
            workspaceId,
            topicId: topic.id,
            sources: [{ id: document.id, title: source.title, description: source.description, mainContent: document.cleanContent }],
            claims: entries.length > 0
              ? (await claims.getClaimsForSource(workspaceId, source.id)).map((c) => ({
                claimText: c.claimText,
                claimType: c.claimType,
                evidenceText: c.evidenceText,
                confidence: c.confidence,
              }))
              : [],
            workspaceProfile,
            icp: icpText,
            existingTopics,
          });
        } catch {
          detected = [];
        }
        for (const gap of detected) {
          const dupe = await prisma.contentGap.findFirst({
            where: { workspaceId, topicId: topic.id, gapType: gap.gapType as never, description: gap.description },
            select: { id: true },
          });
          if (!dupe) {
            await prisma.contentGap.create({
              data: {
                workspaceId,
                topicId: topic.id,
                gapType: gap.gapType as never,
                description: gap.description,
                importanceScore: gap.importanceScore,
                evidence: gap.evidence,
              },
            });
          }
        }
        let generated;
        try {
          generated = await opportunities.generateOpportunity({
            workspaceId,
            topicId: topic.id,
            sourceIds: [source.id],
            claimIds: entries.map((e) => e.id),
            trendSignalIds: trendIds,
            workspaceProfile,
            icp: icpText,
            contentGaps: detected.map((g) => ({ type: g.gapType, description: g.description, evidence: g.evidence })),
          });
        } catch {
          continue;
        }
        if (!generated.opportunity) {
          if (generated.error) notes.push(`Opportunity skipped: ${generated.error.slice(0, 160)}`);
          continue;
        }
        await prisma.contentOpportunity.create({
          data: {
            workspaceId,
            topicId: topic.id,
            title: generated.opportunity.title,
            thesis: generated.opportunity.thesis,
            problem: u.understanding.mainProblem,
            audience: generated.opportunity.audience,
            angle: generated.opportunity.angle,
            objective: generated.opportunity.objective,
            contentFormat: generated.opportunity.contentFormat,
            opportunityScore: generated.opportunity.opportunityScore,
            status: 'NEW',
            sourceIds: [source.id],
            claimIds: entries.map((e) => e.id),
            trendSignalIds: trendIds,
            reasoning: generated.opportunity.reasoning,
            evidenceSummary: generated.opportunity.evidenceSummary,
          },
        });
        counts.opportunitiesCreated += 1;
      }
    }
  }

  // Per-source fetch failures are data, not stage failure: they are counted
  // here and recorded on FeedSource.lastError rows. FAILED is reserved for
  // unexpected throws (recorded by the orchestrator's catch).
  if (counts.failed > 0) {
    notes.push(`${counts.failed} feed(s) failed; see FeedSource.lastError rows.`);
  }
  return {
    status: 'SUCCEEDED',
    counts,
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
  };
};

const decision: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const service = new OperatorActionService(prisma);
  const ranked = await service.refreshWorkspace(ctx.workspaceId, 50);
  return {
    status: 'SUCCEEDED',
    counts: { rankedActions: ranked.length },
  };
};

const content: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const { workspaceId } = ctx;
  const counts = {
    ideasCreated: 0,
    plansCreated: 0,
    plansValidatedOk: 0,
    plansValidatedNeedsReview: 0,
    draftsComposed: 0,
    skippedNoAI: 0,
  };
  const notes: string[] = [];

  const registry = aiRegistry();
  const aiAvailable = registry.getAvailable().length > 0;
  const planService = new ContentPlanService(prisma, registry);
  const composer = new DraftComposer(prisma, registry);
  const ownerId = await workspaceOwnerId(workspaceId);

  // 1. Top NEW opportunities -> ContentIdea with provenance. The opportunity
  // stays NEW (never auto-CONVERTED): humans still triage it, and the idea
  // row guards against duplicates.
  const opportunities = await prisma.contentOpportunity.findMany({
    where: { workspaceId, status: 'NEW' },
    orderBy: { opportunityScore: 'desc' },
    take: MAX_IDEAS_PER_RUN,
  });
  for (const opp of opportunities) {
    const dupe = await prisma.contentIdea.findFirst({
      where: { workspaceId, opportunityId: opp.id },
      select: { id: true },
    });
    if (dupe) continue;
    if (!ownerId) {
      notes.push('No workspace owner found; ideas require an author.');
      break;
    }
    if (!ctx.budget.spendPreparation()) {
      notes.push('Preparation budget exhausted; remaining opportunities deferred.');
      break;
    }
    const sourceIds = (opp.sourceIds as string[] | null) ?? [];
    const claimIds = (opp.claimIds as string[] | null) ?? [];
    const trendSignalIds = (opp.trendSignalIds as string[] | null) ?? [];
    await prisma.contentIdea.create({
      data: {
        workspaceId,
        authorId: ownerId,
        title: opp.title,
        description: opp.thesis,
        angle: opp.angle,
        format: (opp.contentFormat as never) ?? undefined,
        status: 'DRAFT',
        tags: [],
        opportunityId: opp.id,
        topicId: opp.topicId,
        sourceIds,
        claimIds,
        trendSignalIds,
        thesis: opp.thesis,
        audience: opp.audience,
        objective: opp.objective,
        reasoning: opp.reasoning,
        evidenceSnapshot: { evidenceSummary: opp.evidenceSummary, sourceIds, claimIds, trendSignalIds },
      },
    });
    counts.ideasCreated += 1;
  }

  if (!aiAvailable) {
    if (counts.ideasCreated > 0 || opportunities.length > 0) {
      notes.push('AI unavailable: plans and drafts deferred (no prose invented).');
      counts.skippedNoAI += 1;
    }
  } else {
    // 2. Ideas with opportunities but no plans -> DRAFT plans (never approved
    // by the loop; approval stays human-gated).
    const ideas = await prisma.contentIdea.findMany({
      where: { workspaceId, opportunityId: { not: null }, plans: { none: {} } },
      include: { plans: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_IDEAS_PER_RUN,
    });
    const [profile, icp] = await Promise.all([
      prisma.profile.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } }),
      prisma.iCP.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } }),
    ]);
    for (const idea of ideas) {
      if (!ctx.budget.spendLlm() || !ctx.budget.spendPreparation()) {
        notes.push('Budget exhausted; remaining ideas deferred.');
        break;
      }
      const opportunity = idea.opportunityId
        ? await prisma.contentOpportunity.findFirst({ where: { id: idea.opportunityId, workspaceId } })
        : null;
      const claims = opportunity
        ? await prisma.sourceClaim.findMany({
          where: { id: { in: ((opportunity.claimIds as string[]) ?? []) }, workspaceId },
        })
        : [];
      const gaps = await prisma.contentGap.findMany({
        where: { workspaceId },
        take: 10,
        orderBy: { importanceScore: 'desc' },
      });
      try {
        const plan = await planService.generatePlan({
          workspaceId,
          contentIdeaId: idea.id,
          opportunityId: opportunity?.id,
          topicId: opportunity?.topicId ?? idea.topicId ?? undefined,
          thesis: opportunity?.thesis ?? idea.thesis ?? idea.title,
          audienceOverride: idea.audience ?? undefined,
          objective: (idea.objective?.toUpperCase() ?? undefined) as never,
          angle: (idea.angle?.toUpperCase() ?? undefined) as never,
          format: (idea.format ?? undefined) as never,
          sourceIds: ((opportunity?.sourceIds as string[]) ?? (idea.sourceIds as string[]) ?? undefined) as string[] | undefined,
          claimIds: ((opportunity?.claimIds as string[]) ?? (idea.claimIds as string[]) ?? undefined) as string[] | undefined,
          trendSignalIds: ((opportunity?.trendSignalIds as string[]) ?? (idea.trendSignalIds as string[]) ?? undefined) as string[] | undefined,
          claims: claims.map((c) => ({ id: c.id, text: c.claimText, type: c.claimType, evidence: c.evidenceText, confidence: c.confidence })),
          gaps: gaps.map((g) => ({ type: g.gapType, description: g.description })),
          contradictions: [],
          profile: profile
            ? { role: profile.role, headline: profile.headline, professionalContext: profile.professionalContext, industry: profile.industry }
            : null,
          icp: icp
            ? { id: icp.id, name: icp.name, description: icp.description, criteria: icp.criteria, targetRoles: icp.targetRoles, industries: icp.industries, companySize: icp.companySize, problems: icp.problems, exclusions: icp.exclusions }
            : null,
          createdBy: ownerId ?? undefined,
        });
        counts.plansCreated += 1;
        try {
          const validation = await planService.validatePlan(workspaceId, plan.id);
          if (validation.ok) counts.plansValidatedOk += 1;
          else counts.plansValidatedNeedsReview += 1;
        } catch {
          counts.plansValidatedNeedsReview += 1;
        }
      } catch (error) {
        notes.push(`Plan skipped for idea ${idea.id.slice(0, 8)}: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
      }
    }

    // 3. Human-APPROVED plans without drafts -> compose prose. The judgment
    // already happened; the loop only does the laborious drafting step.
    if (ownerId) {
      const approved = await prisma.contentPlan.findMany({
        where: { workspaceId, status: 'APPROVED', drafts: { none: {} } },
        orderBy: { updatedAt: 'desc' },
        take: MAX_IDEAS_PER_RUN,
      });
      for (const plan of approved) {
        if (!ctx.budget.spendLlm() || !ctx.budget.spendPreparation()) {
          notes.push('Budget exhausted; remaining approved plans deferred.');
          break;
        }
        try {
          await composer.composeFromPlan(workspaceId, plan.id, ownerId, plan.contentIdeaId ?? undefined);
          counts.draftsComposed += 1;
        } catch (error) {
          notes.push(`Draft skipped for plan ${plan.id.slice(0, 8)}: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
        }
      }
    }
  }

  return {
    status: 'SUCCEEDED',
    counts,
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
  };
};

const sales: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const { workspaceId } = ctx;
  const counts = {
    researched: 0,
    qualified: 0,
    briefsCreated: 0,
    suggestionsComputed: 0,
    draftsComposed: 0,
    classified: 0,
    followUpsRecommended: 0,
    skippedNoAI: 0,
  };
  const notes: string[] = [];

  const registry = aiRegistry();
  const aiAvailable = registry.getAvailable().length > 0;
  const research = new ProspectResearchService(prisma, registry);
  const qualification = new QualificationService(prisma);
  const briefs = new BriefService(prisma, registry);
  const outreach = new OutreachComposer(prisma, registry);
  const classification = new ClassificationService(prisma, registry);
  const ownerId = await workspaceOwnerId(workspaceId);

  const leads = await prisma.lead.findMany({
    where: { workspaceId, status: 'NEW', research: { none: {} } },
    orderBy: { createdAt: 'asc' },
    take: MAX_LEADS_PER_RUN,
  });
  for (const lead of leads) {
    if (!ctx.budget.spendPreparation()) {
      notes.push('Preparation budget exhausted; remaining leads deferred.');
      break;
    }
    // Research from the lead's own recorded fields only. Confidence stays
    // null: nothing here is verified against public sources yet.
    const facts: Array<{ statement: string; sourceRef: string; confidence: number | null }> = [];
    if (lead.headline) facts.push({ statement: `Headline: ${lead.headline}`, sourceRef: `lead:${lead.id}`, confidence: null });
    if (lead.company) facts.push({ statement: `Company: ${lead.company}`, sourceRef: `lead:${lead.id}`, confidence: null });
    if (lead.location) facts.push({ statement: `Location: ${lead.location}`, sourceRef: `lead:${lead.id}`, confidence: null });
    let researchRow;
    try {
      researchRow = await research.createResearch({
        workspaceId,
        leadId: lead.id,
        name: lead.name,
        title: lead.headline ?? undefined,
        company: lead.company ?? undefined,
        location: lead.location ?? undefined,
        publicSourceUrls: [],
        facts,
        unknowns: ['Public background not yet researched from public sources.'],
      });
      counts.researched += 1;
    } catch (error) {
      notes.push(`Research skipped for lead ${lead.id.slice(0, 8)}: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
      continue;
    }
    try {
      const signals = await prisma.prospectSignal.findMany({
        where: { workspaceId, leadId: lead.id },
        select: { evidence: true },
        take: 10,
      });
      await qualification.qualifyAndPersist(workspaceId, lead.id, {
        problemEvidence: signals.map((s) => s.evidence),
        timingEvidence: [],
        researchFactCount: facts.length,
        researchConfidence: null,
      });
      counts.qualified += 1;
    } catch (error) {
      notes.push(`Qualification skipped for lead ${lead.id.slice(0, 8)}: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
    }
    if (!ctx.budget.spendPreparation()) {
      notes.push('Preparation budget exhausted; remaining briefs deferred.');
      break;
    }
    try {
      await briefs.createBrief({ workspaceId, leadId: lead.id, researchId: researchRow.id, createdBy: ownerId ?? undefined });
      counts.briefsCreated += 1;
    } catch (error) {
      notes.push(`Brief skipped for lead ${lead.id.slice(0, 8)}: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
      continue;
    }
    try {
      const suggestions = await suggestRelevantContent(prisma, workspaceId, { leadId: lead.id });
      counts.suggestionsComputed += suggestions.length;
    } catch {
      // Suggestions are advisory; never fail the lead over them.
    }
  }

  // Human-APPROVED strategies without drafts -> compose prose (AI-gated).
  if (aiAvailable && ownerId) {
    const approved = await prisma.outreachStrategy.findMany({
      where: { workspaceId, status: 'APPROVED', drafts: { none: {} } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_LEADS_PER_RUN,
    });
    for (const strategy of approved) {
      if (!ctx.budget.spendLlm() || !ctx.budget.spendPreparation()) {
        notes.push('Budget exhausted; remaining approved strategies deferred.');
        break;
      }
      try {
        await outreach.composeFromStrategy(workspaceId, strategy.id, 'FIRST_MESSAGE', ownerId);
        counts.draftsComposed += 1;
      } catch (error) {
        notes.push(`Outreach draft skipped for strategy ${strategy.id.slice(0, 8)}: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
      }
    }
  } else if (!aiAvailable) {
    const pendingStrategies = await prisma.outreachStrategy.count({
      where: { workspaceId, status: 'APPROVED', drafts: { none: {} } },
    });
    if (pendingStrategies > 0) {
      notes.push('AI unavailable: outreach drafting deferred (no prose invented).');
      counts.skippedNoAI += pendingStrategies;
    }
  }

  // Deterministic classification + follow-ups for conversations with fresh
  // messages but no classification yet.
  const conversations = await prisma.conversation.findMany({
    where: {
      workspaceId,
      messages: { some: {} },
      classifications: { none: {} },
    },
    select: { id: true, leadId: true },
    orderBy: { lastMessageAt: 'desc' },
    take: MAX_LEADS_PER_RUN,
  });
  for (const conv of conversations) {
    if (!ctx.budget.spendPreparation()) {
      notes.push('Preparation budget exhausted; remaining conversations deferred.');
      break;
    }
    try {
      await classification.classifyConversation(workspaceId, conv.id);
      counts.classified += 1;
    } catch {
      continue;
    }
    try {
      await classification.recommendFollowUp(workspaceId, { conversationId: conv.id, leadId: conv.leadId });
      counts.followUpsRecommended += 1;
    } catch {
      continue;
    }
  }

  return {
    status: 'SUCCEEDED',
    counts,
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
  };
};

const approvalSnapshot: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const { workspaceId } = ctx;
  const [pendingActions, submittedContentReviews, submittedOutreachReviews] = await Promise.all([
    prisma.operatorAction.count({ where: { workspaceId, status: 'PENDING' } }),
    prisma.contentReview.count({ where: { workspaceId, status: 'SUBMITTED' } }),
    prisma.outreachReview.count({ where: { workspaceId, status: 'SUBMITTED' } }),
  ]);
  return {
    status: 'SUCCEEDED',
    counts: { pendingActions, submittedContentReviews, submittedOutreachReviews },
  };
};

const execution: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const policy = await prisma.autonomyPolicy.findUnique({
    where: { workspaceId: ctx.workspaceId },
  });
  return {
    status: 'SKIPPED',
    counts: { executedActions: 0 },
    note: `No execution integration in Step E (Tier-1 policy: ${
      policy?.tier1PostingEnabled ? 'enabled-but-unintegrated' : 'disabled'
    }). Prepared items stay prepared.`,
  };
};

const observeLearn: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const { workspaceId } = ctx;
  const counts = {
    metricsAnalyzed: 0,
    proposalsCreated: 0,
    skippedBacklog: 0,
    insufficientData: 0,
  };
  const notes: string[] = [];

  const outcomes = new ContentOutcomeService(prisma);
  const derivation = new LearningDerivationService(prisma);

  // Discover which metrics actually have content-linked measurements.
  const metricNames = await prisma.outcomeMetric.findMany({
    where: { workspaceId, contentVersionId: { not: null } },
    select: { metricName: true },
    distinct: ['metricName'],
    take: MAX_METRICS_ANALYZED,
  });
  const attributes = ['format', 'angle', 'objective'] as const;
  for (const { metricName } of metricNames) {
    for (const attribute of attributes) {
      let summary;
      try {
        summary = await outcomes.summarize(workspaceId, { metricName, attribute });
      } catch {
        continue;
      }
      if (summary.totalMetrics === 0) {
        counts.insufficientData += 1;
        continue;
      }
      counts.metricsAnalyzed += 1;
      let outcome;
      try {
        outcome = outcomes.deriveFromSummary(summary, 3);
      } catch {
        counts.insufficientData += 1;
        continue;
      }
      if (!outcome.derived) {
        counts.insufficientData += 1;
        continue;
      }
      const { derived, dimension } = outcome as {
        derived: { observedPattern: string; sampleSize: number; denominator: number; proposedAdjustment: number; reason: string; confidence: number; sourceMetricIds: string[] };
        dimension: string;
      };
      // Never spam the backlog: one open proposal per dimension at a time.
      // Humans resolve PROPOSED rows; the loop does not pile on.
      const open = await prisma.learningProposal.findFirst({
        where: { workspaceId, dimension, status: 'PROPOSED' },
        select: { id: true },
      });
      if (open) {
        counts.skippedBacklog += 1;
        continue;
      }
      try {
        await derivation.propose({
          workspaceId,
          dimension,
          observedPattern: derived.observedPattern,
          supportingMeasurements: summary.groups,
          sourceMetricIds: derived.sourceMetricIds,
          sampleSize: derived.sampleSize,
          denominator: derived.denominator,
          proposedAdjustment: derived.proposedAdjustment,
          reason: derived.reason,
          confidence: derived.confidence,
        });
        counts.proposalsCreated += 1;
      } catch (error) {
        notes.push(`Proposal skipped (${dimension}): ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
      }
    }
  }

  return {
    status: 'SUCCEEDED',
    counts,
    note: notes.length > 0
      ? notes.join(' ')
      : 'Derivation proposes only (PROPOSED); confirmation stays human-gated.',
  };
};

const digest: StageFn = async (ctx) => {
  const blocked = await gate(ctx);
  if (blocked) return blocked;
  const start = new Date(`${ctx.runDate}T00:00:00.000Z`);
  const end = new Date(`${ctx.runDate}T23:59:59.999Z`);
  const reports = new BrainReportService(prisma);
  const report = await reports.daily(ctx.workspaceId, start, end);
  return {
    status: 'SUCCEEDED',
    counts: { digests: 1 },
    note: `DAILY digest upserted for ${ctx.runDate} (report ${report.id.slice(0, 8)}).`,
  };
};

export const STAGES: Record<StageName, StageFn> = {
  INTELLIGENCE: intelligence,
  DECISION: decision,
  CONTENT: content,
  SALES: sales,
  APPROVAL_SNAPSHOT: approvalSnapshot,
  EXECUTION: execution,
  OBSERVE_LEARN: observeLearn,
  DIGEST: digest,
};
