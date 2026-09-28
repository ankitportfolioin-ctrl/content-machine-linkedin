# Phase 14 — Opportunity-Feedback-Driven Ranking

## Boundary
START:
Existing `OpportunityFeedback` rows (`workspaceId`, `opportunityId`, `userId`,
`feedback` type, optional `reason`, `createdAt`) written from the Brain
opportunity feedback UI with zero readers.
END:
Feedback visibly affects opportunity ranking and display: aggregated vote counts
appear on the Brain opportunity detail/score view, reasons are visible, negatively
rated opportunities are demoted on ranked surfaces, empty states stay honest, and
zero feedback changes nothing. No deletion, suppression, auto-convert, approval,
learning derivation, analytics, LinkedIn, workers, migrations, or dependencies.

## Repository Evidence
Verified at HEAD `53ac435` before editing: model (`schema.prisma:883-898`, six-value
`FeedbackType`, no FK on `opportunityId`); single writer (`POST
…/opportunities/:id/feedback`, `intelligence.ts:512-540`); zero readers (no
`find*`/`count` in `apps/`+`packages/`); base scorer (`contentOpportunity.ts:201`,
dimensions averaged, must stay intact); learning seam (`opportunityLearning.ts`,
`baseOverallScore` preserved); collector ranking via stored `opportunityScore`
(`collectors.ts:56-79`); Brain detail/feedback card (`BrainPage.tsx:322-484`);
client methods (`getOpportunity`, `getOpportunityScoring`,
`submitOpportunityFeedback`); no LinkedIn/workers anywhere.

## Implementation
| File | Change |
|------|--------|
| `packages/intelligence/src/opportunityFeedback.ts` (new) | `summarizeFeedback` (counts per type, total, newest-first capped reasons, unknown types ignored, empty reasons dropped), `feedbackDemotion`, `applyFeedbackDemotion`, workspace-scoped `fetchFeedbackSummary` + batched `fetchFeedbackSummaries` (single query) |
| `packages/intelligence/src/index.ts` | Re-export (one line) |
| `packages/decision/package.json` + `pnpm-lock.yaml` | Workspace link `@growth-operator/intelligence` (acyclic; verified no reverse imports) |
| `packages/decision/src/collectors.ts` | `contentOpportunities` applies one batched feedback read; `relevance01 = max(0, normalize01(score) − penalty)` + explicit demotion reason only when penalty > 0 |
| `packages/decision/src/test/collectors.test.ts` | Added `opportunityFeedback` model mock (one line; assertions unchanged) |
| `apps/api/src/routes/intelligence.ts` | Detail GET attaches `feedbackSummary` (after 404); score GET attaches `feedbackSummary` + `rankedOverallScore` + `feedbackPenalty`; base scoring untouched |
| `apps/web/src/types/index.ts` | `OpportunityFeedbackSummary` + optional response fields (non-breaking) |
| `apps/web/src/pages/BrainPage.tsx` | "Workspace feedback" card (total, per-type `N× label` counts, reasons with labels, honest empty state); vote handler re-fetches detail so the new vote appears |
| `apps/api/src/phase14.test.ts` (new) | 10 DB-backed integration tests |
| `packages/intelligence/src/test/opportunityFeedback.test.ts` (new) | 17 unit tests |
| `apps/web/src/pages/BrainPage.feedback.test.tsx` (new) | 3 DOM tests |

## Feedback Aggregation
`SummarizeFeedback(rows)`: per-type counts over exactly the six enum values
(unknown strings ignored, never misclassified); `total`; reasons newest-first
(tie: alphabetical), capped at 10, empty/null reasons dropped. Deterministic;
pure; empty input yields the honest zero summary.

## Demotion Rule
`penalty = min(0.20, negativeVotes × 0.05)` where negative = every type except
`USEFUL`, counted per row; `ranked = max(0, round2(base − penalty))` on the 0–1
scale. Positive votes: counted/displayed, never penalize. Threshold: none — one
vote moves exactly one step (−0.05, ≈−1 operator point), so burying is
impossible. Floor/cap: penalty ≤ 0.20, ranked ≥ 0, opportunity row untouched
(demotion, never deletion/suppression). Zero feedback → penalty 0 → ranked ==
base exactly. Votes are per-row (repeat votes allowed by the API; the cap makes
stacking safe). Bounded because both step and ceiling are constants with the
floor at zero.

## API
- `GET /intelligence/opportunities/:id` → `{ opportunity, feedbackSummary }`
  (404 before any feedback read, so orphaned feedback is unreachable).
- `GET /intelligence/opportunities/:id/score` → adds `feedbackSummary`,
  `rankedOverallScore`, `feedbackPenalty`; `scoring` dimensions and scores
  byte-identical. No new router, no new endpoint, existing middleware intact.

## UI
Brain opportunity detail gains a "Workspace feedback" card: `Feedback: N`,
`N× <Label>` rows for voted types only, reasons with type labels, and "No
feedback recorded yet." when empty. Voting re-fetches the detail, so counts
update and the thanks message never stands alone. Controls, convert flow, and
score breakdown untouched.

## Tests
- Unit (17/17): empty, single, multi-type, all-six, ties, determinism, reason
  cap, newest-first, empty/null reasons, unknown-type ignore, zero-penalty,
  one-step, multi-vote growth, cap bound, floor, positive-neutrality,
  per-row stacking.
- Integration (10/10, real DB): empty summary; vote counts/reasons; score view
  ranked-vs-base; operator order flip with neither deleted; zero-feedback score
  stability; foreign-workspace invisibility (+404 on foreign id); outsider 403s;
  orphaned-vote ignore (404 + no phantom action); convert unchanged.
- Web (3/3 DOM): counts/types/reasons render; empty state; vote refreshes data.
- Focused total: **30/30 PASS**.

## Full Regression
`pnpm test:all`: api 161/161, web 19/19, intelligence 147/147, content 91/91,
sales 71/71, learning 31/31, decision 89/89. **609/609 PASS, zero failures.**

## Typechecks
- `pnpm --filter @growth-operator/intelligence run typecheck` — PASS
- `pnpm --filter @growth-operator/decision run typecheck` — PASS
- `pnpm --filter @growth-operator/api run typecheck` — PASS
- `pnpm --filter @growth-operator/web run typecheck` — PASS

## Builds
- intelligence (`tsc`) — PASS (rebuilt before DB-backed runs)
- decision (`tsc`) — PASS (rebuilt before DB-backed runs)
- api (`tsc`) — PASS
- web (`tsc && vite build`) — PASS (pre-existing chunk-size warning only)

## Static Audit
- `git diff --check`: clean.
- Forbidden-term grep (LinkedIn/OAuth/automation/AI-calls/queues/workers/senders): zero hits; learning-semantics grep shows only pre-existing context lines.
- Workspace isolation: all reads scoped (`workspaceId` + opportunity existence); foreign/outsider proven by tests.
- Migration/schema check: `git status -- packages/db/prisma` empty; no model/index/enum edits.
- Dependency check: one workspace link (`decision → intelligence`, acyclic, lockfile-only change); no external packages.
- Phase 9–13 semantics: untouched (only additive collector/route/UI lines; no test asserted changed text).

## Database
- No schema changes.
- No migrations.

## Non-Goals
LinkedIn/OAuth/execution; outreach sending; AI ranking/prose; automatic creation,
approval, publishing, conversion, suppression, or deletion; learning derivation or
`LearningSignal` input; confirmed-learning changes; analytics expansion;
`AnalyticsEvent`/`LearningSignal` consumption; workers/queues/cron; new pages,
pipelines, routers, or models; review-from-Home approval; concurrency-race fixes;
any Phase 1–13 behavior change. None implemented — verified by diff audit.

## Known Limitations / Debt
Only repository-verified items: demotion visibility requires ≥1 negative vote to
move ranking (~1 operator point per vote; counts display regardless); per-row vote
counting (repeat votes stack within the cap); orphaned rows filtered at read time,
never repaired; carried (not phases): initiation check-then-create races,
compensation-delete, `migrate status` root-tooling limitation, `dist`-rebuild
discipline, Open-navigation context loss on terminal cards.

## Commit
`e093e6a` — `phase 14: opportunity-feedback-driven ranking` (pending at report
write time; hash filled after commit).
