# Phase 15 — Opportunity Triage

## Boundary

START:
`ContentOpportunity` rows stuck in `NEW` with convert as the only exit;
`REVIEWED`/`DISMISSED` enum values unwritable; Brain list unfilterable, so
triaged-or-converted rows linger visibly.
END:
Any member can Mark-reviewed or Dismiss a NEW opportunity from Brain (triage,
not approval); valid transitions persist; reviewed/dismissed leave the active
operator queue (pre-existing collector/eligibility behavior, proven by test)
and the default Brain list via a status filter; convert/feedback/learning
untouched; nothing deleted.

## Repository Evidence

Verified at HEAD `8777643` before editing: enum (`schema.prisma:137-142`);
single writer (convert, `intelligence.ts:566`); collector `status:'NEW'` filter
(`collectors.ts:57-62`); non-NEW ineligibility (`eligibility.ts:27-33`); stale
prune (`actions.ts:99-101`); server `?status` filter (`intelligence.ts:416-419`)
unused by Brain (`BrainPage.tsx:257` bare call); pipeline transition-validation
pattern (`sales/pipeline.ts:26-39`); error maps (`utils/errors.ts`,
`utils/salesErrors.ts`, both `INVALID_TRANSITION → 422`).

## Transition Contract

`validateOpportunityTriage(from, to)` (`contentOpportunity.ts`, pure):
`NEW + REVIEWED → valid`; `NEW + DISMISSED → valid`; anything else —
including same-state rewrites, terminal exits, and unknown statuses — invalid
with an explicit reason. REVIEWED = acknowledged, retained as history, out of
the NEW queue. DISMISSED = rejected, retained as history, out of the NEW queue.
Neither deletes, approves, learns, or converts.

## API

`PATCH /intelligence/opportunities/:opportunityId/status` (same router, triple
middleware): Zod body `{status}`, workspace-scoped lookup (404 unknown/foreign),
uppercase normalize, validator verdict → `AppError(reason, 422,
'INVALID_TRANSITION')` on failure, row update, `200 {opportunity}`. New Zod
schema `opportunityTriageSchema` (+ type) in `@growth-operator/schemas`.
Convert, feedback, scoring, and learning routes byte-untouched.

## Brain UI

Detail card gains a Triage card (Mark reviewed / Dismiss buttons, working
state, success/error message; success refetches detail so the status badge
updates). Opportunities list gains a status filter (New default; Reviewed,
Dismissed, Converted, All) wired to the existing `?status` server filter, with
filter-aware empty copy. Feedback and convert cards untouched.

## Status Filter

Server filter pre-existed; the client `listOpportunities({status?})` now passes
it (omitted for All). Default `NEW` hides reviewed/dismissed/converted from the
active queue view without deleting or archiving anything.

## Operator/Home Behavior

Zero code changes required and none made: the collector's `NEW` filter,
eligibility's non-NEW rule, and the stale-row prune already implement the end
state. Proven by integration test (triaged rows leave `next-actions`; convert
behavior identical).

## Tests

- Unit `packages/intelligence/src/test/opportunityTriage.test.ts`: **11/11 PASS**
  (full transition matrix incl. same-state, terminal, unknown, and determinism).
- Integration `apps/api/src/phase15.test.ts` (real DB): **11/11 PASS**
  (both transitions; queue exclusion; per-status filters; NEW-default exclusion;
  4×422 matrix with zero state change; 404; foreign untouched; outsider 403;
  convert + feedback + score + learning paths regression-green).
- Web `apps/web/src/pages/BrainPage.triage.test.tsx` (real DOM): **3/3 PASS**
  (filter defaults NEW; review/dismiss call client with exact args and refresh
  visible state).
- Focused total: **25/25 PASS**.

## Full Regression

`pnpm test:all`: api 172/172, web 22/22, intelligence 158/158, content 91/91,
sales 71/71, learning 31/31, decision 89/89. **634/634 PASS, zero failures.**

## Typechecks

- `pnpm --filter @growth-operator/intelligence run typecheck` — PASS
- `pnpm --filter @growth-operator/decision run typecheck` — PASS
- `pnpm --filter @growth-operator/api run typecheck` — PASS
- `pnpm --filter @growth-operator/web run typecheck` — PASS (caught one missing
  type export in the new test path; fixed by adding `OpportunityTriageStatus`
  to shared web types)

## Builds

- intelligence (`tsc`) — PASS (rebuilt before DB-backed runs)
- schemas (`tsc`) — PASS (rebuilt before DB-backed runs)
- decision (`tsc`) — PASS (untouched source; dist current)
- api (`tsc`) — PASS
- web (`tsc && vite build`) — PASS (pre-existing chunk-size warning only)

## Static Audit

- `git diff --check`: clean.
- Forbidden-term grep (LinkedIn/OAuth/automation/AI-calls/queues/workers/senders): zero hits.
- Learning/analytics grep: only pre-existing context lines.
- Workspace isolation: scoped lookup + membership middleware; foreign/outsider proven by tests.
- Migration/schema check: `git status -- packages/db/prisma` empty; no model/index/enum edits.
- Phase 9–14 semantics: untouched (additive lines only; convert/feedback/score/learning paths regression-green).

## Database

- No schema changes.
- No migrations.

## Non-Goals

LinkedIn/OAuth/execution; outreach sending; AI ranking/prose; automatic creation,
approval, publishing, conversion, suppression, or deletion; learning derivation or
`LearningSignal` input; confirmed-learning changes; analytics expansion;
`AnalyticsEvent`/`LearningSignal` consumption; workers/queues/cron; new pages,
pipelines, routers, or models; review-from-Home approval; idea-status or
lead-status automation; Open deep-links; concurrency-race fixes; any Phase 1–14
behavior change. None implemented — verified by diff audit.

## Known Limitations / Debt

Only repository-verified items: no bulk-triage (one PATCH per opportunity);
status history is the row itself (no audit trail beyond `updatedAt`); carried
(not phases): initiation check-then-create races, compensation-delete, `migrate
status` root-tooling limitation, `dist`-rebuild discipline, Open-navigation
context loss on terminal cards, `brief.relevance` null, voice-sample gap.

## Commit

Single phase commit on `main` with message `phase 15: add opportunity triage`
(hash per `git log -1`; reported in the phase-closing message). No push performed.
