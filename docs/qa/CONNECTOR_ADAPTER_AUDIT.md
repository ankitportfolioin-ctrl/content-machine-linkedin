# Connector + Adapter Architecture Audit

**Date**: 2026-10-02
**Method**: Repository-first inspection (imports/calls traced, no code modified) + existing test-suite execution
**Quality gates this gate**: typecheck ✅ · build ✅ · API 310 pass / 3 skipped · Intelligence 254 pass · Web 73 pass
**Rule applied**: file existence ≠ implementation; mock test ≠ runtime proof; UI card ≠ connection; OAuth URL ≠ connection; DB row ≠ verification.

---

## 1. Executive summary

Two parallel connector systems exist, both real code, neither fully live end-to-end:

- **(A) Research connectors** (`packages/intelligence`): 9 connectors behind a `ResearchConnector` interface + `ConnectorRegistry`. Fetch code is genuine (native `fetch()` against official/public endpoints). The registry is populated at import time. **But production never supplies credentials**: `setCredentials()` is called only in tests; `stages.ts` and `routes/intelligence.ts` never call it, so `fetchFromAllSources()` skips every enabled connector as "not configured". The in-loop connector block is therefore **inert at runtime**. Additionally it sits **inside the per-feed loop** (`stages.ts:141-474`), so it would re-run per feed if credentials ever appear.
- **(B) Social adapters** (`packages/social`): 5 OAuth adapters behind a `SocialAdapter` interface, wired to real API routes (`/social/*`: connect/refresh/verify/pause/disconnect/callback) with AES-256-GCM token storage. All 5 report **NOT_CONFIGURED** on this server (no `*_CLIENT_ID/_SECRET` in env). No live verification possible here. Publishing capability is **hardcoded `false` for every platform** in two places (`routes/social.ts:131-137`, `routes/readiness.ts:155-162`), and EXECUTION is unconditionally SKIPPED (`stages.ts:972-985`). Publishing is therefore NOT_IMPLEMENTED by construction, not merely unconfigured.
- **(C) Feed/source pipeline** (the part that actually works): `FeedSource` → `SourceIngestionService` → `IntelligenceSource/SourceDocument` → understanding → claims → topics → trends → gaps → opportunities → ideas → plans → drafts. **REAL_REQUEST_VERIFIED only for Hacker News + generic RSS/ATOM/HTML/URL paths** (2026-10-02 run: 5 HN story documents, 21 claims). Everything else is code without runtime proof.
- **No scraping found**: extraction uses `jsdom` (server-side DOM parse of already-fetched HTML) + `xml2js` for feeds. No Playwright/Puppeteer/Cheerio/axios in product code. Playwright exists only as an MCP tool config (`opencode.json`); `jsdom` in `apps/web` is test env only.
- **Quora is the model citizen**: no official API exists, and the connector honestly throws `UNAVAILABLE` instead of fabricating.

Companion matrix: `docs/integrations/CONNECTOR_MATRIX.md`.

---

## 2. Connector architecture discovered

**Location**: `packages/intelligence/src/researchConnectors.ts` (507 lines), re-exported via `packages/intelligence/src/index.ts:14` and `packages/intelligence/src/connectors/index.ts`.

| Element | Definition | Evidence |
|---|---|---|
| `SourceType` union | `REDDIT YOUTUBE GOOGLE_TRENDS LINKEDIN X INSTAGRAM TIKTOK RSS ATOM HACKERNEWS GITHUB_RELEASES BLOG SITE USER_URL` | researchConnectors.ts:8-22 |
| `ResearchConnector` interface | `sourceType, displayName, capabilities, isConfigured, getAuthorizationUrl, exchangeCode, refreshAccessToken, fetchRecentItems, getHealth, getCapabilities` | researchConnectors.ts:156-177 |
| `BaseResearchConnector` | Default `isConfigured` (valid + non-empty), `generateDedupeHash`, `classifyFreshness`, shared `getCapabilities` | researchConnectors.ts:183-224 |
| `RawSignal` / `NormalizedSignal` | External fetch shape → workspace-scoped normalized shape with `dedupeHash`, `freshness`, optional AI `understanding` | researchConnectors.ts:54-92 |
| `normalizeSignal`, `generateDedupeHash`, `stripTrackingParams`, `extractKeywords`, `classifyFreshnessStatic` | Pure normalization helpers | researchConnectors.ts:230-332 |
| `EngagementMetric` + `extractEngagementMetric` | Typed per-source engagement (REDDIT_SCORE, YOUTUBE_STATS, X_METRICS, LINKEDIN_IMPRESSIONS, INSTAGRAM_ENGAGEMENT, TIKTOK_STATS, GOOGLE_TRENDS_INTEREST, UNKNOWN) — defined but **never consumed by ranking** (capabilities docs state engagement is never stored/used) | researchConnectors.ts:339-417 |
| `ConnectorRegistry` | `register / getConnector / getAllConnectors / getTier1Connectors / getTier2Connectors / setCredentials / getCredentials / setConfig / getConfig / fetchFromAllSources / fetchAndNormalizeFromAllSources`; singleton `connectorRegistry` | researchConnectors.ts:419-507 |
| Registration | All 9 connectors registered at module import | connectors/index.ts:24-32 |

**Failure isolation**: `fetchFromAllSources` try/catches per connector and returns `{ signals, errors }` (researchConnectors.ts:460-491). Verified by `connectorIsolation.test.ts` (7 tests).

---

## 3. Adapter architecture discovered

Two distinct adapter layers exist (duplication noted in §8):

**3a. Feed adapters** — `packages/intelligence/src/feedAdapters.ts` (129 lines). Not a class hierarchy; two pure functions:
- `expandHackerNewsFeed(feedUrl)` — official HN Firebase API (`https://hacker-news.firebaseio.com/v0/topstories.json` → `/item/{id}.json`), returns `AdapterItem[]` (url/title/publishedAt). Ask-HN items keep the discussion URL as canonical (never invented). Throws on failure → caller failure-isolates the feed. (feedAdapters.ts:85-129)
- `resolveReleaseFeedUrl(url)` — pure rewrite `github.com/<owner>/<repo>` → `.../releases.atom`, consumed by the generic ATOM path. (feedAdapters.ts:61-70)
- `isFeedUrl(url)` — regex for `.rss/.atom/.xml` or `/rss|/atom|/feed|/feeds`. (feedAdapters.ts:53-55)

**3b. Social adapters** — `packages/social/src/adapters.ts` (512 lines) behind `SocialAdapter` interface (`packages/social/src/types.ts:81-91`): `platform, displayName, capabilities(), authorizationUrl, exchangeCode, refreshAccessToken, fetchRecentItems(accessToken, limit)`. Five classes: `YouTubeAdapter, InstagramAdapter, FacebookAdapter, LinkedInAdapter, XAdapter`. Lookup via `getSocialAdapter()` / `allSocialAdapters()` over a static `ADAPTERS` record (adapters.ts:498-512) — there is **no dynamic registry** (no `register()`); adding a platform requires editing the record. Shared `fetchJson()` maps 401/403→EXPIRED, 429→RATE_LIMITED, else API_UNAVAILABLE (types.ts:121-170). `AdapterRegistry` interface is declared (types.ts:93-96) but **never implemented or used** — SKELETON.

**3c. Extraction** — `packages/shared/src/intelligence/sourceExtraction.ts` (355 lines, `jsdom` + `xml2js`): `extractHtmlContent` (boilerplate stripping, main-content heuristics), `extractRssContent`/`extractAtomContent` (→ `FeedItem[]`), `extractSitemapContent` (→ urls). Server-side parse of fetched bytes only — not browser automation.

---

## 4. Registry architecture discovered

| Registry | Type | Register | Credential store | Consumer | Verdict |
|---|---|---|---|---|---|
| `connectorRegistry` (intelligence) | `Map<string, ResearchConnector>` + credential/config maps, in-memory singleton | Static, at import (`connectors/index.ts:24-32`) | `setCredentials()` — **production never calls it** (only `connectorIsolation.test.ts` + `connectorAuth.test.ts`); `getCredentials()` always misses in prod | `stages.ts:276`, `intelligence.ts:1059` | WIRED_NOT_RUNTIME_VERIFIED; credential leg IMPLEMENTED_NOT_WIRED |
| `ADAPTERS` (social) | Static `Record<SocialPlatform, SocialAdapter>` | Hardcoded literal (adapters.ts:498-504) | DB-backed: `SocialConnection.encryptedAccess/encryptedRefresh` + env `*_CLIENT_ID/_SECRET` | `routes/social.ts` (all handlers) | WIRED_NOT_RUNTIME_VERIFIED (routes real, no creds on server) |
| `AdapterRegistry` interface | Declared, types.ts:93-96 | N/A | N/A | No imports anywhere | SKELETON |

---

## 5. Research pipeline call graph (traced, not assumed)

```
FeedSource rows (workspace-scoped, feeds.ts CRUD)
  └─ INTELLIGENCE stage (stages.ts:99-487)
       ├─ HACKERNEWS type → expandHackerNewsFeed() [feedAdapters.ts:85]
       │    └─ per story URL → SourceIngestionService.ingest() [sourceIngestion.ts:32]
       ├─ GITHUB_RELEASES type → resolveReleaseFeedUrl() [feedAdapters.ts:61] → ingest()
       ├─ else → ingest(feedUrl) [sourceIngestion.ts:32]
       │    ├─ checkSsrfProtection() [ssrfProtection.ts]
       │    ├─ fetch() (native, generic UA, size/timeout caps) [sourceIngestion.ts:100]
       │    ├─ detectContentType → extractRss/Atom/Sitemap/HtmlContent [shared/sourceExtraction.ts]
       │    └─ persist IntelligenceSource + SourceDocument [sourceIngestion.ts:282-316]
       ├─ RSS/ATOM → candidate item URLs → ingest() each (≤MAX_ITEMS_PER_FEED)
       ├─ SITEMAP → candidate URLs → ingest() each
       ├─ [DEAD BLOCK] connectorRegistry.fetchFromAllSources() [stages.ts:276]
       │    └─ always yields 0 signals in prod (no setCredentials) — errors appended to notes
       └─ processNewDocs() per NEW document [stages.ts:310-473]:
            SourceUnderstandingService.understand() (AI)
              → ClaimLedgerService.persistClaims() → SourceClaim
              → TopicClusteringService.normalizeTopics() → Topic + TopicMention
              → TrendSignalService.updateTrendSignal() → TrendSignal
              → ContentGapService.detectGaps() → ContentGap
              → ContentOpportunityService.generateOpportunity()
                → prisma.contentOpportunity.create() [stages.ts:450-469]
CONTENT stage (stages.ts:509-682):
  NEW Opportunity → ContentIdea (provenance-carrying, no AI) [stages.ts:537-578]
  Idea w/o plan → ContentPlanService.generatePlan() (AI) → validatePlan() [stages.ts:617-652]
  APPROVED plan w/o draft → DraftComposer.composeFromPlan() [stages.ts:662-673]
```

Social-adapter path (separate, ends at inspiration, not at Content Brain pipeline):
```
BrainPage/SettingsPage → listSocialConnections() → GET /api/v1/social/connections [social.ts:116]
Connect → POST /:platform/connect → authorizationUrl → platform → /callback/:platform → exchangeCode → encryptToken → SocialConnection upsert [social.ts:523-591]
Refresh → POST /:platform/refresh → adapter.fetchRecentItems → SocialPost upsert [social.ts:282-391]
Verify → POST /:platform/verify → fetchRecentItems(limit=1) probe [social.ts:393-452]
Save idea → POST /posts/:postId/save-idea → ContentIdea DRAFT (social-inspiration evidenceSnapshot, no claims/topics) [social.ts:473-510]
```

---

## 6. Platform-by-platform matrix

| Platform | Connector File | Adapter | Registry | Auth | Real Request | Data Normalization | Pipeline Connected | Tests | Runtime Verified | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| RSS | — (generic) | extractRssContent [shared] | FeedSourceType.RSS | None | `fetch()` URL | FeedItem → ingest | INTELLIGENCE | sourceExtraction 29 ✅, sourceIngestion 16 ✅ | YES (via HN story sub-fetches + prior runs) | REAL_REQUEST_VERIFIED |
| Atom | — (generic) | extractAtomContent [shared] | FeedSourceType.ATOM | None | `fetch()` URL | FeedItem → ingest | INTELLIGENCE | same as RSS | YES (GitHub releases.atom path design; generic path live) | REAL_REQUEST_VERIFIED |
| Websites/Blogs | — (generic) | extractHtmlContent [shared] | FeedSourceType.BLOG/SITE | None | `fetch()` URL | ExtractedContent → ingest | INTELLIGENCE | sourceExtraction 29 ✅ | YES (HN story HTML pages: word counts 81–4193 recorded) | REAL_REQUEST_VERIFIED |
| Sitemaps | — (generic) | extractSitemapContent [shared] | (SITEMAP SourceType; no FeedSourceType) | None | `fetch()` URL | URLs → ingest | INTELLIGENCE | sourceExtraction ✅ | PARTIAL (parser tested; no live sitemap run this gate) | WIRED_NOT_RUNTIME_VERIFIED |
| User URLs | — (generic) | extractHtmlContent | (USER_URL SourceType) | None | `fetch()` URL | ExtractedContent → ingest | INTELLIGENCE + POST /intelligence/sources | sourceIngestion 16 ✅ | YES | REAL_REQUEST_VERIFIED |
| Hacker News | feedAdapters.ts:85 | expandHackerNewsFeed | FeedSourceType.HACKERNEWS | None (public Firebase API) | `topstories.json` + `/item/{id}.json` | AdapterItem → ingest → Document/Claims | Full chain to ContentPlan | feedAdapters ✅ (API 3 incl. live-behavior), dailyLoop ✅ | YES — 2026-10-02: 5 docs, 21 claims, 10 topics, 1 opportunity, 1 idea, 1 plan | REAL_REQUEST_VERIFIED |
| GitHub | feedAdapters.ts:61 | resolveReleaseFeedUrl (pure) | FeedSourceType.GITHUB_RELEASES | None (public Atom) | Rewritten releases.atom via generic fetch | FeedItem → ingest | INTELLIGENCE | feedAdapters ✅ (resolver unit) | NO live releases.atom ingestion observed | WIRED_NOT_RUNTIME_VERIFIED |
| Reddit | connectors/redditConnector.ts | none (direct) | connectorRegistry | None (public `.json`) | `reddit.com/r/{sub}/{sort}.json` (real code, UA header, 15s timeout) | RawSignal→normalizeSignal (code real) | INTELLIGENCE connector block — inert (no creds set; block inside feed loop) | connectorIsolation/Auth ✅ (mock registries — UNIT_TEST_ONLY) | NO | WIRED_NOT_RUNTIME_VERIFIED |
| Google Trends | connectors/googleTrendsConnector.ts | none | connectorRegistry | None (**unofficial** CSV endpoints) | `trends.google.com/trends/api/.../csv` (fragile, unofficial) | RawSignal (code real) | Same inert block | UNIT_TEST_ONLY | NO | WIRED_NOT_RUNTIME_VERIFIED (plus unofficial-API risk) |
| YouTube (research) | connectors/youtubeConnector.ts | none | connectorRegistry | OAuth2 + API key (`YOUTUBE_API_KEY`, `YOUTUBE_ACCESS_TOKEN` env exist) | `googleapis.com/youtube/v3/search` + `/videos` (real code) | RawSignal (code real) | Same inert block (env creds read into dead local, never setCredentials — stages.ts:271-274) | UNIT_TEST_ONLY | NO | AUTH_REQUIRED |
| LinkedIn (research) | connectors/linkedinConnector.ts | none | connectorRegistry | OAuth2; **approved product required** (`Share on LinkedIn`/`Community Mgmt`), else honest 403→AUTH_REQUIRED | `api.linkedin.com/v2/userinfo`, `ugcPosts` (real code) | RawSignal (code real) | Same inert block | UNIT_TEST_ONLY | NO | REQUIRES_APPROVAL |
| X (research) | connectors/xConnector.ts | none | connectorRegistry | OAuth2 PKCE | `api.twitter.com/2/users/me`, `/tweets`, `/mentions` (real code) | RawSignal (code real) | Same inert block | UNIT_TEST_ONLY | NO | AUTH_REQUIRED |
| Instagram (research) | connectors/instagramConnector.ts | none | connectorRegistry | OAuth2 FB Login; business/creator + Page link required | `graph.facebook.com/v19.0/...` (real code) | RawSignal (code real) | Same inert block | UNIT_TEST_ONLY | NO | AUTH_REQUIRED |
| TikTok (research) | connectors/tiktokConnector.ts | none | connectorRegistry | OAuth2; **approved product / eligibility review** | `open.tiktokapis.com/v2/...` (real code) | RawSignal (code real) | Same inert block | UNIT_TEST_ONLY | NO | REQUIRES_APPROVAL |
| Facebook (research) | connectors/facebookConnector.ts | none | connectorRegistry | OAuth2; Page access token required | `graph.facebook.com/v19.0/...` (real code) | RawSignal (code real) | Same inert block | UNIT_TEST_ONLY | NO | AUTH_REQUIRED |
| Quora | connectors/quoraConnector.ts | none | connectorRegistry (registered) | None exists | NONE — `fetchRecentItems` throws UNAVAILABLE; `getHealth` returns UNAVAILABLE | N/A | N/A (correctly absent) | connectorAuth ✅ (expects UNAVAILABLE) | YES (unavailability honestly verified) | UNAVAILABLE |
| LinkedIn (social) | packages/social/adapters.ts:321 | LinkedInAdapter | ADAPTERS record | OAuth2 (`LINKEDIN_CLIENT_ID/_SECRET`) | `userinfo` + `ugcPosts` (real code) | SocialItem → SocialPost | Inspiration-only (save-idea → DRAFT, no claims) | social.test 9 ✅ | NO (server NOT_CONFIGURED) | WIRED_NOT_RUNTIME_VERIFIED |
| Instagram (social) | adapters.ts:143 | InstagramAdapter | ADAPTERS record | FB OAuth (`INSTAGRAM_CLIENT_ID`) | `/me/accounts` + `/{igId}/media` (real) | SocialItem → SocialPost | Inspiration-only | social.test ✅ | NO (NOT_CONFIGURED) | WIRED_NOT_RUNTIME_VERIFIED |
| Facebook (social) | adapters.ts:239 | FacebookAdapter | ADAPTERS record | FB OAuth (`FACEBOOK_CLIENT_ID`) | `/me/accounts` + `/{page}/posts` (real) | SocialItem → SocialPost | Inspiration-only | social.test ✅ | NO (NOT_CONFIGURED) | WIRED_NOT_RUNTIME_VERIFIED |
| YouTube (social) | adapters.ts:44 | YouTubeAdapter | ADAPTERS record | Google OAuth (`YOUTUBE_CLIENT_ID/_SECRET`) | `/channels?mine=true` + `/playlistItems` (real) | SocialItem → SocialPost | Inspiration-only | social.test ✅ | NO (NOT_CONFIGURED) | WIRED_NOT_RUNTIME_VERIFIED |
| X (social) | adapters.ts:410 | XAdapter | ADAPTERS record | OAuth2 PKCE (`X_CLIENT_ID`) | `/users/me`, `/users/{id}/tweets` (real) | SocialItem → SocialPost | Inspiration-only | social.test ✅ | NO (NOT_CONFIGURED) | WIRED_NOT_RUNTIME_VERIFIED |
| Internal content signals | stages.ts DECISION/sales | n/a (SQL) | n/a | n/a | n/a (DB rows) | OperatorAction | Human triage | loopStages/signalFlow ✅ | YES (test DB) | WORKING |
| Internal sales signals | ProspectSignal rows | n/a (SQL) | n/a | n/a | n/a (DB rows) | Opportunity (originKind/originId) | NEW-opportunity proposal | signalFlow ✅ | YES (test DB) | WORKING |
| Audience signals | AudienceProblemService | Reddit/YouTube inputs | n/a | n/a | Depends on connectors above | AudienceProblemGroup | Opportunity scoring context | audienceProblems 3 ✅ | NO live (inputs unavailable) | WIRED_NOT_RUNTIME_VERIFIED |

---

## 7. Runtime verification evidence

Executed this gate (no code changed):
- `pnpm typecheck` ✅ (10 packages) · `pnpm build` ✅ (API + Web) · API 310 pass/3 skipped · Intelligence 254 pass · Web 73 pass.
- Historical live evidence (prior gate, cited not re-run): 2026-10-02 HN run — `fetched:1 failed:5 documentsNew:5 claimsPersisted:21 topicsNormalized:10 opportunitiesCreated:1`, plus `ideasCreated:1 plansCreated:1`; provenance HN item → inrng.com story → 5 claims → plan `6d9fc5b2`.
- `feedAdapters.test.ts` (API, 3 tests incl. "expands an HN frontpage feed into story sources with provenance", ~1.6s) — consistent with live HN API reachability from test env.
- `social.test.ts` (9 tests): proves honest states (NOT_CONFIGURED without creds, 409s, isolation) — explicitly NOT a connection proof.
- `connectorIsolation.test.ts` / `connectorAuth.test.ts`: prove failure isolation + auth-state mapping using **mock connectors** — UNIT_TEST_ONLY, not provider proof.
- Deliberately NOT performed: live OAuth flows, live credentialed pulls, LinkedIn product application. No results fabricated.

---

## 8. Fake/mock/demo implementations found

- **None in production paths.** No stubbed success responses, no demo content injected by the loop. `seed-demo.ts` (`apps/api/src/seed-demo.ts`) exists as a dev script — scope NOT audited in this gate (UNKNOWN, not on any production call path found).
- Test-only mocks: `connectorIsolation.test.ts` / `connectorAuth.test.ts` use synthetic connectors against fresh `ConnectorRegistry` instances — correctly scoped, never shipped.
- `signalFlow.test.ts` / `loopStages.test.ts` use real DB rows + real stages — genuine integration evidence for internal signals.
- Honesty mechanisms verified real: Quora UNAVAILABLE, LinkedIn 403→AUTH_REQUIRED mapping, `NOT_CONFIGURED` before any network call, per-feed failure isolation, publishing hardcoded false.

---

## 9. Implemented-but-unwired components

1. **Research connector credential supply**: `setCredentials()` exists (researchConnectors.ts:444) but production never calls it. All 9 connectors' `fetchRecentItems` are implemented yet unreachable in-loop. Fix location: `stages.ts` INTELLIGENCE block + a credential source (env for no-auth providers; DB/OAuth for the rest).
2. **`AdapterRegistry` interface** (social/types.ts:93-96): declared, zero usages — SKELETON. Either implement or delete.
3. **`extractEngagementMetric()`** (researchConnectors.ts:350-417): full typed implementation, zero call sites — engagement deliberately excluded from ranking. Keep with a comment, or remove to avoid implying capability.
4. **`fetchAndNormalizeFromAllSources()`** (researchConnectors.ts:496-504): zero call sites.
5. **YouTube env credentials** (`YOUTUBE_API_KEY`, `YOUTUBE_ACCESS_TOKEN` in env schema; read at stages.ts:263/272 into a local never passed to the registry) — half-plumbed, then dropped.
6. **FeedSource types REDDIT/YOUTUBE/GOOGLE_TRENDS/LINKEDIN/X/INSTAGRAM/TIKTOK** (feeds.ts:21-26, schema enum): creatable via API, but the INTELLIGENCE stage has no branch for them — they fall into generic URL fetch of whatever URL the user typed. The feed-type label therefore overpromises.

---

## 10. Wired-but-unverified components

1. All 9 research connectors' `fetchRecentItems`/`getHealth` — real HTTP code, zero live calls observed.
2. All 5 social adapters + full OAuth route set (`social.ts` connect/refresh/verify/pause/resume/disconnect/callback) — wired, tested with mocks/absent-creds, never exercised against a real platform.
3. Google Trends connector specifically — unofficial CSV endpoints; even after wiring, expect breakage/blocks. Treat as fragile by design.
4. `/research/trigger` (intelligence.ts:1029-1100) — wired to the same credential-less registry call; will return `discovered:0` + connectorErrors until §9.1 is fixed. (Note: it also contains `void credentials;` at line 1054 — dead code confirming the gap.)
5. Social `save-idea` → ContentIdea — wired, tested, but produces claim-less DRAFTs (no topic/claim/trend linkage). By design (inspiration), but must never be mistaken for pipeline provenance.

---

## 11. Missing connectors

- **MISSING: GitHub API connector.** WHY: only releases-atom rewrite exists; no star/commit/PR/issue signals. REQUIRED: public REST/GraphQL (no auth for public repos, token for rate limits). LOCATION: new `githubConnector.ts` + `FeedSourceType` branch or generic URL. TEST: live `api.github.com/repos/{o}/{r}/releases` fetch → SourceDocument.
- **MISSING: Publishing adapters (all platforms).** WHY: `publishing:false` hardcoded; EXECUTION always SKIPPED. REQUIRED: per-platform write scopes + approved products (LinkedIn Share/Community Mgmt; X paid tiers; Meta publishing permissions). LOCATION: new `packages/social/src/publishers.ts` + readiness `publishing` computation + EXECUTION stage. TEST: sandbox/test-account post, then delete.
- **MISSING: Analytics/comments/audience readers (all platforms).** WHY: `analytics/comments/audience:false` hardcoded in social capabilities. REQUIRED: platform insights APIs + approvals. TEST: pull metrics for an owned test post.
- **MISSING: Credential store for research connectors.** WHY: in-memory map only; nothing persists per-workspace research credentials. REQUIRED: `ResearchConnection` model (mirroring `SocialConnection`) or explicit env mapping. TEST: Reddit live fetch in-loop after fix.
- **MISSING: Sitemap discovery automation.** WHY: sitemap parsing exists but no feed-type branch auto-expands sitemaps like HN. Minor.
- No browser-scraping missing piece is acknowledged as missing: correctly absent by design (constitution §8).

---

## 12. Missing capabilities (per platform, honest)

Publishing/analytics/comments/audience: **NOT_IMPLEMENTED on all 9 providers** — no code, no routes, no schema beyond `SocialPost` storage. Read path only. LinkedIn/TikTok additionally gated on **product approval** that no code can substitute.

---

## 13. Authentication/OAuth status

- Social OAuth: authorization-URL builders + code exchange + refresh (where supported) implemented per platform; callback binds `state→workspace` with 10-min TTL in-memory map (single-process shape — noted in code comment, social.ts:84-87). Token refresh attempted once on EXPIRED/REVOKED during refresh (social.ts:310-339), else connection marked EXPIRED/ERROR.
- Research connectors: OAuth methods implemented per class; Reddit/GoogleTrends/Quora correctly no-op or throw. No stored research credentials anywhere (see §9.1).
- Env contract (`.env.example` + `config/env.ts`): `*_CLIENT_ID/_SECRET` for INSTAGRAM, FACEBOOK, LINKEDIN, YOUTUBE(+`_API_KEY`, `_ACCESS_TOKEN`), X; `SOCIAL_CONNECTOR_KEY`; AI keys. All optional → honest NOT_CONFIGURED paths. **Server state: none of the platform credentials configured.**
- LinkedIn/TikTok refresh: explicitly non-silent (re-connect required) — documented in code, not a bug.

---

## 14. Token/security status

- AES-256-GCM via `SOCIAL_CONNECTOR_KEY` (64 hex chars), random IV per encryption, `iv:tag:ciphertext` storage (tokenVault.ts:39-56). `vaultGuard()` blocks connect/callback without key (social.ts:75-82). Tokens never sent to frontend (only `accountLabel`, status, counts). `tokenVault.test.ts` (3 ✅).
- SSRF: `checkSsrfProtection()` gates every ingest (sourceIngestion.ts:78); DNS via system resolver fix previously landed. Localhost blocked (test feeds blocked by design).
- Workspace isolation: every connector-persisted row carries `workspaceId` (`SocialConnection` unique `[workspaceId, platform]`; `SocialPost` unique `[workspaceId, platform, externalId]`; all intelligence rows workspace-scoped; cross-workspace tests pass — authFlow, social, loopFaults).
- No credential logging found: AI validation logs strip secrets (test asserts `not.toContain('API_KEY')`); connector errors carry messages only.
- Residual risk: OAuth `state` map is in-memory (multi-instance deployments must externalize — code says so). No token-expiry scheduler; expiry surfaces lazily on refresh/verify.

---

## 15. Workspace isolation status

VERIFIED (tests, not claims): `social.test.ts` (isolated workspaces, cross-user 403s), `authFlow.test.ts` (cross-workspace forbidden), `loopFaults.test.ts` (full loops isolated across two workspaces), `connectorIsolation.test.ts` (per-connector failure containment). All queries observed filter by `workspaceId`; joins (`socialPost→connection`, `lineage`) re-scope by workspace.

---

## 16. Content Brain integration status

Complete chain exists **only** for feed/URL-sourced intelligence: Source → Document → Claims → Topics → Trends → Gaps → Opportunity → Idea → Plan → (human APPROVED) → Draft — code-traced §5, runtime-proven for HN.
- Research connectors: interface-compatible (`RawSignal` → `normalizeSignal` → ingest-by-URL at stages.ts:297) **but inert** (§9.1). A connector that "fetches" without reaching `SourceDocument` is not a research connector yet — today, all 9 fail this bar in production.
- Social adapters: terminate at `SocialPost` (inspiration). `save-idea` creates claim-less DRAFTs. Correctly NOT part of the evidence chain (lineage endpoint only resolves source/claim/trend provenance).
- Internal signals (sales/audience/learning): producer→persistence→consumer→outcome all present and test-verified (signalFlow, loopStages, learningMachine).

---

## 17. Exact blockers

1. **Credential plumbing absent** (code, biggest): `setCredentials` never called in prod; in-loop + `/research/trigger` connector paths always no-op. No platform work can proceed before this.
2. **Connector block placement** (code): inside per-feed loop (stages.ts:141ff, block at 259-305) — must hoist to once-per-run.
3. **No server platform credentials** (ops): all `*_CLIENT_ID/_SECRET` empty; `YOUTUBE_API_KEY`/`_ACCESS_TOKEN` empty.
4. **LinkedIn + TikTok product approval** (external): code correctly refuses without it; cannot be coded around.
5. **Publishing unimplemented** (code, by design): hardcoded `publishing:false` ×2, EXECUTION SKIPPED. Separate build-out, not a flag flip.
6. **Google Trends fragility** (external): unofficial endpoints; treat as best-effort even after wiring.
7. **Quora impossibility** (external): no API; permanent UNAVAILABLE. Do not attempt scraping (ToS).

---

## 18. Recommended implementation order (gates, smallest-first)

- **Gate 0 (this report)**: PROVE — done. No platform connections attempted.
- **Gate 1 — Fix connector wiring (code-only, no new platforms)**: (a) populate `connectorRegistry` credentials each run (no-auth providers get `{credentials:{},valid:true}`; YouTube from env); (b) hoist connector block out of the feed loop; (c) remove or use the `void credentials` dead code; (d) add a regression test asserting Reddit/GoogleTrends signals reach `SourceDocument` in-loop. Proves the architecture with zero secrets.
- **Gate 2 — Reddit live**: enable in-loop, run daily loop on a test workspace, verify RawSignal→Document→Claims. No auth needed. First REAL_REQUEST_VERIFIED connector.
- **Gate 3 — Google Trends live (best-effort)**: same verification; quarantine failures (unofficial API may 403/429).
- **Gate 4 — YouTube research**: supply API key (+OAuth for channel uploads), one platform at a time; verify quota handling (RATE_LIMITED path).
- **Gate 5+ — OAuth platforms one-by-one (X → Facebook → Instagram)**: each gate = creds + connect + refresh + verify + pull + save-idea, runtime evidence recorded in CONNECTOR_MATRIX.
- **Gate N — LinkedIn/TikTok**: only after written product approval; keep REQUIRES_APPROVAL until then.
- **Never-gate**: Quora scraping; publishing without approvals; weakening tests/SSRF/isolation to go green.

---

## Gate 1 addendum — research connector engine activated (2026-10-02)

BEFORE (this audit above): connector code existed but production wiring was
inert. AFTER (Gate 1): the registry is reachable from the production
intelligence run. No platform accounts connected; no publishing/analytics/
comments work (unchanged).

### Exact wiring fixed
1. **Credential priming** — new `primeConnectorRegistry()` in
   `packages/intelligence/src/researchConnectors.ts`. Called at the start of
   the INTELLIGENCE stage (`apps/api/src/worker/stages.ts`) and by POST
   `/research/trigger` (`apps/api/src/routes/intelligence.ts`, dead
   `void credentials` lines removed). No-auth providers get valid-empty
   credentials; YouTube only from real env creds; OAuth five stay unset.
   Only source-type names returned — secrets never logged.
2. **Once-per-cycle placement** — connector block hoisted out of the per-feed
   loop; feeds and connectors push into one run-scoped `newDocs` queue;
   single `processNewDocs()` pass (understanding → claims → topics → trends →
   gaps → opportunities). `fetchFromAllSources()` asserted **exactly once**
   per run by spy test.
3. **Same-pipeline ingestion** — connector signals go through
   `SourceIngestionService.ingest()` (SSRF-checked, canonical-URL deduped,
   workspace-scoped). No parallel pipeline. Dead YouTube `credentials` local
   removed (env now flows via priming).
4. **No-fake-success enforcement** — Reddit/Trends total provider failure now
   throws classified errors (429→RATE_LIMITED preserved) instead of silent
   `[]`; Trends CSV fetches gained status checks + 15s timeouts (previously
   timeout-less). Partial failures stay per-source isolated.
5. **FeedSource honesty** — `routes/feeds.ts` refuses connector-managed types
   (`reddit/youtube/google_trends/linkedin/x/instagram/tiktok`) on create and
   retarget with 400 + explanation. UI already offered only the six feed
   types; DB enum untouched (no migration).
6. **Social adapters untouched** — separation kept per gate mandate.

### Regression found and fixed during this gate (honest record)
Activating the wiring added ~10s/provider-latency per INTELLIGENCE run
(Reddit 20 sequential subs ≈6.4s + Trends 14 sequential fetches ≈3s against
refusing providers), which pushed three `loopStages` tests past the 10s
testTimeout (two timeouts + one cascade assertion). Fixed WITHOUT touching
tests: concurrent `fetchFromAllSources` (`Promise.allSettled`, order
preserved, message contract preserved), bounded-concurrency subreddit/topic
fetching (5/4, order-preserving), Trends timeouts, and bounded default scope
(5 subreddits / 5 topics, mirroring `/research/trigger`; prior wider defaults
were never live so nothing depended on them). Full suite green after fix;
no existing test was modified.

### Runtime verification (exact, no fabrication)
- Reddit live: HTTP 403 from this environment (bot mitigation). Registry
  records `Reddit: r/<sub>: Reddit API responded 403 …`; run continues.
- Google Trends live: CSV endpoints HTTP 400, explore page HTTP 429.
  Registry records `Google Trends: "<topic>": Google Trends responded 400`.
- YouTube: no env creds on server → `YouTube: not configured` (honest).
- Opt-in live tests (`connectorLive.test.ts`, `LIVE_CONNECTOR_TESTS=1`)
  fail LOUD with the above provider reasons — proving priming reaches the
  connectors and rejections surface. Skipped by default.
- Statuses Reddit/Trends remain WIRED_NOT_RUNTIME_VERIFIED. Nothing is
  claimed beyond what was observed.

### Tests added (12 new, all passing)
- `packages/intelligence/src/test/connectorWiring.test.ts` (9): priming,
  YouTube env gating, no-secret result, Quora UNAVAILABLE-after-priming,
  once-per-cycle invocation, unprimed-honesty, real-RedditConnector parsing +
  normalization + dedupe, Trends 429 isolation.
- `packages/intelligence/src/test/connectorLive.test.ts` (2, skipped default).
- `apps/api/src/connectorWiring.test.ts` (3): 7-type FeedSource refusal,
  retarget refusal, pause/resume unaffected, once-per-run spy + priming and
  connector-error evidence on the run row.

### Remaining gates (unchanged order)
Next: Gate 2 Reddit live on an allowing network (single subreddit, verify
RawSignal→Document→Claims), then Trends best-effort, YouTube with creds, then
per-platform OAuth gates. LinkedIn/TikTok stay REQUIRES_APPROVAL. Quora stays
UNAVAILABLE permanently.

---

## Gate 2 — Reddit Live Verification (2026-10-02): BLOCKED

**Verdict: REDDIT LIVE VERIFICATION = BLOCKED.** No architecture, connector,
test, or bypass code was changed for this gate (zero code diff). The existing
`RedditConnector.fetchRecentItems()` was exercised unmodified via throwaway
probes (deleted afterwards).

- **Environment**: same sandbox as Gates 0–1 (Docker PostgreSQL, Node 24).
  No alternative authorized network is available from here; no proxy,
  UA-spoofing, `old.reddit` retarget, or scraping workaround was used
  (all would violate §8).
- **Subreddits tried**: `r/artificial` (preferred), then `r/technology`,
  `r/AskReddit` (alternates recorded per mandate; Gate 1 already showed
  `r/programming` → 403).
- **Endpoint**: `GET https://www.reddit.com/r/{sub}/hot.json?t=day&limit=25`
  (connector default; probe used limit 5/1 — same path).
- **Request timestamps (UTC)**: 2026-10-02T10:06:25Z (artificial),
  10:06:34Z (technology).
- **HTTP status**: **403 on all four subreddits** (artificial 975ms,
  technology 358ms). Network-wide Reddit bot mitigation, not per-subreddit.
- **Response result**: 0 items on every attempt. Classified error surfaced
  through the registry as `Reddit: r/<sub>: Reddit API responded 403 …`
  (Gate 1 surfacing fix confirmed working against the real provider).
- **RawSignal**: none created (no response to parse — correctly zero).
- **NormalizedSignal / SourceDocument / Claims / Topics / Gaps /
  Opportunities**: none (nothing fabricated; pipeline untouched).
- **Deduplication**: not exercisable (no items). Existing mechanism
  unchanged and still covered by deterministic wiring tests.
- **Workspace isolation**: untouched (no live data entered any workspace).
- **Tests**: none added or modified. Opt-in `connectorLive.test.ts` already
  encodes this exact outcome (fails LOUD with the provider reason when
  enabled; skipped by default). Default suite remains deterministic.
- **Final status**: Reddit row → **BLOCKED** in `CONNECTOR_MATRIX.md`.
  `REAL_REQUEST_VERIFIED` requires all 10 §9 conditions; condition 2
  (successful response) is unmet, so the status is refused honestly.

**Exact next gate**: re-run this Gate 2 probe from an allowing network
(residential/office egress or approved Reddit API access). The moment any
public subreddit returns 200 through the unmodified connector, continue the
chain (normalize → ingest → claims → topics → opportunity) with real counts
and flip the status. Until then, no Reddit-dependent product work.

---

## Gate 3 — Google Trends Live Verification (2026-10-02): BLOCKED

**Verdict: GOOGLE_TRENDS LIVE VERIFICATION = BLOCKED.** The existing connector
was inspected first and used exactly as implemented (status-checked CSV
fetches, 15s timeouts, bounded concurrency — all Gate 1 code, unmodified
here). Zero code changed for this gate; throwaway probe deleted afterwards.

- **Request**: `GoogleTrendsConnector.fetchRecentItems({}, 5,
  { topics: ['AI'], geo: 'US', timeRange: 'now 7-d', category: 0 })` —
  one small deterministic query matching production defaults. Underlying
  HTTP: `GET https://trends.google.com/trends/api/widgetdata/
  relatedsearches/csv?req={comparisonItem:[{keyword,geo,time}]…}&tz=0`
  (plus the `multiline/csv` interest endpoint per topic), no auth.
- **Request timestamp (UTC)**: 2026-10-02T10:11:17Z (`AI`), 10:11:29Z
  (`Claude Code`, alternate production-default topic).
- **HTTP status**: **400 on both topics** (`AI` in 701ms, `Claude Code` in
  671ms). Response is a 1691-byte HTML error page, not CSV — genuinely
  unusable by the existing parser (which correctly threw instead of parsing
  garbage). Gate 1 additionally recorded the explore endpoint → 429.
  Endpoint-wide refusal, not topic-specific.
- **Provider error**: `Google Trends responded 400`, surfaced through the
  registry as `Google Trends: "AI": Google Trends responded 400` (failure
  isolation held; nothing else affected).
- **RawSignal / NormalizedSignal / SourceDocument / Claims / Topics /
  Trends-Gaps / Opportunity**: all 0 — live pipeline stopped at the
  provider refusal per mandate; nothing fabricated.
- **Deduplication / workspace isolation**: not exercisable (no items);
  mechanisms unchanged, covered by deterministic wiring tests.
- **Tests**: none added or modified. Existing `connectorWiring` Trends
  isolation test and opt-in `connectorLive` test already encode this
  failure mode. Default suite remains deterministic.
- **Final status**: Trends row → **BLOCKED** in `CONNECTOR_MATRIX.md`.
  `REAL_REQUEST_VERIFIED` required (1) usable provider data + (2) pipeline
  traversal; condition 1 unmet, so the status is refused honestly. No
  scraping bypass, proxy, UA-spoof, or parser-weakening was used.

**Exact next gate**: re-run this Gate 3 probe from an allowing network. On
the first 200 with parseable CSV through the unmodified connector, continue
the chain with real counts. Until then, no Trends-dependent product work —
and no other connector in this task.

---

## Gate 4 — GitHub Live Verification (2026-10-02): BLOCKED (internal defect)

**Verdict: GITHUB LIVE VERIFICATION = BLOCKED.** Step 1 inspection first
established what "the existing GitHub connector" actually is: there is NO
GitHub connector class, no registry registration, nothing to prime — only
`resolveReleaseFeedUrl()` (pure rewrite to `releases.atom`), the
`GITHUB_RELEASES` FeedSource branch (`stages.ts:201`), generic ATOM
ingestion, and reliability metadata. Tests cover only the pure rewrite.
Nothing was redesigned; Reddit/Trends untouched; zero product-code changes.

- **Target**: `https://github.com/microsoft/TypeScript` → resolved
  `https://github.com/microsoft/TypeScript/releases.atom` (stable public
  repo, tech audience; same repo the unit tests already cite).
- **Provider request (timestamp 2026-10-02T10:17:12Z)**: HTTP **200**,
  `application/atom+xml`, 13,656 bytes, **10 `<entry>` items**, valid Atom
  (`<feed xmlns="http://www.w3.org/2005/Atom">`). First entry: real release
  `vscode-typescript/v1.0.1`, real timestamp `2026-09-30T19:10:17Z`, real
  author `typescript-automation[bot]`, real URL. Provider side fully healthy.
- **Production loop run** (scratch workspace + OWNER + GITHUB_RELEASES feed,
  real `runDailyLoop`, deleted afterwards — 0 orphan rows verified):
  run COMPLETED, all stages SUCCEEDED, but the feed source row came back
  `status: FAILED`, document `extractionStatus: FAILED`, wordCount 0 →
  **0 claims, 0 topics, 0 trends, 0 gaps, 0 opportunities, 0 ideas, 0 plans**.
- **Root cause (defect, reported not fixed)**: GitHub's Atom carries
  `<content type="html">`, which xml2js parses to an OBJECT
  (`{_: '<p>…', type: 'html'}`). `extractAtomContent`
  (`shared/sourceExtraction.ts:286`: `entry.summary || entry.content`)
  passes the object through as `FeedItem.description` (typed
  `string | null` — violated at runtime), and the ATOM branch in
  `sourceIngestion.ts` calls `i.description?.split(...)` → TypeError →
  caught → FAILED. Same latent shape exists in the RSS branch
  (`content:encoded`). Independent corroboration: the dev DB already held a
  same-URL row (other workspace, type USER_URL, status FAILED) — this defect
  predates Gate 4 and reproduces across ingestion paths.
- **Provenance**: source row kept the real github.com URL and ATOM type;
  no engagement/velocity/timestamps invented (nothing survived extraction
  to invent anything from).
- **Deduplication**: re-ingest of the same URL returned `SUCCESS /
  "Content already exists"` with null documentId — source-level dedupe
  held even in the failure state.
- **Workspace isolation**: every read/write filtered by the scratch
  workspaceId; the same-URL row elsewhere was counted, never read.
  Scratch workspace + user deleted (cascade verified: 0 rows remain).
- **Tests**: none added or modified (a parser unit test belongs to the fix
  gate, not this verification gate). No suite re-run needed — no code
  changed.
- **Final status**: GitHub row → **BLOCKED (internal defect, not
  provider)**; the prior matrix overclaim for this row is corrected above.
  `REAL_REQUEST_VERIFIED` refused (downstream traversal unmet).

**Defect report for a future fix gate (not implemented here)**: normalize
xml2js object nodes to strings in `extractAtomContent` (and audit the RSS
`content:encoded` twin) — e.g. unwrap `{_: text}` / strip HTML to text in
`shared/sourceExtraction.ts`, or coerce in `sourceIngestion.ts` ATOM/RSS
branches. Estimated small, testable with the real bytes captured above
(10 TypeScript release entries). Until fixed, GitHub releases ingestion
fails closed honestly.

**Exact next gate**: fix-gate for the Atom content-normalization defect with
a regression test using real GitHub release bytes; then re-run this Gate 4
probe end-to-end. Do not implement the next connector in this task.

---

## Gate 4-fix — Atom normalization fix + GitHub re-verification: REAL_REQUEST_VERIFIED

**Defect** (as reported): GitHub `<content type="html">` parses to an
xml2js object that crashed the ATOM/RSS `wordCount` line. Fixed without
touching architecture, Reddit, Trends, or any test expectations.

**Fix** (`packages/shared/src/intelligence/sourceExtraction.ts`):
`normalizeXmlText()` + `xmlTextOrNull()` — string passthrough, arrays
joined, xml2js value/object nodes reduced to their text body (`_` wins
outright; otherwise non-attribute children joined; attribute-only nodes
yield `''`; missing → `''`; never throws). Applied to item
title/description/author and feed title/description/subtitle in
`extractRssContent`/`extractAtomContent` (RSS `content:encoded` twin
audited and covered). Shapes were determined empirically against the
repo's own xml2js config, not assumed.

**Re-run** (same target, production loop, scratch workspace, cleaned up):
feed HTTP 200 → 6 sources ACTIVE → 6 documents SUCCESS (145–380 words) →
15 claims (FACT/SUPPORTED, e.g. "The release tag is v7.0.2.") → 10 topics →
10 trends → 96 gaps → **10 opportunities** (NEW, scores 0.62–0.65, github.com
source/claim provenance) → 5 ideas → 5 plans. Re-ingest → "Source already
exists" (dedupe held). Same-URL row elsewhere counted, never read
(isolation held). 0 orphan rows after cleanup.

**Tests**: 11 new in `sourceExtraction.test.ts` (helper contract A–F incl.
GitHub-shaped type=html, type=text, CDATA/typed content:encoded,
attr-only/nested no-crash, wordCount numeric). Suites: intelligence 274
pass, API 313 pass, web 73 pass; typecheck ✅; build ✅.

**Status**: GitHub row → **REAL_REQUEST_VERIFIED**. First provider in this
program to complete the full real-data chain. No engagement numbers were
ever read or stored (connector reads titles/descriptions only).

---

## Appendix — file inventory (all read this gate)

`packages/intelligence/src/researchConnectors.ts`, `connectors/index.ts`, `connectors/{reddit,youtube,googleTrends,linkedin,x,instagram,tiktok,facebook,quora}Connector.ts`, `feedAdapters.ts`, `sourceIngestion.ts`, `index.ts`, `test/{connectorIsolation,connectorAuth,feedAdapters,sourceIngestion,sourceExtraction}.test.ts`, `packages/social/src/{types,adapters,index}.ts`, `packages/shared/src/intelligence/sourceExtraction.ts` (+ `urlCanonicalization.ts` referenced), `apps/api/src/worker/stages.ts`, `apps/api/src/routes/{social,intelligence,feeds,readiness}.ts`, `apps/api/src/utils/tokenVault.ts`, `apps/api/src/{social,feedAdapters,dailyLoop,loopStages,signalFlow}.test.ts`, `packages/db/prisma/schema.prisma`, `apps/web/src/pages/{BrainPage,SettingsPage,HomePage}.tsx`, `.env.example`, `apps/api/src/config/env.ts`.
