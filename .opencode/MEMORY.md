# Growth Operator — Project Memory

Durable lessons from this repository's previous failures. This file must be updated whenever a new failure pattern is discovered and fixed.

---

## Authentication Lessons

### Issue: Frontend Request Race During Bootstrap
**Observed:** Multiple times across Phases 7-15
- Frontend fires `/auth/me`, `/workspaces`, `/readiness`, `/onboarding`, `/learning/derived` simultaneously on load
- Authentication context not fully resolved before protected API calls execute
- Results in 500 errors when workspace context is null/undefined

**Root Cause:**
- `AuthContext.tsx` resolves session asynchronously
- Components using `useAuth()` don't wait for resolution before making API calls
- Race condition between session validation and data fetching

**Required Regression Checks:**
- `/auth/me` - must return 200 with user or 401, never 500
- `/workspaces` - must return 200 with `[]` for fresh user, never 500
- `/readiness` - must return 200 with readiness state, never 500
- `/onboarding` - must return 200 with onboarding state or NOT_CONFIGURED, never 500
- `/learning/derived` - must return 200 with `[]` or INSUFFICIENT_DATA, never 500
- Fresh user (0 workspaces, 0 profiles, 0 ICPs) - all endpoints handle empty state
- Expired/invalid session - returns 401, never 500
- Cross-workspace authorization - returns 403, never 500

**Files Involved:**
- `apps/web/src/context/AuthContext.tsx`
- `apps/web/src/services/api.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/routes/auth.ts`

---

## Onboarding Lessons

### Issue: Fresh User Cannot Complete Onboarding
**Observed:** Phase 7, Phase 10
- Fresh registered user hits 500 on `/onboarding` because `OnboardingState` record doesn't exist
- Backend assumes record exists; doesn't create on demand
- Frontend shows error instead of onboarding UI

**Root Cause:**
- `OnboardingState` is created only during workspace creation
- No auto-creation logic in GET `/onboarding` endpoint
- Frontend has no fallback for missing record

**Fix Applied:**
- GET `/api/v1/onboarding` now creates `OnboardingState` if missing (idempotent)
- Returns default step "profile" with all steps false for fresh workspace

**Regression Requirement:**
- Fresh user → Register → Login → Onboarding page loads without 500
- No manual DB editing required
- No curl-only prerequisites

---

## ICP Lessons

### Issue: ICP Fields Silently Dropped on Round-Trip
**Observed:** Phase 8, Phase 11
- UI sends `targetRoles`, `industries`, `companySize`, `problems`, `exclusions`
- API accepts but some fields not persisted or returned
- Frontend shows stale/empty data after save

**Root Cause:**
- Prisma schema has fields but API route doesn't include all in select/update
- Zod schema validation missing some fields
- Frontend type definition missing fields

**Required Regression Checks:**
- UI → API → DB → API → UI round-trip for ALL ICP fields
- No silently dropped fields
- All fields visible in UI after save

**Files Involved:**
- `apps/api/src/routes/icps.ts`
- `packages/schemas/src/index.ts` (ICP schemas)
- `apps/web/src/types/index.ts` (ICP types)
- `apps/web/src/pages/SettingsPage.tsx` (ICP UI)

---

## Decision Engine Lessons

### Issue: Signals Produced But Not Consumed
**Observed:** Phase 9, Phase 12, Phase 13
- Learning signals written to DB but `decisionContext` doesn't read them
- Attribution signals written but not factored into recommendation scores
- Audience/sales signals exist in DB but `recommendationEngine` ignores them
- "Integrated" claimed because producer exists, but consumer never reads

**Root Cause:**
- Each signal type has its own producer (learning, attribution, audience, sales)
- Consumer (`decisionContext.ts`) only reads subset
- No integration test verifying signal → score impact

**Required Regression Checks:**
- Objective → score → recommendation chain works
- Attribution → recommendation score impact measurable
- Learning → recommendation score impact measurable (when maturity ≥ threshold)
- Audience signal → recommendation impact measurable
- Sales signal → recommendation impact measurable
- Signal written → consumer reads → affects output

**Files Involved:**
- `packages/decision/src/decisionContext.ts`
- `packages/decision/src/recommendationEngine.ts`
- `packages/learning/src/derivation.ts`
- `packages/sales/src/relevantContent.ts`
- `packages/sales/src/scoring.ts`

---

## Intelligence Lessons

### Issue: HN/GitHub Adapters Not Actually Invoked
**Observed:** Phase 10, Phase 11
- Adapter functions exist in `packages/intelligence/src/feedAdapters/`
- Daily run claims "intelligence stage completed" but no new sources stored
- No runtime verification that adapters execute

**Root Cause:**
- Intelligence stage calls adapter registry but adapters not registered
- No test invoking actual adapter with real HTTP
- Unit tests mock adapter, hiding integration failure

**Required Regression Checks:**
- HN adapter → actual HTTP request → sources stored in DB
- GitHub adapter → actual HTTP request → sources stored in DB
- Feed source creation → daily run → ingestion → normalization → dedup → provenance → signal

**Files Involved:**
- `packages/intelligence/src/feedAdapters/`
- `apps/api/src/worker/stages.ts` (intelligence stage)
- `apps/api/src/routes/feeds.ts`

---

## Learning Lessons

### Issue: Learning Not Discoverable or Measurable
**Observed:** Phase 12, Phase 13
- Learning proposals created but not visible in UI
- No way to confirm/reject learning
- Confirmed learning doesn't affect subsequent recommendations

**Root Cause:**
- `/learning/derived` returns proposals but UI doesn't render confirmation flow
- `LearningProposalStatus.PROPOSED` never transitions to `CONFIRMED`
- `maturity.ts` gates influence but no confirmed learning reaches it

**Required Regression Checks:**
- Learning proposals discoverable by user in UI
- User can confirm/reject proposal
- Confirmed learning (maturity ≥ threshold) affects next recommendation
- Maturity gates influence correctly

**Files Involved:**
- `packages/learning/src/derivation.ts`
- `packages/learning/src/maturity.ts`
- `apps/api/src/routes/learning.ts`
- `apps/web/src/pages/LearningPage.tsx`

---

## Cross-Machine Intelligence Lessons

### Issue: Bridges Without Consumers
**Observed:** Multiple phases
- Intelligence writes sources → no consumer reads for decision
- Sales writes qualifications → no consumer uses for content
- Content writes DNA → no consumer uses for analytics
- Learning writes proposals → no consumer uses for ranking

**Root Cause:**
- Each package builds producer in isolation
- No cross-package integration verification
- "Feature complete" claimed per-package, not end-to-end

**Required Regression Checks:**
- Every producer has a consumer
- Every consumer has a producer
- Observable outcome at each bridge

**Files Involved:**
- All packages with cross-package dependencies

---

## Approval Lessons

### Issue: Approval Snapshots Are Aggregate Counts, Not Frozen State
**Observed:** Phase 14
- `ApprovalSnapshot.items` stores counts, not individual item state
- Later human decisions can rewrite what the run saw
- Resume logic skips SUCCEEDED stages but snapshot doesn't capture item-level detail

**Root Cause:**
- Snapshot design stores JSON counts, not item identifiers + scores + reasons
- No unique constraint on workspace+dailyRun to prevent overwrites

**Fix Applied (Phase 14):**
- `ApprovalSnapshot.items` now stores plain copied values (ids, scores, reasons, version identifiers)
- One row per run (upsert); resume skips SUCCEEDED stages
- Snapshot captured at snapshot time — never live references

**Regression Requirement:**
- Snapshot represents frozen state at capture time
- Later human decisions cannot silently rewrite what the run saw

---

## Execution Lessons

### Issue: LinkedIn Execution Faked in Tests/Demos
**Observed:** Phase 6, Phase 8
- Tests mock "sent" state for outreach
- Demo data includes fake LinkedIn message IDs
- Execution cap (0) bypassed in test setup

**Root Cause:**
- No authorized LinkedIn integration exists
- Tests use mock execution to get green CI
- Demo seeding creates unrealistic "sent" records

**Hard Rules (Never Violate):**
- Execution cap remains 0 (`dailyExecutionCap = 0` in `WorkspaceSettings`)
- Prepared actions stay `READY_FOR_AUTHORIZED_EXECUTION` — never "sent"
- No LinkedIn automation code unless authorized integration exists
- Tests must not mock execution as success

**Files Involved:**
- `packages/db/prisma/schema.prisma` (PreparedActionStatus, WorkspaceSettings)
- `apps/api/src/routes/outreach.ts`
- `apps/api/src/worker/stages.ts` (execution stage)
- All test files

---

## Database Safety Lessons

### Issue: Schema/Client Mismatch Causes 500
**Observed:** Phase 9, Phase 11
- Migration adds column but Prisma client not regenerated
- Enum value added in DB but not in Prisma schema
- Test fails with "Unknown field" or "Invalid enum value"

**Required Regression Checks:**
- `pnpm db:generate` runs after every schema change
- `pnpm db:migrate status` shows clean state
- Prisma client version matches schema
- All enum values in schema match DB

---

## Test Integrity Lessons

### Issue: Flaky Tests Mask Real Failures
**Observed:** Phase 7-15
- Tests use random data causing intermittent failures
- External AI provider failures marked as test failures
- Tests deleted/weakened to get green CI

**Required Rules:**
- Never delete/weaken failing test — fix the root cause
- External provider failures explicitly identified (not app regression)
- Deterministic test data only
- If test is genuinely obsolete, document why and replace with stronger test

---

## What Future Agents Must Avoid

1. **Assuming authentication works** — always verify `/auth/me` returns 200/401, not 500
2. **Skipping empty-state handling** — every endpoint must handle 0 records
3. **Claiming "integrated" without consumer** — verify producer→consumer chain
4. **Faking execution** — cap=0, no "sent" states, no LinkedIn automation
5. **Ignoring workspace isolation** — every query must filter by workspaceId
6. **Inventing data** — use UNAVAILABLE/INSUFFICIENT_DATA, not plausible filler
6. **Bypassing approval gates** — human approval required for consequential actions
7. **Weakening tests to pass** — fix the bug, not the test
8. **Not running typecheck/build** — mandatory before declaring done
9. **Not verifying migrations** — `pnpm db:migrate status` must be clean