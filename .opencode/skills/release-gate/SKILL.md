---
name: release-gate
description: Release readiness gate. A change cannot be considered release-ready until all criteria pass.
---

# Release Gate Skill

## Purpose
A change cannot be considered release-ready until all criteria pass.

## Hard Rule
**External-provider failures must be distinguished from application failures.**

## Release Criteria Checklist

### 1. Focused Tests Pass
- [ ] Unit tests for modified packages pass
- [ ] Integration tests for modified flows pass
- [ ] No new test failures introduced

**Command**: `pnpm test` (or package-specific)

### 2. Regression Tests Pass
- [ ] All golden flow tests from `REGRESSION_MATRIX.md` pass
- [ ] Auth flows (AUTH-001, 002, 003)
- [ ] Onboarding flow (ONBOARD-001)
- [ ] Intelligence flows (INTEL-001, 002)
- [ ] Decision flows (DECISION-001 through 004)
- [ ] Content flow (CONTENT-001)
- [ ] Sales flow (SALES-001)
- [ ] Learning flow (LEARNING-001)
- [ ] Safety flows (SAFETY-001, 002)

**Command**: `pnpm test:all`

### 3. Relevant E2E Passes
- [ ] Fresh user journey: register → onboard → app loads
- [ ] Authenticated user: login → workspace → no 500s
- [ ] Critical UI paths render without error

**Command**: `pnpm --filter=@growth-operator/web test:e2e` (or Playwright)

### 4. Typecheck Passes
- [ ] `pnpm typecheck` — zero errors across all packages
- [ ] No `any` types introduced in critical paths
- [ ] Schema types match API types

**Command**: `pnpm typecheck`

### 5. Build Passes
- [ ] `pnpm build` — zero errors
- [ ] All packages compile
- [ ] No TypeScript emit errors

**Command**: `pnpm build`

### 6. Prisma Validation Passes
- [ ] `pnpm db:generate` — client generated successfully
- [ ] `pnpm db:migrate status` — clean (no pending, no drift)
- [ ] Schema validates: `pnpm prisma validate` (if available)

**Command**: `pnpm db:generate && pnpm db:migrate status`

### 7. Migration State Understood
- [ ] If schema changed: migration created and tested
- [ ] Migration is reversible (down migration exists)
- [ ] Migration tested against production-like data volume
- [ ] No destructive changes (DROP COLUMN, DROP TABLE) without explicit approval

### 8. Security Checks Pass
- [ ] Unauthenticated access → 401 (not 500, not 200)
- [ ] Invalid token → 401
- [ ] Expired token → 401
- [ ] Cross-workspace → 403
- [ ] Workspace isolation verified (at least one test)
- [ ] No auth bypass introduced
- [ ] Rate limiting functional
- [ ] CSP headers present
- [ ] CORS restricted to WEB_URL

### 9. Architecture Constraints Pass
- [ ] Execution cap = 0 enforced
- [ ] No "sent" states in PreparedAction
- [ ] Approval snapshots frozen (not aggregate)
- [ ] No LinkedIn automation code
- [ ] Data honesty: no invented metrics
- [ ] Empty states use honest unavailable values

### 10. No Unexplained Regression
- [ ] All test failures explained (app bug vs external provider)
- [ ] No flaky tests introduced
- [ ] No tests deleted/weakened to pass
- [ ] Behavior before/after documented for changed endpoints

## External Provider Failure Handling

If tests fail due to external AI providers (OpenRouter, Anthropic, OpenAI):
1. **Document** which tests fail and why
2. **Verify** the failure is provider-side (rate limit, model unavailable, API error)
3. **Do not** weaken/delete those tests
4. **Mark** as "EXTERNAL_PROVIDER_FAILURE" in test results
5. **Proceed** only if application logic tests pass

## Gate Decision

| Criteria | Status | Evidence |
|----------|--------|----------|
| Focused Tests | PASS/FAIL | Test output |
| Regression Tests | PASS/FAIL | Test output |
| E2E | PASS/FAIL | Playwright output |
| Typecheck | PASS/FAIL | Typecheck output |
| Build | PASS/FAIL | Build output |
| Prisma | PASS/FAIL | Generate/migrate output |
| Migrations | PASS/FAIL | Migration files |
| Security | PASS/FAIL | Security audit |
| Architecture | PASS/FAIL | Architecture audit |
| No Unexplained Regression | PASS/FAIL | Test analysis |

**RELEASE READY** = All PASS

**NOT READY** = Any FAIL (with explanation)

## Output
Provide:
1. Gate decision: READY / NOT READY
2. Criteria table with status and evidence links
3. External provider failures documented separately
4. Remaining risks/unknowns
5. Git commit if code changed: `chore: release preparation` or `fix: ...`