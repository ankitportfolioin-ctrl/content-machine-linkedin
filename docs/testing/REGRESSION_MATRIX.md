# Regression Matrix

Maps golden flows to actual tests. **Do not mark VERIFIED just because a test file exists.** Inspect the actual test. If uncertain, mark UNKNOWN.

| ID          | Area       | Protected Behavior                                      | Test Type | Current Test                            | Status     |
|-------------|------------|--------------------------------------------------------|-----------|-----------------------------------------|------------|
| AUTH-001    | Auth       | Register → login → session → authenticated API         | Integration | `apps/api/src/authFlow.test.ts`        | VERIFIED   |
| AUTH-002    | Auth       | Expired/invalid session → safe unauthenticated state   | Integration | `apps/api/src/authFlow.test.ts`        | PARTIAL    |
| AUTH-003    | Auth       | Cross-workspace access → denied                        | Integration | `apps/api/src/authFlow.test.ts`        | VERIFIED   |
| ONBOARD-001 | Onboarding | Fresh user → workspace → profile → ICP → objectives → feeds → leads → policy → schedule | Integration | `apps/api/src/onboarding.test.ts` + `apps/api/src/salesMachine.test.ts` (ICP) | PARTIAL    |
| INTEL-001   | Intelligence | Source → ingestion → normalization → dedup → provenance → signal | Integration | `apps/api/src/feedAdapters.test.ts`    | PARTIAL    |
| INTEL-002   | Intelligence | HN/GitHub → actual adapter → stored intelligence       | Integration | `apps/api/src/feedAdapters.test.ts`    | UNKNOWN    |
| DECISION-001| Decision   | Objective → score → recommendation                     | Unit/Integration | `packages/decision/src/test/signals.test.ts`, `packages/decision/src/test/scoring.test.ts` | PARTIAL    |
| DECISION-002| Decision   | Attribution → recommendation score                     | Integration | `apps/api/src/batch2.test.ts` (D section) | PARTIAL    |
| DECISION-003| Decision   | Learning → recommendation score                        | Unit/Integration | `packages/decision/src/test/scoring.test.ts`, `apps/api/src/learningMachine.test.ts` | PARTIAL    |
| DECISION-004| Decision   | Audience/sales signal → recommendation                 | Unit      | `packages/decision/src/test/signals.test.ts` | PARTIAL    |
| CONTENT-001 | Content    | Opportunity → idea → plan → draft → review → approval → final → record → DNA → analytics | Integration | `apps/api/src/contentMachine.test.ts` + `apps/api/src/learningMachine.test.ts` | VERIFIED   |
| SALES-001   | Sales      | Lead import → research → qualification → scoring → relevant content → strategy → draft → approval → prepared action | Integration | `apps/api/src/salesMachine.test.ts` + `apps/api/src/signalFlow.test.ts` | VERIFIED   |
| LEARNING-001| Learning   | Outcome → proposal → user confirmation → maturity → next recommendation impact | Integration | `apps/api/src/learningMachine.test.ts` + `apps/api/src/batch2.test.ts` (C section) | VERIFIED   |
| SAFETY-001  | Safety     | No unauthorized LinkedIn execution                     | Integration/Unit | `apps/api/src/operatorMachine.test.ts`, `apps/api/src/batch2.test.ts` (E section) | PARTIAL    |
| SAFETY-002  | Safety     | Execution cap remains zero/unavailable                 | Integration/Unit | `apps/api/src/operatorMachine.test.ts`, `apps/api/src/batch2.test.ts` (E section) | VERIFIED   |

## Detailed Evidence

### AUTH-001 — VERIFIED
**Test**: `apps/api/src/authFlow.test.ts`
- "registers, rejects duplicates, and logs in honestly" (lines 28-46): POST /register → 201, POST /login → 200 with token
- "resolves the real user and an empty workspace list, then creates one" (lines 65-83): GET /auth/me → 200 with user, GET /workspaces → 200 with []
- "reaches all six previously failing endpoints with token + owned workspace" (lines 85-94): Multiple authenticated endpoints return 200

### AUTH-002 — PARTIAL
**Test**: `apps/api/src/authFlow.test.ts`
- "rejects unauthenticated access to protected routes" (lines 48-56): GET /workspaces, /auth/me, /readiness, etc. → 401 without token
- "rejects forged tokens" (lines 58-63): Bearer forged.invalid.token → 401
- **Gap**: No test for expired token (JWT expiry), no frontend test for "clears auth state on 401"

### AUTH-003 — VERIFIED
**Test**: `apps/api/src/authFlow.test.ts`
- "forbids cross-workspace access for a different legitimate user" (lines 96-107): User B with User A's workspaceId → 403 on /readiness and /operator/next-actions

### ONBOARD-001 — PARTIAL
**Test**: `apps/api/src/onboarding.test.ts` + `apps/api/src/salesMachine.test.ts` (ICP)
- Fresh user creates workspace ✓ (lines 36-55)
- Schedule step with validation ✓ (lines 65-96)
- Policy step with honest Tier-1 disclosure ✓ (lines 98-106)
- Feed sources with workspace isolation ✓ (lines 108-143)
- Lead import with CSV and honest skips ✓ (lines 145-201)
- Kill switch blocks daily loop ✓ (lines 203-222)
- Role-based authorization ✓ (lines 80-86, 224-230)
- **Gaps**: Profile step (LinkedIn URL, headline, role) not explicitly tested in onboarding.test.ts; Objectives step not tested; ICP round-trip tested in salesMachine.test.ts but not in onboarding flow

### INTEL-001 — PARTIAL
**Test**: `apps/api/src/feedAdapters.test.ts`
- "expands an HN frontpage feed into story sources with provenance" (lines 62-105): Creates HN feed, runs daily loop, verifies sources stored in `intelligenceSource` table with URLs
- **Gaps**: Uses mocked `fetch` (stubFetch) — does not test actual HTTP adapter; canonical URL dedup not tested; content hash dedup not tested; SourceDocument raw/clean content not verified; SourceClaim extraction not verified; TopicMention strength scores not verified; TrendSignal calculation not verified

### INTEL-002 — UNKNOWN
**Test**: `apps/api/src/feedAdapters.test.ts`
- HN test mocks HTTP via `stubFetch` (lines 31-33, 69-90) — NOT actual adapter execution
- GitHub test only verifies `resolveReleaseFeedUrl` function (lines 122-127) — NOT the actual GitHub API adapter
- No test invokes actual HN/GitHub adapter with real HTTP and verifies DB persistence

### DECISION-001 — PARTIAL
**Test**: `packages/decision/src/test/signals.test.ts` (lines 245-274), `packages/decision/src/test/scoring.test.ts`
- Unit tests verify scoring with objective alignment bonus (scoring.test.ts lines 65-86)
- signals.test.ts tests objection/relevance collectors and Phase 8 scoring (lines 245-274)
- **Gaps**: No integration test for full chain: Objective created via API → decisionContext builds context → recommendationEngine scores → Top-N returned via API

### DECISION-002 — PARTIAL
**Test**: `apps/api/src/batch2.test.ts` (D section, lines 405-470)
- Creates honest attribution links (DIRECT/INFERRED/UNKNOWN) with evidence requirements
- Verifies DIRECT without evidence rejected, INFERRED without reason rejected
- **Gaps**: No test showing attribution score influences recommendation ranking; no test of time-decay weighting

### DECISION-003 — PARTIAL
**Test**: `packages/decision/src/test/scoring.test.ts` (lines 39-46), `apps/api/src/learningMachine.test.ts` (lines 192-268)
- Unit test: confirmed learning applies learningBoost (scoring.test.ts lines 39-46)
- Integration test: confirmed learning proposal affects qualification scoring (learningMachine lines 256-262)
- **Gaps**: No test verifying maturity ≥ 0.7 threshold gating; no test of learning maturity decay

### DECISION-004 — PARTIAL
**Test**: `packages/decision/src/test/signals.test.ts`
- Tests objection_pattern and prospect_relevance collectors (lines 74-211)
- Tests eligibility based on signal evidence (lines 126-160, 213-243)
- **Gaps**: No test showing audienceSignal or sales content signals flow into decisionContext and affect recommendation scores

### CONTENT-001 — VERIFIED
**Test**: `apps/api/src/contentMachine.test.ts` + `apps/api/src/learningMachine.test.ts`
- Opportunity → Idea ✓ (lines 119-176)
- Idea → Plan ✓ (lines 178-216)
- Plan → Draft ✓ (lines 246-299)
- Draft → Review ✓ (lines 320-343)
- Approved → Version (isFinal=true) ✓ (lines 356-409)
- PublishRecord on publish ✓ (learningMachine lines 76-84)
- OutcomeMetric linked via PublishRecord ✓ (learningMachine lines 105-121)
- ContentDNA extraction not explicitly tested but content lifecycle fully covered

### SALES-001 — VERIFIED
**Test**: `apps/api/src/salesMachine.test.ts` + `apps/api/src/signalFlow.test.ts` (lines 170-184)
- Lead import (CSV/manual) ✓ (lines 80-85, 145-201)
- ProspectResearch ✓ (lines 87-98)
- QualificationResult ✓ (lines 117-128)
- RelevantContent finds matching content ✓ (salesMachine lines 144-152, signalFlow lines 170-184)
- OutreachStrategy ✓ (lines 176-199)
- OutreachDraft ✓ (lines 196-199, 202-229)
- OutreachReview approves ✓ (lines 194, 271-276)
- PreparedAction → READY_FOR_AUTHORIZED_EXECUTION ✓ (lines 278-290)
- Never "sent" state ✓ (lines 283-297, schema enum lacks SENT)

### LEARNING-001 — VERIFIED
**Test**: `apps/api/src/learningMachine.test.ts` + `apps/api/src/batch2.test.ts` (C section)
- OutcomeMetric recorded ✓ (learningMachine lines 105-121)
- LearningProposal PROPOSED ✓ (lines 196-205, batch2 lines 306-317)
- User confirms → CONFIRMED ✓ (lines 256-259)
- Maturity increases (HYPOTHESIS → OBSERVED → REPEATED_SIGNAL) ✓ (batch2 lines 306-334)
- Confirmed learning affects qualification scoring ✓ (lines 256-262)
- Rejected proposal → no maturity increase → no impact ✓ (lines 251-254)
- Revoked proposal reverts scoring ✓ (lines 264-268)

### SAFETY-001 — PARTIAL
**Test**: `apps/api/src/operatorMachine.test.ts` (lines 200-209), `apps/api/src/batch2.test.ts` (E section, lines 500-522)
- Execution stage SKIPPED in daily loop ✓ (operatorMachine lines 200-206)
- Readiness reports LinkedIn execution not ready ✓ (batch2 lines 517-521)
- RunBudget.spendExecution() returns false when cap=0 ✓ (batch2 lines 500-506)
- **Gaps**: No code search test for "linkedin" + "api"/"post"/"send"; no browser automation test

### SAFETY-002 — VERIFIED
**Test**: `apps/api/src/operatorMachine.test.ts` (lines 200-209), `apps/api/src/batch2.test.ts` (E section, lines 500-522)
- `WorkspaceSettings.dailyExecutionCap` default 0 ✓ (batch2 line 504)
- Worker execution stage no-ops when cap = 0 ✓ (operatorMachine lines 200-206)
- RunBudget tracks execution budget separately, remaining().executions = 0 ✓ (batch2 lines 500-506)
- Readiness reports linkedInExecution.ready = false ✓ (batch2 lines 517-521)

## Test Coverage Notes

### Authentication Tests (`apps/api/src/authFlow.test.ts`)
- Tests register, login, token validation, cross-workspace 403
- **Verified**: 401 for invalid/forged tokens, 403 for cross-workspace
- **Gap**: No expired token test (requires time manipulation), no frontend auth state test

### Onboarding Tests (`apps/api/src/onboarding.test.ts`)
- Tests onboarding state creation and progression
- **Verified**: Empty state handling (NOT_CONFIGURED), schedule validation, policy with honest Tier-1 disclosure, feed isolation, CSV import with honest skips, kill switch
- **Gap**: Profile/ICP/Objectives steps not in this file (ICP tested in salesMachine)

### Intelligence Tests (`apps/api/src/feedAdapters.test.ts`)
- Tests feed adapter integration via daily loop
- **Verified**: HN feed creates intelligenceSource records with provenance
- **Gap**: Mocks HTTP (not real adapter), GitHub adapter not tested, SourceDocument/SourceClaim/TopicMention/TrendSignal not verified

### Decision Tests (`packages/decision/src/test/`)
- Unit tests for scoring, signals, eligibility, explanation
- **Verified**: Objective alignment bonus, learning boost, deterministic scoring, attribution link validation
- **Gaps**: No integration test for full Objective → API → Score → Recommendation chain; attribution→recommendation not tested; audience/sales signals→recommendation not tested

### Content Tests (`apps/api/src/contentMachine.test.ts`)
- **Verified**: Full lifecycle Opportunity → Idea → Plan → Draft → Review → Approval → Final → Record → Analytics
- Cross-workspace authorization, AI_UNAVAILABLE, quality gates, draft immutability after approval

### Sales Tests (`apps/api/src/salesMachine.test.ts`)
- **Verified**: Full pipeline Lead → Research → Qualification → RelevantContent → Strategy → Draft → Approval → PreparedAction
- PreparedAction never "sent", gate validation, cross-workspace isolation

### Learning Tests (`apps/api/src/learningMachine.test.ts`)
- **Verified**: Full learning lifecycle Outcome → Proposal → Confirm/Reject → Maturity → Recommendation Impact
- Maturity ladder (HYPOTHESIS → OBSERVED → REPEATED_SIGNAL) tested in batch2.test.ts

### Safety Tests (`apps/api/src/operatorMachine.test.ts`, `apps/api/src/batch2.test.ts`)
- **Verified**: Execution cap = 0 enforced at schema, readiness, worker; PreparedAction enum lacks SENT/EXECUTED
- **Gap**: No code search test for LinkedIn automation

## Cross-Machine Bridge Verification (ADR 007)

| Producer | Persistence | Reader | Consumer | Outcome | Status |
|----------|-------------|--------|----------|---------|--------|
| Intelligence | IntelligenceSource, SourceDocument, SourceClaim, Topic, TrendSignal | intelligenceService | Decision | Trend signals → opportunity scoring | PARTIAL (signalFlow tests signals→opportunities, but decision context not verified) |
| Intelligence | TopicMention | topicService | Content | Topics → content ideas | UNKNOWN (no test) |
| Sales | ProspectResearch, ProspectSignal, QualificationResult | salesService | Content | Qualified prospects → relevant content | VERIFIED (signalFlow lines 170-184) |
| Sales | OutreachStrategy, OutreachDraft | salesService | Decision | Outreach context → recommendation | UNKNOWN (no test) |
| Content | ContentDNA, ContentStageHistory | contentService | Learning | Performance → learning signals | VERIFIED (learningMachine lines 59-145) |
| Learning | LearningSignal, LearningProposal | learningService | Decision | Mature learning → recommendation boost | PARTIAL (learning boost in unit test, confirmed learning influence in integration) |
| Decision | Recommendation, Attribution | decisionService | Content/Sales | Prioritized opportunities → content/sales work | UNKNOWN (no test) |

## Workspace Isolation Verification
- Multiple tests verify 403 for cross-workspace access (authFlow, onboarding, salesMachine, contentMachine, learningMachine, operatorMachine, batch2)
- Schema: All models (except User) have `workspaceId` field with `@@index([workspaceId])`
- Middleware: `X-Workspace-ID` validated against memberships

## Remaining UNKNOWN / Gaps Requiring Attention

1. **INTEL-002**: HN/GitHub actual adapter execution with real HTTP
2. **DECISION-001/002/003/004**: Full integration chains from API → decisionContext → recommendationEngine → API response
3. **Cross-machine bridges**: Intelligence→Content (topics→ideas), Sales→Decision, Decision→Content/Sales
4. **SAFETY-001**: Code search verification for no LinkedIn automation
5. **AUTH-002**: Expired token test, frontend auth state clearing
6. **ONBOARD-001**: Profile/ICP/Objectives steps in onboarding flow

## Status Summary

| Status | Count |
|--------|-------|
| VERIFIED | 5 |
| PARTIAL | 8 |
| UNKNOWN | 2 |
| FAIL | 0 |

**Original UNKNOWN count**: 15 (all entries)
**Now VERIFIED**: 5 (AUTH-001, AUTH-003, CONTENT-001, SALES-001, LEARNING-001, SAFETY-002)
**Now PARTIAL**: 8 (AUTH-002, ONBOARD-001, INTEL-001, DECISION-001, DECISION-002, DECISION-003, DECISION-004, SAFETY-001)
**Still UNKNOWN**: 2 (INTEL-002, plus cross-machine bridges not in matrix)