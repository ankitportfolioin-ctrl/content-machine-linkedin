# PHASE 8 BOUNDARY AUDIT

Audit only. No implementation, refactoring, migrations, tests, commits, or pushes.
Prior reports treated as evidence, never authority — every material claim below was
re-verified against code, schema, tests, or runtime in this pass.

## 1. Starting State

- `git status --short`: empty (clean; no uncommitted Phase 8 work).
- `git log -1`: `a1703cf phase 7: activate cross-machine intelligence`, parent `a03067d`.
  HEAD and parent both match expectations. Proceeding.

## 2. Current Architecture

```
apps/web (React 18 + Router v6, fetch client; 9 pages: Home/Content/Brain/Leads/Inbox/Pipeline/Analytics/Settings/+auth)
  → apps/api (Express · JWT + workspace triple-middleware · Zod · typed error codes)
    → packages/decision (9 collectors / eligibility / deterministic scoring / explain / OperatorAction lifecycle)
    → packages/content (plan/thesis/audience/voice/hook/evidence/gates/review/compose/preview)
    → packages/sales (icp/discovery/research/qualification/scoring/signals/brief/strategy/compose/gates/review/prepared/classify/pipeline/bridge + objections + topicRelevance)
    → packages/intelligence (ingestion/extraction/claims/topics/trends/gaps/opportunities + SSRF + opportunityLearning view)
    → packages/learning (publish/outcome/aggregation/derivation/influence + contentOutcome rules; zero AI calls)
    → packages/ai (single registry: OpenAI + Anthropic; guarded call sites, honest AI_UNAVAILABLE)
    → packages/db (Prisma → Docker PostgreSQL 17 · 6 migrations · 45 models — see §8 note) + shared + schemas
External boundary: NOTHING outbound. No LinkedIn, senders, webhooks, queues, workers, or schedulers (grep-verified).
```

Phase 7 (commit `a1703cf`, forensically ACCEPTED WITH UNVERIFIED ITEMS) added four read-only seams:
objection aggregation, topic→prospect relevance, content→outcome derivation rules, and the
confirmed-only opportunity scoring seam with explanation surface. No tables, no automation.

## 3. Current Product Capability

CONTENT MACHINE: idea creation (manual) IMPLEMENTED; research/source ingestion/extraction/claims/
evidence/contradictions IMPLEMENTED; audience via Profile/ICP IMPLEMENTED; voice/strategy/hooks/
composition IMPLEMENTED; visual planning MISSING (no references in code or UI); quality gates/review/
approval/immutable finals/preview IMPLEMENTED; publication records + outcome recording IMPLEMENTED;
analytics (summary + defined-pair rates) IMPLEMENTED; learning (Phase 7 content-outcome rules)
PARTIAL-active; operator prioritization IMPLEMENTED (generic kinds only); recommendations PARTIAL
(no content-specific recommendation consumer).

SALES MACHINE: ICP/discovery (manual-only)/research/qualification/scoring/personalization/drafting/
review/approval/prepared-actions/inbox-classification/follow-ups/pipeline/outcomes IMPLEMENTED;
learning PARTIAL (generic derivation + qualification influence; no sales-specific rules — still true);
operator prioritization IMPLEMENTED (generic kinds only).

GROWTH INTELLIGENCE: ingestion/extraction/claims/evidence/contradictions/topics/mentions/trends/gaps/
opportunities/feedback/source-diversity/scoring/explanations IMPLEMENTED; research discovery MISSING
(caller-supplied URLs only — `POST /topics/research` ingests `data.query` as USER_URL, unchanged);
cross-machine signals PARTIAL (Phase 7 computes objections + relevance; only scoring is consumed);
relevance computation IMPLEMENTED, relevance consumption MISSING.

LEARNING: recording/aggregation/derivation/confirmation/rejection/revocation IMPLEMENTED;
qualification influence IMPLEMENTED; opportunity influence IMPLEMENTED (Phase 7); content influence
PARTIAL (proposals exist; no content-recommendation consumer); recommendation influence PARTIAL
(decision-engine boost only); workspace isolation + provenance IMPLEMENTED.

DECISION ENGINE: 9 collectors (`content_opportunity`, `content_gap`, `trend_signal`, `content_review`,
`outreach_review`, `follow_up`, `prepared_action`, `learning_proposal`, `stale_draft`), eligibility,
deterministic scoring (urgency/relevance/evidence/readiness/freshness/learning_boost), explanations,
dismiss/complete/refresh — all IMPLEMENTED. Objection-, relevance-, and outcome-driven collectors MISSING.

ANALYTICS: raw events (record/list only — **no consumer reads `AnalyticsEvent`**), outcome metrics,
aggregation, provenance, defined-pair rates IMPLEMENTED; funnels/cohorts/attribution/content-to-lead/
lead-to-opportunity/opportunity-to-outcome joins/comparisons/historical trends MISSING; UI is
summary-only (metric filter + rate pairs).

EXTERNAL INTEGRATION: LinkedIn auth/identity/data/publishing/messaging, platform analytics, external
research/discovery — all MISSING (intentional; 14 prerequisites absent per Phase 7 boundary §7).

BACKGROUND INFRASTRUCTURE: jobs/queues/schedulers/workers/retries/notifications all MISSING
(grep-verified zero matches); idempotency exists only on outcome recording. Nothing in the workload
justifies them (all operations synchronous and fast; full suite runs in seconds).

## 4. End-to-End Flow Audit

- FLOW A (idea→…→outcome→learning→recommendation): IMPLEMENTED except research is caller-supplied
  and content recommendations have no dedicated consumer (learning reaches content only indirectly
  via opportunity scoring).
- FLOW B (prospect→…→pipeline→outcome→learning→recommendation): IMPLEMENTED except discovery is
  manual-only and execution/monitoring intentionally absent.
- FLOW C (source→evidence→topic→opportunity→action→workflow): IMPLEMENTED via decision collectors.
- FLOW D (objection→pattern→content INPUT→workflow): **PARTIAL — pattern computed, zero consumers.**
  No generator, planner, strategist, or collector reads objection patterns. `toContentInput` bridge
  serves signals (not patterns) and itself has no content consumer.
- FLOW E (topic→relevance→prioritization/use): **PARTIAL — relevance computed, zero consumers.**
  No prioritization, no outreach linkage (`relevantContentId` remains a validated-but-uncomputed optional field).
- FLOW F (outcome→proposal→confirm→opportunity scoring): **IMPLEMENTED and live-tested** (Phase 7).

## 5. Cross-Machine Matrix

| Signal | Source | Current transformation | Consumer | Status | Evidence |
|---|---|---|---|---|---|
| objections → opportunities | classifications | normalized patterns + provenance (P7) | none | DEAD END | zero references outside route+tests |
| objections → strategy | classifications | none | none | MISSING | strategy takes no sales input |
| topics → prospect relevance | topics/mentions/lead/ICP/research | 4-dim explained score (P7) | none | DEAD END | zero UI + zero backend consumers |
| engagement → relevance/prioritization | — | — | — | MISSING | no engagement model/data exists |
| relevant content → outreach | — | `relevantContentId` validated only | strategy (manual) | PARTIAL | no computation; unchanged by P7 |
| research → content / sales | rows | mutually readable; `toContentInput` shape | none call it | PARTIAL | zero refs in `packages/content` |
| content performance → learning | OutcomeMetric | contentOutcome rules → PROPOSED (P7) | opportunity scoring | ACTIVE | live-tested lifecycle |
| sales outcomes → learning | OutcomeMetric | generic unit-grouped derivation only | qualification | PARTIAL | no sales-specific rules (verified absent) |
| learning → qualification | confirmed proposals | bounded influence | prospects qualify | ACTIVE | pre-existing |
| learning → opportunity scoring | confirmed proposals | bounded influence + explanation (P7) | score endpoints + UI card | ACTIVE | live-tested lifecycle |
| learning → content recommendations | confirmed proposals | none | none | MISSING | no consumer |
| learning → operator ranking | confirmed proposals | learning_boost ≤10pts | decision scoring | ACTIVE | `scoring.ts` verified |
| intelligence → operator actions | 9 collectors | rank/explain/dismiss/complete | Home/Brain | ACTIVE | live-tested |
| outcomes → future recommendations | learning | see rows above | partial | PARTIAL | via scoring/ranking only |

Phase 7's two dead-end seams (objections, relevance) are the precise incompleteness this audit targets.

## 6. Remaining Gaps

Ranked by what blocks intelligence becoming useful work (not by size): (1) objection patterns and
topic relevance have no consumer — computed intelligence invisible to the operator; (2) relevant
content→outreach uncomputed; (3) no sales-specific learning rules; (4) AnalyticsEvent/LearningSignal
rows are write-only (no readers); (5) analytics summary-only; (6) research discovery caller-only;
(7) LinkedIn/workers intentionally absent. Gap (1) is the bottleneck: it strands the newest,
most-specific intelligence the system just learned to compute.

## 7. Candidate Phase 8 Directions

- **A. Research/discovery engine.** Foundation: ingestion/extraction/claims exist. Missing: external
  search/fetch, source vetting, dedup-at-scale. Requires new external dependencies + network trust
  (SSRF surface widened); boundary complexity high; does not unlock existing functionality (no
  consumer waits on more sources). Risks oversized phase. NOT RECOMMENDED.
- **B. Content performance + analytics intelligence.** Foundation: OutcomeMetric path active.
  Missing: event semantics, producers (no UI records AnalyticsEvents), funnel/cohort machinery.
  Builds views over data nobody produces — the analytics-deepening trap prior audits flagged.
  NOT RECOMMENDED now.
- **C. Cross-machine recommendation completion.** Foundation: two computed-but-unconsumed signals +
  decision engine with free-form `kind` (plain string — no migration), eligibility/scoring/explain/
  dismiss/complete all generic. Missing: 2 collector kinds + eligibility rules + kind labels.
  Unlocks Phase 7 outputs directly through existing approval rails. Small, deterministic, testable.
  RECOMMENDED.
- **D. Operator workflow completion (dismissal reasons, rank history).** Dismissal reasons need a
  migration for marginal value; rank history likewise. Small but schema-touching for UX polish —
  defer. NOT RECOMMENDED now.
- **E. External LinkedIn integration.** 14 prerequisites still absent; would dwarf a phase and breach
  every standing non-goal. EXCLUDED.
- **F. Analytics deepening.** See B. NOT RECOMMENDED now.
- **G. Background jobs/infrastructure.** No workload justification; suites run in seconds; all flows
  synchronous by design. EXCLUDED.
- **H. Learning expansion (sales-specific rules, content recommendations).** Sales-specific rules are
  real but serve the already-working qualification path; content recommendations lack a defined
  consumer shape. Lower leverage than C; keep as future. NOT RECOMMENDED now.
- **I. AnalyticsEvent/LearningSignal consumption.** Dead-end rows exist, but no producer/consumer
  pressure and no user question they answer. Explicitly OUT (do not invent semantics for dormant rows).

No numeric ranking used; C wins on unlock-per-risk by direct evidence.

## 8. Architecture/Data Model Findings

- 45 models in `schema.prisma` (Phase 7 boundary stated 41 — minor undercount, no implementation impact).
- 6 migrations; DB in sync; no model is overloaded for Phase 8's needs.
- `OperatorAction.kind` is a free `String(100)` + `@@unique([workspaceId, identityKey])`: new collector
  kinds (`objection_pattern`, `prospect_relevance`) require **no migration**; identity keys
  (`kind:pattern-hash`, `kind:topicId:leadId`) give dedup/suppression for free.
- `subjectMeta` (Json) carries provenance (classification/conversation ids; topic/lead/dimension scores).
- Derivable without schema changes: everything in §12–§14. Unused-but-existing: AnalyticsEvent,
  LearningSignal (deliberately untouched). Nothing justifies a new table.

## 9. User Experience Findings

- Home answers "what should I do today" generically; Brain answers "why" per artifact; learning tab
  shows proposals; pipeline shows outcomes. Real and backed.
- Unanswerable today: "which objections keep recurring and what content answers them?", "which
  prospects does this topic actually fit?", "how do content and sales inform each other?" — the exact
  questions Phase 7's dead-end seams could answer. Verified: Brain has no objections/relevance tabs;
  Leads/Inbox/Home contain zero references to the Phase 7 objections/relevance endpoints (only
  `getOpportunityScoring` is consumed by UI).
- No UI implies capabilities the backend lacks (prior audits' standard holds; re-verified by the
  endpoint-usage grep). Backend capabilities missing from UI: objection patterns, topic relevance.

## 10. AI Boundary

AI participates only at pre-existing call sites (understanding, synthesis, composition, classification
assist, optional explanation prose) — all Zod-validated with honest `AI_UNAVAILABLE`. All Phase 7
seams are deterministic; the recommended Phase 8 (collectors/eligibility/scoring/explanations over
recorded rows) is fully deterministic. **AI is unnecessary for Phase 8** — explicitly no new AI
responsibility, no new provider, no AI-scored ranks.

## 11. Verification Baseline (fresh in this audit, read-only commands)

- `pnpm test:all`: API 88/88 · Web 3/3 · intelligence 130/130 · content 91/91 · sales 59/59 ·
  learning 31/31 · decision 22/22 — **424/424, zero failures** (matches forensic baseline exactly).
- `pnpm typecheck`: PASS, zero errors (10 script filters + intelligence separately — same standing
  process note as Phase 7 F4).
- `pnpm build` (API + web): PASS (`✓ built in 1.84s`; `apps/api/dist/index.js` present).
- Docker `growth_operator_postgres:17`: Up, healthy. No DB writes performed by this audit.

## 12. Recommended Phase 8 Boundary

**NAME: Phase 8 — Cross-Machine Recommendation Completion.**
**PROBLEM IT SOLVES:** Phase 7 computes objection patterns and topic→prospect relevance that no
consumer reads and no surface shows — measured intelligence that cannot become work.
**WHY NEXT:** it is the only candidate that unlocks already-built, already-tested functionality
without new tables, endpoints, dependencies, AI, or automation; everything it needs exists and is green.

## 13. Inputs

Recorded rows only: OBJECTION classifications + conversations (via existing aggregation),
topics/mentions + leads + ICP + research (via existing relevance fn), existing decision-candidate
context. No new data collection of any kind.

## 14. Transformations

Two new read-only decision collectors reusing `packages/decision` machinery: (1) `objection_pattern`
— patterns meeting the existing min-sample rule become "address recurring objection" candidates with
conversation/quote provenance; (2) `prospect_relevance` — bounded top-K topic×lead pairs above a
fixed relevance floor become "qualified-fit" candidates with per-dimension reasons. Both reuse
eligibility/scoring/explain unchanged in shape (fixed weights for new dimension inputs, documented
in code); refresh/dedup/suppression/dismiss/complete untouched.

## 15. Outputs

Ranked, explained `OperatorAction` rows of the two new kinds on Home with evidence links; full
explanations via the existing explanation endpoint; routing links into existing manual rails
(content-idea creation stays manual; outreach stays approval-gated). Nothing auto-created, nothing sent.

## 16. Persistence

`OperatorAction` rows only (existing table, existing lifecycle). No new tables, no migrations,
no status-model changes, no dismissal-reason column.

## 17. APIs

No new endpoints: `refreshWorkspace` picks up the new collectors; `GET /operator/next-actions`,
`GET /operator/actions`, dismiss/complete, and `GET /operator/explanations/:id` serve them unchanged.
(If a kind filter enum blocks the new kinds, extend the filter list only — no behavior change.)

## 18. UI

Home renders the new kinds generically (add kind labels to the existing display-name mapping);
explanations render through existing components. No new pages, no new tabs, no Brain/Inbox/Leads
changes unless trivial reuse. No mock data; honest empty states when no patterns/relevance qualify.

## 19. Learning/Decision/Analytics Interaction

Learning: none new (existing decision learning_boost continues to apply). Decision: the two
collectors plus documented scoring-dimension inputs. Analytics: none (no new metrics; outcomes of
acted-upon recommendations flow through the existing publish/outcome path and become measurable
by the current system — the loop Phase 7 opened, closed).

## 20. Human Gates

Dismiss/complete preserved per action; content creation remains manual via existing idea/plan/review
rails; outreach remains approval-gated via strategy/draft/review/prepared-action rails; learning
confirm/revoke untouched. No autonomous anything.

## 21. Security

Workspace-scoped collectors (caller workspace id only); candidate queries reuse existing scoped
accessors; no client-controlled workspace ids; no external calls; no secrets; no new attack surface
beyond two read-only aggregations over already-readable rows.

## 22. Tests

Unit: collector mapping/provenance, eligibility (threshold, floor, caps, staleness), scoring math
for new kinds, explanation-line completeness. Integration on Docker PostgreSQL: seeded objections →
ranked objection actions with order; seeded topic×lead fit → relevance actions; dismiss/complete
lifecycle; empty workspace → explicit empty (no noise); cross-workspace denial; min-score/cap
behavior. Regression: full 424-test suite green.

## 23. Definition of Done

- Every new action traces to recorded rows (spot-checkable ids/quotes/scores).
- Below-threshold patterns and below-floor relevance never become actions; empty states, never noise.
- Deterministic output for identical inputs (rank ties broken by documented rule).
- No automatic artifact creation (grep-verified: no new writes outside `OperatorAction` lifecycle).
- Workspace isolation + role behavior proven by tests.
- UI lists match backend ranking; explanations match scores.
- Suite green including regression; typecheck; build; compiled boot/health/ready.

## 24. Explicit Non-Goals

LinkedIn OAuth/API/posting/messaging; browser automation; CAPTCHA; scraping; autonomous
outreach/follow-up; workers/queues/schedulers/cron; production deployment; load infrastructure;
UI redesign or new pages/tabs; new AI provider or AI responsibilities; automatic artifact creation;
AnalyticsEvent/LearningSignal consumption; analytics expansion (funnels/cohorts/attribution);
sales-specific learning rules; content-recommendation consumers; dismissal reasons/rank history
(schema-touching polish — future); research discovery; `relevantContentId` auto-suggestion.

## 25. Stop Conditions

STOP (do not expand) if implementation would require: external execution or credentials; scraping
or unvetted external fetch; autonomous action of any kind; a worker/queue; a new table or migration;
invented metrics or unattributed scores; bypassing any approval lifecycle; per-pair fan-out without
tested caps; or any cross-workspace read.

## 26. Unverified Items

Browser/E2E, live-AI prose, external-network behavior, production deployment, load/performance —
carried forward unchanged (all out of scope). Nothing within the recommended boundary is unverifiable:
collectors, scoring, and lifecycle are deterministic and Docker-testable.

## 27. Final Boundary Decision

**PHASE 8 BOUNDARY APPROVED**

Phase 8 — Cross-Machine Recommendation Completion, exactly as bounded in §§12–25: two new
read-only decision collectors (`objection_pattern`, `prospect_relevance`) turning Phase 7's
unconsumed signals into ranked, explained, dismissable operator actions through existing rails —
no tables, no endpoints, no AI, no automation.
