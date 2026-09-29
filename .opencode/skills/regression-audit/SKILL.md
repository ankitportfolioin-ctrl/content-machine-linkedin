---
name: regression-audit
description: Verify that a change did not break existing functionality. Use after any modification to audit for regressions.
---

# Regression Audit Skill

## Purpose
Verify that a change did not break existing functionality.

## Hard Rule
**Never convert UNKNOWN into PASS.**

## Workflow

### 1. Inspect Git Diff
```bash
git diff HEAD~1 --name-only
git diff HEAD~1
```
- List all modified files
- Identify scope: API, Web, DB, Workers, Packages

### 2. Identify Affected Modules
Map each changed file to:
- Package (`apps/api`, `apps/web`, `packages/*`)
- Functional area (auth, onboarding, intelligence, decision, content, sales, learning)
- Golden flow IDs from `REGRESSION_MATRIX.md`

### 3. Identify Affected Workflows
For each golden flow potentially affected:
- Check `GOLDEN_FLOWS.md` for protected behaviors
- Note which test should cover it

### 4. Find Regression Tests
- Unit tests in modified packages
- Integration tests in `apps/api/src/*.test.ts`
- E2E tests in `apps/web/src/**/*.test.tsx`
- Cross-package tests

### 5. Run Focused Tests
```bash
# Run tests for modified packages
pnpm --filter=@growth-operator/api test
pnpm --filter=@growth-operator/web test
pnpm --filter=@growth-operator/decision test
# etc.
```

### 6. Run Relevant Integration Tests
```bash
# Run integration tests for affected areas
pnpm --filter=@growth-operator/api test -- --testNamePattern="auth|onboarding|decision"
```

### 7. Run Relevant E2E
```bash
# If frontend modified
pnpm --filter=@growth-operator/web test:e2e
# Or specific Playwright tests
```

### 8. Check API Contracts
- Run `pnpm typecheck` — catches contract drift
- Verify response shapes match `packages/schemas`
- Check status codes for error cases (401, 403, 404, 422, 500)

### 9. Check DB Contracts
```bash
pnpm db:generate
pnpm db:migrate status
```
- Prisma client in sync with schema
- No pending migrations
- Enum values match

### 10. Check Authorization
- Unauthenticated requests → 401 (not 500, not 200)
- Invalid token → 401
- Cross-workspace → 403
- Workspace-scoped queries all filter by workspaceId

### 11. Check Workspace Isolation
- Run `workspace-isolation-review` skill on modified queries/routes
- Verify at least one test proves workspace A ≠ workspace B

### 12. Check Safety Gates
- Execution cap = 0 enforced
- No "sent" states created
- Approval snapshots frozen
- No LinkedIn automation code

### 13. Check Existing Behavior
Compare before/after for:
- Fresh user experience (0 workspaces, 0 profiles, 0 ICPs)
- Empty states return `[]`, `null`, `NOT_CONFIGURED`, `INSUFFICIENT_DATA`
- No 500 for missing records
- React Router warnings unchanged (not the primary issue)

## Output
**PASS / FAIL / PARTIAL / UNKNOWN**

### PASS Criteria
- All focused tests pass
- All regression tests pass
- All relevant E2E pass
- Typecheck passes
- Build passes
- DB contracts valid
- Authorization correct
- Workspace isolation verified
- Safety gates intact
- No behavior regression

### FAIL Criteria
- Any test regression
- Any contract violation
- Any security boundary weakened
- Any safety gate bypassed

### PARTIAL Criteria
- Some tests pass, some fail (document which)
- External provider failures (document separately)
- Manual verification needed for some flows

### UNKNOWN Criteria
- Test doesn't exist for affected flow
- Cannot verify due to missing infrastructure
- Blast radius not fully determined

## Reporting
Provide:
1. Git diff summary
2. Affected modules/workflows
3. Test results (exact counts)
4. Contract verification results
5. Security/safety verification
6. Verdict: PASS/FAIL/PARTIAL/UNKNOWN
7. Remaining UNKNOWN items requiring attention