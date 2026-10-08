import { prisma } from '@growth-operator/db';
import { OperatorActionService, proposeSignalOpportunities } from '@growth-operator/decision';
import {
  ClaimLedgerService,
  ContentGapService,
  ContentOpportunityService,
  ContentPatternService,
  SourceIngestionService,
  SourceUnderstandingService,
  TopicClusteringService,
  TrendSignalService,
  loadTopicTrendEvidence,
  expandHackerNewsFeed,
  resolveReleaseFeedUrl,
  connectorRegistry,
  primeConnectorRegistry,
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
import { loadWorkspaceConnectorConfigs, buildWorkerFetchConfigs } from '../services/workspaceConnectors';
import { assertRunAllowed } from './settings';
import {
  StageName,
  STAGE_ORDER,
  StageContext,
  StageResult,
  StageFn,
  RunBudget,
} from '@growth-operator/shared';

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
  return createDefaultRegistry(env.OPENAI_API_KEY, env.ANTHROPIC_API_KEY, env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL);
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

export type UnderstandingSkipKind =
  | 'AI_UNAVAILABLE'
  | 'UNDERSTANDING_CALL_FAILED'
  | 'VALIDATION_ERROR'
  | 'UNDERSTANDING_FAILED';

/**
 * G2: structured, secret-free skip note for SourceUnderstanding failures.
 * Persisted via stage notes → runStage.error, so operators can distinguish
 * no-content / no-provider / call-failure / validation-failure per document.
 * Only ids, failure kind, provider type, and a truncated reason are recorded —
 * never keys, prompts, or raw provider responses.
 */
export function buildUnderstandingSkipNote(input: {
  kind: UnderstandingSkipKind;
  documentId: string;
  sourceId: string;
  reason: string;
  provider?: string;
}): string {
  const reason =
    input.reason.length > 200 ? `${input.reason.slice(0, 200)}...` : input.reason;
  const provider = input.provider ? ` provider=${input.provider}` : '';
  return `${input.kind} document=${input.documentId} source=${input.sourceId}${provider}: ${reason}`;
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
    understandingFailed: 0,
    understandingValidationFailed: 0,
  };
  // Workspace connector configuration is the ONLY source of connector
  // selection. A missing row means DISABLED; nothing is ever inferred as
  // enabled. Feed fetching and connector execution are independent: either
  // can run without the other.
  const persistedConnectorConfigs = await loadWorkspaceConnectorConfigs(workspaceId);
  const { fetchConfigs: workerFetchConfigs, skipped: skippedConnectors } =
    buildWorkerFetchConfigs(persistedConnectorConfigs);
  const anyConnectorEnabled = Object.values(workerFetchConfigs).some((c) => c.enabled);
  if (feeds.length === 0 && !anyConnectorEnabled) {
    return { status: 'SUCCEEDED', counts, note: 'No active feed sources and no enabled connectors; nothing to fetch.' };
  }

  const registry = aiRegistry();
  const aiAvailable = registry.getAvailable().length > 0;
  // G2: non-secret provider attribution for understanding-failure notes.
  // A single available provider is unambiguous; several/zero stay omitted
  // rather than guessed.
  const availableProviders = registry.getAvailable();
  const singleProviderType =
    availableProviders.length === 1 ? availableProviders[0]?.type : undefined;
  const ingestion = new SourceIngestionService(prisma);
  const understanding = new SourceUnderstandingService(registry);
  const claims = new ClaimLedgerService(prisma);
  const topics = new TopicClusteringService(prisma, registry);
  const trends = new TrendSignalService(prisma);
  const gaps = new ContentGapService(prisma, registry);
  const opportunities = new ContentOpportunityService(prisma, registry, topics, trends);
  const patterns = new ContentPatternService(prisma);
  const notes: string[] = [];
  if (!aiAvailable) {
    notes.push('AI unavailable: fetch-only path; understanding, topics, gaps and opportunities deferred (no output invented).');
  }

  const mapFeedType = (t: string): 'RSS' | 'ATOM' | undefined =>
    t === 'RSS' ? 'RSS' : t === 'ATOM' ? 'ATOM' : undefined;

  let docsProcessed = 0;
  const env = getEnv();
  // Run-scoped document queue: feed fetching AND the once-per-run connector
  // block below both push here; processNewDocs() runs a single pass after
  // all fetching completes.
  const newDocs: Array<{ sourceId: string; documentId: string }> = [];
  for (const feed of feeds) {
    if (!ctx.budget.spendFetch()) {
      notes.push('Fetch budget exhausted; remaining feeds deferred to the next run.');
      break;
    }
    counts.sourcesAttempted += 1;

    // Dedicated platform adapters (Batch 3 #13). GitHub repo URLs resolve
    // to their official releases Atom feed and take the generic path; HN
    // frontpage URLs expand via the official HN API into story URLs that
    // are ingested individually (each SSRF-checked). Adapter failure marks
    // only this feed (failure isolation) — never the run.
    if (feed.type === 'HACKERNEWS') {
      let adapterItems: Array<{ url: string }> | null = null;
      try {
        adapterItems = await expandHackerNewsFeed(feed.url);
      } catch (error) {
        counts.failed += 1;
        await prisma.feedSource.update({
          where: { id: feed.id },
          data: { lastFetchedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : 'Hacker News adapter failure' },
        });
        continue;
      }
      if (adapterItems) {
        let adapterFailed = 0;
        for (const item of adapterItems.slice(0, MAX_ITEMS_PER_FEED)) {
          if (!ctx.budget.spendFetch()) {
            notes.push('Fetch budget exhausted; remaining items deferred.');
            break;
          }
          try {
            const itemResult = await ingestion.ingest(workspaceId, item.url, {});
            if (itemResult.status !== 'FAILED' && itemResult.documentId) {
              newDocs.push({ sourceId: itemResult.sourceId, documentId: itemResult.documentId });
            } else {
              adapterFailed += 1;
              notes.push(`HN story ingestion failed for ${item.url}: ${itemResult.error ?? 'unknown'}`);
            }
          } catch (e) {
            adapterFailed += 1;
            notes.push(`HN story ingestion error for ${item.url}: ${e instanceof Error ? e.message : 'unknown'}`);
          }
        }
        counts.failed += adapterFailed;
        await prisma.feedSource.update({
          where: { id: feed.id },
          data: { lastFetchedAt: new Date(), lastError: null, lastCursor: adapterItems[0]?.url ?? null },
        });
        counts.fetched += 1;
        continue;
      }
    }

    const feedUrl = feed.type === 'GITHUB_RELEASES' ? resolveReleaseFeedUrl(feed.url) : feed.url;
    let result;
    try {
      result = await ingestion.ingest(workspaceId, feedUrl, { sourceType: mapFeedType(feed.type) });
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

  }

  // Research connectors run ONCE per intelligence cycle — never once per
  // feed — and ONLY when the workspace enabled them. Selection comes solely
  // from persisted WorkspaceConnector rows (missing row == DISABLED).
  // Fetching needs no AI key: without AI the fetch-only path applies and
  // understanding is deferred below, exactly like feed fetching.
  // Credential priming comes first: without server credentials, eligible
  // connectors are honestly skipped as "not configured". Connector signals
  // re-enter the SAME ingestion pipeline as feed items (SSRF-checked,
  // canonical-URL deduped, workspace-scoped). Connector failures are
  // recorded in notes and never fail the run.
  if (anyConnectorEnabled) {
    const { primed, skippedAuthRequired } = primeConnectorRegistry(connectorRegistry, {
      YOUTUBE_API_KEY: env.YOUTUBE_API_KEY,
      YOUTUBE_ACCESS_TOKEN: env.YOUTUBE_ACCESS_TOKEN,
    });
    notes.push(
      `Connector registry primed (${primed.length > 0 ? primed.join(', ') : 'none'}); ` +
      `awaiting credentials: ${skippedAuthRequired.length > 0 ? skippedAuthRequired.join(', ') : 'none'}.`,
    );
    const enabledList = Object.entries(workerFetchConfigs)
      .filter(([, c]) => c.enabled)
      .map(([t]) => t);
    notes.push(`Workspace connectors enabled: ${enabledList.join(', ')}.`);

    const { signals: connectorSignals, errors: connectorErrors } = await connectorRegistry.fetchFromAllSources(
      workspaceId,
      Math.min(50, MAX_NEW_DOCS_PER_RUN - docsProcessed),
      workerFetchConfigs
    );

    const signalsBySource = new Map<string, number>();
    for (const s of connectorSignals) {
      signalsBySource.set(s.sourceType, (signalsBySource.get(s.sourceType) ?? 0) + 1);
    }
    for (const [sourceType, count] of signalsBySource) {
      notes.push(`✓ ${sourceType} — ${count} signal(s) discovered.`);
    }
    if (connectorErrors.length > 0) {
      notes.push(`Connector errors: ${connectorErrors.join('; ')}`);
      for (const sourceType of enabledList) {
        const display = connectorRegistry.getConnector(sourceType)?.displayName ?? sourceType;
        if (!signalsBySource.has(sourceType) && connectorErrors.some((e) => e.startsWith(`${display}:`))) {
          notes.push(`⚠ ${sourceType} — ran but returned no signals (see connector errors).`);
        }
      }
    }
    // Non-executable catalogue entries are reported, never executed.
    for (const skipped of skippedConnectors) {
      const persisted = persistedConnectorConfigs[skipped.sourceType];
      if (persisted?.enabled) {
        notes.push(`○ ${skipped.sourceType} — enabled but not executed: ${skipped.reason}`);
      } else {
        notes.push(`○ ${skipped.sourceType} — disabled.`);
      }
    }

    for (const signal of connectorSignals) {
      if (docsProcessed >= MAX_NEW_DOCS_PER_RUN) {
        notes.push(`New-document cap (${MAX_NEW_DOCS_PER_RUN}) reached; remainder deferred.`);
        break;
      }
      if (!ctx.budget.spendFetch()) {
        notes.push('Fetch budget exhausted; remaining connector signals deferred.');
        break;
      }
      try {
        const connectorResult = await ingestion.ingest(workspaceId, signal.url, { sourceType: signal.sourceType as 'REDDIT' | 'YOUTUBE' | 'GOOGLE_TRENDS' | 'LINKEDIN' | 'X' | 'INSTAGRAM' | 'TIKTOK' });
        if (connectorResult.status !== 'FAILED' && connectorResult.documentId) {
          newDocs.push({ sourceId: connectorResult.sourceId, documentId: connectorResult.documentId });
        }
      } catch {
        counts.failed += 1;
      }
    }
  }

  if (!anyConnectorEnabled) {
    notes.push('○ Connectors — all disabled for this workspace; nothing executed.');
  }

  if (aiAvailable) {
    await processNewDocs();
  }

    async function processNewDocs(): Promise<void> {

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
      } catch (error) {
        // G2: an AI call that throws must stay observable per document.
        counts.understandingFailed += 1;
        notes.push(
          buildUnderstandingSkipNote({
            kind: 'UNDERSTANDING_CALL_FAILED',
            documentId: document.id,
            sourceId: source.id,
            reason: error instanceof Error ? error.message : 'Unknown AI call error',
            provider: singleProviderType,
          }),
        );
        continue;
      }
      if (!u.understanding) {
        // G2: a null understanding must not vanish silently. Classify so
        // operators can tell no-provider / validation / other failures apart.
        counts.understandingFailed += 1;
        if (!u.aiAvailable) {
          notes.push(
            buildUnderstandingSkipNote({
              kind: 'AI_UNAVAILABLE',
              documentId: document.id,
              sourceId: source.id,
              reason: u.error ?? 'No AI provider available',
            }),
          );
        } else if (u.error && u.error.startsWith('AI output validation failed')) {
          counts.understandingValidationFailed += 1;
          notes.push(
            buildUnderstandingSkipNote({
              kind: 'VALIDATION_ERROR',
              documentId: document.id,
              sourceId: source.id,
              reason: u.error,
              provider: u.provider ?? singleProviderType,
            }),
          );
        } else {
          notes.push(
            buildUnderstandingSkipNote({
              kind: 'UNDERSTANDING_FAILED',
              documentId: document.id,
              sourceId: source.id,
              reason: u.error ?? 'Unknown understanding failure',
              provider: u.provider ?? singleProviderType,
            }),
          );
        }
        continue;
      }
      docsProcessed += 1;
      counts.documentsNew += 1;

      let entries: Array<{ id: string }> = [];
      try {
        entries = await claims.persistClaims(workspaceId, source.id, document.id, u.understanding, {
          ...(u.provider && u.model ? { ai: { provider: u.provider, model: u.model } } : {}),
        });
        counts.claimsPersisted += entries.length;
      } catch {
        continue;
      }

      // Persist content pattern if extracted
      if (u.understanding.contentPattern) {
        try {
          await patterns.persistPattern({
            workspaceId,
            documentId: document.id,
            sourceId: source.id,
            pattern: u.understanding.contentPattern,
          });
        } catch {
          notes.push('Pattern persistence failed for document ' + document.id);
        }
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
          // G3: supply the service its designed historical evidence — all
          // persisted mentions for this workspace+topic (excluding the
          // current source, appended fresh below so no source is doubled) —
          // instead of the current mention alone. Single-source topics still
          // resolve to INSUFFICIENT_HISTORY inside the unchanged service.
          const history = await loadTopicTrendEvidence(prisma, workspaceId, topic.id, source.id);
          await trends.updateTrendSignal(workspaceId, topic.id, [
            ...history,
            {
              sourceId: source.id,
              mentionStrength: mention.mentionStrength,
              relevanceScore: mention.relevanceScore,
              createdAt: new Date(),
            },
          ]);
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
  // Signal opportunities first: sales-side signals become NEW opportunities
  // for human triage, then the same-run refresh ranks them like any other
  // NEW opportunity. Deterministic, capped, never auto-converted.
  const signalOpps = await proposeSignalOpportunities(prisma, ctx.workspaceId);
  const service = new OperatorActionService(prisma);
  const ranked = await service.refreshWorkspace(ctx.workspaceId, 50);
  // WP9 Phase 3: expose how many ranked actions actually consumed
  // workspace-confirmed learning (ScoredAction.learningApplied is populated
  // by scoreCandidate only for CONFIRMED, dimension-matched influences).
  // Additive audit key only — ranking behavior is unchanged.
  const learningBoostedActions = ranked.filter((a) => (a.learningApplied ?? []).length > 0).length;
  return {
    status: 'SUCCEEDED',
    counts: {
      rankedActions: ranked.length,
      signalOpportunitiesCreated: signalOpps.created,
      signalOpportunitiesSkipped: signalOpps.skippedExisting + signalOpps.skippedBelowFloor,
      learningBoostedActions,
    },
    ...(signalOpps.notes.length > 0 ? { note: signalOpps.notes.join(' ') } : {}),
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
    const objective = opp.objective?.slice(0, 50) ?? '';
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
        objective,
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
    let brief: { id: string } | null = null;
    try {
      brief = await briefs.createBrief({ workspaceId, leadId: lead.id, researchId: researchRow.id, createdBy: ownerId ?? undefined });
      counts.briefsCreated += 1;
    } catch (error) {
      notes.push(`Brief skipped for lead ${lead.id.slice(0, 8)}: ${error instanceof Error ? error.message.slice(0, 140) : 'unknown'}.`);
      continue;
    }
    try {
      // Relevant content flows into the sales preparation path through the
      // brief's relevance slot (previously computed then discarded): the
      // strategy-creation UI reads the same deterministic suggestions live,
      // and the brief now preserves what the run computed, with provenance.
      // Empty stays null — never invented.
      const suggestions = await suggestRelevantContent(prisma, workspaceId, { leadId: lead.id });
      counts.suggestionsComputed += suggestions.length;
      if (brief && suggestions.length > 0) {
        await prisma.prospectBrief.update({
          where: { id: brief.id },
          data: {
            relevance: {
              suggestions: suggestions.map((s) => ({
                ideaId: s.ideaId,
                title: s.title,
                topicId: s.topicId,
                topicName: s.topicName,
                relevance: s.relevance,
                reason: s.reason,
              })),
              computedAt: new Date().toISOString(),
              provenance: 'daily-loop SALES stage (deterministic suggestRelevantContent; strategy UI reads the same live)',
            } as object,
          },
        });
      }
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
  const run = await prisma.dailyRun.findFirst({
    where: { workspaceId, runDate: new Date(`${ctx.runDate}T00:00:00.000Z`) },
    select: { id: true },
  });
  if (!run) {
    return { status: 'FAILED', error: 'DailyRun row missing; cannot anchor an approval snapshot.' };
  }
  // Frozen capture: plain copied values (ids, scores, reasons, versions),
  // never live references — later human decisions cannot rewrite what this
  // run observed. "What exactly was waiting at snapshot time" is answered
  // from this row alone.
  const now = new Date();
  const daysSince = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
  const [pendingActions, submittedContentReviews, submittedOutreachReviews] = await Promise.all([
    prisma.operatorAction.findMany({
      where: { workspaceId, status: 'PENDING' },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    }),
    prisma.contentReview.findMany({
      where: { workspaceId, status: 'SUBMITTED' },
      include: {
        draft: {
          select: {
            id: true, version: true,
            contentIdea: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    prisma.outreachReview.findMany({
      where: { workspaceId, status: 'SUBMITTED' },
      include: { draft: { select: { id: true, version: true, leadId: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ]);
  const items = {
    runId: run.id,
    workspaceId,
    runDate: ctx.runDate,
    capturedAt: now.toISOString(),
    actions: pendingActions.map((a) => ({
      actionId: a.id,
      identityKey: a.identityKey,
      kind: a.kind,
      title: a.title,
      score: a.score,
      status: a.status,
      reasons: a.reasons,
      evidenceLinks: a.evidenceLinks,
    })),
    contentReviews: submittedContentReviews.map((r) => ({
      reviewId: r.id,
      draftId: r.draftId,
      draftVersion: (r.draft as { version?: unknown } | null)?.version ?? null,
      contentIdeaId: (r.draft as { contentIdea?: { id?: unknown } | null } | null)?.contentIdea?.id ?? null,
      title: (r.draft as { contentIdea?: { title?: unknown } | null } | null)?.contentIdea?.title ?? null,
      waitingDays: daysSince(r.createdAt),
      requestedAt: r.createdAt.toISOString(),
    })),
    outreachReviews: submittedOutreachReviews.map((r) => ({
      reviewId: r.id,
      draftId: r.draftId,
      draftVersion: (r.draft as { version?: unknown } | null)?.version ?? null,
      leadId: (r.draft as { leadId?: unknown } | null)?.leadId ?? null,
      waitingDays: daysSince(r.createdAt),
      requestedAt: r.createdAt.toISOString(),
    })),
  };
  const counts = {
    pendingActions: pendingActions.length,
    submittedContentReviews: submittedContentReviews.length,
    submittedOutreachReviews: submittedOutreachReviews.length,
  };
  // Idempotent per run: unique (workspaceId, dailyRunId). Resume skips
  // SUCCEEDED stages, so a snapshot is normally written once; a forced
  // re-run rewrites the same key rather than duplicating history.
  await prisma.approvalSnapshot.upsert({
    where: { workspaceId_dailyRunId: { workspaceId, dailyRunId: run.id } },
    create: {
      workspaceId,
      dailyRunId: run.id,
      runDate: new Date(`${ctx.runDate}T00:00:00.000Z`),
      capturedAt: now,
      items: items as object,
      counts: counts as object,
    },
    update: { capturedAt: now, items: items as object, counts: counts as object },
  });
  return {
    status: 'SUCCEEDED',
    counts: { ...counts, snapshotItems: items.actions.length + items.contentReviews.length + items.outreachReviews.length },
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
