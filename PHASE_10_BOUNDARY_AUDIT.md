# PHASE 10 BOUNDARY AUDIT (FRESH)

Audit only. No application code modified, no Prisma schema modified, no migrations,
no dependencies, no refactor, no fixes, no commit, no push. Phase 10 NOT implemented.
Prior phase reports treated as historical evidence, never authority — every material
claim below was re-verified against the CURRENT source (routes, packages, schema,
UI) at HEAD `89bc4a3`.

A stale `PHASE_10_BOUNDARY_AUDIT.md` (untracked, ~19KB) existed from the interrupted
prior attempt. It claims HEAD `7efdfee` (Phase 8) while already describing Phase 9
as implemented — internally inconsistent and stale. It was discarded and replaced
by this fresh audit. No other working-tree changes existed.

## 1. Starting Git State

- `git status --short` at audit start: only `?? PHASE_10_BOUNDARY_AUDIT.md` (the stale
  interrupted file). No modified tracked files. No application-code changes.
- `git log --oneline -8`:
  - `89bc4a3 phase 9: objection-driven content initiation` (HEAD)
  - `7efdfee phase 8: complete cross-machine recommendations` (parent)
  - `a1703cf phase 7: activate cross-machine intelligence`
  - `a03067d phase 6: growth intelligence and decision engine`
  - `cfb3dd0 phase 5: outcomes and learning loop verified`
  - `b9bd5d0 phase 4: sales intelligence verified`
  - `6a5627a phase 3: content machine verified`
  - `32024a8 phase 2: growth intelligence engine verified`
- HEAD verified: `89bc4a3` (`git rev-parse HEAD` = `89bc4a390f607dc4ec3434a1d549ffb8108e0469`).
- Working tree: CLEAN except the stale untracked audit file. No unexpected
  application-code changes. Nothing reverted (per instructions, no auto-revert).

## 2. Current Architecture

Verified from current source (not from old reports):

```
apps/web (React 18 + Router v6, fetch client;
  Analytics/Brain/Content/Home/Inbox/Leads/Pipeline/Settings + EmptyPage)
  -> apps/api (Express, JWT + workspace triple-middleware, Zod, typed errors;
       22 route mounts: auth/workspaces/profiles/icps/content-ideas/
       content-drafts/content-versions/content-plans/content-reviews/voice/
       leads/conversations/messages/pipeline/analytics/learning/intelligence/
       prospects/outreach/sales-intelligence/publish-records/outcomes/operator)
    -> packages/decision (11 collectors / eligibility exhaustive-switch /
        deterministic 0-100 scorer / explainer + explainWithAi /
        OperatorAction refresh + dismiss/complete + initiateIdea for
        objection_pattern only)
    -> packages/content (idea -> plan/strategy -> compose -> 16 quality gates ->
        review -> approval -> immutable final version -> preview ->
        publication record -> outcome record)
    -> packages/sales (ICP -> discovery -> research -> qualification -> scoring ->
        brief -> strategy -> compose -> gates -> review -> prepared action ->
        classify -> follow-up -> pipeline + objections/topicRelevance/bridge)
    -> packages/intelligence (ingest w/ SSRF guard -> extract -> claims ->
        topics/mentions -> trends/gaps/opportunities + learning-adjusted
        opportunity scoring view)
    -> packages/learning (publish/outcome record -> aggregation -> derivation ->
        PROPOSED lifecycle -> confirm/reject/revoke -> qualification +
        opportunity + operator-ranking influence; zero AI calls)
    -> packages/ai (OpenAI + Anthropic registry; honest AI_UNAVAILABLE; embeddings
        defined but uncalled) -> packages/db (PostgreSQL 17, Prisma) + shared + schemas
```

Key files: `apps/api/src/index.ts:93-115` (mounts), `apps/api/src/routes/operator.ts`
(operator surface), `packages/decision/src/{collectors,signals,eligibility,scoring,
actions,initiation,explain}.ts`, `packages/content/src/*`, `packages/sales/src/*`,
`packages/intelligence/src/*`, `packages/learning/src/*`, `packages/ai/src/registry.ts`,
`packages/db/prisma/schema.prisma` (45 models, 6 migration dirs), `apps/web/src/pages/*`.

Per-machine state:

1. **Content Machine** — idea CRUD (`contentIdeas.ts`), plan generate/validate/approve
   (`contentPlans.ts`, `packages/content/src/plan.ts + strategy.ts`), compose-from-approved-plan
   (`compose.ts`, `POST /content-drafts/compose`), 16 quality gates (`gates.ts`,
   `POST /:id/validate`, `GET /:id/gates|preview`), review lifecycle with approval gate
   (`review.ts`, `contentReviews.ts`), finalize-to-immutable-version
   (`contentVersions.ts: POST /finalize`), record-publication / record-outcome as
   user-assertion-only (`publishRecords.ts`, `outcomes.ts`, `ContentPage.tsx:1266-1507`).
2. **Sales Machine** — ICP, discovery (manual), research, qualification, scoring, brief,
   strategy (with validated-optional `relevantContentId`), compose, outreach gates,
   review, prepared actions (READY_FOR_AUTHORIZED_EXECUTION, human-authorized, no senders),
   classify/recommend-follow-up, follow-ups, pipeline, objections aggregation,
   topic relevance computation, `SalesBridgeService.toContentInput` (shapes evidence, no
   content consumer calls it).
3. **Intelligence** — caller-supplied-URL ingest, extraction, claims, topics/mentions,
   trends/gaps/opportunities, feedback, diversity, scoring + explanations, learning-adjusted
   scoring seam (`intelligence.ts:42-64` via `applyLearningInfluence`).
4. **Learning** — outcome recording with idempotency key, aggregation, pure derivation
   (2+ groups, minSample 3, minGap 0.1, adjustment in [0.02,0.20], MAX 0.2), PROPOSED ->
   CONFIRMED/REJECTED -> REVOKED (confirm/revoke OWNER/ADMIN only), influences on
   qualification + opportunity + operator ranking only.
5. **Decision / Operator** — 11 collectors (9 base + 2 Phase-8 cross-machine), live
   eligibility, deterministic scorer, explainer, refresh upsert + stale-removal, lifecycle
   (PENDING -> DISMISSED/COMPLETED only), Home + Brain explanations, cross-machine recs,
   ONE initiation transition (`initiateIdea`, objection_pattern only).
6. **Analytics** — raw events record/list, outcome metrics consumed by aggregation and
   learning, defined-pair rates + honest empty states; no funnels/cohorts/attribution/joins.
7. **AI** — guarded call sites only (understanding/synthesis/composition/classify-assist/
   optional summaries + explainWithAi summarize-only); honest unavailable states.
8. **External integrations** — none outbound (no OAuth, senders, LinkedIn clients,
   automation, scraping). `linkedinUrl/linkedinMessageId` are plain string columns;
   "LinkedIn" appears only in prompt copy and `prepared.ts` "no senders" comment.
9. **Persistence** — 45 Prisma models, 6 migration dirs (init + phase2-6), in sync; no drift.
10. **Human approval** — plan approve OWNER/ADMIN, review approve OWNER/ADMIN + no-BLOCKED-gate,
    finalize OWNER/ADMIN, learning confirm/revoke OWNER/ADMIN, prepared-action ready state,
    no autonomous consequential action.
11. **Background infrastructure** — none (no workers/queues/schedulers/retries/notifications);
    synchronous `refreshWorkspace` with bounded caps.

## 3. Capability Matrix

Statuses: IMPLEMENTED / PARTIAL / MISSING / INTENTIONALLY ABSENT.

CONTENT:

- idea creation (manual, ungated, title-only required, DRAFT default): IMPLEMENTED
- source/research (caller-supplied URLs only): PARTIAL
- evidence: IMPLEMENTED
- contradictions: IMPLEMENTED
- audience/ICP: IMPLEMENTED
- voice: IMPLEMENTED
- strategy (plan generate/validate/approve): IMPLEMENTED
- hooks: IMPLEMENTED
- composition (from approved plan only): IMPLEMENTED
- quality gates (16 checks, BLOCKED>REVIEW_REQUIRED>WARN>PASS): IMPLEMENTED
- review: IMPLEMENTED
- approval (OWNER/ADMIN + gate check): IMPLEMENTED
- immutable final versions: IMPLEMENTED
- preview: IMPLEMENTED
- publication (user-asserted record only): IMPLEMENTED
- outcomes (user-asserted record only): IMPLEMENTED
- performance analytics (summary + defined rate pairs): IMPLEMENTED
- content learning (outcome rules -> proposals -> opportunity scoring): IMPLEMENTED (ACTIVE path)
- content recommendations (confirmed learning influencing creation choices): MISSING
- visual planning: MISSING (zero code/UI references)
- content opportunity intake (objection-driven initiation): IMPLEMENTED (Phase 9; relevance path MISSING)

SALES:

- ICP: IMPLEMENTED
- prospect discovery (manual): IMPLEMENTED
- research: IMPLEMENTED
- qualification: IMPLEMENTED
- scoring: IMPLEMENTED
- personalization: IMPLEMENTED
- outreach drafting: IMPLEMENTED
- review: IMPLEMENTED
- approval: IMPLEMENTED
- prepared actions (human-authorized, non-executable): IMPLEMENTED
- inbox (classify + follow-up recs): IMPLEMENTED
- follow-up: IMPLEMENTED
- pipeline: IMPLEMENTED
- outcomes: IMPLEMENTED
- sales learning (no sales-specific rules, generic derivation only): PARTIAL
- sales recommendations (relevance actions exist; no workflow initiation): PARTIAL
- external execution: INTENTIONALLY ABSENT

INTELLIGENCE:

- source ingestion: IMPLEMENTED
- extraction: IMPLEMENTED
- claims: IMPLEMENTED
- evidence: IMPLEMENTED
- contradictions: IMPLEMENTED
- topics: IMPLEMENTED
- topic mentions: IMPLEMENTED
- trends: IMPLEMENTED
- gaps: IMPLEMENTED
- opportunities: IMPLEMENTED
- feedback: IMPLEMENTED
- source diversity: IMPLEMENTED
- scoring: IMPLEMENTED
- explanations: IMPLEMENTED
- research discovery (external URL discovery): MISSING (caller-supplied URLs only)
- cross-machine signals (objection patterns + topic relevance -> operator): IMPLEMENTED

LEARNING:

- outcome recording: IMPLEMENTED
- aggregation: IMPLEMENTED
- proposal derivation: IMPLEMENTED
- confirmation: IMPLEMENTED
- rejection: IMPLEMENTED
- revocation: IMPLEMENTED
- qualification influence: IMPLEMENTED (confirmed-only, bounded +/-0.2)
- opportunity influence: IMPLEMENTED (confirmed-only, bounded)
- operator ranking influence: IMPLEMENTED (learning_boost <=10pts, confirmed-only)
- content recommendation influence: MISSING
- sales strategy influence: MISSING

DECISION / OPERATOR:

- collectors (11 kinds): IMPLEMENTED
- eligibility (exhaustive-switch, live re-check): IMPLEMENTED
- scoring: IMPLEMENTED
- explanations (deterministic + optional AI summary): IMPLEMENTED
- deduplication (identityKey): IMPLEMENTED
- lifecycle (PENDING->DISMISSED/COMPLETED): IMPLEMENTED
- Home recommendations: IMPLEMENTED
- cross-machine recommendations (objection_pattern + prospect_relevance): IMPLEMENTED
- action initiation (objection_pattern -> ContentIdea): IMPLEMENTED (Phase 9)
- workflow linkage (bidirectional provenance via subjectMeta): IMPLEMENTED (objection path only)
- action completion (manual dismiss/complete): IMPLEMENTED

ANALYTICS:

- raw events: IMPLEMENTED (record/list; no consumers)
- outcome metrics: IMPLEMENTED
- aggregation: IMPLEMENTED
- provenance: IMPLEMENTED
- rates (defined pairs): IMPLEMENTED
- funnels: MISSING
- cohorts: MISSING
- attribution: MISSING
- content-to-lead relationships: MISSING
- lead-to-opportunity relationships: MISSING
- recommendation performance: PARTIAL (objection initiation events now exist; relevance path has none)

EXTERNAL:

- LinkedIn OAuth: INTENTIONALLY ABSENT
- LinkedIn identity: INTENTIONALLY ABSENT
- LinkedIn data: INTENTIONALLY ABSENT
- LinkedIn publishing: INTENTIONALLY ABSENT
- LinkedIn messaging: INTENTIONALLY ABSENT
- LinkedIn analytics: INTENTIONALLY ABSENT
- external research/discovery: MISSING (intentional carve-out; SSRF-guarded fetch only for caller URLs)

INFRASTRUCTURE:

- workers: INTENTIONALLY ABSENT
- queues: INTENTIONALLY ABSENT
- schedulers: INTENTIONALLY ABSENT
- retries: INTENTIONALLY ABSENT
- notifications: INTENTIONALLY ABSENT
- background processing: INTENTIONALLY ABSENT
- rate limiting: MISSING (no external calls needing it; internal caps suffice)

## 4. End-to-End Flow Audit

Traced against CURRENT source:

FLOW A (Idea -> research -> evidence -> strategy -> draft -> review -> approval ->
publication -> outcome -> learning -> recommendation): COMPLETES except two carve-outs:
research is caller-supplied (PARTIAL by design) and confirmed learning has no consumer
in content-creation choices (MISSING). All gates from idea to outcome verified wired
(`contentIdeas/Plans/Drafts/Reviews/Versions`, `publishRecords`, `outcomes`,
`learning derived/content-outcome`).

FLOW B (ICP -> prospect -> research -> qualification -> scoring -> personalization ->
outreach -> approval -> response -> follow-up -> pipeline -> outcome -> learning ->
recommendation): COMPLETES except manual discovery (PARTIAL by design), intentional
non-execution of prepared actions (INTENTIONALLY ABSENT external step), and generic-only
sales learning (PARTIAL). No automation beyond explicit human gates.

FLOW C (Source -> evidence -> topic -> trend/opportunity -> decision -> operator action ->
human workflow): COMPLETES. Ingest->opportunity chain (`POST /intelligence/topics/research`),
opportunity scoring seam, 11 collectors, eligibility/scoring/explain, Home/Brain UI,
manual dismiss/complete. Actions are terminal pointers except the one Phase-9 initiation.

FLOW D (Sales objection -> objection pattern -> operator recommendation -> Start idea ->
ContentIdea -> content workflow): COMPLETES (was PARTIAL before Phase 9). Verified:
`signals.objectionPatterns` (MIN_SAMPLE 2, cap 20) -> candidate -> eligibility
(`eligibility.ts:109-130`, live distinct-conversation recount) -> Home "Start idea"
(`HomePage.tsx:316-324`, objection_pattern-only guard) -> `POST
/api/v1/operator/actions/:actionId/ideas` (`operator.ts:96-106`) -> DRAFT ContentIdea
(tag `objection-driven`, deterministic prefill) + subjectMeta linkage -> refresh preserves
linkage (`actions.ts:53-86` via `extractResultKeys`) -> user continues manually through
plan/compose/gates/review/approval/finalize/publish/outcome (all unchanged, all mandatory).

FLOW E (Topic -> prospect relevance -> operator recommendation -> sales workflow):
PARTIAL — stops at advice text. Verified: `signals.prospectRelevance` computes bounded
relevance (10 topics x 10 leads, floor 0.5, max 10 actions, `signals.ts:104-203`) ->
eligibility recomputes `computeTopicRelevance` live (`eligibility.ts:131-156`) ->
Home shows "Prospect fit" card (`HomePage.tsx:46`) with only Open/Dismiss/Mark-done
(no Start-idea button; guard is objection-only) -> "Suggested next step: review the
prospect in Leads" (one click via Open to `/leads`, but no deeper use;
`relevantContentId` on strategies remains a validated-but-uncomputed optional field).
**This is the precise symmetric dead end to pre-Phase-9 Flow D.**

FLOW F (Outcome -> learning proposal -> confirmation -> scoring influence -> future
recommendation): COMPLETES. Verified: `recordOutcome` -> `summarize` -> `deriveProposal`
-> `propose` (PROPOSED) -> confirm (OWNER/ADMIN) -> `confirmedInfluences` consumed by
qualification/opportunity/operator scoring. Live-tested in prior phases; unchanged by Phase 9.

## 5. Cross-Machine Intelligence Matrix

1. Sales objections -> content opportunities: DEAD END (patterns never reach opportunity
   generation; unchanged).
2. Sales objections -> content strategy: MISSING (strategy takes no sales input; verified).
3. Topics -> prospect relevance: ACTIVE computation, PARTIAL use (operator actions only;
   no workflow initiation consumer).
4. Content engagement -> prospect relevance: MISSING (no engagement model).
5. Content engagement -> prioritization: MISSING (no model).
6. Relevant content -> outreach: PARTIAL (validated optional `relevantContentId` on
   strategies, `strategy.ts:98-119`; nothing computes it; `toContentInput` uncalled by
   any content consumer).
7. Research -> content: PARTIAL (mutually readable rows; `bridge.toContentInput`
   shapes data but has exactly one caller — `salesIntelligence.ts:119` research route —
   and zero content-side callers).
8. Research -> sales: PARTIAL (same bridge; readable, not auto-consumed).
9. Content performance -> learning: ACTIVE (content-outcome rules -> proposals -> scoring).
10. Sales outcomes -> learning: PARTIAL (generic derivation only; no sales-specific rules).
11. Learning -> qualification: ACTIVE (confirmed-only, bounded).
12. Learning -> opportunity scoring: ACTIVE (confirmed-only, bounded).
13. Learning -> content recommendations: MISSING (no consumer shape in creation choices).
14. Learning -> sales strategy: MISSING (no consumer shape).
15. Learning -> operator ranking: ACTIVE (learning_boost <=10pts, confirmed-only).
16. Intelligence -> operator actions: ACTIVE (11 collectors, all wired).
17. Operator actions -> workflow initiation: PARTIAL (objection_pattern ACTIVE via Phase 9;
    prospect_relevance DEAD END — the Phase 10 target; all other 9 kinds terminal by design).
18. Outcomes -> future recommendations: PARTIAL (works via learning loop; recommendation
    performance measurement has objection-path initiation events but no relevance-path events).

## 6. Phase 9 Post-Implementation Audit

Independently re-traced at HEAD `89bc4a3` (Phase 9 committed):

Chain: `aggregateObjectionPatterns` -> `signals.objectionPatterns` candidate
(`identityKey=objection_pattern:<sha256>`, subjectMeta with normalizedObjection/count/
conversationIds/classificationIds/minSampleSize/sampleEvidence) -> `collectCandidates`
-> `checkEligibility` (live recount vs minSample) -> `refreshWorkspace` upsert ->
`POST /api/v1/operator/actions/:actionId/ideas` (`operator.ts:96-106`, triple middleware:
auth + workspace + membership) -> `initiateIdea` (`actions.ts:131-209`) -> `ContentIdea`
+ subjectMeta linkage -> Home navigation to `/content`.

Verified item by item:

- authentication: YES (router-level `authMiddleware`).
- workspace isolation: YES (`findFirst({id: actionId, workspaceId})`, creation with
  `workspaceId`, eligibility scoped; integration tests cover foreign/outsider denial).
- authorization: YES (membership middleware; confirm/revoke-style role gates not needed
  here — any member may scaffold a draft; downstream approve gates remain OWNER/ADMIN).
- objection_pattern validation: YES (`row.kind !== 'objection_pattern'` -> 409 CONFLICT).
- PENDING validation: YES (`row.status !== 'PENDING'` -> 409).
- stale eligibility: YES (re-collect + `checkEligibility`; missing/stale -> 409, nothing created).
- duplicate protection: YES for sequential calls (409 with existing ideaId/title when
  `resultIdeaId` resolves to a live idea; proceeds when prior idea deleted — correct).
- ContentIdea creation: YES — exactly one, DRAFT default (schema default, no status override),
  title `Address objection: "<quote>"` sliced to 200 (`initiation.ts:40-53`), deterministic
  description (count/pattern/conversations/classifications/identityKey + gates-still-required
  note), tags `['objection-driven']`.
- DRAFT state: YES (schema `ContentStatus @default(DRAFT)`; no override in `actions.ts:182-190`).
- provenance: YES bidirectional (idea description cites pattern/conversations/action identity;
  action subjectMeta merged `{resultIdeaId, resultIdeaTitle, initiatedAt}`, never replaced).
- subjectMeta linkage: YES (spread-merge; `extractResultKeys` keeps only the 3 linkage keys).
- refresh behavior: YES (persistedMeta map + merge on upsert `actions.ts:53-64`; `/next-actions`
  route re-merges `operator.ts:45`; stale PENDING rows deleted as before).
- absence of unintended downstream artifacts: YES by construction (no plan/draft/review/
  publish/outcome/learning/outreach/pipeline/analytics calls in `initiateIdea`; integration
  test asserts zero side-effect artifacts).

After ContentIdea creation the user CAN continue manually through strategy -> composition ->
quality gates -> review -> approval -> publication record -> outcome record (all routes and
`ContentPage` panels verified present and unchanged). Nothing is auto-created; action stays
PENDING for manual dismiss/complete.

Carried-forward Phase 9 forensic issue — MEDIUM concurrent-duplicate race: two concurrent
requests can both pass the `resultIdeaId` check, both create ideas, second update wins,
first orphaned (`actions.ts:142-190`, sequential create+update with compensating delete,
not `prisma.$transaction`; `.catch(() => undefined)` swallows compensation failure — LOW
sub-issue). Verdict: REMAINS TECHNICAL DEBT. It does not materially affect the next phase
selection (same pattern would be reused; fixing it via row-lock/transaction is a small
hardening item that can ride along with or follow Phase 10, not a phase of its own).
Documented here and carried to Section 21.

## 7. Dead-End Analysis

Format: SOURCE -> CURRENT OUTPUT -> MISSING CONSUMER -> USER FRICTION -> EXISTING
INFRASTRUCTURE THAT COULD CONSUME IT.

D1. Objection pattern -> ranked Home recommendation -> (Phase 9: DRAFT idea + linkage).
   RESOLVED. Remaining gap is only the inherited concurrency debt above.

D2. Prospect relevance -> ranked Home recommendation ("Prospect fit", relevance % +
   per-dimension reasons) -> NO initiation consumer -> operator clicks Open to Leads,
   then manually navigates to Content and retypes topic/lead context; system cannot tell
   which relevance recs produced work -> `ContentIdea` + `subjectMeta` linkage (exact
   Phase-9 rails) + existing eligibility recompute + existing Home card. **Primary
   Phase-10-shaped dead end.**

D3. `toContentInput` bridge -> shaped measured evidence -> NO content-side caller ->
   researcher copies context manually -> `ContentIdea`/`ContentPlan` creation inputs
   (already accept free-form fields). Lower leverage than D2 (no ranked trigger).

D4. `relevantContentId` field -> validated optional strategy field -> NOTHING computes it
   -> strategist guesses which content fits a lead -> read-only relevance lookup
   (ideas-by-topic) rendered in strategy form. Real but SMALLER than D2 (strategy form is
   already manually completable; consumer render location less defined than D2's existing card).

D5. Confirmed learning -> qualification/opportunity/ranking (ACTIVE) BUT NOT content-creation
   choices or sales strategy -> authors get no learning-guided suggestions -> NO consumer
   shape exists (what would a "learning-guided title" even render as?). Inventing one is a
   design task, not a linkage task. DEFERRED.

D6. AnalyticsEvent / LearningSignal rows -> stored, listed -> NO readers in any package
   (verified: only `analytics.ts`/`learning.ts` routes reference them) -> none (no UI
   producer, no question they answer) -> deliberately NOT a consumer target (analytics-deepening trap).

D7. OutcomeMetric -> aggregation + learning (ACTIVE) BUT NOT funnels/cohorts/attribution/
   content->lead/lead->opportunity joins -> analyst cannot answer attribution questions ->
   would need new join semantics + new UI. Broad redesign, not bounded. DEFERRED.

D8. Prepared actions (READY_FOR_AUTHORIZED_EXECUTION) -> terminal pointer (dismiss/complete
   records decision only) -> NO executable external action -> user executes manually outside
   the system -> LinkedIn OAuth/token/identity/capability/rate-limit/retry/idempotency/audit
   stack (14 prerequisites, all absent). Coherent LATER phase of its own, not Phase 10.

Not every dead end belongs in Phase 10. Only D2 has: a ranked trigger already firing, a
proven linkage pattern (Phase 9), existing eligibility recompute, existing persistence
shape, and a one-button UI slot — i.e. the smallest safe transformation that closes a loop.

## 8. Data Model Audit

- Schema: `packages/db/prisma/schema.prisma` (1401 lines), 45 models, 6 migration dirs
  (`init`, `phase2_intelligence`, `phase3_content_machine`, `phase4_sales`,
  `phase5_outcomes`, `phase6_operator_actions`); no drift reported by prior forensic runs.
- `ContentIdea`: title required (`@db.VarChar(200)`), rest optional, `status DRAFT` default,
  `tags String[]`, plus `topicId/sourceIds/claimIds/trendSignalIds/thesis/audience/
  evidenceSnapshot` — accepts prefilled relevance-driven creation with NO migration
  (title + description + tags suffice; `topicId`/`lead` refs can ride in description +
  subjectMeta exactly as Phase 9 does for objections).
- `OperatorAction`: `@@unique([workspaceId, identityKey])`, `subjectMeta Json?` — the
  Phase-9 linkage keys (`resultIdeaId/resultIdeaTitle/initiatedAt`) fit without migration;
  refresh upsert already preserves them. A second kind branch reuses the same keys
  (kind is carried by the action row itself; no key collision: one action has one kind).
- `OutreachStrategy.relevantContentId String?` + `contentReason` — existing validated-optional
  field; auto-suggestion would need NO migration either (read-only lookup), but is NOT the
  selected path (see Section 15).
- `AnalyticsEvent` / `LearningSignal`: deliberately untouched (no readers; no Phase-10 use).
- `OutcomeMetric` / `LearningProposal` / `Topic` / `Lead` / `ConversationClassificationResult`:
  all relations needed for relevance prefill already exist.
- Verdict: the selected Phase-10 transformation (Section 16) requires NO new models, NO new
  fields, NO migrations — same as Phase 9. Any candidate requiring new tables (attribution
  joins, external action state, dismissal reasons, rank history) is by definition NOT Phase 10.

## 9. Learning Audit

Actual consumers (verified by grep + route/package reads):

- `OutcomeMetric`: WRITTEN by `OutcomeService.recordOutcome` (`POST /outcomes`); READ by
  `GET /outcomes`, `AggregationService.summarize` (`GET /analytics/summary`),
  `ContentOutcomeService.summarize`, `LearningDerivationService.propose` validation +
  generic derive path, publish-record detail. VERDICT: meaningfully consumed; affects
  learning (proposals) and reports.
- `LearningProposal`: WRITTEN by derivation (`POST /learning/derived`, `POST
  /learning/derived/content-outcome`); READ by `GET /learning/derived`, collector
  `learningProposals` (-> operator actions), `confirmedInfluences()` (CONFIRMED only).
  CONFIRMED rows AFFECT qualification scoring, opportunity scoring (`applyLearningInfluence`,
  bounded +/-0.2), and operator ranking (learning_boost). PROPOSED/REJECTED/REVOKED rows
  correctly inert. VERDICT: affects scoring + recommendations (via operator boost).
- `LearningSignal`: WRITTEN by `POST /learning`; READ by `GET /learning` list only. NO
  package (decision/learning/scoring/intelligence/content/sales) queries it. VERDICT:
  write-only / dormant by design carve-out. NOT a Phase-10 consumer.
- Largest learning dead ends (content-creation choices, sales strategy ignore confirmed
  learning): real, but NO consumer shape exists; inventing one is lower-leverage than D2.
  Explicitly NOT Phase 10.

## 10. Analytics Audit

- `AnalyticsEvent`: record + list only; zero package readers. WRITE-ONLY by design carve-out.
- `LearningSignal`: same (see Section 9).
- `OutcomeMetric`: the only analytics primitive that drives decisions (via learning loop);
  otherwise honest defined-pair rates + empty states (`GET /analytics/summary`).
- Missing (funnels/cohorts/attribution/content->lead/lead->opportunity/recommendation
  performance): genuine gaps, but each needs new join semantics and new UI — a broad
  redesign, explicitly NOT Phase 10 (same rationale as Phase-9 boundary: the
  analytics-deepening trap). Phase 9 created the first initiation events enabling MINIMAL
  future performance tracking for the objection path; the relevance path still has zero
  initiation events — another reason D2 is the right next linkage (it creates the missing
  events rather than building a dashboard over absent events).

## 11. AI Audit

- Current AI calls (registry `createDefaultRegistry`, per-router instantiation; empty
  registry -> honest `AI_UNAVAILABLE`, never fallback estimation): intelligence
  understanding/clustering/opportunity/gap, content plan/compose/hook, sales
  classify/compose/brief, decision `explainWithAi` (summarize-only, failure -> deterministic
  explanation intact). `createEmbedding` defined but uncalled.
- Deterministic logic: all collectors, eligibility, scorer, initiation prefill
  (`buildObjectionIdea` — pure string ops), learning derivation/influence, gates.
- Fallbacks: deterministic explanations/gates/validation always intact when AI unavailable.
- Unavailable states: honest `AI_UNAVAILABLE` / `aiAvailable: false`, never fabricated prose.
- AI-dependent workflows: plan-generate and draft-compose REQUIRE AI (correctly gated);
  everything else runs without AI.
- Next phase AI requirement: NONE. The selected transformation is fully deterministic
  (template prefill from recorded relevance evidence — topic/lead/dimensions — no ranking,
  no facts, no prose generation), mirroring Phase 9. No new AI responsibility introduced.

## 12. External Integration Audit

- Real outbound LinkedIn integration: ABSENT (verified). Distinguishing clearly:
  - PREPARED ACTION = internal row (`PreparedAction`, READY_FOR_AUTHORIZED_EXECUTION)
    recording that a human authorized execution-readiness; dismiss/complete records the
    operator's decision only — never executes anything (`prepared.ts`: "no senders, no
    LinkedIn clients, no automation"; `publish.ts`: "never contacts external systems").
  - EXECUTABLE EXTERNAL ACTION = none exists. No OAuth, no token store, no LinkedIn client,
    no senders, no browser automation, no scraping, no messaging/posting code.
- Prerequisites eventually required for a real external phase (NOT Phase 10): OAuth flow,
  token lifecycle (store/refresh/encrypt), identity mapping (workspace user <-> LinkedIn
  identity), authorization model, capability abstraction (post/message/analytics as discrete
  capabilities), rate limits, retries with backoff, idempotency keys, auditability
  (who-authorized-what-when), approval binding (prepared-action <-> external call),
  disconnect/revocation. All 14 absent (re-audited, unchanged). External execution stays a
  coherent later phase of its own.

## 13. Infrastructure Audit

- Synchronous processing SUFFICIENT (verified): `refreshWorkspace` fan-out is capped
  (50-row takes, 20-pattern cap, 10x10 relevance pairs -> max 10 actions, MAX_STORED_IDS 50;
  standing worst-case estimate ~303 bounded reads, no external calls in hot paths); suites
  run in seconds per prior reports; no long-running operations exist.
- `refreshWorkspace`, collector fanout, query counts, expensive computation (relevance pairs
  bounded + deterministic ordering), external calls (none in hot paths): all within sync budget.
- Do NOT introduce workers/queues/schedulers/cron/background jobs/retries/notifications:
  no measured or structural justification exists. Same verdict as Phases 7-9, re-verified.

## 14. Human-in-Loop / Security Audit

Verified against CURRENT source:

- Workspace isolation: YES (all initiation/eligibility/creation queries scoped to caller
  `workspaceId`; `initiateIdea` + `refreshWorkspace` + route all workspace-first).
- Authorization: YES (triple middleware on operator router; OWNER/ADMIN gates on plan-approve,
  review-approve, finalize, learning confirm/revoke preserved; initiation itself correctly
  member-allowed since it only scaffolds a draft).
- No client-controlled workspace IDs: YES (workspace from auth context, never request body).
- Approval requirements: INTACT (idea->plan->draft->gates->review->approval chain untouched;
  initiation creates DRAFT idea only, action stays PENDING for manual completion).
- No autonomous consequential actions: YES (explicit click only; no auto-create, auto-send,
  auto-publish, auto-follow-up).
- No LinkedIn automation / scraping / CAPTCHA bypass: YES (grep-clean; no such code).
- No fabricated analytics: YES (user-asserted publication/outcome notices; honest empty states;
  no estimated metrics).
- No fabricated evidence: YES (prefill uses recorded evidence only; Phase-9 pattern enforced).

## 15. Candidate Phase 10 Directions

A. **Relevance-driven content initiation (Flow E closure).**
   PROBLEM: Flow E stops at advice text; retyping; no action->artifact link for
   `prospect_relevance`. CURRENT STATE: relevance computed ACTIVE, consumed only by actions;
   Home card has no Start-idea button; `relevantContentId` uncomputed. TRANSFORMATION: explicit
   POST creates DRAFT idea prefilled from recorded relevance evidence + records result id in
   action subjectMeta (Phase-9 mirror). REUSED: ideas API shapes, eligibility recompute
   (`eligibility.ts:131-156`), refresh preserve pattern, dismiss/complete, Home, initiation
   module. NEW MODELS: none. NEW ENDPOINTS: none (same POST, new kind branch) or one narrow
   branch — implementation detail. UI: "Start idea" on `prospect_relevance` cards -> navigate
   `/content`. HUMAN GATE: explicit click; downstream gates intact. PROVENANCE: bidirectional
   (description cites topic/lead/dimensions; action links idea id). SECURITY: workspace-scoped,
   same as Phase 9. READINESS: highest (trigger fires, data present, rails proven). SCOPE:
   one kind, one prefill, one button. NON-GOALS: objection path (done), relevantContentId
   suggestion, AI prefill, auto-creation, plan/draft/review creation, general
   complete-with-resultRef, analytics, LinkedIn, workers, UI redesign. STOP: any ws-leak,
   migration need, autonomy, AI need, fan-out, rewrite, approval bypass.

B. **Relevant-content suggestions for strategy composition (read-only).**
   PROBLEM: strategist guesses which content fits a lead. CURRENT: validated-optional
   `relevantContentId`, nothing computes it. TRANSFORMATION: read-only ideas-by-topic lookup
   surfaced in strategy form. REUSED: topic/relevance computation, strategy validation. NEW
   MODELS: none. NEW ENDPOINTS: one GET. UI: suggestion list in strategy form. GATE: none
   needed (read-only). PROVENANCE: cite topic/idea ids. SECURITY: workspace-scoped read.
   READINESS: medium (relevance math exists, but render location + ranking cutoff + UX copy
   less defined than A's existing card). SCOPE: small but serves the already-manually-complete
   strategy form. NON-GOALS: auto-linking, outreach send, learning influence. STOP: same list.
   DEFERRED (less-broken flow, less-shaped consumer).

C. **Learning -> content recommendations.**
   PROBLEM: confirmed learning never guides creation choices. CURRENT: influences exist for
   qualification/opportunity/ranking only. TRANSFORMATION: surface applicable confirmed
   influences during idea/plan/compose. REUSED: `confirmedInfluences`. NEW MODELS: none, but
   NEW CONSUMER SHAPE must be invented (where/how guidance renders, what "applied" means).
   UI: new guidance surfaces. GATE: human still decides. READINESS: low (design task, not
   linkage task). SCOPE: medium-open. DEFERRED (lower leverage than closing shaped Flow E).

D. **Sales-specific learning rules.**
   PROBLEM: sales outcomes use generic derivation only. CURRENT: qualification path works.
   TRANSFORMATION: sales-dimension derivation rules. REUSED: derivation lifecycle. NEW: rule
   definitions + tests. UI: none. READINESS: medium. SCOPE: narrow but serves the
   already-working path. DEFERRED (lower leverage than unblocking a dead-ended workflow).

E. **General recommendation-performance linkage.**
   PROBLEM: "Outcomes -> future recommendations" only PARTIAL; no per-recommendation
   performance view. CURRENT: objection initiation events exist; relevance events absent.
   TRANSFORMATION: event model + joins + UI. REUSED: initiation linkage keys. NEW: likely
   schema + analytics UI. READINESS: low (needs relevance-path events from A first;
   premature standalone). DEFERRED (A covers the relevance path minimally).

Comparison (factual, no "best" label here): A has highest dependency readiness (all inputs
recorded + rails proven by Phase 9), smallest implementation surface (one kind branch + one
prefill + one button), maximal infrastructure reuse, zero schema/external/AI needs, explicit
human gate, and tightest boundedness. B is smaller but serves a completable flow with a
vaguer consumer. C/D/E each require inventing shapes or schemas that A does not.

## 16. Selected Phase 10 Boundary

**PHASE 10 — Relevance-Driven Content Initiation.** Human-initiated creation of a DRAFT
content idea prefilled from a recorded `prospect_relevance` operator action, with
bidirectional provenance, through existing rails — the exact symmetric mirror of Phase 9.
If the evidence had not supported a tighter option than A, no boundary would be declared.
It does.

## 17. Transformation

`POST /api/v1/operator/actions/:actionId/ideas` — extend the Phase-9 endpoint with a
`prospect_relevance` kind branch (same path, same middleware, same error-code conventions):

1. Validate: action exists in caller workspace (else 404); caller is member (else 403);
   kind = `prospect_relevance` (else 409); status PENDING (else 409); no live
   `resultIdeaId` resolving to an existing idea (else 409 with existing id/title);
   eligibility recompute passes via `collectCandidates` + `checkEligibility`
   (relevance >= 0.5 with live topic/lead/ICP rows; else 409, nothing created).
2. Prefill deterministically from recorded relevance evidence only: title bounded to 200
   chars (e.g. topic + lead fit, truncated); description lines carrying topic id/name,
   lead id/name, relevance %, per-dimension scores/reasons, ICP ref, originating action
   identityKey, and a gates-still-required note; tags `['relevance-driven']` (new tag;
   no collision with `objection-driven`). No LLM, no invented claims, no ranking.
3. Create exactly one `ContentIdea` (DRAFT default) + merge `{resultIdeaId,
   resultIdeaTitle, initiatedAt}` into action `subjectMeta` (spread-merge; refresh upsert
   preserves these keys via the existing `extractResultKeys` pattern). Nothing else created
   (no plan/draft/review/approval/publication/outcome/learning/outreach/pipeline rows).
4. Action stays PENDING for manual dismiss/complete. Home `prospect_relevance` cards gain
   the same "Start idea" affordance (success AND already-initiated-409 both navigate to
   `/content`, mirroring Phase 9). All downstream content gates unchanged and mandatory.

## 18. Definition of Done

- Every created idea traces to live relevance rows (topic + lead + dimensions); proven by tests.
- Ineligible / duplicate / wrong-kind / non-PENDING / foreign / outsider attempts create
  NOTHING (proven by negative tests).
- Duplicate initiation returns 409 with the SAME existing idea id/title (idempotent for
  sequential calls).
- Linkage survives `refreshWorkspace` (preserved keys on upsert; proven by test).
- UI button appears ONLY on `prospect_relevance` cards (objection cards keep theirs; no
  other kind gains one).
- Zero side-effect artifacts (no plan/draft/review/publish/outcome/learning/outreach/
  pipeline/analytics rows from initiation; proven by test).
- Full regression suite green (excluding the 3 known pre-existing `App.test.tsx`
  environment failures if still present); typecheck clean; build clean; boot + /health +
  /ready verified.
- No migration, no new model, no new AI call, no worker/queue/scheduler, no LinkedIn code.

## 19. Explicit Non-Goals

Objection->idea creation (done, Phase 9); `relevantContentId` auto-suggestion; AI prefill or
prose generation; auto-creation of any kind; plan/draft/review creation in this step;
general complete-with-resultRef; dismissal reasons; rank history; analytics expansion
(funnels/cohorts/attribution/dashboards); `AnalyticsEvent`/`LearningSignal` consumption;
LinkedIn OAuth/API/posting/messaging/analytics; browser automation; scraping; CAPTCHA
bypass; autonomous outreach/follow-up/publishing; workers/queues/schedulers/cron;
production/load scope; broad UI redesign.

## 20. Stop Conditions

STOP (do not expand) if any of: workspace-isolation leak; client-controlled workspace id;
migration need; new table without proven necessity; autonomous consequential action;
approval bypass; AI responsibility required or unverifiable; fabricated metrics/evidence/
attribution; LinkedIn execution / browser automation / scraping / CAPTCHA bypass;
unjustified workers/queues/schedulers; unbounded fan-out; architectural rewrite; or any
validation/eligibility/duplicate/provenance requirement from Section 18 proves untestable.
Any trigger stops the phase, never expands it.

## 21. Carried-Forward Technical Debt

1. (MEDIUM, from Phase 9 forensic F1) Concurrent initiation race: two concurrent POSTs on
   the same action can both pass the `resultIdeaId` check and create duplicate ideas
   (second update wins, first orphaned). Phase 10 reuses the same check-then-create pattern
   and inherits the same race for the new kind branch. Fix (row-level lock or true
   `prisma.$transaction` with unique guard) is small hardening that may ride along with
   Phase 10 implementation but is NOT itself the phase.
2. (LOW, F2/F4) "Transaction" terminology: Phase-9 implementation uses sequential
   create+update with compensating delete (`.catch(() => undefined)` swallows compensation
   failure), not `prisma.$transaction`. Same caveat applies to the mirrored branch.
3. (INFO, F5/F6) Pre-existing web test-env issues (`App.test.tsx` document-is-not-defined
   in full-suite runs; TS JSX/moduleResolution notes) — unrelated, carried forward.
4. Stale interrupted `PHASE_10_BOUNDARY_AUDIT.md` replaced by this file (no code impact).

## 22. Carried-Forward Unverified Items

Browser/E2E testing; live-AI prose paths (none added by this boundary); external network
behavior; production deployment; load/performance testing. All explicitly out of scope per
Sections 19-20, same as Phases 8-9.

## 23. Why the Selected Boundary Is Evidence-Backed

- The dead end is PROVEN in current code, not inferred: `prospectRelevance` emits ranked
  candidates (`signals.ts:104-203`) with live eligibility (`eligibility.ts:131-156`), Home
  renders them as "Prospect fit" (`HomePage.tsx:46`) with NO Start-idea button (guard at
  line 316 is objection-only), and the only advice is "review the prospect in Leads".
- The transformation is PROVEN feasible by precedent: Phase 9 implemented the identical
  shape for `objection_pattern` (endpoint `operator.ts:96-106`, `initiateIdea`
  `actions.ts:131-209`, prefill `initiation.ts`, refresh preserve, Home button +
  409-navigate), forensically ACCEPTED WITH UNVERIFIED ITEMS with 22 new tests green.
- The persistence shape is PROVEN sufficient: `ContentIdea` title-only-required + DRAFT
  default (`schema.prisma:451-459`) and `OperatorAction.subjectMeta Json?` +
  `@@unique([workspaceId, identityKey])` (`schema.prisma:1353-1372`) accept the relevance
  prefill + linkage with no migration (relevance subjectMeta already carries topic/lead/
  dimensions/ICP — everything the prefill needs).
- The scope is PROVEN minimal versus alternatives: B serves a manually-completable form
  with a vaguer consumer; C/D require inventing consumer/rule shapes; E needs the very
  initiation events A creates. A is the only candidate that is simultaneously shaped
  (trigger + data + rails + UI slot all exist), loop-closing (Flow E -> publish -> outcome
  -> learning, same as Phase 9 did for Flow D), and bounded (one kind, one prefill, one
  button, no schema/AI/external/infra).
