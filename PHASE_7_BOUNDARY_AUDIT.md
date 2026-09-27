# Phase 7 Boundary Audit

Audit only. No implementation, refactoring, migrations, commits, or pushes. Prior reports treated as evidence, never authority — every material claim below was re-verified against code, schema, tests, or runtime in this pass.

## 1. Executive Summary

The repository at `a03067d` is a coherent, fully-tested, human-gated operating system with four working machines (research/intelligence, content, sales, outcomes/learning) plus a decision layer — but the machines largely operate side by side rather than together. The evidence supports exactly one narrow next phase: **Cross-Machine Intelligence Activation**: wire the documented-but-dead connections (objection aggregation → opportunity inputs, topic→prospect relevance, content-outcome derivation, opportunity scoring seam) using only recorded data, with the same honesty and approval guarantees. LinkedIn, automation, workers, ingestion, and production deployment are explicitly excluded with evidence.

## 2. Current Checkpoint

- HEAD: `a03067d phase 6: growth intelligence and decision engine` (prior: `cfb3dd0`, `b9bd5d0`, `6a5627a`, `32024a8`, `dbe8dd3`).
- Working tree at audit start: **clean**; after this audit the sole addition is this file (untracked).
- Fresh verification in this audit: `pnpm test:all` **392/392, 0 failures** (API 71 · Web 3 · intelligence 127 · content 91 · sales 51 · learning 27 · decision 22); `pnpm typecheck` PASS (10 packages); `pnpm build` PASS with `apps/api/dist/index.js` present.

## 3. Architecture Map

```
apps/web (React 18 + Router v6, fetch client, no query lib; 9 pages)
  → apps/api (Express · 22 route files · JWT + workspace triple-middleware · Zod · typed error codes)
    → packages/decision (collectors/eligibility/scoring/explain/actions + optional AI summaries)
    → packages/content (13 services: plan/thesis/strategy/audience/voice/hook/evidence/gates/review/compose/preview)
    → packages/sales (16 services: icp/discovery/research/qualification/scoring/signals/brief/strategy/compose/gates/review/prepared/classify/pipeline/bridge)
    → packages/intelligence (8 services + SSRF; "research" = caller-supplied URL ingestion, intelligence.ts:201)
    → packages/learning (5 services, zero AI calls: publish/outcome/aggregation/derivation/influence)
    → packages/ai (single abstraction: OpenAI + Anthropic + registry; 11 guarded call sites)
    → packages/db (Prisma → Docker PostgreSQL 17 · 6 migrations · 41 models) + shared + schemas
External boundary: NOTHING outbound. No LinkedIn, senders, webhooks, queues, workers, or schedulers (grep-verified).
```

No duplicated logic, no orphan services/routes (except dead `health.ts` route file), no unused packages, no duplicated AI abstractions.

## 4. Product Capability Matrix

CONTENT: idea creation (manual CRUD — contentIdeas.ts contains zero AI calls) PARTIAL; research/source ingestion/evidence/contradictions IMPLEMENTED; strategy/audience/voice/hooks/composition/gates/review/approval/immutable finals/preview IMPLEMENTED; publication/outcome recording IMPLEMENTED; analytics PARTIAL (computed summaries, no funnels/cohorts/attribution); content learning MISSING; opportunity prioritization IMPLEMENTED (via decision layer); operator recommendation IMPLEMENTED.
SALES: ICP/discovery (manual-only entries)/research/qualification/scoring/personalization/drafting/review/approval/prepared-actions/inbox-classification/follow-ups/pipeline/outcomes IMPLEMENTED; sales learning PARTIAL (generic derivation works on sales metrics; no sales-specific rules); operator recommendation IMPLEMENTED.
INTELLIGENCE: ingestion/extraction/claims/evidence/contradictions/topics/trends/gaps/opportunities/feedback (`POST /opportunities/:id/feedback` verified present)/prioritization/explanations IMPLEMENTED; source diversity IMPLEMENTED (`sourceDiversityScore`); discovery MISSING (caller-supplied URLs only).
DECISION ENGINE: collection/eligibility/ranking/explanation/persistence/dismissal/completion/lifecycle/isolation/learning-boost all IMPLEMENTED and live-tested.
LEARNING: recording/aggregation/derivation/lifecycle/confirmation/revocation IMPLEMENTED; scoring influence PARTIAL (qualification path only); content/opportunity/recommendation influence MISSING.
ANALYTICS: raw events + outcome metrics + deterministic aggregation + provenance + denominators + defined-pair rates IMPLEMENTED; funnels/cohorts/attribution/comparisons/dashboards-beyond-summary MISSING.

## 5. Cross-Machine Intelligence Matrix

| # | Connection | Verdict | Evidence |
|---|---|---|---|
| 1 | Sales objections → content opportunities | MISSING | "Objection" strings exist only in test fixtures; no aggregation or generator input path |
| 2 | Sales objections → content strategy | MISSING | Same — strategy service has no sales input |
| 3 | Content topics → prospect relevance | MISSING | No topic↔lead linkage in code or schema |
| 4 | Content engagement → prospect prioritization | MISSING | No engagement data model or collection |
| 5 | Relevant content → outreach preparation | PARTIAL | Validated `relevantContentId` only; no relevance computation |
| 6 | Sales research ↔ content research | PARTIAL | Mutually readable rows; no fan-out or shared pipeline (`toContentInput` shapes data but no content consumer calls it — verified zero references in `packages/content`) |
| 7 | Content performance → learning | MISSING | Derivation is metric-agnostic and would accept such rows, but nothing records content-performance metrics |
| 8 | Sales outcomes → learning | PARTIAL | Mechanically supported; no sales-specific derivation rules |
| 9 | Learning → qualification scoring | IMPLEMENTED | Single filtered caller (`prospects.ts:189-190`), proven live |
| 10 | Learning → opportunity scoring | MISSING | No caller; seam function exists but unwired there |
| 11 | Learning → content recommendations | MISSING | No consumer |
| 12 | Intelligence → operator actions | IMPLEMENTED | Opportunity/gap/trend collectors live-tested |
| 13 | Operator actions → workflow completion | IMPLEMENTED | Dismiss/complete lifecycle live-tested |
| 14 | Outcomes → future recommendations | PARTIAL | Via confirmed learning on qualification + ranking only |

## 6. End-to-End Workflow Audit

Content chain (idea → … → learn → recommend) is unbroken except two links: research is caller-supplied (no discovery), and content performance never re-enters as learning input. Sales chain is unbroken except: discovery is manual-only, and execution/monitoring are intentionally absent (human boundary). Operator chain is complete. Broken links are all on the *input* side (discovery, engagement, performance data) — never on enforcement.

## 7. Human-in-the-Loop Audit

Approvals required: content/opportunity generation paths, plan approval, draft review decisions, strategy approval, review approvals, prepared-action readiness (approval-gated), learning confirm/revoke (OWNER/ADMIN), operator dismiss/complete (operator's own decision). Recordable: publications, outcomes, signals, feedback, reviews, dismissals. Dismissable/completable: operator actions only. Not executable: anything external — no code path exists. The product is **not ready** for external execution, and must not become ready without: OAuth/token lifecycle, external identity mapping, capability abstraction, idempotency, rate-limit/retry semantics, audit log, approval binding, and disconnect semantics — none of which exist. Those prerequisites, not eagerness, are why execution stays out of Phase 7.

## 8. External Execution Readiness

All 14 prerequisite areas in the brief are MISSING (verified by grep + architecture review). They form a coherent *later* phase of their own, not part of Phase 7.

## 9. Analytics Audit

Outcome aggregation is real (counts/sums/avgs/min/max/sources/period/IDs, defined-pair rates with numerators/denominators, omitted-rate reasons, explicit empty states). Missing, scoped to recorded rows only: time-series history views, content-level performance rollups, sales funnel analytics, cohort/group comparison, trend comparison, attribution, conversion/response-rate rollups, content-to-lead and opportunity-to-outcome joins. AnalyticsPage is real but summary-only.

## 10. Learning Audit

`OutcomeMetric → aggregation → LearningProposal → confirmation → influence` is real and tested. 14 known dimensions; consumers: exactly one (qualification scoring). Missing consumers: opportunity ranking, content recommendations, operator ranking beyond the boost. Deterministic throughout; no workers, no silent mutation (proposed/rejected/revoked structurally excluded — single filtered caller verified).

## 11. Decision-Engine Audit

Genuinely cross-machine (9 collectors across content/sales/intelligence/learning), learning-aware (confirmed-only boost with reasons), outcome-aware (via learning + follow-up/recommendation states), with deterministic bounded scoring, evidence-linked explanations, stale-state removal, persisted dismiss/complete lifecycle, and workflow routing via subject metadata. Remaining gaps: no objection-driven candidates, no engagement-driven candidates, no content-performance candidates, no dismissal reasons, no rank-change history — all precise, all small.

## 12. AI Audit

AI-enabled: source understanding, opportunity/gap/topic synthesis, plan/hook/draft composition, brief/research synthesis, classification assist, explanation summaries — every call Zod-validated with honest `AI_UNAVAILABLE` and zero fallback prose. Deterministic: ingestion, extraction, qualification, scoring, gates, reviews, aggregation, derivation, ranking, transitions, previews. Learning package needs no AI at all (grep-verified zero AI imports). Phase 7 needs no new AI capability; optional explanation-style synthesis may reuse the existing pattern.

## 13. Frontend UX Audit

Home/Content/Brain/Leads/Inbox/Pipeline/Settings are real and API-backed (call/state density verified per page); Analytics is real; only dead copy was found (HomePage "empty shells" text — Phase 6 replaced the card it lived in; verified absent). No mock data, fake metrics, or misleading active/connected/learned/published claims. Genuinely missing: objection-driven views, performance views, funnel views, dismissal-reason capture, rank-change visibility.

## 14. Data-Model Gap Audit

Current schema represents everything Phase 7 needs except, at most: (a) optional `dismissalReason`/`rankSnapshot` columns on `OperatorAction` (convenience, not required — reasons live in rows already); (b) a measured `ObjectionPattern` aggregate *only if* objection mining is scoped in (derivable from existing `Message` + `SalesContentSignal` rows, so likely unnecessary). No new model is *required*; any proposal adding one must meet the brief's first-class-entity test. `Json` ID-lists are adequate for display links; join-driven ranking would need relations only if Phase 7 ranks across machines in SQL (it should not — collectors already do this in code).

## 15. Security/Governance Audit

Greps clean (only fixtures, guardrails, URL-string fields, and Express `.send()` matched). Workspace isolation, role gates, approval boundaries, immutability, prepared-action terminality, and provenance all verified in prior acceptances and untouched since. No new attack surface is proposed.

## 16. Testing/Verification Audit

Fresh in this audit: `pnpm test:all` **392/392, 0 failures** (API 71 · Web 3 · intelligence 127 · content 91 · sales 51 · learning 27 · decision 22); `pnpm typecheck` PASS (10 packages); `pnpm build` PASS with dist present. Blind spots (unchanged, recorded): no browser/E2E specs (glob-verified absent), no live-AI tests (honest-unavailable paths tested instead), no load tests, no migration tests, and the pre-existing scaffold CRUD routes carry no dedicated API tests (`index.test.ts` covers health/validation/auth/workspace/DB only).

## 17. Up to 3 Possible Phase 7 Boundaries

**Candidate A — Cross-machine intelligence activation.** Wire dead connections with recorded data only: objection-pattern aggregation → opportunity *inputs* (never auto-created opportunities; full Phase 3 pipeline still required); topic→prospect relevance signals; content-outcome derivation rules; opportunity-scoring seam mirroring the qualification seam. Reuses collectors, gates, reviews, learning lifecycle. Verifiable without credentials. Risk: scope creep into auto-generation — contained by "inputs only, never artifacts."
**Candidate B — Operator experience completion.** Dismissal reasons, rank-change visibility, Home grouping, Brain explanations everywhere, onboarding empty states. Small, UX-only, fully testable. Risk: low leverage alone.
**Candidate C — Analytics deepening.** Funnels, cohorts, attribution, content-to-lead and opportunity-to-outcome joins over recorded rows. Deterministic and verifiable. Risk: builds views before the cross-machine data flows (A) exist to feed them; lower leverage first.

Tradeoffs: A unlocks B and C (connections first, surfaces second); B alone changes no intelligence; C alone visualizes sparse data. Dependencies: all three need only the current schema plus at most the minor additions in §14. No candidate needs credentials, workers, or LinkedIn.

## 18. Tradeoff/Dependency Analysis

See §17 per candidate. Shared dependency for all: the 392-test baseline must stay green. A is prerequisite-shaped (data flows), B is surface-shaped, C is view-shaped; correct order is A → (B, C in any order).

## 19. Recommended Boundary Only If Evidence Supports Defining One

Evidence supports exactly one: **Candidate A, scoped as "measured cross-machine inputs, never auto-created artifacts."** Every connection has a proven seam to reuse, recorded-data-only inputs, and an objective completion test (aggregation produces proposal-shaped inputs; opportunity pipeline unchanged; no bypass code).

## 20. Explicit Phase 7 Non-Goals

LinkedIn OAuth/API/posting/messaging/scheduling, platform analytics ingestion, autonomous outreach/follow-up, browser automation, CAPTCHA bypass, scraping, background workers/queues/schedulers/cron, production deployment, load infrastructure, new AI provider responsibilities, and auto-created opportunities/drafts/reviews from aggregated signals.

## 21. Definition of Done for Phase 7

- Objection patterns aggregate from recorded messages with counts/quotes/conversation IDs; nothing aggregates from empty sets.
- Topic→prospect relevance computed from recorded rows with stated reasons; no relevance invented.
- Content-outcome derivation rules produce proposals from recorded metrics only.
- Opportunity scoring seam mirrors qualification (confirmed-only, explained, bounded).
- All inputs flow through existing plan/evidence/gates/review rails — verified by tests that bypass attempts fail.
- Suite green including regression; typecheck/build/boot/health pass; grep gates clean.

## 22. Risks

1. Auto-generation temptation (mitigation: inputs-only rule + bypass-failure tests). 2. Denominator sparsity producing noisy patterns (mitigation: minimum-sample thresholds + explicit sample display). 3. Overlap with analytics deepening (mitigation: Phase 7 ships inputs and seams; views stay minimal).

## 23. Unverified Items

Browser E2E, live AI prose, external-network behavior, production deployment, load/performance — all carried forward unchanged.

## 24. Final Boundary Decision

**Phase 7 = Cross-Machine Intelligence Activation** as bounded in §§19–21: measured, human-gated data flows between the four machines with no auto-created artifacts, no automation, and no new external dependencies.
