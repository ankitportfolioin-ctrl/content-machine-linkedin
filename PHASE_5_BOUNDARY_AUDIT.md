# Phase 5 Boundary Audit

Audit only. No implementation, no refactoring, no migrations, no commits. One new file: this report.

Status vocabulary: `IMPLEMENTED` / `PARTIAL` / `CRUD ONLY` / `MISSING` / `UNVERIFIED` / `REAL` / `SHELL`.

## 1. Repository Baseline

- HEAD: `b9bd5d0 phase 4: sales intelligence verified` (prior: `6a5627a`, `32024a8`, `dbe8dd3` — 4 commits total).
- Working tree at audit start: **clean** (`git status --short` empty, `git diff --stat` empty).
- Verification re-run in this audit: `pnpm typecheck` PASS (8 packages), `pnpm build` PASS (`apps/api/dist/index.js` present), `pnpm test:all` **321/321, 0 failures** (API 49 = 21 Phase 1 + 13 Phase 3 + 15 Phase 4; Web 3; intelligence 127; content 91; sales 51).

## 2. Current Architecture

```
apps/web (React 18 + Router v6, fetch client, no query lib)
  → apps/api (Express, JWT + workspace triple-middleware, Zod, central error codes)
    → packages/content | packages/sales | packages/intelligence (domain services)
    → packages/ai (single provider abstraction: OpenAI + Anthropic + registry)
    → packages/db (Prisma → Docker PostgreSQL 17)
    → packages/shared (URL/extract utils) + packages/schemas (Zod)
External boundary: NOTHING outbound. No LinkedIn, no senders, no webhooks, no queues.
```

- Duplicated logic: **none found** — sales package does not reimplement SSRF, claims, topics, trends, or canonicalization (grep-verified); content/sales/intelligence are disjoint domains sharing only `packages/ai`.
- Dead code: `apps/api/src/routes/health.ts` (orphan; live health/ready are inline in `index.ts`).
- Orphan services/routes: none functional (all 21 route files mounted; all services have callers).
- Unused packages/dependencies: none (every workspace package is imported; no queue/browser/LinkedIn deps anywhere).
- Duplicated AI abstractions: none — one registry, 8 call sites (`intelligence` 4, `content` 3, `sales` 3: research/brief/compose/classify), every call site guarded by `getAvailable()` with honest degradation.

## 3. Phase 1 Actual Status

`IMPLEMENTED` and re-verified: JWT auth + bcrypt (12 rounds), workspace membership with OWNER/ADMIN/MEMBER/VIEWER roles, triple-middleware isolation, Zod validation, helmet/CORS/rate-limit/1MB body caps, structured errors without stack traces, health + readiness with DB check, PostgreSQL 17 via compose, API emit fixed (`noEmit:false`, dist boots), frontend shell + health page. Proof: 21 API + 3 Web tests plus live boot/health/ready in prior acceptances, re-run green here.

## 4. Phase 2 Actual Status

`IMPLEMENTED` (deterministic core; AI/live-network paths `UNVERIFIED`): ingestion (canonicalize + SSRF + fetch + hash dedupe), HTML/RSS/Atom/sitemap extraction, AI-structured understanding with `AI_UNAVAILABLE` honesty, claim ledger with contradiction heuristics, topic normalization, trend calculus, 10-dimension opportunity scoring, gap detection, thin idea handoff. 127/127 tests (mocked boundaries). Critical precision: **"research" in Phase 2 means B: caller-supplied URL ingestion** (`intelligence.ts:201` ingests `data.query` as `USER_URL`) — there is no discovery/search engine. Brain APIs are real but the original "Brain UI complete" claim was already corrected by the boundary audit.

## 5. Phase 3 Actual Status

`IMPLEMENTED`: ContentPlan (AI-gated generation + manual validated creation + approval), thesis preservation (verbatim/Jaccard enforcement in gates), audience resolution from real Profile/ICP rows (`INSUFFICIENT_CONTEXT` when absent), 9-objective/7-angle taxonomy with defensibility rules, 6 semantic formats with Zod structures, 5 narratives via deterministic mapping, hook engine with anti-templates, voice context with banned-word/leakage gates, span→claim bindings, 16 quality gates with worst-of final, DRAFT→REVIEW→APPROVED enforcement, immutable finals, preview renderer with markup assertion. Every UI claim spot-checked against backend capability: Brain/Content/Settings pages call real endpoints (`await discoverProspect/listSalesLeads/...` verified in source). 91 unit + 13 integration tests, all green.

## 6. Phase 4 Actual Status

`IMPLEMENTED`: discovery with unknown-tracking, research with mandatory `{statement, sourceRef}`, deterministic 8-dimension qualification (`INSUFFICIENT_DATA`/`UNQUALIFIED`/`POSSIBLE_FIT`/`QUALIFIED`), transparent scoring (never a conversion probability — grep-verified, only prohibition comments matched), evidence-required signals with counting intent rollup, briefs with auto-`no_outreach`, strategy gating (evidence minimums, non-COLD references, content-ID validation), approved-only AI drafting, 16 outreach gates with server-side re-evaluation at approval, hash-pinned reviews, approval-gated terminal prepared actions with expiry and **no execution path** (grep-verified), deterministic inbox classification with UNCLEAR fallback, recommendation-only follow-ups, transition-controlled pipeline (WON/LOST user-recorded, no inferred revenue), measured-frequency content bridge. Leads/Inbox/Pipeline pages verified calling real endpoints with honest states. 51 unit + 15 integration tests, all green. No external LinkedIn action exists anywhere (only `linkedinUrl`/`linkedinMessageId` string fields and test fixture URLs).

## 7. Deferred Capability Audit

### Analytics
`CRUD ONLY`: `AnalyticsEvent` storage + filtered read (`analytics.ts`, 63 lines), no aggregation, no metrics, no dashboards; `AnalyticsPage.tsx` is an honest placeholder ("will be implemented in future phases"). Zero computed values exist, so no fake metrics exist either.

### Learning
`CRUD ONLY`: `LearningSignal` storage with source-existence validation (`learning.ts`), no patterns, workers, jobs, scoring influence, or feedback loops. `OpportunityFeedback` is similarly write-only.

### LinkedIn
`MISSING` in full: no OAuth, SDK, API client, posting, scheduling, messaging, connections, comments, profile access, inbox/analytics sync, webhooks, or browser automation (greps return only URL-string fields and prompt copy). The product writes LinkedIn-*formatted* content; it touches no LinkedIn system.

### Background Jobs
`MISSING`: no job model, queue, worker, scheduler, retry, idempotency, dead-letter, or observability. All work is request-scoped (only `setTimeout` uses are fetch/SSRF timeouts). Matches in generated Prisma runtime noise only.

### Production Infrastructure
`PARTIAL`: compose + PostgreSQL 17 + health/readiness + env validation + graceful shutdown exist; compiled `dist` boots and serves traffic (verified). Missing: deployment target, log aggregation, error monitoring, secret management beyond `.env`, backups, and any scheduler.

## 8. Shared Intelligence Audit

- Sales objections → content opportunities: `MISSING` as a pipeline (bridge carries measured signals as *inputs*; the Content Machine still runs its own plan/evidence/gates/review — verified by design, no bypass code).
- Content engagement → prospect/topic relevance: `MISSING` (no engagement data exists anywhere).
- Research → content / research → sales: `PARTIAL` (research rows exist and are readable by both domains; no automated fan-out).
- Content performance → learning: `MISSING` (no performance data recorded).
- Sales outcomes → learning: `CRUD ONLY` (outcomes can be recorded as signals; nothing consumes them).
- Learning → scoring/recommendations: `MISSING` (no consumer of `LearningSignal` exists in any service — grep-verified).

## 9. Database Audit

34 models across 4 migrations, schema↔DB in sync (`db:migrate`: none pending). All Phase 3/4 models workspace-scoped with cascade deletes and indexes; uniques where upserts require them (`TopicMention`, `TrendSignal`, `QualificationResult`). Foreign keys correct, including `SetNull` for optional evidence/lead links. Findings (non-blocking, carry forward): `contradictionState`/`severity`/`reviewerId`/`requestedBy`/`createdBy` are plain strings, not enums/FKs; `OpportunityFeedback` has no relation to `ContentOpportunity`; opportunity/provenance ID lists are `Json` (by design, documented); `Profile.linkedinUrl` is globally unique (pre-existing); committed generated Prisma client inflates the repo (pre-existing). No cross-workspace relation leakage, no orphan records by construction, approved records protected at the service layer with immutable version rows.

## 10. AI Architecture Audit

Single abstraction (`AIProvider`, OpenAI + Anthropic, `AIProviderRegistry`), Zod-validated structured outputs at every call site, `getAvailable()` gating with typed `AI_UNAVAILABLE` and zero fallback prose, deterministic-first design (qualification, scoring, gates, classification fallback, follow-ups, transitions need no AI). Gaps, unchanged since prior phases: no retries/backoff, no timeouts inside providers (only at fetch/SSRF boundaries), no token accounting, no provider fallback beyond first-available, no embedding use. AI can never generate prose without evidence-grounded prompts + output validation, and validators re-check output deterministically. Phase 5 needs no new AI responsibilities beyond reusing this exact pattern — unless it chooses live-verified generation, which requires credentials that do not exist.

## 11. Frontend Audit

- Home: REAL API-BACKED (health/ready). Content, Brain, Settings, Leads, Inbox, Pipeline: REAL API-BACKED (verified `await` calls to typed client functions; auth-gated; honest states). Analytics: PLACEHOLDER (explicit future-phase copy).
- Auth/workspace selection, loading, error, empty, insufficient-data, AI-unavailable, review-required, blocked, approved, and ready-for-execution states all present in the Phase 3/4 pages; no fake data, no mock datasets, no fake metrics, no misleading connected/published/learned claims found.
- No send/schedule/publish controls exist (verified by grep).

## 12. Security Audit

Greps for `devWorkspaceContext`, hardcoded IDs/users/tokens/secrets, fake auth, mock business data, bypasses, automation, scraping, and `TODO/FIXME` in app code: **clean** (only HTML input `placeholder=` attributes, guardrail strings, and test fixtures matched). Production paths cannot bypass auth (middleware on all business routes), workspace isolation (scoped queries + 403/404 tests), approval (role + gate + version/hash checks), or mutate approved content (immutability guards + immutable version rows). Prepared actions cannot execute (no code path). Test-only credential fallbacks remain `NODE_ENV=test`-gated.

## 13. Phase 4 Unverified Items

Disposition for Phase 5 planning (not silently absorbed as scope):
1. Browser E2E → **separate hardening track**, not a Phase 5 prerequisite (component/API-level tests remain the bar, per precedent).
2. Live AI prose quality → **separate track**, blocked on credentials; Phase 5 must stay AI-optional like Phases 2–4.
3. External-network research → **separate hardening track**.
4. Production deployment → **separate infrastructure track**.
5. Load testing → **future hardening**.

## 14. Proposed Phase 5

**Name:** Outcomes & Learning Loop. **User value:** close the loop from approved work to measured results — users record what actually happened (publishes, outcomes, metrics with sources) and the system aggregates only recorded rows into provenance-shown dashboards and transparent learning signals that visibly influence future scoring. **Non-goals (§22) hold**: no LinkedIn, no automation, no platform ingestion.

## 15. Phase 5 Workflow

Approved version/outreach → publish record (manual, with external reference) → outcome recording (metrics + source + recorder) → deterministic aggregation (counts/rates with denominators, empty states) → learning-signal derivation (transparent rules) → scoring influence (weights as data with reasons) → surfaced back in Brain/qualification/opportunity ranking with provenance links.

## 16. Phase 5 Data Model

`PublishRecord` (workspace, version/draft refs, channel label, externalRef?, recordedBy), `OutcomeMetric` (workspace, subject refs, metric name/value, source, recordedBy), plus derivations written to existing `AnalyticsEvent`/`LearningSignal` tables (no new engine tables beyond the two record tables). All workspace-scoped, cascades, indexes; no changes to Phases 1–4 models except optional back-relations.

## 17. Phase 5 Services

`PublishService` (record-only validation), `OutcomeService` (metric validation: value + source + recorder required; rejects sourceless numbers), `AggregationService` (pure functions over recorded rows; denominators mandatory; empty-set → explicit empty result, never zero-filled estimates), `LearningDerivationService` (rule-based signal generation from measured aggregates; weight proposals as data with reasons, human-confirmed before influencing scoring).

## 18. Phase 5 API

`POST/GET /publish-records`, `POST/GET /outcomes`, `GET /analytics/summary` (computed, provenance-attached), `GET/POST /learning/derived` (proposals + confirm), all triple-middleware + Zod + scoped queries. Extend, don't duplicate, existing analytics/learning routes.

## 19. Phase 5 Frontend

Analytics page becomes real (computed summaries with provenance footnotes + empty states); Brain/Leads surfaces show learning influence where applied; publish/outcome recording forms in Content/Pipeline detail views. Reuse AuthContext, honest-state patterns, plain-language labels.

## 20. Phase 5 Security Boundary

Recording endpoints validate subject existence workspace-scopely; aggregation is read-only over own workspace; derived weights require OWNER/ADMIN confirm; no external calls; no secrets; no automation surfaces.

## 21. Phase 5 AI Boundary

Reuse only: optional synthesis of outcome summaries with `AI_UNAVAILABLE` honesty. No new AI responsibilities required; aggregation and derivation stay deterministic so the phase is fully verifiable without credentials.

## 22. Phase 5 Non-Goals

LinkedIn OAuth/posting/messaging/scheduling; platform analytics ingestion; autonomous outreach/follow-up; background workers/schedulers (use synchronous derivation + idempotency keys); fake/estimated metrics under any name; learning that silently mutates scores.

## 23. Phase 5 Dependency Graph

Phase 1 (auth/workspace/validation) → Phase 2 (claims/topics/trends as evidence vocabulary) → Phase 3 (approved versions + reviews as loop inputs) → Phase 4 (pipeline closes + follow-up outcomes + prepared-action completions as loop inputs) → Phase 5. Per component: REUSE analytics/learning CRUD, approval/review records, pipeline stages, AI registry, middleware; NEW publish/outcome tables, aggregation + derivation services, dashboard UI; REFACTOR REQUIRED: none (additive only); BLOCKED: nothing (no credentials or infrastructure needed).

## 24. Phase 5 Implementation Order

1. Database (two record tables + migration). 2. Zod schemas. 3. Outcome/publish validation services. 4. Aggregation engine (pure, tested). 5. Derivation engine + weight-confirmation flow. 6. API (records, summary, derived). 7. Frontend (record forms, dashboard, influence surfacing). 8. Scoring-integration seam (read confirmed weights only). 9. Security/negative tests. 10. Runtime verification (typecheck, test:all, build, boot, health/ready).

## 25. Phase 5 Test Strategy

Unit (aggregation math incl. empty sets, derivation rules, weight application), integration on Docker PostgreSQL (record → aggregate → derive → confirm → influence visible), negative (sourceless metrics rejected, unconfirmed weights ignored, cross-workspace denial, absolute claims without denominators rejected), AI-unavailable matrix for any synthesis, plus full 321-test regression. No browser/live-AI/network/load tests (per §13).

## 26. Phase 5 Acceptance Criteria

Recorded publishes/outcomes persist with provenance; dashboards show only computed-from-rows values with denominators and empty states; learning signals derive transparently and influence scoring only after explicit confirmation; no estimated metric anywhere; workspace isolation tests pass; full suite green; typecheck/build/boot/health pass.

## 27. Definition of Done

- No fake data: every displayed number traces to recorded rows (spot-checkable).
- No unsupported claims: denominators shown; empty states instead of zeros.
- No unauthorized actions: confirmation-gated weight changes, role-checked.
- Workspace isolation: cross-workspace tests green.
- Real persistence/API/UI: integration-tested end to end.
- Deterministic unavailable states: empty registries/datasets yield honest states.
- AI unavailable is honest: synthesis paths return typed errors, zero prose.
- No Phase 6 leakage: LinkedIn/automation/ingestion grep-clean.
- Suite green: `pnpm test:all`, typecheck, build, boot, health/ready all executed PASS.

## 28. Risks

1. Fake-metric temptation (mitigation: denominator + provenance + rejection tests). 2. Opaque learning weights (mitigation: weights as data with reasons + human confirm). 3. Scope creep into LinkedIn/platform ingestion (mitigation: non-goals + grep gates). 4. AnalyticsPage placeholder copy must be replaced, not left alongside a dashboard. 5. Test-row accumulation in dev DB (established pattern; no resets per policy).

## 29. Recommended Next Prompt

"Implement Phase 5 (Outcomes & Learning Loop) per PHASE_5_BOUNDARY_AUDIT.md §§14–27, in §24 order. Constraints: additive-only schema (PublishRecord, OutcomeMetric; reuse AnalyticsEvent/LearningSignal); deterministic aggregation with mandatory denominators and empty states; learning weights as human-confirmed data; reuse auth/AI-registry/error-code patterns; no LinkedIn, automation, platform ingestion, or workers; full test matrix (unit + real-DB integration + negative + AI-unavailable) with 321-test regression green; typecheck, build, compiled boot, health/ready executed; no commits or pushes."
