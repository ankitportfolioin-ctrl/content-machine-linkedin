# PHASE 2 → PHASE 3 BOUNDARY / SCOPE AUDIT

Audit-only. No Phase 3 implementation. No commits. No pushes.

Status vocabulary used throughout: `IMPLEMENTED` / `PARTIAL` / `MISSING` / `UNRELATED` / `UNVERIFIED` / `REAL` / `MOCK/DEMO` / `FOUND` / `NOT FOUND` / `NOT YET IMPLEMENTED` / `UNKNOWN`.

---

## 1. Executive Summary

- Phase 1 (foundation: auth, workspaces, profiles, health, AI provider abstraction, base schema) is intact and verified by its own suites.
- Phase 2 (Growth Intelligence Engine: ingestion → extraction → understanding → claims → topics → trends → opportunities → gaps → idea handoff) is **implemented at the service + API + test level** with all 127 behavioral tests passing, but with **bounded, documented gaps**: no live-AI verification, no browser verification, no external-network verification, thin idea-handoff provenance, two Prisma upsert-key defects, and a frontend that does **not** consume the intelligence APIs.
- The Phase 2 commit (`32024a8`) also bundled **thin CRUD scaffolding** for content, sales, analytics, learning, profiles/ICPs that is **not Phase 2 intelligence work**. Those routes are real CRUD but belong to future phases.
- A prior claim in `PHASE_2_IMPLEMENTATION_REPORT.md` §7/§13 that the “Brain UI tabs are connected to real APIs” is **incorrect**. `apps/web/src/pages/BrainPage.tsx` is a static placeholder and `apps/web/src/services/api.ts` exposes only `checkHealth`/`checkReady`. This audit corrects the record.
- No LinkedIn integration, no learning engine, no background workers, no fake metrics, and no auth/workspace bypasses were found.
- Phase 3 (Content Machine) is **mostly missing** and must be built on top of — not beside — the Phase 2 intelligence layer.

---

## 2. Repository State

Verified via `git status`, `git log --oneline -5`, `git diff --stat`, `git ls-files`:

- Current branch: `main`
- Current HEAD: `32024a8 phase 2: growth intelligence engine verified`
- Previous checkpoint: `dbe8dd3 phase 1: verified growth operator foundation`
- Working tree at audit start: **clean** (`nothing to commit, working tree clean`).
- `git diff --stat`: empty (no uncommitted changes).
- Unexpected uncommitted files: **none**.
- PostgreSQL: Docker container `growth_operator_postgres` (`postgres:17`) `Up (healthy)`; left untouched (no reset, no deletion).
- Commit attribution (via `git show --stat`):
  - `dbe8dd3` (Phase 1): foundation only — auth/health/profiles/workspaces routes, base schema (User, Workspace, WorkspaceMembership, Profile, ICP, ContentIdea/Draft/Version, Lead/Conversation/Message, PipelineOpportunity, AnalyticsEvent, LearningSignal), AI abstraction, web shell, generated Prisma client (committed).
  - `32024a8` (Phase 2): intelligence package + shared intelligence utilities + `intelligence.ts` route + Phase 2 migration + report **plus** 10 thin CRUD route files (analytics, contentDrafts, contentIdeas, contentVersions, conversations, icps, leads, learning, messages, pipeline) and schema additions for 9 intelligence models.

---

## 3. Phase 1 Verification Status

Re-ran during this audit (exact results):

- `pnpm --filter=@growth-operator/api test`: **21/21 passing** (`apps/api/src/index.test.ts`).
- `pnpm --filter=@growth-operator/web test`: **3/3 passing** (`apps/web/src/App.test.tsx`; React `act()` warnings only).
- `pnpm typecheck`: **PASS** (api, web, db, ai, schemas, shared).
- Production build: **PASS with one caveat** (see §23): web `vite build` emits real output; api `tsc` exits 0 but emits **no JS** because root `tsconfig.json` sets `noEmit: true` and `apps/api/tsconfig.json` does not override it (`apps/api/dist/` contains only `tsconfig.tsbuildinfo`).
- Health/readiness: verified at runtime in this audit (see §18).
- Verdict: Phase 1 remains intact. No regressions observed.

---

## 4. Phase 2 Verification Status

Re-ran during this audit (exact results):

- `pnpm --filter=@growth-operator/intelligence test`: **127/127 passing, 9 files**.

| Suite | Result |
|---|---|
| `claimLedger.test.ts` | 9/9 |
| `contentGap.test.ts` | 9/9 |
| `contentOpportunity.test.ts` | 14/14 |
| `sourceExtraction.test.ts` | 29/29 |
| `sourceIngestion.test.ts` | 16/16 |
| `ssrfProtection.test.ts` | 12/12 |
| `topicClustering.test.ts` | 8/8 |
| `trendSignal.test.ts` | 12/12 |
| `urlCanonicalization.test.ts` | 18/18 |

- Combined verified total: **151/151** (21 API + 3 Web + 127 intelligence).
- Important scoping note: root `pnpm test` (`package.json:10`) runs **only** api + web. The intelligence suite must be run separately (`pnpm --filter=@growth-operator/intelligence test`). Any “all tests pass” claim based solely on root `pnpm test` understates coverage by 127 tests.
- What the 127 tests prove: deterministic logic, mocked-Prisma persistence behavior, mocked-DNS SSRF behavior, mocked-fetch ingestion behavior, mocked-registry AI-unavailable behavior, and mocked-FS XML parsing. They do **not** prove live-AI output quality, live-network fetching, live-DNS behavior, or browser integration (see §6, §18).

---

## 5. Phase 2 Pipeline Audit

Judged on implementation actually read, not filenames. “Real” below means genuine logic (unit-verified, often with mocked boundaries); live-network/live-AI paths are marked `UNVERIFIED`.

| Stage | Classification | Files / Functions / Endpoints | Tests | Workspace-scoped | Real vs mock |
|---|---|---|---|---|---|
| SOURCE DISCOVERY | `PARTIAL` | `apps/api/src/routes/intelligence.ts:196` (`POST /topics/research` treats `data.query` as a URL and calls `ingestionService.ingest(workspaceId, data.query, {sourceType:'USER_URL'})`). No search/discovery service exists. | None dedicated | Yes (`workspaceId` passed through) | Real URL path; discovery itself MISSING |
| SOURCE INGESTION | `IMPLEMENTED` | `packages/intelligence/src/sourceIngestion.ts`: `SourceIngestionService.ingest`, `createFailedSource`, `extractContent`, `mapContentTypeToSourceType`; canonicalize + SSRF + fetch (30s timeout, 10MB limit) + hash dedupe (`workspaceId+canonicalUrl`, `workspaceId+contentHash`) | `sourceIngestion.test.ts` 16/16 (mocked SSRF/fetch/Prisma) | Yes | Real logic; external fetch mocked in tests, `UNVERIFIED` live |
| SOURCE SECURITY VALIDATION | `IMPLEMENTED` | `packages/intelligence/src/ssrfProtection.ts`: `validateUrlForFetch`, `resolveAndValidateHostname`, `checkSsrfProtection` (HEAD redirect walk, 10s timeout, 5-redirect cap) | `ssrfProtection.test.ts` 12/12 (mocked DNS) | N/A (URL-level) + workspace on failure record | Real logic; live DNS `UNVERIFIED` |
| CONTENT EXTRACTION | `IMPLEMENTED` | `packages/shared/src/intelligence/sourceExtraction.ts`: `extractHtmlContent`, `extractRssContent`, `extractAtomContent`, `extractSitemapContent`, `detectContentType` | `sourceExtraction.test.ts` 29/29 | N/A (pure functions) | Real (JSDOM/xml2js) |
| SOURCE UNDERSTANDING | `IMPLEMENTED` (conditional) | `packages/intelligence/src/sourceUnderstanding.ts`: `SourceUnderstandingService.understand`, `SourceUnderstandingSchema` (Zod `safeParse`); honest `AI_UNAVAILABLE` when registry empty (`:52-58`) | Covered indirectly (opportunity/ingestion tests mock it); no dedicated live-AI test | Pass-through `workspaceId` | Real pipeline; AI output `UNVERIFIED` live |
| CLAIM EXTRACTION | `IMPLEMENTED` | `packages/intelligence/src/claimLedger.ts`: `ClaimLedgerService.persistClaims`, `getClaimsForSource`, `updateClaimStatus` | `claimLedger.test.ts` 9/9 (mocked Prisma) | Yes | Real logic |
| EVIDENCE / PROVENANCE | `PARTIAL` | `SourceClaim` stores `evidenceText/evidenceLocation/confidence/provenance(Json)` (`schema.prisma:531-555`); `ContentOpportunity.sourceIds/claimIds/trendSignalIds` are `Json` ID lists, **not FK relations** (`schema.prisma:635-637`); convert response returns only `provenance:{opportunityId}` (`intelligence.ts:491`) | Claim tests 9/9; no provenance-chain test | Yes | Real but thin; full chain MISSING |
| CONTRADICTION DETECTION | `IMPLEMENTED` (deterministic) | `claimLedger.ts`: `detectContradictions`, `areContradictory`, `getNumberContext`, `contextsAreSimilar`, `assessSeverity` | `claimLedger.test.ts` 9/9 | Yes | Real deterministic heuristics; semantic accuracy `UNVERIFIED` |
| TOPIC NORMALIZATION | `PARTIAL` | `packages/intelligence/src/topicClustering.ts`: `TopicClusteringService.normalizeTopics`, `normalizeTopicName`, `deterministicClustering`, `aiAssistedClustering`, `mergeTopics`; Topic upsert via valid unique `workspaceId_canonicalName` (`:94-113`). **Defect:** `TopicMention` upsert targets `workspaceId_topicId_sourceId` (`:143-150`) which has **no `@@unique` in schema** (`schema.prisma:578-596` indexes only) → live upsert would fail | `topicClustering.test.ts` 8/8 (mocked Prisma) | Yes | Normalization real; mention persistence path defective live |
| TREND SIGNALS | `PARTIAL` | `packages/intelligence/src/trendSignal.ts`: `TrendSignalService.calculateTrend` (INSUFFICIENT_HISTORY/EMERGING/RELEVANT/TRENDING/STALE), `updateTrendSignal`, recency/diversity/frequency scorers. **Defect:** upsert targets `workspaceId_topicId` (`:121-127`) with **no `@@unique([workspaceId,topicId])` in schema** (`schema.prisma:598-620`) → live upsert would fail; `POST /topics/research` calls it (`intelligence.ts:250`) | `trendSignal.test.ts` 12/12 | Yes | Calculation real + tested; persistence path defective live |
| CONTENT OPPORTUNITIES | `IMPLEMENTED` (scoring; generation conditional) | `packages/intelligence/src/contentOpportunity.ts`: `ContentOpportunityService.scoreOpportunity` (10 dimensions), `generateOpportunity` (Zod-validated AI JSON, honest `AI_UNAVAILABLE`); endpoints `GET /opportunities`, `GET /opportunities/:id`, `POST /:id/feedback`, `POST /:id/convert` | `contentOpportunity.test.ts` 14/14 | Yes | Scoring real; generation `UNVERIFIED` live |
| CONTENT GAPS | `IMPLEMENTED` | `packages/intelligence/src/contentGap.ts`: `ContentGapService.detectGaps`, `detectDeterministicGaps`, `detectAIGaps`, `deduplicateGaps`; endpoints `GET /gaps`, `GET /gaps/:gapId` | `contentGap.test.ts` 9/9 | Yes | Real; AI path `UNVERIFIED` live |
| CONTENT IDEA HANDOFF | `PARTIAL` | `intelligence.ts:458-495`: copies `title/description←thesis/angle/format`, sets opportunity `CONVERTED`, creates `ContentIdea(status:DRAFT)`; returns `provenance:{opportunityId}` only. Source/claim/trend ID lists and evidence bundle are **not** carried over; `ContentIdea` has no provenance columns | No dedicated handoff-chain test | Yes | Real but thin |

---

## 6. Database Model Audit

Schema: `packages/db/prisma/schema.prisma` (686 lines, PostgreSQL). Migration `20260927050345_phase2_intelligence` exists and is tracked.

| Model | Schema | Migration | Service uses | API exposes | Frontend consumes | Tests | Workspace isolation | Relations / provenance |
|---|---|---|---|---|---|---|---|---|
| `IntelligenceSource` | Yes (`:474`) | Yes | `SourceIngestionService` | Yes (sources CRUD + reprocess) | No (Brain is placeholder) | Ingestion 16/16 | Yes (`workspaceId`, `@@unique([workspaceId,canonicalUrl])`, `@@unique([workspaceId,contentHash])`) | Correct; cascade to documents/claims/mentions |
| `SourceDocument` | Yes (`:506`) | Yes | Ingestion | Yes (embedded in source detail) | No | Ingestion 16/16 | Yes | Correct cascades |
| `SourceClaim` | Yes (`:531`) | Yes | `ClaimLedgerService` | Yes (`/:sourceId/claims`) | No | Claims 9/9 | Yes | Correct; `provenance Json?` present but population path not verified live |
| `Topic` | Yes (`:557`) | Yes | `TopicClusteringService` | Yes (topics list/detail/research) | No | Topics 8/8 | Yes (`@@unique([workspaceId,canonicalName])`) | Correct |
| `TopicMention` | Yes (`:578`) | Yes | TopicClustering | Yes (embedded in topic detail) | No | Topics 8/8 (mocked) | Yes (column) but **missing `@@unique([workspaceId,topicId,sourceId])` required by the upsert** | **Defect** (see §5) |
| `TrendSignal` | Yes (`:598`) | Yes | `TrendSignalService` | Yes (trends list/detail) | No | Trends 12/12 | Yes (column) but **missing `@@unique([workspaceId,topicId])` required by the upsert** | **Defect** (see §5) |
| `ContentOpportunity` | Yes (`:622`) | Yes | `ContentOpportunityService` | Yes (list/detail/feedback/convert) | No | Opportunities 14/14 | Yes | ID-list provenance (`Json`), no FKs — thin by design, flag for Phase 3 |
| `ContentGap` | Yes (`:652`) | Yes | `ContentGapService` | Yes (list/detail) | No | Gaps 9/9 | Yes | Correct |
| `OpportunityFeedback` | Yes (`:671`) | Yes | Feedback endpoint only | Yes (`POST /:id/feedback`) | No | None dedicated | Yes | **No relation to `ContentOpportunity`** (bare `opportunityId String`, no cascade) — loose feedback linkage |

Models added by the Phase 2 commit but unrelated to Phase 2 intelligence: **none at the model layer**. The 9 models above are the only schema additions (schema diff +341 lines). The unrelated scaffolding that arrived in the same commit is at the **route layer** (see §7), corresponding to models already defined in Phase 1 (ContentIdea/Draft/Version, Lead/Conversation/Message, PipelineOpportunity, AnalyticsEvent, LearningSignal, Profile, ICP).

---

## 7. API Route Scope Audit

All files under `apps/api/src/routes/`. Mounts verified in `apps/api/src/index.ts:78-91`.

| Route file | Mount | Classification | Reason |
|---|---|---|---|
| `auth.ts` | `/api/v1/auth` (register, login, me, verify) | `PHASE_1` | Present in `dbe8dd3`; user-scoped, no workspace middleware (correct for auth) |
| `health.ts` | **not mounted (orphan)** | `PHASE_1` (superseded) | Phase 1 report notes removal; live endpoints are inline in `index.ts:48-76`. Orphan file is dead code — harmless, flag for cleanup |
| `workspaces.ts` | `/api/v1/workspaces` | `PHASE_1` | Present in `dbe8dd3`; full `authMiddleware+workspaceMiddleware+workspaceMembershipMiddleware+requireRole` |
| `profiles.ts` | `/api/v1/profiles` | `PHASE_1` | Present in `dbe8dd3`; workspace-scoped. Minor debt: `PATCH /:profileId` applies raw `req.body` without a Zod schema (unlike sibling routes) |
| `intelligence.ts` | `/api/v1/intelligence` (17 endpoints) | `PHASE_2` | Added in `32024a8`; all handlers behind the workspace triple-middleware (`:24-26`); real service wiring |
| `contentIdeas.ts` | `/api/v1/content-ideas` | `PHASE_3_PREEXISTING` | Added in Phase 2 commit but **CRUD-only** (no generation, prompts, gates); model predates it (Phase 1 schema). Shell for Phase 3 |
| `contentDrafts.ts` | `/api/v1/content-drafts` | `PHASE_3_PREEXISTING` | Same: CRUD + parent checks + version uniqueness; no generation |
| `contentVersions.ts` | `/api/v1/content-versions` | `PHASE_3_PREEXISTING` | Same: CRUD, no PATCH by design; no approval flow |
| `icps.ts` | `/api/v1/icps` | `PHASE_3_PREEXISTING` | Full CRUD but no consumer: research passes `icp:''` (`intelligence.ts:275,286`); no frontend |
| `leads.ts` | `/api/v1/leads` | `PHASE_3_PREEXISTING` (sales shell) | CRUD + manual `LeadStatus`; no scoring/enrichment/outreach (see §12) |
| `conversations.ts` | `/api/v1/conversations` | `PHASE_3_PREEXISTING` (sales shell) | CRUD only, no AI reply / send |
| `messages.ts` | `/api/v1/messages` | `PHASE_3_PREEXISTING` (sales shell) | CRUD only; `linkedinMessageId` is an opaque passthrough string, not an integration |
| `pipeline.ts` | `/api/v1/pipeline` | `PHASE_3_PREEXISTING` (sales shell) | CRUD + manual stage/probability; no automation |
| `analytics.ts` | `/api/v1/analytics` | `PHASE_3_PREEXISTING` (analytics shell) | Event write/read only; no aggregation or dashboards (see §13) |
| `learning.ts` | `/api/v1/learning` | `PHASE_3_PREEXISTING` (learning shell) | Signal write/read only; no training or consumers (see §14) |

Nothing was deleted or refactored in this audit.

---

## 8. Content System Audit

“CRUD endpoint ≠ Content Machine” applied strictly. Content routes are `contentIdeas.ts`, `contentDrafts.ts`, `contentVersions.ts`; the only AI-adjacent generation is `ContentOpportunityService.generateOpportunity` (intelligence domain, invoked from `intelligence.ts:279`, not wired to content routes).

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| 1 | Content idea creation | `PARTIAL` | REAL CRUD (`POST /content-ideas`, `contentIdeas.ts:50-72`); no strategy/thesis enforcement |
| 2 | Opportunity → idea conversion | `PARTIAL` | REAL thin handoff (`intelligence.ts:458-495`); provenance reduced to `{opportunityId}` |
| 3 | Thesis preservation | `PARTIAL` | Thesis/angle copied on convert (`:483-484`); nothing enforces it downstream |
| 4 | Audience selection | `MISSING` | No audience entity/flow; opportunity `audience` is AI text, unvalidated live |
| 5 | ICP matching | `MISSING` | ICP CRUD exists but research passes `icp:''`; scoring `scoreAudienceFit` uses string length heuristics, no matching engine |
| 6 | Objective selection | `MISSING` | Opportunity `objective` is AI text; no objective taxonomy or selection flow |
| 7 | Angle selection | `MISSING` | `possibleAngles` produced by understanding; no selection/validation flow |
| 8 | Content format selection | `PARTIAL` | `ContentFormat` enum + `contentFormat` passthrough (`contentIdeas.ts:62`, opportunity schema enum POST/ARTICLE/CAROUSEL/VIDEO/POLL); no format-aware logic |
| 9 | Narrative structure | `MISSING` | No narrative/outline model or endpoint |
| 10 | Hook generation | `MISSING` | No hook generator, template, or endpoint |
| 11 | Body generation | `MISSING` | No draft-body generator (draft `body` is user-supplied) |
| 12 | Carousel generation | `MISSING` | No slide model or splitter |
| 13 | Visual brief generation | `MISSING` | No visual-brief concept anywhere |
| 14 | Source-backed claims | `PARTIAL` | Claims carry evidence in ledger; nothing binds claims to draft spans |
| 15 | Evidence validation | `MISSING` | No draft-vs-evidence checker |
| 16 | Contradiction handling | `PARTIAL` | Ledger detects; opportunity scoring hard-fails on high-confidence contradictions; drafts ignore it entirely |
| 17 | Voice application | `MISSING` | No voice fields, no voice step (see §11) |
| 18 | Banned-word enforcement | `MISSING` | No banned-word list, storage, or check (grep: none) |
| 19 | Quality gates | `MISSING` | No gates service or endpoint |
| 20 | Hard-block gates | `MISSING` | No blocks; `ContentStatus` manually settable (`contentIdeas.ts:63,125`) |
| 21 | Draft versioning | `REAL` | Mechanical versioning with per-parent uniqueness (`contentDrafts.ts:60-66`, `contentVersions.ts:59-65`) |
| 22 | Human review | `MISSING` | No review queue/assignment flow (`REVIEW` is a label) |
| 23 | Approval | `MISSING` | No approval transition enforcement (`APPROVED` is a label) |
| 24 | Publish readiness | `MISSING` | No readiness check; no publisher |
| 25 | Preview rendering | `MISSING` | No preview endpoint or component |

---

## 9. Known Content Quality Issue Audit

There is **no draft-generation system** in the repo, so most failure classes cannot manifest. Verdicts reflect current code, not hypotheticals.

| Issue | Verdict | File/function basis |
|---|---|---|
| A. Generic fallback writing | `NOT YET IMPLEMENTED` | No generator exists; `ContentDraft.body` is user-supplied (`contentDrafts.ts:68-76`) |
| B. Thesis drift | `NOT YET IMPLEMENTED` | No multi-stage pipeline to drift across; convert copies thesis once (`intelligence.ts:483`) |
| C. Semantic drift from original idea | `NOT YET IMPLEMENTED` | Same as B |
| D. Generic hook templates | `NOT FOUND` | No hook code or templates anywhere (grep: none) |
| E. Format-independent generation | `NOT YET IMPLEMENTED` | No generator; `contentFormat` is a passthrough enum |
| F. Checklist ≡ Deep Analysis structure | `NOT YET IMPLEMENTED` | No narrative formats exist |
| G. Unsupported claims | `NOT YET IMPLEMENTED` | No draft-claim binding; ledger side is evidence-carrying |
| H. Invented statistics | `NOT FOUND` | No generator; understanding prompts forbid external knowledge (`sourceUnderstanding.ts:60-68`), live output `UNVERIFIED` |
| I. Invented personal experiences | `NOT FOUND` | Same as H |
| J. Persona/ICP leakage | `NOT FOUND` | No persona fields exist to leak (see §11) |
| K. Malformed carousel slides | `NOT YET IMPLEMENTED` | No slides concept |
| L. Placeholder markup in user content | `NOT FOUND` | No `[SLIDE]`/`[HOOK]`/instruction strings in code (grep: none) |
| M. Internal instructions in preview | `NOT FOUND` | No preview surface exists |
| N. Duplicate titles/content | `NOT YET IMPLEMENTED` | No generator; dedupe exists only for sources (hash uniques) |
| O. Repeated sentences | `NOT YET IMPLEMENTED` | No generator |
| P. Score PASS despite hard-gate failure | `NOT YET IMPLEMENTED` | No gates exist; at opportunity level, `criticalFailure` blocks generation (`contentOpportunity.ts:68-74`) — that gate itself is honest |
| Q. AI-unavailable misleading content | `NOT FOUND` | Honest `AI_UNAVAILABLE` returns (`sourceUnderstanding.ts:52-58`; `contentOpportunity.ts:77-83`); no fake fallback content |
| R. Contradiction ignored | `PARTIAL` | Ledger detects + opportunity hard-fails, but drafts/pipeline have no contradiction consumer |
| S. Fidelity claims without evidence | `NOT YET IMPLEMENTED` | No fidelity claims rendered to users |
| T. Preview differing from approved content | `NOT YET IMPLEMENTED` | No preview and no approval flow |
| U. Approval despite blocking failures | `NOT YET IMPLEMENTED` | No approval flow; `APPROVED` is a manually set label |

Nothing was silently fixed.

---

## 10. AI Architecture Audit

Inspected `packages/ai/src/*` and all AI call sites.

- Provider abstraction: `REAL` — `AIProvider` interface (`ai/src/types.ts`), `OpenAIProvider` (`ai/src/openai.ts`), `AnthropicProvider` (`ai/src/anthropic.ts`).
- OpenAI support: `REAL` (code) — chat + embeddings via `https://api.openai.com/v1/*`; models `gpt-4o/mini/turbo/3.5-turbo`. Live calls `UNVERIFIED`.
- Anthropic support: `REAL` (code) — chat via `https://api.anthropic.com/v1/messages`; models `claude-3-5-sonnet/haiku`, `claude-3-opus`; embeddings explicitly unsupported (throws). Live calls `UNVERIFIED`.
- Provider registry: `REAL` — `AIProviderRegistry` (`ai/src/registry.ts:5-67`), `createDefaultRegistry(openaiKey?, anthropicKey?)` (`:69-74`).
- Structured output validation: `REAL` — Zod schemas in intelligence services (`SourceUnderstandingSchema.safeParse` in `sourceUnderstanding.ts:129`; gap array schema in `contentGap.ts`; opportunity object schema in `contentOpportunity.ts`), `responseFormat:{type:'json_object'}` on requests. Note: validation lives at call sites, not inside `packages/ai`.
- Retry behavior: `MISSING` — no retry loop/backoff anywhere; only a `retryAfter?` field on `AIProviderRateLimitError` (`ai/src/types.ts`).
- Timeout handling: `PARTIAL` — none inside `packages/ai` (no `AbortController`); present at call boundaries (ingestion 30s default in `sourceIngestion.ts:82`; SSRF 10s in `ssrfProtection.ts:155`).
- AI-unavailable behavior: `REAL` and honest — empty registry → `AI_UNAVAILABLE` errors, deterministic fallbacks (`deterministicClustering` in `topicClustering.ts`, `detectDeterministicGaps` in `contentGap.ts`).
- Model selection: `REAL` — `preferredProvider` param + `getAvailable()[0]` fallback; callers default to `gpt-4o-mini` (`sourceUnderstanding.ts:98`, `topicClustering.ts:259`, `contentGap.ts:196`, `contentOpportunity.ts:154`).
- Prompt/context construction: `REAL` (code) — grounded prompts in `sourceUnderstanding.ts:60-91` (source-only rules, evidence quotes, confidence); strategy prompts in `contentOpportunity.ts:103-146`, `contentGap.ts:172-188`, `topicClustering.ts:233-250`.
- Source grounding: `PARTIAL` — prompts demand source-only evidence with quotes/locations, but no live output was verified and no downstream evidence-span enforcement exists.
- Deterministic fallback: `REAL` — clustering, gaps, trends, and scoring all function without AI.

Architecture readiness: **AI provider infrastructure is Phase-3-usable; Content Intelligence is not yet built.** What exists is plumbing (providers, registry, validation patterns, honest degradation). What is missing is everything in §21 (plan/narrative/draft/evidence/voice/gates/review/approval).

---

## 11. Profile / ICP / Voice Audit

| Field | Storage | API | Frontend | Used in generation | Workspace-scoped |
|---|---|---|---|---|---|
| Identity (`User.name/email`) | DB-backed (`schema.prisma:158`) | Yes (auth) | No UI | No | User-level |
| Role (`WorkspaceMembership.role`) | DB-backed | Yes | No UI | No (except `requireRole` gating) | Yes |
| Headline/summary/industry/location/avatar/linkedinUrl (`Profile`) | DB-backed (`schema.prisma:238-257`) | CRUD (`profiles.ts`) | **No UI** (`SettingsPage` is placeholder; no profile client) | No | Yes |
| ICP name/description/criteria (`ICP`, `criteria: Json?`) | DB-backed (`schema.prisma:259-271`) | CRUD (`icps.ts`) | No UI | **No** — research passes `icp:''` (`intelligence.ts:275,286`) | Yes |
| Target roles / industries / company size | `MISSING` (no columns; `ICP.criteria` is free-form JSON, unused) | No | No | No | N/A |
| Content pillars | `MISSING` | No | No | No | N/A |
| Tone / voice / banned words / vocabulary | `MISSING` (grep `voice|toneOfVoice|brandVoice|persona|banned` in app code: none) | No | No | No | N/A |
| Writing samples / receipts / approved content / user facts | `MISSING` | No | No | No | N/A |

A UI field being present was not counted as “used”: there are no profile/ICP/voice forms at all. Voice is entirely a Phase 3 build.

---

## 12. Sales Boundary Audit

All sales surfaces are **CRUD only**. No intelligence, research, qualification, scoring, outreach generation, inbox classification, follow-up logic, CRM sync, or external integration.

- `leads.ts` (`/api/v1/leads`): list/create/get/patch/delete; `LeadStatus` set manually; no score/enrich/sequence fields or logic.
- `conversations.ts` (`/api/v1/conversations`): list/create/get/delete; validates parent lead exists; no AI reply, no send.
- `messages.ts` (`/api/v1/messages`): list/create/get/delete; `linkedinMessageId` is an opaque client-supplied string (`:66`), not an integration.
- `pipeline.ts` (`/api/v1/pipeline`): list/create/get/patch/delete; `stage`/`probability` manual; no automation.
- Schema (`schema.prisma:338-431`) and Zod (`schemas/src/index.ts:103-137`) mirror the CRUD shape; no scoring columns.
- Frontend (`LeadsPage`, `InboxPage`, `PipelinePage`) are placeholders; `services/api.ts` has no sales client; `types/index.ts` has no sales types.
- Phase 3 stop-line: Phase 3 must not build outreach, sequencing, inbox classification, lead scoring, or CRM sync. Those belong to later sales phases.

---

## 13. Analytics Boundary Audit

- Schema: `AnalyticsEvent{workspaceId,userId,eventType,eventName,properties,timestamp}` (`schema.prisma:433-450`) — **event collection shape only**.
- API (`analytics.ts`, `/api/v1/analytics`): `POST` writes events, `GET` lists them with `eventType` filter. **No aggregation, no dashboard/metrics/report endpoints, no platform ingestion.**
- Frontend (`AnalyticsPage.tsx`): placeholder; no charts, no fetch.
- Fake/demo metrics: **NOT FOUND** in app code (only the word “Analytics” in wiring/copy). There is no analytics value anywhere to lack provenance — nothing is computed or displayed.
- Phase 3 rule restated: any future metric must carry provenance (source event set + computation); estimated or platform data must be labeled as such.

---

## 14. Learning Boundary Audit

- `LearningSignal{workspaceId,userId,sourceType,sourceId,signalType,signalValue,metadata}` (`schema.prisma:452-472`); source types `CONTENT_PERFORMANCE|ENGAGEMENT|CONVERSION|FEEDBACK`.
- API (`learning.ts`, `/api/v1/learning`): `POST` validates the referenced source exists for known types (`:54-75`) and stores the signal; `GET` lists/filters. No `PATCH/DELETE`, no training, no weight updates.
- Dedicated learning services: **none** (intelligence services do not consume `LearningSignal`; grep confirms no references outside the route).
- Pattern detection / insight generation / scoring influence: **MISSING**.
- Background/scheduled learning: **MISSING** (no workers/cron — §10 cross-check: job/queue/cron grep returns nothing).
- Content-performance learning loop: **MISSING**.
- The only other feedback loop is `OpportunityFeedback` + `POST /opportunities/:id/feedback` (intelligence-scoped, loose linkage — see §6).
- Phase 3 must not build closed-loop learning; it should only emit well-shaped signals (and opportunity feedback) that a later phase can consume.

---

## 15. LinkedIn Integration Audit

Result: **no actual LinkedIn integration exists** in any form.

- OAuth / API clients / calls: **NONE FOUND** (grep `oauth`, `voyager`, `li_at`, LinkedIn-OAuth patterns: none).
- Posting / scheduling / messaging / connection requests: **NONE FOUND** (`ContentStatus.PUBLISHED` in `schema.prisma:18-24` is a manual label; no publisher exists).
- Profile scraping / browser automation / cookies-session automation / CAPTCHA or rate-limit bypass: **NONE FOUND** (grep `playwright|puppeteer|captcha|li_at`: none; the sole “cookie” hit is a `.cookie-banner` CSS selector for generic article cleaning in `sourceExtraction.ts:56`).
- What does exist (explicitly **not** integrations):
  - `Profile.linkedinUrl`, `Lead.linkedinUrl` (`schema.prisma:242,342`): plain URL string storage.
  - `Message.linkedinMessageId` (`schema.prisma:394`): opaque string passthrough.
  - Marketing/policy copy: `package.json:5`, `README.md:3,101` (the latter states official/authorized integrations only, human approval required), `Layout.tsx:13` tagline, one test string.
  - `contentGap.ts:148` contains the word “linkedin” in a topic-keyword list (false positive).
- Classification: UI placeholders for sales pages exist, but there are **no API abstractions for LinkedIn itself** — only domain CRUD with URL-string fields. Nothing to reuse for posting/messaging; Phase 3 must not add any.

---

## 16. Frontend Audit

- `Home` (`HomePage.tsx` + `useHealth.ts` + `services/api.ts`): REAL health/ready integration with loading (`Checking connection...`), error (`Connection Failed` + Retry), and `Unknown` fallbacks. Only real integration in the app.
- `Content` (`ContentPage.tsx`): shell-only. No fetch, no states beyond shared `EmptyPage`; copy says “will be implemented in future phases.” Does **not** consume intelligence opportunities.
- `Brain` (`BrainPage.tsx`): shell-only. No fetch, no tabs, no states. Does **not** consume `/api/v1/intelligence/*`. **This contradicts `PHASE_2_IMPLEMENTATION_REPORT.md` §7/§13 (“Brain UI tabs connected to real APIs”) — that claim is incorrect and is superseded by this audit.**
- `Leads` / `Inbox` / `Pipeline` / `Analytics` / `Settings`: all shell-only placeholders with future-phase copy.
- API client (`services/api.ts:1-26`): health + ready only. No intelligence/content/sales/analytics clients; no `ApiError` misuse found.
- Types (`types/index.ts`): `User`, `Workspace`, `HealthResponse`, `ApiError` only — no domain types for content/intelligence/sales.
- Mock/hardcoded data: **no mock datasets**; hardcoded values are limited to nav structure, header/tagline copy, `Unknown` fallbacks, and inline SVGs.
- Backend-internals exposure: **NOT FOUND** — placeholders render no schemas, prompts, scores, or debug metadata.

---

## 17. Test Audit

Fresh runs in this audit (exact):

- `pnpm --filter=@growth-operator/intelligence test`: **9 files, 127/127 passed** (≈2s).
- `pnpm --filter=@growth-operator/api test`: **1 file, 21/21 passed** (`src/index.test.ts`, supertest vs Docker Postgres, ≈2.5s; covers auth, workspaces, profiles, validation, health shape).
- `pnpm --filter=@growth-operator/web test`: **1 file, 3/3 passed** (`src/App.test.tsx`; React `act()` warnings, non-blocking).
- `pnpm typecheck`: **PASS** (all six workspace packages).
- `pnpm build`: **PASS** (api `tsc` exit 0 + web `tsc && vite build`, 48 modules, `index-EDD2Y1mY.js` 401.63 kB / 115.17 kB gzip) **with the api noEmit caveat in §23**.
- Root `pnpm test` runs **api + web only** (`package.json:10`); intelligence must be run separately. Total verified: **151/151**.

Coverage map (conceptual, not a coverage-percentage tool):

| Category | Present | Evidence |
|---|---|---|
| Unit (services/utils) | Yes | 127 intelligence tests; canonicalization/extraction suites |
| Integration/API (HTTP + DB) | Yes | 21 api tests via supertest against Docker Postgres |
| Security (SSRF) | Yes (unit) | 12 ssrf tests with mocked DNS |
| Intelligence behavioral | Yes | All 9 Phase 2 suites |
| Frontend render | Minimal | 3 tests (loading/nav); no interaction or API-mock tests |
| E2E (browser) | **None** | No Playwright/Cypress config or specs |
| Migration tests | None | Migrations apply; no automated migration test |
| Live-AI tests | None | By design (no credentials); AI paths return `AI_UNAVAILABLE` |
| Load/perf tests | None | Nothing found |

Untested routes: all 10 scaffolding CRUD route files have **zero** dedicated API tests (the 21 api tests predate them). Claim is bounded: “151/151 of existing tests pass,” not “every endpoint is covered.”

---

## 18. Runtime Verification

Performed without changing architecture or touching the database contents (no resets, no seed data, no new users):

- DB: Docker `growth_operator_postgres` (`postgres:17`) `Up (healthy)`; left running.
- API start attempt 1 (`node apps/api/dist/index.js`): **failed as expected** — `MODULE_NOT_FOUND` because `apps/api/dist/` contains only `tsconfig.tsbuildinfo` (api `tsc` emits nothing; see §23).
- API start attempt 2 (`pnpm exec tsx src/index.ts` from `apps/api`): **failed on env** — `❌ Invalid environment variables: { DATABASE_URL: ['Required'], JWT_SECRET: ['Required'] }` because `import 'dotenv/config'` (`index.ts:1`) resolves `.env` from CWD and the only `.env` lives at repo root. (Not a code change; an environment-layout limitation.)
- API start attempt 3 (same, with root `.env` values preloaded as process env, no secrets printed): **succeeded**.
  - `GET /api/v1/health` → `{"status":"healthy","timestamp":"2026-09-27T09:20:47.635Z","service":"growth-operator-api","version":"0.0.0"}` ✅
  - `GET /api/v1/ready` → `{"status":"ready",...,"dependencies":{"database":"connected"}}` ✅
- Authenticated runtime request: **not executed manually** (would require creating credentials/data). Authenticated coverage is instead provided by the 21 automated API tests, which exercise register/login/me/verify plus workspace-authorized routes against the same Docker Postgres.
- No production deployment, no browser session, no external-URL ingestion was executed.

---

## 19. Security / Workspace Audit

Targeted greps over `apps/`, `packages/` (excluding `node_modules`, generated Prisma client, lockfile):

| Check | Result |
|---|---|
| `devWorkspaceContext` | `NOT FOUND` in code (sole hit is the historic “Not found” row in `PHASE_1_STABILIZATION_REPORT.md:282`) |
| Hardcoded workspace IDs / users / tokens | `NOT FOUND` in app code |
| Fake authentication / auth bypass | `NOT FOUND`; JWT verify + `AuthenticationError` paths real (`middleware/auth.ts:28-54`) |
| Unscoped DB queries in routes | `NOT FOUND`; every business route uses `authMiddleware + workspaceMiddleware + workspaceMembershipMiddleware` with `where:{workspaceId}` or `findFirst({id, workspaceId})` (verified per-file in inventory) |
| Cross-workspace access | `NOT FOUND`; workspaces route additionally re-checks `workspaceId !== authReq.workspaceId` (`workspaces.ts:87`) with `requireRole` on mutations |
| Fake success / mock business data | `NOT FOUND` in app code (`vi.mock` hits are test-only) |
| Demo leads / demo analytics / hardcoded metrics | `NOT FOUND` (sole hits are historic “Not found” rows in the Phase 1 stabilization report) |
| `localStorage`/`sessionStorage` as source of truth | `NOT FOUND` (sole hit is the `localStorage` shim in `apps/web/src/test/setup.tsx:18`) |
| Hardcoded secrets / API keys | `NOT FOUND`; `JWT_SECRET` min-32 enforced (`config/env.ts:11`); AI keys optional (`:15-16`); `.env` untracked; dev-only `POSTGRES_PASSWORD: growth_operator_dev` in `docker-compose.yml:8` is local-compose scope only |
| Unsafe URL fetching / SSRF bypasses | `NOT FOUND`; ingestion funnels through `checkSsrfProtection` (`sourceIngestion.ts` via `ssrfProtection.ts`); private/metadata/loopback ranges blocked and unit-tested |
| Auth/CAPTCHA/paywall bypass, LinkedIn scraping | `NOT FOUND` (see §15) |
| Secrets hygiene note | Test fallback credentials exist **only** in the `NODE_ENV=test` path (`config/env.ts:45-46`) and never in production paths |

Residual notes (not vulnerabilities, recorded for completeness): `PATCH /profiles/:profileId` accepts raw `req.body` without a Zod schema (sibling routes validate); `health.ts` is an unmounted orphan (dead code, not a bypass — live health endpoints are inline and public by design).

---

## 20. Phase 3 Readiness

Phase 3’s conceptual pipeline against current reality:

| Pipeline step | State | Basis |
|---|---|---|
| CONTENT OPPORTUNITY (input) | Implemented (input side) | Scoring + retrieval APIs real; generation needs AI live |
| THESIS | Partial | Thesis text exists on opportunities; no preservation enforcement downstream |
| AUDIENCE / ICP | Missing | No audience entity; ICP unused in generation |
| OBJECTIVE | Missing | Text-only field, no taxonomy |
| ANGLE | Partial | `possibleAngles` produced; no selection flow |
| FORMAT | Partial | Enum passthrough; no format-aware logic |
| NARRATIVE | Missing | No outline model |
| HOOK | Missing | No generator |
| CONTENT PLAN | Missing | No plan artifact (the “think before write” step) |
| DRAFT | Partial | Manual `ContentDraft.body` CRUD only |
| EVIDENCE VALIDATION | Missing | No draft-span evidence checker |
| VOICE VALIDATION | Missing | No voice data or checker |
| QUALITY GATES | Missing | No gates engine |
| REVIEW | Missing | Status label only |
| APPROVAL | Missing | Status label only |
| VERSIONED FINAL CONTENT | Partial | Mechanical `ContentVersion` CRUD; no approval-gated finalization |

---

## 21. Exact Phase 3 Missing Components

1. Content plan artifact (pre-prose structured plan: thesis → audience → objective → angle → format → narrative → hook → evidence map).
2. Audience/ICP resolution engine (match opportunity against workspace ICP; currently `icp:''`).
3. Objective taxonomy + selection.
4. Angle selection + locking.
5. Format-semantic generators: post, article, **true** carousel (slides model), checklist, framework, contrarian — each with distinct structural validators.
6. Narrative/outline builder.
7. Hook generator with anti-template rules.
8. Draft composer that binds claim spans to `SourceClaim` IDs.
9. Evidence validator (every factual claim → SUPPORTED claim or `REVIEW_REQUIRED`; statistics require `STATISTIC` claims).
10. Contradiction propagator (surface ledger contradictions into draft review).
11. Voice context assembly (profile + ICP + pillars + samples + receipts + approved content) with leakage guards.
12. Banned-word / vocabulary enforcement (storage + checker).
13. Quality-gate engine where **hard gates override numeric scores**.
14. Review queue + approval transitions (DRAFT → REVIEW → APPROVED, enforced, not labels).
15. Versioned finalization (immutable approved version + preview-equals-approved guarantee).
16. Preview renderer (guaranteed free of `[SLIDE]`/`[HOOK]`/JSON/debug markup).
17. Honest AI-unavailable behavior extended to every new generator (no fallback prose).
18. Provenance bundle on `ContentIdea`/drafts (opportunity + source/claim/trend ID lists + evidence snapshot), replacing the current `{opportunityId}`-only handoff.
19. Schema migration(s): plan/narrative/hook/voice/evidence-span/gate-result storage (exact shape is Phase 3 design work, not prescribed here).
20. API additions: plan/narrative/hook/draft-compose/validate/review/approve/preview endpoints (exact routes are Phase 3 design work).
21. Frontend: Brain wired to real intelligence endpoints; Content wired to plan/draft/review/approve flows with loading/error/empty states.
22. Tests: generator unit tests (deterministic fixtures), gate-override tests, evidence-binding tests, approval-flow tests, workspace-isolation tests for all new endpoints, plus negative tests for every quality failure in §9.

---

## 22. Recommended Phase 3 Architecture

Principles from the audit brief, mapped to concrete placement:

1. **THINK BEFORE WRITE** — new `ContentPlan` step owned by a planner service; the draft composer may only render from an approved plan. Reuse `SourceUnderstanding`/`ClaimLedger` outputs as plan inputs; do not re-extract.
2. **THESIS PRESERVATION** — carry `thesis` verbatim from opportunity → plan → draft → version; add a thesis-similarity check in the evidence/quality pass. Reuse `ContentOpportunity.thesis` and convert-time copy (`intelligence.ts:483`).
3. **FORMAT IS SEMANTIC** — one generator per format with a structural validator (carousel requires a slides model; checklist requires checklist items; framework requires steps). Do not split a text post into slides.
4. **EVIDENCE FIRST** — draft spans reference `SourceClaim.id`; validator marks unbound factual claims `REVIEW_REQUIRED`; statistics require `claimType:STATISTIC`; contradictions from `ClaimLedgerService.detectContradictions` surface in review.
5. **CONTRADICTIONS PROPAGATE** — pipe ledger severity into the plan and review UI; never silently drop.
6. **GATES OVERRIDE SCORES** — gate engine returns `PASS/REVIEW_REQUIRED/BLOCKED` independent of the 10-D `overallScore`; `APPROVED` transition requires `PASS`.
7. **NO INTERNAL MARKUP** — preview renderer strips/never emits `[SLIDE]/[HOOK]/[CTA]`, JSON, debug metadata; add a test asserting absence.
8. **HONEST AI-UNAVAILABLE** — every generator returns typed `AI_UNAVAILABLE` with zero prose when the registry is empty (extend the existing `sourceUnderstanding.ts:52-58` / `contentOpportunity.ts:77-83` pattern).
9. **VOICE IS CONTEXT** — assemble voice server-side from Profile/ICP/pillars/samples/receipts into a context block; never render it into user-visible content; add leakage tests.
10. **NO FAKE ANALYTICS** — Phase 3 must not invent performance data; analytics stays write-only until a later phase defines real ingestion.
11. **HUMAN APPROVAL** — enforce DRAFT → REVIEW → APPROVED transitions in the API (not labels); publishing stays out of scope.
12. **WORKSPACE ISOLATION** — every new query uses the established `findFirst({id, workspaceId})` / `where:{workspaceId}` pattern behind the existing middleware triple.

---

## 23. Risks / Technical Debt

1. **Missing Prisma unique constraints (highest priority):** `TrendSignal` lacks `@@unique([workspaceId, topicId])` yet `TrendSignalService.updateTrendSignal` upserts on `workspaceId_topicId` (`trendSignal.ts:121-127`); `TopicMention` lacks `@@unique([workspaceId, topicId, sourceId])` yet `TopicClusteringService` upserts on `workspaceId_topicId_sourceId` (`topicClustering.ts:143-150`). Both paths execute from `POST /topics/research` (`intelligence.ts:245-257`). Live calls would fail; unit tests pass only because Prisma is mocked. Phase 3 must add the constraints (or change the write logic) with a migration.
2. **API has no compiled output:** root `tsconfig.json` sets `noEmit:true`; `apps/api/tsconfig.json` never overrides it, so `pnpm --filter=@growth-operator/api build` exits 0 while emitting nothing (`apps/api/dist/` holds only `tsconfig.tsbuildinfo`). `pnpm start` (`node dist/index.js`) cannot work. Production deployment of the API is therefore currently impossible without a build-config fix.
3. **Dev env layout:** `apps/api/src/index.ts:1` loads `.env` from process CWD; the only `.env` is at repo root, so `pnpm --filter=@growth-operator/api dev` from the package dir fails env validation (observed: `DATABASE_URL/JWT_SECRET Required`). Documented here; not fixed per audit-only restriction.
4. **Orphan `health.ts`:** `apps/api/src/routes/health.ts` is dead code (live health/ready are inline in `index.ts:48-76`). Harmless but confusing.
5. **Unvalidated profile PATCH:** `profiles.ts` `PATCH /:profileId` applies raw `req.body`; all sibling routes use Zod schemas.
6. **Thin provenance:** opportunity ID lists are `Json` (no FKs); `OpportunityFeedback` has no relation to `ContentOpportunity`; convert returns `{opportunityId}` only. Later analytics/learning joins will be fragile.
7. **Committed Prisma generated client:** `packages/db/src/generated/client/*` (including a 19MB Windows `.node` binary) is tracked in git from Phase 1. Harmless for the audit; inflates the repo and risks platform-specific breakage.
8. **Stale report claims:** `PHASE_2_IMPLEMENTATION_REPORT.md` §7/§13 claims Brain UI API integration that does not exist (corrected by this audit). Future readers should treat this boundary audit as authoritative on scope.
9. **Zero tests for scaffolding CRUD routes:** the 10 route files added in the Phase 2 commit have no dedicated API tests; the 21 API tests predate them.
10. **Research endpoint passes empty voice context:** `workspaceProfile:''`, `icp:''`, `existingTopics:[]` (`intelligence.ts:274-276,285-286`) — profile/ICP data is collected but never used.

---

## 24. Files That Phase 3 Should Reuse

- `packages/intelligence/src/sourceUnderstanding.ts` — grounded understanding + `SourceUnderstandingSchema` + honest degradation.
- `packages/intelligence/src/claimLedger.ts` — claim persistence, contradiction primitives, provenance fields.
- `packages/intelligence/src/topicClustering.ts` — normalization + deterministic fallback (after fixing the mention-upsert key, §23.1).
- `packages/intelligence/src/trendSignal.ts` — status calculus + scorers (after fixing the upsert key, §23.1).
- `packages/intelligence/src/contentOpportunity.ts` — 10-D scoring dimensions and critical-failure pattern; extend, don’t fork.
- `packages/intelligence/src/contentGap.ts` — deterministic gap rules + dedupe.
- `packages/intelligence/src/sourceIngestion.ts` + `ssrfProtection.ts` + `packages/shared/src/intelligence/*` — fetch/extract/canonicalize stack as-is.
- `packages/ai/src/*` — provider abstraction, registry, request/response Zod types.
- `apps/api/src/routes/intelligence.ts` — retrieval + research + feedback + convert endpoints as the read/handoff layer.
- `apps/api/src/middleware/auth.ts` — auth + workspace triple-middleware + `requireRole` pattern.
- `packages/schemas/src/index.ts` — extend existing Zod schemas rather than inventing parallel validation.
- `packages/db/prisma/schema.prisma` — extend (plan/narrative/voice/evidence-span/gate models) rather than side tables.

---

## 25. Files That Phase 3 Should NOT Duplicate

- Do **not** create a second claim/contradiction system — extend `claimLedger.ts`.
- Do **not** create a second topic/trend/gap scorer — extend `topicClustering.ts`, `trendSignal.ts`, `contentGap.ts`, `contentOpportunity.ts`.
- Do **not** create a second URL fetcher or SSRF checker — reuse `sourceIngestion.ts` / `ssrfProtection.ts`.
- Do **not** create a second AI registry or provider wrapper — reuse `packages/ai`.
- Do **not** duplicate Zod validation already in `packages/schemas/src/index.ts`.
- Do **not** fork `contentIdeas.ts` / `contentDrafts.ts` / `contentVersions.ts` into a parallel content store — extend them with plan/gate/approval behavior.
- Do **not** build LinkedIn posting/messaging/scheduling, lead scoring, outreach sequencing, inbox classification, analytics aggregation, or learning loops — all out of scope (see §§12–15).
- Do **not** reimplement workspace isolation — reuse the middleware triple and the `findFirst({id, workspaceId})` pattern.

---

## 26. Acceptance Criteria for Phase 3

1. A structured content plan is created and persisted **before** any prose, and the draft composer renders only from an approved plan (tests: plan-first ordering, no-plan-no-draft).
2. The opportunity/user thesis is byte-preserved through idea → plan → draft → final, with a similarity check (tests: thesis-preservation fixtures).
3. Each supported format has a distinct generator + structural validator (tests: carousel-is-slides, checklist-is-checklist, framework-teaches-steps, contrarian-thesis-defensible).
4. Every factual draft claim binds to a `SourceClaim.id`; statistics bind to `STATISTIC` claims; unbound claims yield `REVIEW_REQUIRED`, never invented evidence (tests: evidence-binding matrix).
5. Ledger contradictions surface in plan review and block silent approval (tests: contradiction propagation).
6. Hard quality gates override numeric scores: no `APPROVED` transition on `BLOCKED`, regardless of score (tests: gate-override cases including an 87/100-with-critical-failure fixture).
7. Preview output contains no `[SLIDE]`/`[HOOK]`/`[CTA]`, JSON, instructions, or debug metadata (tests: markup-absence assertions).
8. AI-unavailable paths return typed errors with zero generated prose for every generator (tests: empty-registry matrix).
9. Voice context (profile/ICP/pillars/samples/receipts) influences generation without leaking into user-visible content (tests: leakage assertions).
10. No fabricated analytics, metrics, or performance claims appear anywhere (tests: analytics-absence assertions on content surfaces).
11. DRAFT → REVIEW → APPROVED transitions are API-enforced with role checks; consequential actions remain human-approved (tests: transition matrix including forbidden jumps).
12. Every new endpoint is workspace-isolated with tests proving cross-workspace access is denied.
13. The two Prisma upsert-key defects (§23.1) are resolved via migration + regression tests covering `normalizeTopics` and `updateTrendSignal` against a real database.
14. Brain and Content frontends consume the real APIs with loading/error/empty states; no placeholder copy remains on shipped paths (tests: mocked-API component tests at minimum; browser E2E listed as explicit non-goal unless staffed).
15. Full suite green: existing 151 tests plus all new Phase 3 tests; `pnpm typecheck` and `pnpm build` pass; this audit’s `UNVERIFIED` list shrinks only for items actually executed.
