# PHASE 11 BOUNDARY AUDIT — RELEVANCE-DRIVEN SALES WORKFLOW INITIATION

Audit only. No application code modified, no tests added, no migrations, no dependencies,
no commit, no push. Phase 11 NOT implemented. Prior reports treated as historical evidence,
never authority — every material claim below was re-verified against the CURRENT source
(routes, packages, schema, UI) at HEAD `d225f61` (Phase 10 committed and verified).

Starting state: `git status --short` clean; HEAD `d225f61 phase 10:
relevance-driven content initiation`; parent `89bc4a3`.

## A. Current Architecture Relevant to This Phase

```
Topic/Lead rows + ICP + ProspectResearch rows
  → computeTopicRelevance (packages/sales/src/topicRelevance.ts, deterministic, read-only)
  → signals.prospectRelevance (packages/decision/src/signals.ts:104-203;
      caps 10 topics × 10 leads, floor 0.5, max 10 actions;
      identityKey = prospect_relevance:<topicId>:<leadId>; subjectId = leadId;
      subjectMeta = {topicId, topicName, leadId, leadName, relevance, dimensions[], icpUsed})
  → eligibility.ts:131-158 (live recompute: topic + lead exist in workspace, relevance ≥ 0.5)
  → OperatorAction row (PENDING; kind = prospect_relevance)
  → Home "Prospect fit" card (HomePage.tsx:46; Open → /leads via kindTarget substring match)
  → *** DEAD END: no sales-workflow initiation consumer ***
```

Phase 10 added the content-side consumer for the same action kind
(`POST /operator/actions/:id/ideas` → DRAFT ContentIdea, tag `relevance-driven`,
subjectMeta `resultIdeaId/resultIdeaTitle/initiatedAt`, action stays PENDING).
Phase 11 must add the sales-side consumer without touching that path
(different endpoint, different linkage keys — no collision by construction).

Existing sales rails (all workspace-scoped via triple middleware, all verified):
Lead create (`POST /leads`) → discover (stateless) → research create
(`POST /prospects/research` → `ProspectResearchService.createResearch`) →
signals/intent → qualify (`POST /prospects/qualify` → upsert `QualificationResult`) →
brief (`POST /prospects/briefs`, deterministic assembly) → outreach strategy
(DRAFT → OWNER/ADMIN approve) → draft compose (AI-gated) → gates → review/decision
(OWNER/ADMIN approve + no-BLOCKED) → prepared action (READY_FOR_AUTHORIZED_EXECUTION only,
never executed). Full citations in §§C–D.

## B. Existing prospect_relevance Action Lifecycle

1. Generation: `collectCandidates` fans out to `prospectRelevance`, which reuses
   `computeTopicRelevance` verbatim (read-only, no persistence).
2. Eligibility: live recompute per refresh AND per initiation (eligibility.ts:131-158).
3. Persistence: `refreshWorkspace` upserts PENDING rows keyed by
   `@@unique([workspaceId, identityKey])`; stale PENDING rows deleted; DISMISSED/COMPLETED
   suppress recurrence permanently.
4. Display: `/next-actions` returns candidate data + persisted `id` + merged subjectMeta
   (idea-linkage keys re-merged via `extractResultKeys`); status hardcoded PENDING.
5. Transitions: manual dismiss/complete only (`transition` PENDING → DISMISSED/COMPLETED).
6. Consumers today: (a) display + explain; (b) Phase 10 content-idea initiation.
   No sales consumer exists — the exact gap Phase 11 closes.

## C. Existing Sales Workflow Entry Points

| # | Entry | Creates | AI? | Gate? | Provenance channel? |
|---|-------|---------|-----|-------|---------------------|
| 1 | `POST /leads` (leadCreateSchema: linkedinUrl + name required; notes ≤5000, tags) | Lead | No | None | `notes` free text — but lead already exists here (action has leadId); not an initiation target |
| 2 | `POST /prospects/discover` | Nothing (stateless candidate) | No | None | Caller-supplied echo only — no persistence, unsuitable |
| 3 | `POST /prospects/research` → `ProspectResearchService.createResearch` | **ProspectResearch** | No | None | **YES: `facts[]` {statement, sourceRef, confidence} — service accepts them, though the HTTP route forwards only 7 profile fields and drops facts** |
| 4 | `POST /prospects/signals` (ProspectSignal; signalType closed enum) | ProspectSignal | No | None | `evidence/interpretation` free text, but **no enum value honestly describes topic-relevance** (adding one = migration) — REJECTED |
| 5 | `POST /prospects/qualify` {leadId} (upsert, @@unique workspace+lead) | QualificationResult | No | None at creation | `problemEvidence/timingEvidence` free arrays — but they feed scoring dimensions; mislabeling topic-fit as problem evidence risks score distortion — REJECTED |
| 6 | `POST /prospects/briefs` (deterministic assembly, no free input) | ProspectBrief | No | None | No input channel at all — REJECTED as initiation target |
| 7 | `POST /outreach/strategies` (objective/audience/angle/reasonForContact required free text) | OutreachStrategy DRAFT | No | Downstream approve | Would require INVENTING objective/angle/reasonForContact — strategist judgment, not recorded evidence — REJECTED |

**Selected: #3 at the service layer** (`ProspectResearchService.createResearch`, called
directly — the same function the HTTP route calls). Rationale recorded in §E.

## D. Exact Missing Bridge

`prospect_relevance` OperatorAction → ??? → `ProspectResearch` row for the action's lead.

Everything on both sides exists: the action carries topicId/topicName/leadId/leadName/
relevance/dimensions/icpUsed in subjectMeta; `createResearch` accepts
`{workspaceId, leadId, facts[], unknowns[], confidence?}` with workspace-scoped lead
validation (`research.ts:48-53`) and fact statement/sourceRef validation
(`research.ts:54-58`). Missing is exactly one human-gated transition that validates the
action (kind/PENDING/eligibility/duplicate, mirroring `initiateIdea`) and calls
`createResearch` with facts built deterministically from the recorded relevance evidence.

## E. Proposed Smallest Change

1. `packages/decision/src/initiation.ts` (additive only):
   - `SALES_RESULT_KEYS = ['resultResearchId', 'resultResearchTitle', 'initiatedResearchAt']`
     + `extractSalesResultKeys()` (same string-only filter pattern as `extractResultKeys`).
   - Pure `buildRelevanceResearch(input)` → `{ facts: [{statement, sourceRef, confidence}] }`
     (unknowns `[]`, confidence `null` — never estimated). No LLM, no invented fields.
2. `packages/decision/src/actions.ts` (additive only): `initiateSalesResearch(workspaceId,
   actionId, authorId)` — 404 unknown/foreign; 409 wrong-kind (≠ prospect_relevance),
   non-PENDING, live `resultResearchId` (409 with existing ids), missing candidate (409),
   ineligible (409); explicit lead-exists check (409 CONFLICT, never 500); then
   `ProspectResearchService.createResearch` + subjectMeta merge
   `{resultResearchId, resultResearchTitle, initiatedResearchAt}` + compensation delete
   on link failure (mirrors ideas path). Action stays PENDING. `SalesError` from the
   service call is converted to `DecisionError CONFLICT` so the operator route's
   `forwardDecisionError` convention holds with no route changes.
3. `apps/api/src/routes/operator.ts` (additive only): `POST /actions/:actionId/research`
   → 201 `{research, action}` under existing triple middleware. No other route touched.
4. Refresh preservation (surgical): merge sales keys alongside idea keys in
   `refreshWorkspace` upsert and in `/next-actions` response mapping. Specific keys only —
   not a generic resultRef framework.
5. UI (additive only): `HomePage.tsx` prospect_relevance cards gain a second button
   **"Research prospect"** (existing app vocabulary: LeadsPage "Background research" /
   "Run research"); `handleResearchProspect` navigates to `/leads?leadId=<exact id>`
   (response row's `leadId`, falling back to the action's `subjectId`; 409 uses the
   action's `subjectId` when valid, else plain `/leads`). `api.ts` gains
   `researchProspectFromAction(id)` (response type exposes the already-returned
   `leadId`; no server contract change). `LeadsPage.tsx` gains a `?leadId=` deep-link
   that resolves the exact lead via `listSalesLeads()` (unknown ids select nothing).
   Objection cards keep only "Start idea". All other kinds unchanged. No redesign, no new
   page, existing `LeadDetail` reused unchanged.

## F. Provenance Strategy

Two directions, both in existing fields (no migration):

- Artifact → signal: `ProspectResearch.facts[]` entries, each
  `{statement, sourceRef: 'operatorAction:<identityKey>', confidence: null}`:
  statement 1 carries `Topic <topicId> (<topicName>) × prospect <leadId> (<leadName>)` +
  relevance %/raw + originating action identity; subsequent statements carry up to 8
  `- <dimension>: <score> — <reason>` lines (≤500 chars each); an ICP fact is included
  only when `icpUsed` is present. Confidence is null on every fact: recorded relevance
  evidence carries scores and reasons but no legitimate per-statement confidence value,
  and none is invented.
  Profile fields (`name/title/company/…`) stay `null` deliberately: `BriefService`
  assembles `who.title = research?.title ?? lead?.headline` (brief.ts:71-75), so any label
  we wrote would shadow the lead's real headline in briefs. `unknowns: []`,
  `confidence: null` — never invented, never estimated.
- Action → artifact: subjectMeta merge `{resultResearchId, resultResearchTitle,
  initiatedResearchAt}` where `resultResearchTitle` is a subjectMeta-only display label
  (`Topic relevance: <topicName> × <leadName>`, ≤200) — never written to the research row,
  so no brief-shadow risk.
- Downstream visibility (no extra work): briefs automatically include the new facts as
  `knownFacts` (brief.ts:43,77); topic-relevance `research_support` may shift on recompute
  from genuine recorded overlap (feedback, not fabrication). Qualification is unaffected
  (`researchFactCount ?? 0` — qualification.ts:95 — never auto-counts research rows).

## G. Authorization / Workspace Boundaries

Identical rails to Phases 9/10: router triple middleware (auth + workspace + membership);
every DB operation scoped to `authReq.workspaceId` (action lookup, candidate collection,
eligibility, lead check, research create); never accept workspaceId from client; any member
may initiate (records evidence only — downstream strategy/draft/review/approve gates remain
OWNER/ADMIN-gated as today); outsider/non-member → 403 via middleware; foreign/unknown
action → 404.

## H. Duplicate / Idempotency Behavior

Mirror of the ideas path: sequential repeat with live `resultResearchId` → 409 CONFLICT
with `{researchId, researchTitle}` and zero new rows; dangling id (research row deleted) →
proceeds (re-initiation is legitimate). Refresh preserves sales keys (see §E.4), so linkage
survives `refreshWorkspace`. Concurrent-race hardening is out of scope — same inherited
MEDIUM race as the ideas path (check-then-create); documented in §M, not silently fixed,
not worsened.

## I. Side Effects

Allowed (the boundary): exactly one `ProspectResearch` row + one `subjectMeta` merge.
Everything else forbidden: no Lead mutation, no qualification/brief/strategy/draft/review/
prepared/pipeline/content/outcome/learning/analytics rows from initiation; no AI calls;
no notifications/workers/queues; no external messages; no LinkedIn. Downstream briefs and
relevance recomputes only ever read the genuinely recorded facts (§F).

## J. Tests Required

Unit (`packages/decision/src/test/`, mocked prisma):
`buildRelevanceResearch` mapping/caps/determinism/no-invention; `extractSalesResultKeys`
filtering; `initiateSalesResearch` create+link, unrelated-key preservation, PENDING kept,
duplicate-409, wrong-kind-409, non-PENDING-409, stale-409, missing-lead-409, SalesError
conversion, compensation on link failure, ideas-path untouched.

Integration (`apps/api/src/phase11.test.ts`, real DB, mirrors phase10.test.ts):
setup (ICP + topic + lead + research seeding); valid initiation → exactly one research row
with facts/provenance + PENDING action + linkage; zero side-effect counts (strategy/draft/
review/prepared/brief/qualification/content/learning/outcome rows); refresh preservation;
duplicate-409-same-id; wrong-kind-409; stale-409 (topic deleted); non-PENDING-409;
foreign/outsider denial; missing-lead-409; objection→idea still 201; relevance→idea still
201; no-LinkedIn/no-execution grep-level assertion via absence of senders (code-level fact).

Web: extend the Home button-surface test (Start idea on objection+relevance; Research
prospect on relevance only; neither on other kinds).

## K. Explicit Non-Goals

Second sales pipeline; new sales page; LeadsPage redesign (a minimal additive `?leadId=`
resolver was added instead — no redesign, no new components); strategy/draft/
review/prepared auto-creation; auto-initiation on action existence; autonomous or AI-generated
outreach; LinkedIn OAuth/API/messaging/execution; scraping/CAPTCHA/rate-limit bypass;
`relevantContentId` auto-suggestion; learning→sales-strategy; analytics expansion;
`AnalyticsEvent`/`LearningSignal` consumption; new models/migrations (none needed — `facts`
Json and `subjectMeta` Json already exist); workers/queues/schedulers; generic resultRef
framework; fixing the inherited concurrency race; touching the Phase 10 ideas path.

## L. Stop Conditions

STOP (do not expand) if: `createResearch` cannot accept recorded facts without changing
sales validation semantics; lead-linkage requires a new field/relation; any migration
becomes necessary; eligibility reuse proves impossible; workspace isolation leaks;
client-controlled workspace ids appear; AI becomes required; approval gates would be
bypassed; fabricated facts/metrics become unavoidable; autonomous action becomes necessary;
or any §I side-effect prohibition proves unkeepable. Any trigger stops the phase.

## M. Carried Debt From Earlier Phases

1. (MEDIUM) Concurrent-initiation race on the ideas path (Phase 9 F1, carried through
   Phase 10) — the new research path inherits the same shape; explicitly not fixed here.
2. (LOW) Compensation-delete (not `prisma.$transaction`) on both initiation paths.
3. (INFO) Phase 10 report notes `prisma migrate status` unrunnable from repo root
   (tooling limitation, not drift); `git diff -- packages/db` empty.
4. Stale-`dist` lesson (Phase 10 forensic): API resolves workspace packages via built
   `dist` — implementation PRs must rebuild affected packages before DB-backed runs.

## N. Unverified Areas

Browser/E2E; `/health` + `/ready` invocation; production deployment; external LinkedIn
behavior; load/performance; live AI prose paths. All out of scope per §K–L, same as
Phases 8–10.
