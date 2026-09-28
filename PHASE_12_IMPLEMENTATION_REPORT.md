# Phase 12 — Relevant-Content Suggestions for Outreach Strategy

## Scope

Read-only, deterministic suggestions of existing workspace `ContentIdea` rows relevant
to a prospect, shown while creating an `OutreachStrategy`. The user picks one suggestion;
the existing `relevantContentId` + `contentReason` fields are populated; the strategy
stays `DRAFT` under the unchanged approval workflow. No autonomous outreach, no AI
ranking, no LinkedIn integration, no new pages, no new pipelines, no migrations.

## Repository Evidence

Reused verbatim, verified at HEAD `218e422` before editing:
- `packages/sales/src/topicRelevance.ts` (`computeTopicRelevance`, fixed weights, 4 explained dimensions)
- `MIN_PROSPECT_RELEVANCE = 0.5` floor and 10-topic fan-out bound (`packages/decision/src/signals.ts`)
- `ContentIdea.topicId` (`packages/db/prisma/schema.prisma:462`)
- `OutreachStrategyService.createStrategy` validation, including the `relevantContentId`
  must-exist-in-workspace rule (`packages/sales/src/strategy.ts:98-103`)
- Outreach router conventions (triple middleware, `forwardSalesError`, required-query-param
  400 pattern from `prospects.ts:140-152`)
- `LeadsPage.tsx` `StrategiesSection` form + `createOutreachStrategy` client contract
  (which already accepted `relevantContentId`/`contentReason`; the web form simply never sent them)

## Implementation

| File | Change and why |
|------|----------------|
| `packages/sales/src/relevantContent.ts` (new) | `suggestRelevantContent()` (workspace-scoped lead check → ICP load → bounded topic fan-out → `computeTopicRelevance` reuse with ≥0.5 floor → ideas by `topicId` → `rankRelevantContent()`) + pure `rankRelevantContent()` + `MIN_CONTENT_RELEVANCE`/`MAX_RELEVANCE_TOPICS`/`MAX_CONTENT_SUGGESTIONS` constants |
| `packages/sales/src/index.ts` | Re-export the new module (one line) |
| `apps/api/src/routes/outreach.ts` | `GET /outreach/strategies/relevant-content?leadId=` (registered before `/strategies/:strategyId` so Express cannot misroute); 400 on missing `leadId`; `forwardSalesError` otherwise (unknown/foreign lead → 422, outsider → 403 via middleware) |
| `apps/web/src/services/api.ts` | `RelevantContentSuggestion` import + `listRelevantContent(leadId)` fetcher (existing `authedRequest` pattern) |
| `apps/web/src/types/index.ts` | Shared `RelevantContentSuggestion` interface (single definition; service imports it) |
| `apps/web/src/pages/LeadsPage.tsx` | `StrategiesSection`: suggestion fetch on `leadId`, "Suggested content for this prospect" list (title/topic/relevance/reason + Select), selected chip + editable reason input + Clear, selection wired into the existing create call; honest empty state; strategy stays DRAFT, no auto-submit |

## Data Flow

Lead/prospect
→ relevance (`computeTopicRelevance` per workspace topic, ≥0.5 floor)
→ topic (`topicId`s that qualify)
→ ContentIdea (workspace-scoped `topicId IN (...)` lookup; untagged ideas honestly excluded)
→ suggestion ranking (relevance desc → topicId asc → newest first → ideaId asc, cap 5)
→ user selection (Select button)
→ OutreachStrategy.relevantContentId/contentReason (existing fields, existing validation, DRAFT)

## Deterministic Ranking

`rankRelevantContent()`: relevance descending, then `topicId` ascending (stable topic
grouping), then `createdAt` descending (newest content first), then `ideaId` ascending
(final tie-break). Pure function of recorded rows/values; capped at
`MAX_CONTENT_SUGGESTIONS = 5`. Unit-pinned including full-tie and cap cases.

## Workspace Isolation

Enforced at three layers: lead lookup scoped (`findFirst({id, workspaceId})`, unknown/
foreign → 422); topic and idea queries filtered by `workspaceId`; membership middleware
rejects outsiders (403). Integration proves foreign-workspace content never appears.

## API

`GET /api/v1/outreach/strategies/relevant-content?leadId=<uuid>` → 200
`{ suggestions: [{ ideaId, title, topicId, topicName, relevance, reason }] }`.
Read-only (no writes); 400 missing `leadId`; 422 unknown/foreign lead; 403 outsider.
Response carries only display fields (ids for linkage, recorded names/scores/reasons).

## UI

In the existing `StrategiesSection` ("Outreach plans"), below the create form: suggestion
cards with title, topic, relevance %, and evidence-backed reason; Select populates the
existing fields (reason prefilled from evidence, editable); Clear removes the selection;
create sends `relevantContentId`/`contentReason` only when selected; new strategy renders
DRAFT as before. Empty state: "No relevant content recorded for this prospect yet."
No new page, no redesign, no auto-submit/approve/send.

## Approval Safety

Selection only fills form fields; creation still yields `DRAFT` via the unchanged
`createStrategy` path; `approveStrategy` (OWNER/ADMIN), draft compose gates, review
decisions, and prepared-action readiness are byte-untouched. Nothing in this phase can
send, publish, approve, or execute.

## Tests

- Unit `packages/sales/src/test/relevantContent.test.ts`: **12/12 PASS** (ranking, order,
  tie-breaks, cap, empties, untagged exclusion, no-fallback, score echo, unknown-lead).
- Integration `apps/api/src/phase12.test.ts` (real PostgreSQL): **10/10 PASS**
  (ranked retrieval, determinism, honest empty, cross-workspace exclusion, 400/422/403
  matrix, strategy create stores fields as DRAFT, fabricated-id rejection).
- Web `apps/web/src/pages/LeadsPage.relevantContent.test.tsx` (real DOM): **2/2 PASS**
  (render + select populates + DRAFT preserved; empty state + unlinked create).
- Focused total: **24/24 PASS**.

## Typechecks

- `pnpm --filter @growth-operator/sales run typecheck` — PASS
- `pnpm --filter @growth-operator/decision run typecheck` — PASS
- `pnpm --filter @growth-operator/api run typecheck` — PASS
- `pnpm --filter @growth-operator/web run typecheck` — PASS

## Builds

- `pnpm --filter @growth-operator/sales run build` — PASS (rebuilt before DB-backed runs)
- `pnpm --filter @growth-operator/decision run build` — PASS
- `pnpm --filter @growth-operator/api run build` — PASS
- `pnpm --filter @growth-operator/web run build` — PASS (pre-existing chunk-size warning only)

## Regression

`pnpm test:all`: api 140/140, web 14/14, intelligence 130/130, content 91/91, sales 71/71,
learning 31/31, decision 75/75. **552/552 PASS, zero failures.** Phases 1–11 suites all
green, unchanged behavior verified.

## Diff Audit

`git diff --check`: clean. Tracked diff confined to 5 files (+120 lines, zero deletions):
outreach route, LeadsPage, web api service, web types, sales index — plus 4 new files
(builder, 3 test files) and this report. No schema/migration files, no secrets, no mock
data, no fake analytics, no fabricated relevance (scores echo `computeTopicRelevance`;
reasons quote its recorded dimension strings), no new dependencies, no approval-gate or
workspace-isolation changes.

## Non-Goals

LinkedIn OAuth/API/execution; outreach sending; scraping; external research; AI ranking;
automatic attachment/outreach; learning→strategy influence; analytics expansion;
`AnalyticsEvent`/`LearningSignal` consumption; new pages/pipelines; migrations;
concurrency-race fixes; any Phase 1–11 behavior change. None implemented.

## Known Limitations

Only actual, repository-supported limitations:
1. Ideas without `topicId` are invisible to lookup (honest empty state).
2. Suggestion cap is fixed at 5; relevance floor fixed at 0.5 (documented, tested).
3. `/health` and `/ready` not invoked; browser/E2E, production, external LinkedIn, load,
   and live-AI paths unverified (out of scope).
