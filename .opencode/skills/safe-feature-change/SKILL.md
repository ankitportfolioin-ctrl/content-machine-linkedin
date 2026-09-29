---
name: safe-feature-change
description: Safely modify an existing feature without breaking current behavior. Use before any feature modification.
---

# Safe Feature Change Skill

## Purpose
Safely modify an existing feature without breaking current behavior.

## Hard Rule
**If a regression appears, do not declare the task complete.**

## Workflow

### 1. Read AGENTS.md
- Internalize the engineering constitution
- Focus on: No-Regression Rule, Change-Impact Rule, Completion Rule

### 2. Read Relevant MEMORY
- Check `.opencode/MEMORY.md` for lessons related to the area you're modifying
- Check `docs/testing/FAILURE_MEMORY.md` for similar past failures

### 3. Identify Architecture
- Which packages/modules are involved?
- What are the cross-package dependencies?
- Which ADRs apply? (Check `docs/adr/`)

### 4. Find Current Implementation
- Read the actual code (not tests, not docs)
- Trace the data flow: INPUT → API → SERVICE → DATABASE → READER → CONSUMER → UI

### 5. Find Consumers
- Who calls this API?
- Which UI components use this?
- Which worker stages depend on this?
- Which other packages import this?

### 6. Find Database Dependencies
- Which tables/models are read/written?
- What enums/relations are involved?
- Are there migrations pending?

### 7. Find Existing Tests
- Unit tests for the module
- Integration tests for the flow
- E2E tests for the user journey
- **Inspect them** — don't assume they cover your change

### 8. Establish Baseline
- Run relevant tests and capture results
- Note current behavior (status codes, response shapes, UI states)
- Document any existing flaky/skipped tests

### 9. Identify Blast Radius
- Answer explicitly: "What existing functionality could this change break?"
- List every consumer, dependency, and test that could be affected
- If blast radius unknown → STOP, investigate more

### 10. Create Minimal Plan
- Smallest safe change that achieves the goal
- No refactoring unrelated code
- No "while we're here" improvements

### 11. Implement
- Make the change
- Follow existing code patterns
- Don't weaken types, validation, or security

### 12. Run Focused Tests
- Tests directly related to changed code
- Must pass before proceeding

### 13. Run Dependent Regression Tests
- Tests for consumers identified in step 5
- Tests for golden flows in `REGRESSION_MATRIX.md`

### 14. Run Relevant E2E
- Playwright tests for affected user journeys
- Fresh user flow if auth/onboarding touched

### 15. Run Typecheck
```bash
pnpm typecheck
```
Must pass with zero errors.

### 16. Run Build
```bash
pnpm build
```
Must pass with zero errors.

### 17. Check Migration Status
```bash
pnpm db:migrate status
```
Must be clean. If schema changed, generate client and verify.

### 18. Check Security Boundaries
- Workspace isolation preserved?
- Auth/authorization unchanged?
- Execution cap still 0?
- Approval gates intact?

### 19. Compare Behavior Before/After
- API status codes same?
- Response shapes same?
- UI renders same?
- Empty states handled same?

### 20. Report Remaining Uncertainty
- What couldn't be tested?
- What external dependencies untested?
- What requires manual verification?

## Output Format
Provide:
1. Root cause (if fixing bug)
2. Files changed (exact list)
3. What was fixed (concrete changes only)
4. Endpoint verification table (before/after)
5. Security verification
6. Test results (exact counts)
7. Remaining issues (BLOCKER/HIGH/MEDIUM/LOW/NON-BLOCKING)
8. Git commit: `fix: ...` or `chore: ...` (single commit)