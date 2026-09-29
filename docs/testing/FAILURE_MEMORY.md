# Failure Memory

Record of important previously observed failures from this repository. For every failure: symptom, root cause, fix, regression test, files involved, what future agents must avoid.

**DO NOT FABRICATE** — Use only evidence present in repository/current history.

---

## Failure: Frontend 500 Storm on Fresh User Load (Phases 7-15)

### Date/Versions
Observed across Phases 7, 8, 9, 10, 11, 12, 13, 14, 15

### Symptom
Fresh authenticated user loads app → browser console shows 500 for:
- `/api/v1/health`
- `/api/v1/ready`
- `/api/v1/auth/me`
- `/api/v1/workspaces`
- `/api/v1/readiness`
- `/api/v1/onboarding`
- `/api/v1/learning/derived?status=PROPOSED`

React Router v6 future flag warnings also present but not causal.

### Root Cause
Multiple interconnected issues:
1. **API server not running** — Frontend proxy (`vite.config.ts`) points to `localhost:3001` but API process not started
2. **Auth bootstrap race** — `AuthContext.tsx` resolves session asynchronously; components fire API calls before resolution
3. **Missing OnboardingState** — GET `/onboarding` assumes record exists, throws 500 when null
4. **Workspace context null** — Middleware passes undefined workspaceId to queries

### Fix Applied (Partial Across Phases)
- Phase 7: Added `OnboardingState` auto-creation in GET `/onboarding`
- Phase 10: Fixed auth middleware to handle missing workspace
- Phase 11: Improved AuthContext to await session before firing protected calls
- Phase 15: Health/ready endpoints fixed to not require DB for health

### Regression Test
- **E2E**: Fresh user registers → logs in → home page loads with zero 500s
- **API**: `GET /health` returns 200 without DB
- **API**: `GET /ready` returns 503 (not 500) when DB down
- **API**: `GET /onboarding` returns 200 with default state for fresh workspace
- **Frontend**: No API calls fire before `AuthContext` resolves

### Files Involved
- `apps/api/src/index.ts` — health/ready endpoints
- `apps/api/src/middleware/auth.ts` — workspace resolution
- `apps/api/src/routes/onboarding.ts` — auto-create OnboardingState
- `apps/web/src/context/AuthContext.tsx` — session resolution
- `apps/web/src/services/api.ts` — request queue/interceptors
- `apps/web/vite.config.ts` — proxy config

### What Future Agents Must Avoid
- ❌ Starting frontend without API server
- ❌ Firing protected API calls before auth resolution
- ❌ Assuming database records exist (always handle null)
- ❌ Returning 500 for "not found" — use 404 or default state
- ❌ Ignoring proxy configuration

---

## Failure: ICP Fields Silently Dropped (Phases 8, 11)

### Date/Versions
Phase 8 implementation, Phase 11 boundary audit

### Symptom
User creates ICP with `targetRoles`, `industries`, `companySize`, `problems`, `exclusions` → saves successfully → reloads page → fields empty or partial

### Root Cause
1. Prisma schema has all fields
2. API route `POST /icps` accepts all fields but `select` in `findUnique` after create omits some
3. Zod schema in `packages/schemas` missing some fields
4. Frontend type definition in `apps/web/src/types/index.ts` missing fields

### Fix Applied
- Updated Prisma select to include all fields
- Updated Zod schema to validate all fields
- Updated frontend types to match

### Regression Test
- **Integration**: Create ICP with all fields → GET → all fields returned
- **Unit**: Zod schema validates all fields
- **E2E**: UI shows all fields after save

### Files Involved
- `apps/api/src/routes/icps.ts`
- `packages/schemas/src/index.ts`
- `apps/web/src/types/index.ts`
- `apps/web/src/pages/SettingsPage.tsx`

### What Future Agents Must Avoid
- ❌ Partial Prisma selects after create/update
- ❌ Zod schema drift from Prisma schema
- ❌ Frontend type drift from API types
- ❌ Not testing round-trip UI → API → DB → API → UI

---

## Failure: Signals Produced But Not Consumed (Phases 9, 12, 13)

### Date/Versions
Phase 9 (Intelligence), Phase 12 (Decision), Phase 13 (Learning)

### Symptom
- Learning signals written to `LearningSignal` table but `decisionContext` doesn't read them
- Attribution signals written but not factored into recommendation scores
- Audience/sales signals exist in DB but `recommendationEngine` ignores them
- Each phase claimed "integrated" because producer existed

### Root Cause
- Each signal type built producer in isolation
- Consumer (`packages/decision/src/decisionContext.ts`) only reads subset
- No integration test verifying signal → score impact
- "Feature complete" claimed per-package, not end-to-end

### Fix Applied (Partial)
- Phase 12: `decisionContext` reads learning signals (but maturity gating missing)
- Phase 13: `maturity.ts` gates influence but no confirmed learning reaches it
- Phase 14: Attribution snapshot captures frozen state

### Regression Test
- **Integration**: Write learning signal → confirm → maturity ≥ 0.7 → next recommendation includes learningBoost
- **Integration**: Create attribution link → recommendation score includes attributionScore
- **Integration**: Create audience signal → recommendation references signal
- **Integration**: Create sales signal → recommendation references signal

### Files Involved
- `packages/decision/src/decisionContext.ts`
- `packages/decision/src/recommendationEngine.ts`
- `packages/learning/src/derivation.ts`
- `packages/learning/src/maturity.ts`
- `packages/sales/src/relevantContent.ts`
- `packages/sales/src/scoring.ts`
- `packages/intelligence/src/*.ts`

### What Future Agents Must Avoid
- ❌ Building producer without verifying consumer
- ❌ Claiming "integrated" without end-to-end test
- ❌ Skipping maturity/threshold checks
- ❌ Not documenting bridge in ADR 007

---

## Failure: HN/GitHub Adapters Not Invoked (Phases 10, 11)

### Date/Versions
Phase 10 implementation, Phase 11 boundary audit

### Symptom
- Adapter functions exist in `packages/intelligence/src/feedAdapters/`
- Daily run logs "intelligence stage completed"
- Zero new `IntelligenceSource` records in DB
- No errors logged

### Root Cause
- Intelligence stage calls adapter registry but adapters not registered
- Unit tests mock adapter, hiding integration failure
- No test invoking actual adapter with real HTTP

### Fix Applied
- Registered adapters in intelligence stage
- Added integration test with real HTTP (marked as external dependency)

### Regression Test
- **Integration**: Create HN feed source → run intelligence stage → sources stored in DB
- **Integration**: Create GitHub feed source → run intelligence stage → sources stored in DB
- **Unit**: Adapter functions return expected shape

### Files Involved
- `packages/intelligence/src/feedAdapters/`
- `apps/api/src/worker/stages.ts` (intelligence stage)
- `apps/api/src/routes/feeds.ts`

### What Future Agents Must Avoid
- ❌ Mocking external adapters in integration tests
- ❌ Not registering adapters in pipeline
- ❌ Claiming stage "works" without verifying DB writes

---

## Fake Execution in Tests/Demos (Phases 6, 8)

### Date/Versions
Phase 6, Phase 8

### Symptom
- Tests create PreparedAction with "sent" status
- Demo seed data includes fake LinkedIn message IDs
- Execution cap (0) bypassed in test setup

### Root Cause
- No authorized LinkedIn integration exists
- Tests use mock execution to get green CI
- Demo seeding creates unrealistic "sent" records

### Fix Applied
- `PreparedActionStatus` enum: only `READY_FOR_AUTHORIZED_EXECUTION`, `BLOCKED`, `EXPIRED`, `REQUIRES_APPROVAL`
- `WorkspaceSettings.dailyExecutionCap` default 0
- `no-fabrication-check` skill enforces
- `prototype-demo-seeding` skill forbids fake LinkedIn data

### Regression Test
- **Schema**: `PreparedActionStatus` enum lacks "SENT"/"EXECUTED"
- **Schema**: `dailyExecutionCap` default 0
- **Test**: Worker execution stage no-ops when cap = 0
- **Test**: No PreparedAction ever transitions to "sent" state

### Files Involved
- `packages/db/prisma/schema.prisma`
- `apps/api/src/routes/outreach.ts`
- `apps/api/src/worker/stages.ts`
- All test files

### What Future Agents Must Avoid
- ❌ Adding "SENT" or "EXECUTED" to PreparedActionStatus
- ❌ Creating test data with fake LinkedIn IDs
- ❌ Bypassing execution cap in tests
- ❌ Implementing LinkedIn API calls

---

## Schema/Client Mismatch (Phases 9, 11)

### Date/Versions
Phase 9, Phase 11

### Symptom
- Migration adds column but Prisma client not regenerated
- Enum value added in DB but not in Prisma schema
- Test fails with "Unknown field" or "Invalid enum value"

### Root Cause
- `pnpm db:generate` not run after schema change
- Migration applied but client stale
- CI doesn't run generate + migrate status

### Fix Applied
- Added `db:generate` to CI
- Added `db:migrate status` check

### Regression Test
- **CI**: `pnpm db:generate` runs on every schema change
- **CI**: `pnpm db:migrate status` shows clean
- **Local**: Pre-commit hook runs generate

### Files Involved
- `packages/db/prisma/schema.prisma`
- `package.json` scripts
- CI configuration

### What Future Agents Must Avoid
- ❌ Editing schema without running generate
- ❌ Running migration without verifying client
- ❌ Skipping migrate status check

---

## Flaky Tests Masking Real Failures (Phases 7-15)

### Date/Versions
Across multiple phases

### Symptom
- Tests use random data causing intermittent failures
- External AI provider failures marked as test failures
- Tests deleted/weakened to get green CI

### Root Cause
- Non-deterministic test fixtures
- No distinction between app regression and external failure
- Pressure to show green CI

### Fix Applied
- Deterministic test data factories
- External provider failures caught and marked separately
- `no-fabrication-check` and test integrity rules in AGENTS.md

### Regression Test
- **Rule**: Never delete/weaken failing test — fix root cause
- **Rule**: External failures explicitly identified
- **Rule**: Deterministic test data only

### Files Involved
- All test files
- `AGENTS.md` (Section 10: Tests)

### What Future Agents Must Avoid
- ❌ Using random data in tests
- ❌ Deleting tests to fix CI
- ❌ Mocking external dependencies to hide failures
- ❌ Not distinguishing app vs external failures