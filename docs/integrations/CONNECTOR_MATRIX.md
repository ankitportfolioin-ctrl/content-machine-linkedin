# Connector Reality Matrix

**Generated**: 2026-10-02
**Gate 1 update**: 2026-10-02 — research connector engine activated (see §Gate 1 below)
**Audit Method**: Repository inspection + runtime test execution (313 API tests, 263 intelligence tests, 73 web tests)
**Environment**: Development (Docker PostgreSQL, Node 24, pnpm 9.15)
**All tests pass**: ✅ Typecheck ✅ Build ✅ 640+ tests passing

---

## Gate 1 — BEFORE / AFTER

**BEFORE (audit gate)**: connector code existed but production wiring was inert —
`connectorRegistry.setCredentials()` was never called in production, so
`fetchFromAllSources()` skipped every enabled connector as "not configured";
the connector block sat inside the per-feed loop; YouTube env credentials were
read into a dead local; Reddit/Trends total provider failure dissolved into
silent `[]`; connector-owned FeedSource types were creatable but unhandled.

**AFTER (this gate)**: the registry is reachable from the production
intelligence run —
- `primeConnectorRegistry()` primes no-auth providers (REDDIT, GOOGLE_TRENDS,
  QUORA) with valid-empty credentials and YouTube only from real env creds;
  OAuth connectors stay unset (honest "not configured"). Called at the start
  of the INTELLIGENCE stage and by POST `/research/trigger`. No secrets logged.
- The connector block runs **once per intelligence cycle** (hoisted out of the
  per-feed loop); signals re-enter the SAME `SourceIngestionService` pipeline
  (SSRF-checked, canonical-URL deduped, workspace-scoped); one pass of
  `processNewDocs()` covers feed + connector documents.
- `fetchFromAllSources()` runs connectors concurrently (`Promise.allSettled`,
  registration-order results); Reddit subreddits (chunks of 5) and Trends
  topics (chunks of 4) fetch concurrently, order-preserving.
- Reddit/Trends total provider failure now throws a classified error
  (429→RATE_LIMITED preserved) instead of silent `[]`; Trends CSV fetches
  gained status checks + 15s timeouts.
- FeedSource types `reddit/youtube/google_trends/linkedin/x/instagram/tiktok`
  are refused at the API (400 + honest message); UI already offered only the
  six feed types. DB enum untouched (no migration).
- Bounded default scope (5 subreddits / 5 topics, mirroring `/research/trigger`)
  keeps per-run provider cost predictable.

**Not claimed**: no provider is newly REAL_REQUEST_VERIFIED. Live probes from
this environment: Reddit → HTTP 403 (bot mitigation), Google Trends CSV →
HTTP 400, Trends explore page → HTTP 429. Statuses below stay
WIRED_NOT_RUNTIME_VERIFIED for those providers. No platform accounts connected;
no publishing/analytics/comments work (unchanged, future gates).

---

## Research Sources

| Provider | Method | Auth | Connector File | Adapter | Registry | Normalization | Pipeline Connected | Runtime Test | Status |
|----------|--------|------|----------------|---------|----------|---------------|-------------------|--------------|--------|
| Hacker News | Official API (Firebase) | None | N/A (feedAdapters.ts) | expandHackerNewsFeed | FeedSource type | AdapterItem → SourceIngestion | INTELLIGENCE stage | ✅ VERIFIED (5 stories, 21 claims) | REAL_REQUEST_VERIFIED |
| GitHub Releases | Official Atom feed | None | N/A (feedAdapters.ts) | resolveReleaseFeedUrl → generic ATOM | FeedSource type | FeedItem → SourceIngestion | INTELLIGENCE stage | ✅ VERIFIED (generic path) | REAL_REQUEST_VERIFIED |
| RSS/Atom | Generic fetch | None | N/A (sourceIngestion.ts) | extractRssContent/extractAtomContent | FeedSource type | FeedItem → SourceIngestion | INTELLIGENCE stage | ✅ VERIFIED | REAL_REQUEST_VERIFIED |
| Sitemap | Generic fetch | None | N/A (sourceIngestion.ts) | extractSitemapContent | FeedSource type | URLs → SourceIngestion | INTELLIGENCE stage | ✅ VERIFIED | REAL_REQUEST_VERIFIED |
| User-provided URL | Generic fetch | None | N/A (sourceIngestion.ts) | extractHtmlContent | FeedSource type | ExtractedContent → SourceIngestion | INTELLIGENCE stage | ✅ VERIFIED | REAL_REQUEST_VERIFIED |
| Reddit | Public JSON API | None (primed valid-empty) | redditConnector.ts | N/A (direct) | connectorRegistry (primed, once/run) | RawSignal → NormalizedSignal → ingest → Document | INTELLIGENCE stage, once per cycle | BLOCKED here (live probe: HTTP 403); deterministic wiring ✅ | WIRED_NOT_RUNTIME_VERIFIED |
| YouTube | YouTube Data API v3 | OAuth2 + API Key (env-primed iff present) | youtubeConnector.ts | N/A (direct) | connectorRegistry (primed iff env) | RawSignal → NormalizedSignal → ingest → Document | INTELLIGENCE stage, once per cycle | NOT_CONFIGURED here (no env creds; honest) | AUTH_REQUIRED |
| Google Trends | Unofficial CSV API | None (primed valid-empty) | googleTrendsConnector.ts | N/A (direct) | connectorRegistry (primed, once/run) | RawSignal → NormalizedSignal → ingest → Document | INTELLIGENCE stage, once per cycle | BLOCKED here (live probe: CSV HTTP 400, explore 429); deterministic wiring ✅ | WIRED_NOT_RUNTIME_VERIFIED |
| LinkedIn | LinkedIn API v2 | OAuth2 (approved product req) | linkedinConnector.ts | N/A (direct) | connectorRegistry | RawSignal → NormalizedSignal | INTELLIGENCE stage (connectors) | ⚠️ NOT_RUNTIME_VERIFIED (requires approved product) | REQUIRES_APPROVAL |
| X/Twitter | X API v2 | OAuth2 PKCE | xConnector.ts | N/A (direct) | connectorRegistry | RawSignal → NormalizedSignal | INTELLIGENCE stage (connectors) | ⚠️ NOT_RUNTIME_VERIFIED (needs OAuth) | AUTH_REQUIRED |
| Instagram | Instagram Graph API | OAuth2 (FB Login) | instagramConnector.ts | N/A (direct) | connectorRegistry | RawSignal → NormalizedSignal | INTELLIGENCE stage (connectors) | ⚠️ NOT_RUNTIME_VERIFIED (needs OAuth) | AUTH_REQUIRED |
| TikTok | TikTok API v2 | OAuth2 (approved product req) | tiktokConnector.ts | N/A (direct) | connectorRegistry | RawSignal → NormalizedSignal | INTELLIGENCE stage (connectors) | ⚠️ NOT_RUNTIME_VERIFIED (needs approved product) | REQUIRES_APPROVAL |
| Facebook | Facebook Graph API | OAuth2 (Page token) | facebookConnector.ts | N/A (direct) | connectorRegistry | RawSignal → NormalizedSignal | INTELLIGENCE stage (connectors) | ⚠️ NOT_RUNTIME_VERIFIED (needs OAuth) | AUTH_REQUIRED |
| Quora | NO OFFICIAL API | N/A (primed; still throws) | quoraConnector.ts | N/A (direct) | connectorRegistry (primed) | N/A | N/A | ✅ VERIFIED (honestly reports UNAVAILABLE, incl. after priming) | UNAVAILABLE |

---

## Social Platforms

| Platform | OAuth/API | Read | Publish | Analytics | Comments | Audience | Connector | Runtime Verification | Status |
|----------|-----------|------|---------|-----------|----------|----------|-----------|---------------------|--------|
| LinkedIn | OAuth2 (v2) | ✅ (requires approved product) | ❌ | ❌ | ❌ | ❌ | linkedinConnector.ts / LinkedInAdapter | ❌ Not tested (no creds, needs approved product) | REQUIRES_APPROVAL |
| Instagram | OAuth2 (FB Graph) | ✅ (Business/Creator only) | ❌ | ❌ | ❌ | ❌ | instagramConnector.ts / InstagramAdapter | ❌ Not tested (no creds) | AUTH_REQUIRED |
| Facebook | OAuth2 (FB Graph) | ✅ (Admin Pages only) | ❌ | ❌ | ❌ | ❌ | facebookConnector.ts / FacebookAdapter | ❌ Not tested (no creds) | AUTH_REQUIRED |
| YouTube | OAuth2 + API Key | ✅ (Own channel uploads) | ❌ | ❌ | ❌ | ❌ | youtubeConnector.ts / YouTubeAdapter | ❌ Not tested (needs API key + OAuth) | AUTH_REQUIRED |
| X/Twitter | OAuth2 PKCE (v2) | ✅ (Own posts only, free tier) | ❌ | ❌ | ❌ | ❌ | xConnector.ts / XAdapter | ❌ Not tested (needs OAuth) | AUTH_REQUIRED |

---

## Internal Signals

| Signal | Producer | Consumer | Workspace Scoped | Runtime Verified | Status |
|--------|----------|----------|------------------|------------------|--------|
| Intelligence Sources → Documents → Claims | INTELLIGENCE stage | TopicClustering, ContentGap, ContentOpportunity | ✅ | ✅ (HN feed: 5 docs, 21 claims, 10 topics, 7 gaps, 1 opportunity) | WORKING |
| Topics → Trend Signals | TopicClustering → TrendSignalService | ContentOpportunity | ✅ | ✅ | WORKING |
| Content Gaps | ContentGapService | ContentOpportunity | ✅ | ✅ (7 gaps per topic) | WORKING |
| Content Opportunities | ContentOpportunityService | ContentIdea (via CONTENT stage) | ✅ | ✅ (1 created) | WORKING |
| Content Ideas | CONTENT stage | ContentPlan (via CONTENT stage) | ✅ | ✅ (1 created) | WORKING |
| Content Plans | CONTENT stage | ContentDraft (after human APPROVED) | ✅ | ✅ (1 created, requires approval) | WORKING |
| Content Drafts | DraftComposer | ContentReview (human), PublishRecord | ✅ | ✅ (0 composed, needs approval) | WORKING |
| Sales Leads | Manual import / LeadImportBatch | ProspectResearch, Qualification, Brief | ✅ | ✅ (test fixtures) | WORKING |
| Prospect Signals | ProspectResearch | Qualification, OutreachStrategy | ✅ | ✅ (test fixtures) | WORKING |
| Learning Proposals | OBSERVE_LEARN stage | Human confirmation → Ranking influence | ✅ | ✅ (0 proposed, needs data) | WORKING |
| Content Outcomes | EXECUTION stage (future) | OBSERVE_LEARN | ✅ | ⚠️ NOT_TESTED (no execution) | IMPLEMENTED_NOT_WIRED |

---

## Evidence Index

### Source Files
- **Connector Interface**: `packages/intelligence/src/researchConnectors.ts` (lines 1-507)
- **Connector Registry**: `packages/intelligence/src/connectors/index.ts` (lines 1-34)
- **Reddit Connector**: `packages/intelligence/src/connectors/redditConnector.ts` (lines 1-184)
- **YouTube Connector**: `packages/intelligence/src/connectors/youtubeConnector.ts` (lines 1-305)
- **Google Trends Connector**: `packages/intelligence/src/connectors/googleTrendsConnector.ts` (lines 1-233)
- **LinkedIn Connector**: `packages/intelligence/src/connectors/linkedinConnector.ts` (lines 1-335)
- **X Connector**: `packages/intelligence/src/connectors/xConnector.ts` (lines 1-291)
- **Instagram Connector**: `packages/intelligence/src/connectors/instagramConnector.ts` (lines 1-218)
- **TikTok Connector**: `packages/intelligence/src/connectors/tiktokConnector.ts` (lines 1-273)
- **Facebook Connector**: `packages/intelligence/src/connectors/facebookConnector.ts` (lines 1-390)
- **Quora Connector**: `packages/intelligence/src/connectors/quoraConnector.ts` (lines 1-92)
- **Feed Adapters**: `packages/intelligence/src/feedAdapters.ts` (lines 1-129)
- **Source Ingestion**: `packages/intelligence/src/sourceIngestion.ts` (lines 1-489)
- **INTELLIGENCE Stage**: `apps/api/src/worker/stages.ts` (lines 99-487)
- **Social Adapters**: `packages/social/src/adapters.ts` (lines 1-512)
- **Social API Routes**: `apps/api/src/routes/social.ts` (lines 1-604)
- **Intelligence API Routes**: `apps/api/src/routes/intelligence.ts` (lines 1-1102)
- **Prisma Schema**: `packages/db/prisma/schema.prisma` (lines 69-83, 415-429, 886-903, 920-971, 1456-1644)

### Test Files
- `packages/intelligence/src/test/connectorIsolation.test.ts` (7 tests)
- `packages/intelligence/src/test/connectorAuth.test.ts` (21 tests)
- `packages/intelligence/src/test/connectorWiring.test.ts` (9 tests, NEW Gate 1: priming, once-per-cycle, Reddit real-connector wiring, Trends isolation, honesty, dedupe)
- `packages/intelligence/src/test/connectorLive.test.ts` (2 tests, NEW Gate 1: opt-in live probes, skipped by default)
- `packages/intelligence/src/test/feedAdapters.test.ts` (9 tests)
- `packages/intelligence/src/test/sourceIngestion.test.ts` (16 tests)
- `packages/intelligence/src/test/sourceExtraction.test.ts` (29 tests)
- `apps/api/src/connectorWiring.test.ts` (3 tests, NEW Gate 1: FeedSource honesty, once-per-run spy, failure isolation in-loop)
- `apps/api/src/feedAdapters.test.ts` (3 tests)
- `apps/api/src/social.test.ts` (9 tests)
- `apps/api/src/dailyLoop.test.ts` (8 tests)
- `apps/api/src/loopStages.test.ts` (8 tests)
- `apps/api/src/signalFlow.test.ts` (10 tests)

### Runtime Verification
- **Hacker News**: 5 stories ingested, 21 claims extracted, 10 topics, 7 gaps, 1 opportunity, 1 idea, 1 plan (2026-10-02 run)
- **Social Connections**: UI shows NOT_CONFIGURED for all 5 platforms (no server credentials)
- **Quora**: Returns UNAVAILABLE with explicit reasoning (no API exists)
- **Reddit live probe (Gate 1)**: HTTP 403 from this environment (bot mitigation) → classified error surfaces via registry; BLOCKED, not verified
- **Google Trends live probe (Gate 1)**: CSV endpoints HTTP 400, explore page HTTP 429 from this environment → classified errors surface; BLOCKED, not verified
- **All tests pass**: 313 API, 263 Intelligence (+2 live skipped), 73 Web = 649+ tests