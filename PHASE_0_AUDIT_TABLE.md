# Phase 0 - Audit Table: Current Content Brain/Intelligence Implementation

| Concept | Current Implementation (file/module) | Keep / Extend / Fix / Build new |
|---|---|---|
| **Content Brain / Intelligence API Routes** | `apps/api/src/routes/intelligence.ts`, `apps/api/src/routes/brain.ts` | Keep - Existing REST endpoints for intelligence/overview, topics, trends, gaps, opportunities, sources, learning |
| **Content Brain UI** | `apps/web/src/pages/BrainPage.tsx` | Keep - Tabbed UI with Overview, Opportunities, Trends, Gaps, Sources, Learning sections |
| **Research Pipeline - Connectors (Tier 1)** | `packages/intelligence/src/connectors/redditConnector.ts`, `youtubeConnector.ts`, `googleTrendsConnector.ts`, `linkedinConnector.ts`, `xConnector.ts` | **Extend** - All Tier 1 connectors exist with unified `ResearchConnector` interface in `researchConnectors.ts`. Need to ensure status reporting and failure isolation work correctly. |
| **Research Pipeline - Connectors (Tier 2)** | `packages/intelligence/src/connectors/instagramConnector.ts`, `tiktokConnector.ts` | **Keep** - Tier 2 connectors exist but are optional. Mark as NOT_CONFIGURED when OAuth not set up. |
| **Research Pipeline - Feed Sources** | `packages/intelligence/src/feedAdapters.ts` (HackerNews, GitHub Releases) | **Keep** - Existing feed adapters for HackerNews and GitHub Releases work with generic RSS/Atom path |
| **Research Pipeline - Feed Sources (RSS/Atom/Sitemap)** | `packages/intelligence/src/sourceIngestion.ts` | **Keep** - Generic RSS/Atom/Sitemap/HTML ingestion works via `sourceIngestion.ts` |
| **Unified Connector Interface** | `packages/intelligence/src/researchConnectors.ts` | **Keep** - Unified `ResearchConnector` interface and `BaseResearchConnector` abstract class exist. All 7 connectors implement the interface. |
| **Connector Registry** | `packages/intelligence/src/researchConnectors.ts` (ConnectorRegistry class) | **Keep** - Registry exists with registration of all 7 connectors |
| **Connector Status Reporting** | Each connector has `getHealth()` method returning ConnectorStatus | **Keep** - Status enum includes AVAILABLE, DEGRADED, SOURCE_UNAVAILABLE, AUTH_REQUIRED, RATE_LIMITED, NOT_CONFIGURED, INSUFFICIENT_DATA |
| **Connector Failure Isolation** | Each connector's `fetchRecentItems` wrapped in try/catch in `ConnectorRegistry.fetchFromAllSources` | **Keep** - Failure isolation implemented in `ConnectorRegistry.fetchFromAllSources` |
| **Normalization Layer** | `packages/intelligence/src/sourceIngestion.ts` (SourceIngestionService) | **Extend** - SourceIngestionService handles RSS/ATOM/SITEMAP/WEBSITE/USER_URL. Need to ensure connector signals also pass through normalization. |
| **Feed Adapters (HN, GitHub)** | `packages/intelligence/src/feedAdapters.ts` | **Keep** - HackerNews and GitHub Releases adapters exist |
| **Deduplication Logic** | `packages/intelligence/src/sourceIngestion.ts` (urlHash, contentHash) | **Keep** - URL canonicalization, URL hash, content hash deduplication exists in sourceIngestion.ts |
| **Freshness Classification** | `packages/intelligence/src/researchConnectors.ts` (classifyFreshness in BaseResearchConnector) | **Keep** - Freshness buckets: BREAKING, FRESH, RECENT, AGING, STALE, UNKNOWN implemented in BaseResearchConnector |
| **AI Understanding Layer** | `packages/intelligence/src/sourceUnderstanding.ts` (SourceUnderstandingService) | **Keep** - SourceUnderstandingService uses AI to extract topics, claims, angles, audience, problems |
| **Topic Engine (Clustering)** | `packages/intelligence/src/topicClustering.ts` (TopicClusteringService) | **Keep** - TopicClusteringService with AI-assisted and deterministic clustering |
| **Trend Engine** | `packages/intelligence/src/trendSignal.ts` (TrendSignalService) | **Keep** - TrendSignalService with statuses: INSUFFICIENT_HISTORY, EMERGING, RELEVANT, TRENDING, STALE |
| **Audience Problem Engine** | `packages/intelligence/src/contentGap.ts` (ContentGapService.detectDeterministicGaps) | **Keep** - ContentGapService has deterministic problem detection (AUDIENCE, TOPIC, FORMAT, ANGLE, DEPTH, EVIDENCE) |
| **Content Gap Engine** | `packages/intelligence/src/contentGap.ts` (ContentGapService) | **Keep** - ContentGapService with deterministic + AI gap detection |
| **Content Opportunity Engine** | `packages/intelligence/src/contentOpportunity.ts` (ContentOpportunityService) | **Keep** - ContentOpportunityService generates opportunities with scoring |
| **Opportunity Scoring** | `packages/intelligence/src/contentOpportunity.ts` (scoreOpportunity with 12 dimensions) | **Keep** - 12-dimensional scoring with evidence and critical failure detection |
| **Decision Engine Integration** | `apps/api/src/worker/stages.ts` (decision stage) | **Keep** - Decision stage uses OperatorActionService to rank opportunities |
| **Content Machine Integration** | `apps/api/src/worker/stages.ts` (content stage) | **Keep** - Content stage creates ideas from opportunities, generates plans, composes drafts |
| **Content Machine - Plan Generation** | `packages/content/src/plan.ts` (ContentPlanService) | **Keep** - ContentPlanService with AI generation and validation |
| **Content Machine - Draft Composition** | `packages/content/src/compose.ts` (DraftComposer) | **Keep** - DraftComposer with evidence binding |
| **Lineage Tracking** | `ContentOpportunity` model has originKind/originId; `ContentIdea` has opportunityId; `ContentPlan` has opportunityId | **Keep** - Lineage chain exists: post → opportunity → topic → signal → source → evidence |
| **Learning Engine** | `packages/learning/src/derivation.ts` (LearningDerivationService) | **Keep** - LearningDerivationService derives proposals from metrics |
| **Content DNA / Performance Learning** | `packages/learning/src/derivation.ts`, `packages/learning/src/contentOutcome.ts` | **Keep** - Learning from published content performance |
| **Learning Maturity Gating** | `packages/learning/src/maturity.ts` | **Keep** - Maturity gates: PROPOSED → CONFIRMED → REJECTED → REVOKED |
| **Human Approval Boundary** | `ContentPlan.status` (DRAFT/APPROVED/ARCHIVED), `ContentReview` with SUBMITTED/APPROVED/REJECTED | **Keep** - Human approval required before publish |
| **Execution Boundary** | `dailyExecutionCap` default 0, EXECUTION stage SKIPPED | **Keep** - Execution SKIPPED when no LinkedIn integration |
| **Workspace Isolation** | All models have `workspaceId` with `@@index([workspaceId])` and Cascade delete | **Keep** - All intelligence models scoped by workspaceId |
| **Connector Status in UI** | `apps/web/src/pages/BrainPage.tsx` (ConnectorsSection) | **Keep** - ConnectorsSection shows status, last sync, connect/refresh/disconnect buttons |
| **Content Brain Dashboard UI** | `apps/web/src/pages/BrainPage.tsx` (Overview, Opportunities, Trends, Gaps, Sources, Learning sections) | **Keep** - Full dashboard with all sections |
| **Type Definitions / Schemas** | `packages/schemas/src/index.ts` (Zod schemas for all intelligence APIs) | **Keep** - Comprehensive Zod schemas for all intelligence APIs |
| **Daily Loop Stages** | `apps/api/src/worker/stages.ts` (INTELLIGENCE, DECISION, CONTENT, SALES, APPROVAL_SNAPSHOT, EXECUTION, OBSERVE_LEARN, DIGEST) | **Keep** - Full daily loop with 8 stages |
| **Feed Sources (DB)** | `FeedSource` model with FeedSourceType enum (RSS, ATOM, HACKERNEWS, GITHUB_RELEASES, BLOG, SITE, REDDIT, YOUTUBE, GOOGLE_TRENDS, LINKEDIN, X, INSTAGRAM, TIKTOK) | **Keep** - FeedSource model supports all connector types |
| **Intelligence Source Model** | `IntelligenceSource` model with sourceType enum (ARTICLE, RSS, ATOM, SITEMAP, WEBSITE, USER_URL, REDDIT, YOUTUBE, GOOGLE_TRENDS, LINKEDIN, X, INSTAGRAM, TIKTOK) | **Keep** - IntelligenceSource model with all connector types |
| **Source Document Model** | `SourceDocument` model with rawContent, cleanContent, extractionMethod, extractionStatus | **Keep** - SourceDocument stores raw and cleaned content |
| **Source Claims Model** | `SourceClaim` model with claimText, claimType, evidenceText, confidence, status | **Keep** - SourceClaim stores extracted claims with provenance |
| **Topic Model** | `Topic` model with canonicalName, mentions, trendSignals, opportunities, gaps | **Keep** - Topic model with relationships |
| **TrendSignal Model** | `TrendSignal` model with status (INSUFFICIENT_HISTORY/EMERGING/RELEVANT/TRENDING/STALE) | **Keep** - TrendSignal with scoring |
| **ContentOpportunity Model** | `ContentOpportunity` with originKind/originId for lineage | **Keep** - ContentOpportunity with lineage fields |
| **ContentGap Model** | `ContentGap` with gapType (AUDIENCE/TOPIC/FORMAT/ANGLE/DEPTH/EVIDENCE) | **Keep** - ContentGap with importanceScore and evidence |
| **LearningProposal Model** | `LearningProposal` with maturity status (PROPOSED/CONFIRMED/REJECTED/REVOKED) | **Keep** - LearningProposal with maturity gating |
| **Feed Adapters** | `packages/intelligence/src/feedAdapters.ts` (HackerNews, GitHub Releases) | **Keep** - Dedicated adapters for HN and GitHub |
| **SSRF Protection** | `packages/intelligence/src/ssrfProtection.ts` | **Keep** - SSRF protection for source ingestion |
| **Connector Registry** | `ConnectorRegistry` class in `researchConnectors.ts` | **Keep** - Registry with credential/config management |

---

## Summary

**Already Implemented (Keep):**
- Unified connector interface with 7 connectors (5 Tier 1, 2 Tier 2)
- Connector registry with credential/config management
- Connector status reporting with honest statuses
- Failure isolation in registry
- Feed adapters (HackerNews, GitHub)
- Source ingestion with normalization, dedup, freshness
- AI understanding layer (topics, claims, angles, problems)
- Topic clustering (AI-assisted + deterministic)
- Trend detection with 5 statuses
- Content gap detection (deterministic + AI)
- Content opportunity generation with 12-dimension scoring
- Decision engine integration (existing OperatorActionService)
- Content Machine integration (plan generation, draft composition)
- Lineage tracking (opportunity → idea → plan → draft → version)
- Learning engine with maturity gating
- Human approval boundary (ContentPlan status, ContentReview)
- Execution boundary (dailyExecutionCap=0, EXECUTION stage SKIPPED)
- Workspace isolation (all models have workspaceId)
- UI for connector status and Content Brain dashboard
- Comprehensive Prisma schema with all models
- Daily loop with 8 stages

**Needs Extension/Fix:**
1. **Normalization Layer**: SourceIngestionService handles RSS/ATOM/SITEMAP/WEBSITE/USER_URL but connector signals (Reddit, YouTube, etc.) also need to pass through same normalization pipeline
2. **Connector Status**: Some connectors return hardcoded health status instead of real-time checks
3. **Deduplication**: Connector signals need to go through same dedup as feed sources
3. **Freshness**: Connector signals need freshness classification applied
4. **AI Unavailable Handling**: Need explicit AI_ANALYSIS_DEFERRED status when AI unavailable
5. **Tier 2 Connectors**: Instagram/TikTok marked as NOT_CONFIGURED when OAuth not set up
6. **Normalization Tests**: Need test proving different sources produce comparable ResearchSignal records
6. **Dedup Tests**: Need test proving cross-source dedup works
7. **Freshness Tests**: Need test proving UNKNOWN freshness for signals without timestamps