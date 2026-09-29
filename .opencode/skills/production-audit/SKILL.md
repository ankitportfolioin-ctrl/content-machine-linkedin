---
name: production-audit
description: Adversarial audit of the current repository. Use for comprehensive pre-release verification.
---

# Production Audit Skill

## Purpose
Perform an adversarial audit of the current repository. For every PASS, require evidence.

## Audit Sections

### 1. Auth
- [ ] `GET /api/v1/auth/me` → 200 with valid token, 401 without
- [ ] `POST /api/v1/auth/register` → 201, creates user + workspace
- [ ] `POST /api/v1/auth/login` → 200, returns JWT
- [ ] Expired token → 401 (not 500)
- [ ] Invalid token → 401 (not 500)
- [ ] Malformed token → 401 (not 500)
- [ ] Password hashing uses bcrypt (12 rounds)
- [ ] JWT secret ≥ 32 chars, not hardcoded

**Evidence Required**: API test logs, manual curl verification

### 2. Workspace
- [ ] `GET /api/v1/workspaces` → 200, returns user's workspaces only
- [ ] `POST /api/v1/workspaces` → 201, creates workspace + membership
- [ ] Cross-workspace access → 403
- [ ] `X-Workspace-ID` header validated against memberships
- [ ] All queries filter by `workspaceId`
- [ ] Cascade delete works on workspace removal

**Evidence Required**: Workspace isolation test, query audit

### 3. Onboarding
- [ ] Fresh user (0 workspaces) → creates workspace → succeeds
- [ ] Profile step saves all fields → persists
- [ ] ICP step creates ICP with all fields → round-trip works
- [ ] Objectives step saves → persists
- [ ] Feeds step adds source → ingestion runs
- [ ] Leads step imports → research runs
- [ ] Policy step sets caps → persists
- [ ] Schedule step sets time → daily run triggers
- [ ] **No 500 at any step**
- [ ] Empty states: `NOT_CONFIGURED`, `[]`, `INSUFFICIENT_DATA`

**Evidence Required**: E2E test fresh user → complete onboarding

### 4. Business Brain
- [ ] BusinessProfile CRUD works
- [ ] BrandProfile CRUD works
- [ ] StrategyProfile CRUD works
- [ ] AudienceSegment CRUD works
- [ ] Problem CRUD works
- [ ] Product CRUD works
- [ ] All workspace-scoped

**Evidence Required**: API tests per model

### 5. ICP
- [ ] Create ICP with all fields → GET returns all fields
- [ ] Update ICP → all fields persist
- [ ] List ICPs → returns user's workspace ICPs only
- [ ] Delete ICP → cascade works
- [ ] Zod schema validates all fields

**Evidence Required**: Integration test round-trip UI→API→DB→API→UI

### 6. Objectives
- [ ] Objectives created via StrategyProfile
- [ ] Objectives feed into DecisionContext
- [ ] Objectives influence recommendation scoring

**Evidence Required**: DecisionContext test with objectives

### 7. Intelligence
- [ ] Feed source CRUD works
- [ ] HN adapter → real HTTP → sources stored
- [ ] GitHub adapter → real HTTP → sources stored
- [ ] RSS/Atom adapter → sources stored
- [ ] Ingestion → normalization → dedup → provenance
- [ ] SourceDocument stores raw + clean
- [ ] SourceClaim extracts claims with evidence
- [ ] TopicMention links topics with scores
- [ ] TrendSignal calculated

**Evidence Required**: Integration test per adapter, verify DB rows

### 8. Decision Engine
- [ ] DecisionContext builds context (objectives, ICPs, audience, signals)
- [ ] RecommendationEngine scores ContentOpportunities
- [ ] AttributionScore factored in
- [ ] LearningBoost factored in (maturity ≥ threshold)
- [ ] Audience/Sales signals factored in
- [ ] Scores explainable (breakdown available)
- [ ] Top-N recommendations returned

**Evidence Required**: Unit tests for each factor, integration test full chain

### 9. Content
- [ ] Opportunity → Idea → Plan → Draft → Review → Approval → Final
- [ ] ContentQualityGate runs on drafts
- [ ] ContentReview workflow works
- [ ] PublishRecord created on publish
- [ ] ContentDNA extracted from final version
- [ ] OutcomeMetric linked via PublishRecord
- [ ] ContentDNA feeds analytics

**Evidence Required**: Integration test full lifecycle

### 10. Sales
- [ ] Lead import (CSV + manual) works
- [ ] ProspectResearch runs → stores company/role/signals
- [ ] QualificationResult scores fit
- [ ] RelevantContent finds matching content
- [ ] OutreachStrategy generated
- [ ] OutreachDraft created
- [ ] OutreachReview approves
- [ ] PreparedAction created (READY_FOR_AUTHORIZED_EXECUTION)
- [ ] **Never** "sent" state

**Evidence Required**: Integration test full pipeline

### 11. Cross-Machine Intelligence
- [ ] Intelligence → Decision: trend signals → opportunity scoring
- [ ] Intelligence → Content: topics → content ideas
- [ ] Sales → Content: qualified prospects → relevant content
- [ ] Sales → Decision: outreach context → recommendation
- [ ] Content → Learning: performance → learning signals
- [ ] Learning → Decision: mature learning → recommendation boost
- [ ] Decision → Content/Sales: prioritized opportunities → work

**Evidence Required**: Each bridge has integration test (producer→consumer→outcome)

### 12. Learning
- [ ] Outcome → LearningProposal (PROPOSED)
- [ ] User discovers proposal in UI
- [ ] User confirms → CONFIRMED, maturity increases
- [ ] User rejects → no maturity increase
- [ ] Maturity ≥ 0.7 → affects recommendations
- [ ] Learning discoverable by user

**Evidence Required**: Integration test full learning loop

### 13. Worker
- [ ] Daily run triggers on schedule
- [ ] Stages run in order: INTELLIGENCE → DECISION → CONTENT → SALES → APPROVAL_SNAPSHOT → EXECUTION → OBSERVE_LEARN → DIGEST
- [ ] Resume skips SUCCEEDED stages
- [ ] ApprovalSnapshot captures frozen state
- [ ] Execution stage no-ops when cap = 0
- [ ] Budget enforcement (LLM calls, fetch, preparation)

**Evidence Required**: Worker test with mocked time, stage verification

### 14. Safety
- [ ] No LinkedIn API calls in codebase
- [ ] No browser automation for LinkedIn
- [ ] PreparedActionStatus lacks "SENT"/"EXECUTED"
- [ ] dailyExecutionCap default 0
- [ ] No UI/API to increase execution cap
- [ ] Approval required for all PreparedActions

**Evidence Required**: Grep for LinkedIn terms, schema verification, test verification

### 15. Security
- [ ] Helmet CSP configured
- [ ] CORS restricted to WEB_URL
- [ ] Rate limiting on all endpoints
- [ ] Request ID tracking
- [ ] Error handler doesn't leak stack traces
- [ ] No secrets in code/logs
- [ ] Workspace isolation at middleware + DB

**Evidence Required**: Security test suite, config review

### 16. Data Integrity
- [ ] No invented metrics (check `no-fabrication-check`)
- [ ] Empty states honest (`UNKNOWN`, `UNAVAILABLE`, `INSUFFICIENT_DATA`)
- [ ] Approval snapshots frozen (not aggregate counts)
- [ ] Attribution links traceable
- [ ] Learning maturity gates enforced
- [ ] Prisma client matches schema

**Evidence Required**: Code audit, schema verification

### 17. E2E
- [ ] Fresh user registers → completes onboarding → no 500s
- [ ] Authenticated user loads app → no 500 storm
- [ ] All golden flows from `GOLDEN_FLOWS.md` executable
- [ ] Playwright tests pass

**Evidence Required**: Playwright test results

### 18. Tests
- [ ] `pnpm test` passes (all packages)
- [ ] `pnpm test:all` passes
- [ ] No skipped/weakened tests
- [ ] External failures identified separately
- [ ] Coverage reasonable for critical paths

**Evidence Required**: Test output logs

### 19. Build
- [ ] `pnpm typecheck` passes (zero errors)
- [ ] `pnpm build` passes (zero errors)
- [ ] `pnpm lint` passes
- [ ] `pnpm db:generate` succeeds
- [ ] `pnpm db:migrate status` clean

**Evidence Required**: Build logs

### 20. Prisma
- [ ] Schema valid
- [ ] Client generated
- [ ] Migrations applied
- [ ] No drift between schema and DB
- [ ] All enums in sync
- [ ] Indexes present for query patterns

**Evidence Required**: `pnpm db:validate`, migrate status

## Output
For each section: **PASS / FAIL / PARTIAL / UNKNOWN** with evidence reference.

**Overall**: PASS only if all sections PASS. Any FAIL = overall FAIL.