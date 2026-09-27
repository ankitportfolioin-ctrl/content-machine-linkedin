# Phase 6 Boundary Audit

Audit only. No implementation, refactoring, migrations, commits, or pushes. One new file: this report. Prior reports treated as evidence, never authority — every material claim below was re-verified against code, schema, tests, or runtime in this pass.

## 1. Baseline

- HEAD: `cfb3dd0 phase 5: outcomes and learning loop verified` (prior: `b9bd5d0`, `6a5627a`, `32024a8`, `dbe8dd3`).
- Working tree at audit start: **clean** (`git status --short` empty).
- Fresh verification in this audit: `pnpm typecheck` PASS (9 packages), `pnpm test:all` **362/362, 0 failures** (API 63 = 21+13+15+14 · Web 3 · intelligence 127 · content 91 · sales 51 · learning 27), `pnpm build` PASS with `apps/api/dist/index.js` present, compiled boot serving healthy health + ready database-connected on Docker PostgreSQL.

## 2. Current Architecture

```
apps/web (React 18 + Router v6, fetch client, no query lib)
  → apps/api (Express · 24 route files · JWT + workspace triple-middleware · Zod · typed error codes)
    → packages/content (13 services: plan/thesis/strategy/audience/voice/hook/evidence/gates/review/compose/preview)
    → packages/sales (16 services: icp/discovery/research/qualification/scoring/signals/brief/strategy/compose/gates/review/prepared/classify/pipeline/bridge)
    → packages/intelligence (8 services: ingestion/extraction/understanding/claims/topics/trends/opportunities/gaps + SSRF)
    → packages/learning (5 services: publish/outcome/aggregation/derivation/influence — deterministic, zero AI calls)
    → packages/ai (single abstraction: OpenAI + Anthropic + registry)
    → packages/db (Prisma → PostgreSQL 17 · 5 migrations · 40 models) + shared + schemas
External boundary: NOTHING outbound. No LinkedIn, senders, webhooks, queues, workers, or schedulers.
```

- Duplicated logic: **none** — sales never reimplements SSRF/claims/topics/trends/canonicalization (grep-verified); the three domain packages are disjoint, sharing only `packages/ai`.
- Dead code: `apps/api/src/routes/health.ts` (orphan; live health/ready are inline in `index.ts`).
- Orphan services/routes: none functional. Unused packages/dependencies: none. Duplicated AI abstractions: none (one registry, 11 call sites, all `getAvailable()`-guarded).

## 3. What Actually Exists

- **Phase 1:** `IMPLEMENTED` — auth/bcrypt/JWT, membership roles, isolation middleware, validation, hardening headers/limits, health/ready, Postgres+Prisma, emitting API build, shell+health frontend.
- **Phase 2:** `IMPLEMENTED` (deterministic core; AI/live-network `UNVERIFIED`) — ingestion, extraction, claims+evidence+contradictions, topics, trends, opportunities, gaps, 17 intelligence endpoints. Precision: "research" here means **caller-supplied URL ingestion** (`intelligence.ts:201` ingests `data.query` as `USER_URL`) — no discovery/search engine exists.
- **Phase 3:** `IMPLEMENTED` — plan-before-prose, thesis preservation, real Profile/ICP audience resolution, objective/angle/format/narrative/hook engines, voice with leakage guards, span→claim bindings, 16 gates with worst-of final, enforced review/approval, immutable finals, markup-free preview, real Content/Brain/Settings pages.
- **Phase 4:** `IMPLEMENTED` — discovery with unknown-tracking, evidence-required research/signals, deterministic qualification + transparent scoring, briefs with auto-`no_outreach`, gated strategies, approved-only drafting, 16 outreach gates with server-side re-evaluation at approval, hash-pinned reviews, approval-gated terminal prepared actions, deterministic inbox classification, recommendation-only follow-ups, transition-controlled pipeline, measured-frequency bridge, real Leads/Inbox/Pipeline pages.

## 4. What Is Missing

No prioritized cross-machine decision layer of any kind: no ranked opportunity list, no next-action queue, no Home recommendations, no Brain explanations beyond per-artifact views, no objection→opportunity pipeline, no engagement-driven relevance (no engagement data exists), no automated research fan-out, no content-performance learning (no performance data exists), no learning consumers beyond the single qualification seam.

## 5. Cross-Machine Connection Matrix

| Connection | Verdict | Evidence |
|---|---|---|
| Sales objections → content opportunities | `MISSING` | Objection strings exist only in test fixtures and free-text fields; no aggregation, no generator input |
| Content topics → prospect relevance | `MISSING` | No topic↔lead linkage in code or schema |
| Content engagement → prioritization | `MISSING` | No engagement data model or collection |
| Relevant content → outreach | `PARTIAL` | Validated `relevantContentId` on strategies only; no relevance computation |
| Sales research → content research | `PARTIAL` | Rows mutually readable; no fan-out or shared pipeline |
| Content research → sales research | `PARTIAL` | Same tables, no cross-invocation |
| Content performance → learning | `MISSING` | Derivations accept any `OutcomeMetric`, but nothing records content performance metrics |
| Sales outcomes → learning | `PARTIAL` | Mechanically supported (any metric rows derive); no sales-specific derivation rules |
| Learning → scoring | `PARTIAL` | Qualification endpoint only; opportunity scoring untouched |
| Learning → recommendations | `MISSING` | No recommendation consumer exists |
| Intelligence → prioritized actions | `MISSING` | No ranking/priority code anywhere |
| Home → next-best actions | `MISSING` | Home renders health + nav only |
| Brain → explanations | `PARTIAL` | Per-artifact reasons/scores display; no why-this-first reasoning |

## 6. Learning Influence Matrix

- Dimensions that can **generate** learning: any recorded metric grouped by unit (derivation is metric-agnostic).
- Dimensions that can **influence scoring**: 14 known (`timeliness`, `evidence_strength`, `relevance`, `audience_fit`, `source_diversity`, `differentiation`, `actionability`, `thesis_clarity`, `trend_strength`, `icp_fit`, `role_fit`, `company_fit`, `problem_relevance`, `research_completeness`) — **only** on the qualification path. Minor gap: `industry_fit` (a real qualification dimension) is absent from the known set, so proposals targeting it are conservatively rejected — safe direction, noted for Phase 6.
- Dimensions that **cannot influence anything**: all of the above until CONFIRMED; content-opportunity scoring is entirely outside the seam.
- Workspace-scoped: yes (proposals carry `workspaceId`; seam reads confirmed rows per workspace). Evidence-backed: yes (metric IDs + sample/denominator required). Human-controlled: yes (OWNER/ADMIN confirm/revoke with identity/timestamps). Explainable: yes (reason + proposal links in every adjusted score).

## 7. Home/Brain/Analytics Audit

- **Home:** STATIC health dashboard + nav; answers nothing about what to do today. Contains stale copy ("All pages are currently empty shells…") that is now false for 7 of 8 sections — cosmetic defect to fix in Phase 6.
- **Brain:** REAL API-BACKED evidence browser (825-line page: overview/opportunities/trends/gaps/sources tabs + learning section, honest states). It is a browser/dashboard, **not** a decision or recommendation engine, and cannot explain prioritization because none exists.
- **Analytics:** REAL computed summaries with provenance, denominators, omitted-rate reasons, and empty states. No fake values possible by construction (empty inputs → explicit empty payloads).

## 8. Data Model Gaps

Verified across all 40 models: workspace scoping, FKs, cascades, uniques, and indexes are correct for current use. For a decision layer, three gaps are real (not speculative): (a) no first-class **recommended-action** record (PreparedAction covers terminal outreach actions only; prioritized candidate actions from intelligence have nowhere to live); (b) cross-machine links are `Json` ID lists, not relations (adequate for display, inadequate for join-driven ranking); (c) no prioritization fields (scores, ranks, rationales, dismissal state) on any model. No other new models are justified — specifically, no duplicate Lead/Conversation/Pipeline/ICP systems.

## 9. API Gaps

21 mounted route files audited: all authenticated, workspace-scoped, Zod-validated, with correct error codes; no dead endpoints (except orphan `health.ts` file, not route), no global queries, no client-controlled workspace IDs. Missing for Phase 6: ranked-opportunities read, next-actions read/dismiss/complete, explanations read, and any write path those need. Everything else Phase 6 needs already exists as a read source.

## 10. Frontend Gaps

Home/Content/Brain/Leads/Inbox/Pipeline/Settings are real and API-backed; Analytics is real; only dead copy (HomePage placeholder text) and missing surfaces (no prioritized-views anywhere, no explanations view, no dismiss/complete interactions) block an operator experience. No mock data, no fake metrics, no misleading active/connected/learned/published claims found.

## 11. Security Findings

Full grep battery clean: no `devWorkspaceContext`, hardcoded IDs/users/tokens/secrets, fake auth, mock business data, bypasses, automation, scraping, or emitted internal markup (only guardrail strings and fixtures matched). Pre-existing notes carried forward: test-only credential fallbacks (`NODE_ENV=test`-gated), dev-only compose password (local scope), committed generated Prisma client (bloat, not risk).

## 12. AI Boundary

One abstraction, two providers, 11 guarded call sites, Zod-validated structured outputs, typed `AI_UNAVAILABLE` with zero fallback prose, no retries/timeouts/backoff in providers. Phase 6 ranking, eligibility, provenance, permissions, lifecycle, and evidence validation must stay deterministic; AI is justifiable only for optional natural-language explanations of already-computed rankings — never for scores, ranks, or activation decisions.

## 13. Test/Runtime Results

Fresh in this audit: `pnpm test:all` **362/362, 0 failures** (API 63 · Web 3 · intelligence 127 · content 91 · sales 51 · learning 27); `pnpm typecheck` PASS (9 packages); `pnpm build` PASS; `apps/api/dist/index.js` present and booted (healthy + ready, database connected). Blind spots carried forward: no browser tests, no live-AI tests, no load tests, no migration tests, and the pre-existing CRUD routes still lack dedicated API tests.

## 14. Proposed Phase 6

**Name:** Growth Intelligence & Decision Engine. **User value:** the operator opens the app and sees what to do today, in what order, and why — computed from their own recorded workspace state. **Workflow:** existing artifacts (opportunities, trends, gaps, follow-ups, pending reviews, unconfirmed learnings, pipeline next actions, stale drafts) → deterministic candidate collection → eligibility filter → transparent scoring → ranked next-action queue → human dismiss/complete → existing review/prepared-action mechanisms → outcomes → learning. **Non-goals (§22):** LinkedIn, automation, workers, platform ingestion, and any new AI responsibilities beyond optional explanations.

## 15. Phase 6 Workflow

Collect (read-only over Phases 2–5 tables) → eligible? (permissions, lifecycle states, dismissal) → score (weighted, explainable dimensions with evidence links) → rank → present with why → dismiss/complete (persisted) → approved items flow into existing review/prepared-action rails → outcomes → learning. Every step synchronous; no queues.

## 16. Phase 6 Data Model

One new model only: `OperatorAction` (workspace, kind, subject refs as validated ID lists, score, rank inputs snapshot, rationale lines, evidence links, status PENDING/DISMISSED/COMPLETED, timestamps) plus dismissal records on the same table. All cross-machine links stay as validated ID lists (matching house convention); no duplicate domain tables.

## 17. Phase 5 Services (Phase 6 Services)

New `packages/decision` (or equivalent): candidate collectors (read-only adapters per domain), eligibility filter, deterministic scorer, explainer (reasons-from-inputs, no AI required), dismissal/completion service. Optional: AI explanation wrapper reusing `packages/ai` with `AI_UNAVAILABLE` honesty.

## 18. Phase 6 API

`GET /operator/next-actions` (ranked, explained, workspace-scoped), `POST /operator/actions/:id/dismiss`, `POST /operator/actions/:id/complete`, `GET /operator/explanations/:id` — triple-middleware, Zod, scoped queries. Read sources only; all mutations flow through existing rails.

## 19. Phase 6 Frontend

Home becomes the operator view (today's ranked actions with why-links); Brain gains explanations per recommendation; fix stale HomePage copy. Reuse auth, honest-state, and plain-language patterns. No new mock data.

## 20. Phase 6 Security Boundary

Read-only aggregation over own workspace; dismissal/completion writes scoped; no external calls; no secrets; no automation surfaces; recommendations never execute — consequential actions stay on existing approval rails.

## 21. Phase 6 AI Boundary

Deterministic ranking/eligibility/provenance/permissions; AI allowed solely for optional explanation prose with `AI_UNAVAILABLE` honesty. No new provider abstraction, no retries/timeouts additions required, no scoring or activation decisions from AI.

## 22. Phase 6 Non-Goals

LinkedIn OAuth/API/posting/messaging/scheduling, platform analytics ingestion, autonomous outreach/follow-up, browser automation, CAPTCHA bypass, background workers/queues/schedulers, production deployment, load testing, and any new AI provider responsibilities.

## 23. Phase 6 Dependency Graph

Phase 1 (auth/workspace/validation) → Phase 2 (opportunities/trends/gaps as candidates) → Phase 3 (reviews/drafts/versions as candidates) → Phase 4 (follow-ups/pipeline/prepared as candidates) → Phase 5 (outcomes/learning as scoring inputs) → Phase 6 (collect → score → rank → explain). Per component: REUSE everything above; NEW collector/scorer/explainer/actions table + 4 endpoints + Home/Brain surfaces; REFACTOR REQUIRED: HomePage stale copy only; BLOCKED: nothing (no credentials, infra, or schema redesign needed).

## 24. Phase 6 Implementation Order

1. `OperatorAction` model + migration. 2. Zod schemas. 3. Collectors (read-only, per domain). 4. Eligibility + deterministic scorer + explainer. 5. Dismiss/complete service. 6. API (4 endpoints). 7. Home operator view + Brain explanations. 8. Negative/isolation tests. 9. Full matrix + typecheck + build + boot + health/ready. 10. Reports.

## 25. Phase 5 Test Strategy (Phase 6 Test Strategy)

Unit (collector mapping, eligibility rules, scoring math incl. ties/empty sets, explainer completeness), integration on Docker PostgreSQL (seeded multi-artifact workspace → ranked order asserted; dismiss/complete lifecycle; cross-workspace denial; role checks), negative (empty workspace → explicit empty, not ranked noise; dismissed items excluded; stale artifacts excluded), AI-unavailable matrix for optional explanations, plus full 362-test regression.

## 26. Phase 5 Acceptance Criteria (Phase 6 Acceptance Criteria)

Ranked actions derive only from recorded rows; every action shows score + reasons + evidence links; dismissed/completed items never resurface; empty workspaces get explicit empty states; all endpoints isolated and role-correct; no automation surfaces; suite green including regression; typecheck/build/boot/health pass.

## 27. Definition of Done

- No fake data: every rank/score traces to recorded rows (spot-checkable).
- No unsupported claims: empty states instead of ranked noise.
- No unauthorized actions: dismiss/complete scoped and tested.
- Workspace isolation: cross-workspace tests green.
- Real persistence/API/UI: integration-tested end to end.
- Deterministic unavailable states: empty registry/datasets yield honest states.
- AI unavailable is honest: explanations degrade to structured reasons, zero prose.
- No Phase 7 leakage: LinkedIn/automation/ingestion grep-clean.
- Suite green: `pnpm test:all`, typecheck, build, boot, health/ready all executed PASS.

## 28. Risks

1. Ranking-feels-arbitrary risk (mitigation: visible weights + reasons + tests on fixtures). 2. Scope creep into automation (mitigation: non-goals + grep gates). 3. HomePage stale copy must be replaced in the same phase. 4. `industry_fit` learning-dimension gap (pre-existing, safe-fail; include if touching derivation). 5. Test-row accumulation in dev DB (established pattern).

## 29. Recommended Next Prompt

"Implement Phase 6 (Growth Intelligence & Decision Engine) per PHASE_6_BOUNDARY_AUDIT.md §§14–27, in §24 order. Constraints: additive-only (OperatorAction model + collectors/scorer/explainer + 4 endpoints + Home/Brain surfaces); deterministic ranking with visible reasons, no automation surfaces, no LinkedIn/workers/ingestion; reuse auth/AI-registry/error-code patterns; full test matrix (unit + real-DB integration + negative + AI-unavailable) with 362-test regression green; typecheck, build, compiled boot, health/ready executed; no commits or pushes."

---

## Final Decision

**READY FOR PHASE 6 IMPLEMENTATION.** The repository evidence supports it: all inputs Phase 6 needs exist as real, tested, workspace-scoped systems; the work is purely additive; no architectural defect blocks it; the only fixes required are in-scope cosmetic items (stale copy) already assigned to the phase itself.
