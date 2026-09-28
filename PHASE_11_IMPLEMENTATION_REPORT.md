# PHASE 11 IMPLEMENTATION REPORT — RELEVANCE-DRIVEN SALES WORKFLOW INITIATION

## 1. Scope

Phase 11 implements:

prospect_relevance OperatorAction
→ explicit human "Research prospect" action
→ POST /actions/:actionId/research
→ existing ProspectResearchService.createResearch()
→ exactly one ProspectResearch row for the exact lead
→ result research linkage persisted on the OperatorAction
→ frontend opens the EXISTING LeadDetail for that exact lead via:
   /leads?leadId=<exact lead id>

No autonomous outreach, no AI generation, no LinkedIn integration, no workers, no new
sales pipeline, and no new sales page.

The existing content-idea initiation behavior remains preserved and untouched:
objection_pattern still uses its existing Start idea endpoint/path, its existing idea
linkage keys remain intact, and Phase 11 sales-research linkage is additive and coexists
with the idea linkage. Content-idea initiation was not changed by the sales-research
implementation.

## 2. Changed Files

There are 7 modified source files:

| File | Changes |
|------|---------|
| `packages/decision/src/initiation.ts` | Added `SALES_RESULT_KEYS` + `extractSalesResultKeys()` (string-only filter, mirrors `extractResultKeys`); added pure `buildRelevanceResearch()` using facts from recorded evidence with `confidence: null` on every fact and display-only `resultTitle`. Existing idea-initiation functions remain untouched. |
| `packages/decision/src/actions.ts` | Added `initiateSalesResearch()` with validation → eligibility → explicit lead check → existing `createResearch` → subjectMeta merge → compensation delete. Refresh upsert preserves both sales and idea linkage keys. Existing `initiateIdea` path remains untouched. |
| `packages/sales/src/research.ts` | Widened `ResearchFactInput.confidence` to `number \| null` as a type-only change so evidence without a legitimate confidence value can be stored as null. Runtime statement/sourceRef validation is unchanged. |
| `apps/api/src/routes/operator.ts` | Added `POST /actions/:actionId/research` returning 201 `{research, action}` under the existing authorization/workspace middleware. `/next-actions` preserves/re-merges sales linkage keys. |
| `apps/web/src/services/api.ts` | Added `StartResearchResponse` + `researchProspectFromAction(id)`. The response type exposes the already-returned `research.leadId`; no server response contract change was required. |
| `apps/web/src/pages/HomePage.tsx` | Added `handleResearchProspect`. Successful initiation navigates to `/leads?leadId=<exact id>` using the response row's `leadId`, falling back to the action's `subjectId`. The 409 path refetches and uses the action's valid `subjectId`, otherwise `/leads`. Added the "Research prospect" button only for `prospect_relevance`. Existing objection-pattern Start idea behavior remains unchanged. Also moved `useNavigate()` above early returns to fix a latent hooks-order crash. |
| `apps/web/src/pages/LeadsPage.tsx` | Added minimal `?leadId=` deep-link resolution using existing `listSalesLeads()` and existing `LeadDetail`. Exact matching lead is selected automatically; unknown IDs select nothing. Manual selection and existing LeadDetail workflow remain unchanged. |

New test files:

| File | Purpose |
|------|---------|
| `apps/web/src/pages/LeadsPage.deepLink.test.tsx` | 3 DOM tests: normal list view, exact lead auto-open, unknown lead selects nothing. |
| `apps/web/src/pages/HomePage.research.test.tsx` | 2 DOM tests: successful research initiation navigates with exact leadId; objection Start idea remains unchanged. |

Existing test file updated:

| File | Purpose |
|------|---------|
| `apps/web/src/pages/HomePage.startIdea.test.tsx` | Research-prospect surface tests; file now contains 4 tests total. |

Also retain the two Phase 11 documentation files:
- `PHASE_11_BOUNDARY_AUDIT.md`
- `PHASE_11_IMPLEMENTATION_REPORT.md`

No schema change.
No migration.
No new dependency.

## 3. Transformation

POST `/api/v1/operator/actions/:actionId/research`
→ validate action/workspace/member/kind/PENDING state
→ validate candidate/relevance eligibility and explicit lead
→ build deterministic research facts from recorded relevance evidence
→ `ProspectResearchService.createResearch({ workspaceId, leadId, facts })`
→ facts use `confidence: null` because relevance is not confidence and no legitimate confidence value is present
→ merge `resultResearchId`, `resultResearchTitle`, and `initiatedResearchAt` into `subjectMeta`
→ return 201
→ action remains PENDING
→ frontend navigates to `/leads?leadId=<exact lead id>`
→ existing LeadsPage resolves that exact lead
→ existing LeadDetail renders the existing research/signals/qualification/briefs/strategies/drafts workflow.

The server response already contained `leadId`; only the frontend TypeScript response type
needed to expose it.

## 4. Test Coverage

Unit:
- decision: 14 tests

Integration:
- API: 12 tests

Web:
- 9 focused tests related to Phase 11 correction:
  - 4 guard/surface tests
  - 3 deep-link DOM tests
  - 2 research-navigation DOM tests

Focused total:
**35/35 PASS**

## 5. Focused Test Result

- `vitest run src/test/salesResearch.test.ts` — decision: **14/14 PASS**
- `vitest run src/phase11.test.ts` — API with real PostgreSQL: **12/12 PASS**
- Web guard tests: **4/4 PASS**
- `LeadsPage.deepLink.test.tsx`: **3/3 PASS**
- `HomePage.research.test.tsx`: **2/2 PASS**

Affected `dist` artifacts were rebuilt before DB-backed verification:
- decision `dist` rebuilt before the API run
- sales `dist` rebuilt after the confidence type widening when stale declarations were detected

## 6. Full Regression Result

| Suite | Result |
|-------|--------|
| api | 130/130 PASS |
| web | 12/12 PASS |
| intelligence | 130/130 PASS |
| content | 91/91 PASS |
| sales | 59/59 PASS |
| learning | 31/31 PASS |
| decision | 75/75 PASS |

Grand total:
**528/528 PASS, zero failures.**

## 7. Typecheck Result

- decision — PASS
- sales — PASS
- api — PASS
- web — PASS

## 8. Build Result

- decision build — PASS
- sales build — PASS
- api build — PASS
- web build — PASS

`git diff --check`: clean. `git diff -- packages/db/prisma`: empty (no schema/migration
changes). Forbidden-term grep over the diff (LinkedIn/OAuth/automation/scraping/queues/
workers/AI-calls): zero hits. All `workspaceId` uses server-scoped from auth context.

## 9. Correction Note (Incidental Bug Fix)

`RecommendedSteps` had `useNavigate()` below five early returns. This meant the first
authenticated render could call N hooks and a later render N+1 hooks, causing React's
hooks-order failure. The hook was moved above the early returns. This was a one-line
corrective fix and did not change intended button behavior. It is not a Phase 11
architectural feature.

## 10. Known Warnings

- Vite >500 kB chunk-size warning (pre-existing, unchanged).
- pnpm/PowerShell wrapper noise in build output (cosmetic, pre-existing).

## 11. Known Limitations

1. `/health` and `/ready` were not invoked and remain unverified.
2. The original web guard tests are static source-presence pins; the new deep-link/navigation tests are real DOM tests.
3. The deep-link uses `/leads?leadId=<exact id>`. Unknown IDs and lookup failures fall back to the normal list view without selecting another lead.
4. Browser/E2E, production deployment, external LinkedIn behavior, load testing, and live external behavior remain unverified.

## 12. Carried Debt

1. MEDIUM: concurrent initiation check-then-create race remains across objection idea, relevance idea, and sales research paths. Sequential duplicate protection is tested; concurrent race protection is not fully solved.
2. LOW: compensation-delete instead of `prisma.$transaction`.
3. INFO: `prisma migrate status` is unavailable from repo root due to tooling limitation, not evidence of schema drift.
4. PROCESS: workspace packages resolve through built `dist`; affected packages must be rebuilt before DB-backed runs. This was applied during Phase 11.

## 13. Unverified Areas

- Browser/E2E
- `/health`
- `/ready`
- production deployment
- external LinkedIn behavior
- load testing
- live external behavior

## 14. Boundary Compliance

No stop condition triggered: existing entry point reused with unchanged sales validation
semantics; no new model/migration; no external credentials/LinkedIn/workers/queues/
schedulers; no AI calls (empty registry, `createResearch` never touches AI); no autonomous
action; no approval bypass (initiation is member-allowed evidence recording; strategy/draft/
review/approve gates untouched); no fabricated facts (recorded evidence only; fact
confidence is null — recorded relevance carries no legitimate per-statement confidence
and none is invented; unknowns `[]`); no second pipeline; no new page (LeadsPage deep-link
`?leadId=` added, existing LeadDetail reused unchanged); no generic resultRef
(specific keys only); Phase 10 ideas path and objection behavior untouched and
regression-proven intact.

---

**Status:** Phase 11 implementation, correction, and automated verification complete within the defined boundary.

- Focused: **35/35 PASS**
- Full regression: **528/528 PASS**
- Typechecks: PASS
- Builds: PASS
- `git diff --check`: clean
- No schema/migration changes
- No commit performed
- No push performed
- Remaining unverified areas are explicitly listed above.
- Existing content-idea initiation behavior remains intact and separately tested.
