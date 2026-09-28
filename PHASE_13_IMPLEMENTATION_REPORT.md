# Phase 13 — Sales-Signal-Driven Content Initiation

## Boundary

A recorded `SalesContentSignal` becomes a ranked `sales_content_signal` operator action
with a human "Start idea" button. One click creates exactly one DRAFT `ContentIdea`
prefilled deterministically from the recorded signal evidence via the existing
`toContentInput` bridge contract, linked bidirectionally through the existing
`subjectMeta` idea keys. The action stays PENDING; all downstream content gates
(plan, draft, review, approval, finalize) remain unchanged and mandatory.

## Repository Evidence

Reused verbatim, verified at HEAD `6dbb8c3` before editing:
- `packages/sales/src/bridge.ts:60-80` (`toContentInput`: signalType/evidence/frequency/
  recommendedAngle/reasoning/conversationCount) and `SalesContentSignal` model
  (`schema.prisma:1283-1298`: evidence required, frequency measured, angle ≤200)
- `packages/decision/src/{signals,collectors,eligibility,scoring,actions,initiation}.ts`
  collector/eligibility/initiation/refresh patterns from Phases 9–11
- `POST /api/v1/operator/actions/:actionId/ideas` (`operator.ts:96-106`), triple
  middleware, `forwardDecisionError` conventions
- `HomePage.tsx` Start-idea guard/handler/navigate pattern; kind-agnostic
  `startIdeaFromAction` client (no client change needed)

## SalesContentSignal Source

Workspace-scoped rows created by `POST /sales-intelligence/content-signals`
(evidence required; conversation ids workspace-validated; absolute quantifiers need
≥2 conversations). Surfaced read-only in Inbox (`ContentSignalsPanel`); the
`GET …/content-input` route existed with zero callers.

## Existing toContentInput Bridge

The bridge needed no changes: `toContentInput(workspaceId, signalId)` revalidates
workspace-scoped existence (throws `SalesError` when missing) and returns the exact
shape the prefill builder consumes. The initiation branch calls it live, so a
deleted/foreign signal fails closed into 409 instead of fabricating content.

## Collector

`salesContentSignals` (`signals.ts`): workspace `findMany`, `createdAt desc, id asc`,
cap `MAX_SIGNAL_ACTIONS = 10`. One candidate per signal: `kind:
'sales_content_signal'`, `identityKey: sales_content_signal:<id>`, `subjectId:
signal.id`, title from recorded angle (fallback: type + conversation count),
`relevance01 = min(1, conversationCount/5)` (same recurrence semantics as objections),
`evidenceCount = conversation count`, `ready: false`, `learningDimensions: []`,
subjectMeta `{signalId, signalType, frequency, conversationCount, conversationIds≤50,
recommendedAngle}`, reasons + evidence links (signal + ≤3 conversations). Wired into
`collectCandidates` fan-out. No data created, no AI, no scores invented.

## Eligibility

New `sales_content_signal` case (`eligibility.ts`): subjectId must resolve to a
workspace row (else "no longer exists"), and `evidence` must be non-empty (else
"has no recorded evidence"). The `ActionKind` union addition makes the exhaustive
switch compiler-enforced. Existing cases untouched.

## Scoring

Reused untouched: the generic scorer maps `relevance01 → relevance (≤25)`,
`evidenceCount → evidence_strength (8 + 2n, ≤20)`, `ready:false → 6`,
urgency default, freshness by `createdAt`. Deterministic ordering via shared
`rankScored`. No scoring-semantics change for any existing kind.

## Prefill Mapping

`buildSignalIdea` (`initiation.ts`, pure): title from recorded angle or
type+count (sliced to 200); description lines — signal type/count, signal id,
evidence (≤2000), angle (≤500, only if recorded), reasoning (≤2000, only if
recorded), conversation ids (≤20 + overflow count), originating action identity +
gates-still-required note; tags `['signal-driven']` (`SIGNAL_TAG`). No invented
prose, no AI.

## Provenance / Linkage

Both directions in existing fields: the idea description cites signal id/type/
evidence/conversations/action identity; the action merges the existing
`resultIdeaId/resultIdeaTitle/initiatedAt` keys (no new key family — one action
carries one idea through the shared `/ideas` endpoint). Candidate `subjectMeta`
re-emits `signalId/signalType` every refresh, so signal identity survives
`refreshWorkspace` via the existing preserve-on-update path. No migration.

## Initiation

`initiateIdea` extended in place: kind gate now accepts `objection_pattern`,
`prospect_relevance`, and `sales_content_signal` (409 otherwise); duplicate check
(409 with existing `ideaId/ideaTitle`); candidate re-collection + eligibility;
signal branch resolves `signalId` (candidate meta, falling back to `subjectId`),
reads the live bridge, builds the prefill, creates one DRAFT idea, links
atomically with compensating delete on link failure. Action stays PENDING.

## Duplicate Behavior

Phase 9–11 semantics exactly: live `resultIdeaId` → 409 CONFLICT with existing
`ideaId` (proven by test); dangling id (idea deleted) → proceeds; no second idea
ever created sequentially. Concurrency race intentionally not fixed (non-goal,
carried debt).

## API

No new endpoint, no new router: `POST /api/v1/operator/actions/:actionId/ideas`
serves the third kind with identical 201/404/403/409 semantics. Auth/workspace
middleware and `forwardDecisionError` untouched.

## Home UI

`kindLabel`: explicit "Sales signal" branch; `kindTarget`: explicit `/inbox`
branch placed before the `content`-substring fallback (signals live in Inbox);
Start-idea guard extended to the new kind, reusing `handleStartIdea` verbatim
(success and 409 → `/content`). No redesign, no new page, no internal terminology
("Sales signal" is user-facing). API client untouched (kind-agnostic POST).

## Refresh Preservation

Verified by construction + test: refresh re-emits candidate meta (signal identity)
and re-merges persisted idea keys; linkage survives; stale (deleted-signal) rows
are removed like any ineligible PENDING row.

## Tests

- Unit `packages/decision/src/test/signalContent.test.ts`: **14/14 PASS** (prefill
  mapping/truncation/determinism/evidence/conversation preservation; collector
  shaping; deterministic scoring; stale eligibility; wrong-kind; non-PENDING;
  duplicate; missing action; existing key-family reuse).
- Integration `apps/api/src/phase13.test.ts` (real PostgreSQL): **11/11 PASS**
  (exactly one DRAFT idea with deterministic fields/provenance/linkage, PENDING kept;
  zero side-effect rows across 11 artifact counts; refresh preservation; duplicate
  409 with same id; wrong-kind/non-PENDING/foreign/outsider/stale denials with zero
  new ideas; objection regression green; relevance paths regression-checked).
- Web: `HomePage.signal.test.tsx` **2/2 PASS** (signal card renders Start idea,
  click invokes API and navigates to Content; unrelated kinds gain nothing);
  `HomePage.startIdea.test.tsx` guard block extended for the third kind (file 6/6).
- Pre-existing decision mocks extended with the `salesContentSignal` model mock
  (additive one-liners in 5 files; assertions unchanged).

## Typechecks

- `pnpm --filter @growth-operator/decision run typecheck` — PASS (also caught one
  implicit-`any` during implementation; fixed with the repo's explicit row-interface
  convention)
- `pnpm --filter @growth-operator/api run typecheck` — PASS
- `pnpm --filter @growth-operator/web run typecheck` — PASS (also caught one unused
  import in the new web test; fixed)

## Builds

- `pnpm --filter @growth-operator/decision run build` — PASS (rebuilt before every
  DB-backed run per repo lesson; `dist` verified to contain the new branch)
- `pnpm --filter @growth-operator/api run build` — PASS
- `pnpm --filter @growth-operator/web run build` — PASS (pre-existing chunk-size
  warning only)

## Regression

`pnpm test:all`: api 151/151, web 16/16, intelligence 130/130, content 91/91, sales
71/71, learning 31/31, decision 89/89. **579/579 PASS, zero failures.** Phases 9–11
initiation paths regression-proven intact (unit + integration).

## Static Audit

`git diff --check`: clean. Tracked diff confined to 13 Phase-13 files (+202/−18:
decision types/signals/collectors/eligibility/actions/initiation, HomePage ×2
tests, 5 mock one-liners) plus 3 new files (unit, integration, web test) and this
report. No schema/migration files, no secrets, no mock data, no fake metrics, no AI
calls, no LinkedIn code, no senders, no approval-gate edits, no workspace-isolation
changes (all lookups workspace-scoped), no Phase 9/10/11 semantic changes (only the
kind-gate message widened; no test asserted its text — verified by grep).

## Non-Goals

LinkedIn/OAuth/execution; outreach sending; scraping; AI ranking/prose; automatic
creation/approval/publishing; learning/analytics consumption; workers/queues/cron;
migrations; concurrency-race fixes; OpportunityFeedback; brief relevance; new
pipelines/pages/ContentIdea types/routers; any Phase 1–12 behavior change. None
implemented.

## Known Limitations

Only repository-supported items: signals cap 10 newest-first (older signals wait
their turn, same convention as other collectors); ideas from untagged/empty-evidence
signals cannot initiate (eligibility); concurrent-duplicate race inherited, not
fixed; `/health`+`/ready`, browser/E2E, production, LinkedIn, load, live-AI paths
unverified by design.
