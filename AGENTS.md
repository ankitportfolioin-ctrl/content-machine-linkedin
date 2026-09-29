# Growth Operator — Engineering Constitution

This document is the permanent engineering constitution of the Growth Operator repository. It governs all AI and human contributions. Previous agent reports, audit reports, chat history, and claims of completion are evidence only. The CURRENT repository is the only source of truth.

---

## 1. Source of Truth

- The current repository state (code, tests, schema, config) is the only authoritative reference.
- Never assume a feature works merely because:
  - An earlier agent said it works
  - An earlier audit said PASS
  - Code exists
  - A test exists
  - A UI component exists
- **Verify actual behavior** through execution, tests, and evidence.

---

## 2. No-Regression Rule

Before modifying any existing subsystem:

1. Identify current behavior (read code, run tests, inspect DB)
2. Identify consumers (API clients, UI components, workers, other packages)
3. Identify dependencies (database, external services, other packages)
4. Identify database dependencies (tables, columns, enums, relations)
5. Identify API contracts (request/response shapes, status codes, headers)
6. Identify UI dependencies (pages, hooks, context, services)
7. Identify existing tests (unit, integration, E2E)
8. Run relevant baseline tests and capture results
9. Identify potential blast radius
10. Implement the **smallest safe change**
11. Rerun affected tests
12. Rerun regression tests
13. Run typecheck (`pnpm typecheck`)
14. Run build (`pnpm build`)
15. Verify migrations if relevant (`pnpm db:migrate` status)

---

## 3. Change-Impact Rule

Every feature change must explicitly answer:

> **What existing functionality could this change break?**

The answer must be verified through tests. If the blast radius is unknown, the change is not ready.

---

## 4. Completion Rule

A feature is **NOT PASS** merely because implementation exists.

**PASS requires evidence through the complete chain when applicable:**

```
INPUT
→ API
→ SERVICE
→ DATABASE
→ READER
→ CONSUMER
→ UI/ACTION
→ NEXT STAGE
```

Each link must be demonstrable. A producer without a consumer is incomplete. A writer without a reader is incomplete. A UI without a backend is incomplete.

---

## 5. Data Honesty

**Never invent:**
- Metrics
- Engagement numbers
- Outcomes
- Testimonials
- Evidence
- Provenance
- Audience pain points
- Customer information
- Learning signals
- Business results

**Use instead:**
- `UNKNOWN`
- `UNAVAILABLE`
- `INSUFFICIENT_DATA`
- `SOURCE_REVIEW_REQUIRED`
- `NOT_CONFIGURED`

When evidence does not exist, the system must surface the honest unavailable state, not plausible filler.

---

## 6. Security

**Never:**
- Disable authentication
- Bypass authorization
- Bypass workspace isolation
- Bypass approval gates
- Expose protected routes
- Increase execution permissions just to make tests pass
- Weaken security boundaries to "unblock" development

---

## 7. Human Approval

Consequential LinkedIn actions require the existing approval and authorization boundaries.

**Never bypass them.**

---

## 8. LinkedIn Execution

**Do not invent or implement LinkedIn automation** unless an authorized integration explicitly exists.

Execution remains unavailable (cap = 0) unless a legitimate authorized integration is present. The system is designed around official/authorized integrations only.

---

## 9. Database Safety

**Never:**
- Reset or destroy existing data merely to make tests pass
- Silently change database contracts (columns, types, enums, relations)
- Run migrations without understanding their impact
- Create fake records to make endpoints return 200

If a schema/client mismatch exists, fix the actual mismatch properly.

---

## 10. Tests

**Never:**
- Delete, weaken, skip, or rewrite a failing regression test merely to obtain green tests
- Add flaky tests without fixing the underlying race condition
- Mock external dependencies in a way that hides real failures

If a test is genuinely obsolete, explain why and replace it with an equivalent or stronger test.

---

## 11. Agent Behavior

**Before modifying code:**
- Inspect the current implementation
- Understand the architecture and data flow
- Plan the change with blast radius analysis
- Identify regression surface

**After modifying code:**
- Test the change
- Verify behavior end-to-end
- Audit for regressions
- Report remaining uncertainty honestly

**Never claim success without evidence.**

---

## 12. Workspace Isolation

All data access **must** be scoped by `workspaceId`:
- Every DB query filters by `workspaceId` (reads, updates, deletes)
- Every API route derives `workspaceId` from authenticated context, never only from client-supplied fields
- Joins must not pull rows from other workspaces
- Learning, feedback, voice, signals, leads, content, and recommendations are all workspace-scoped
- There must be at least one test proving workspace A cannot read or affect workspace B

---

## 13. Approval Boundaries

Approval snapshots must represent actual frozen state, not merely aggregate counts. The human-in-the-loop boundary is enforced at the API and database layer, not just the UI.

---

## 14. Cross-Machine Intelligence

Every bridge must have:
```
producer
→ persistence
→ reader
→ consumer
→ observable outcome
```

A bridge that writes data but has no consumer is incomplete. A consumer without a producer is incomplete.

---

## 15. Learning Authority

Learning signals must be discoverable by the user and measurable when confirmed learning affects subsequent ranking. Learning maturity must gate influence on recommendations.

---

## 16. Fresh User Experience

A fresh registered user (0 workspaces, 0 profiles, 0 ICPs, 0 objectives, 0 feeds, 0 leads, 0 learning proposals) must be able to:
- Complete onboarding through the actual UI
- Not encounter HTTP 500 due to missing records
- Receive appropriate empty states (`[]`, `null`, `NOT_CONFIGURED`, `INSUFFICIENT_DATA`)

Empty state ≠ server error.

---

## 17. API Error Contracts

The central API client must not convert legitimate server errors into misleading frontend state.

| Status | Meaning |
|--------|---------|
| 401 | Unauthenticated |
| 403 | Authenticated but forbidden |
| 404 | Resource does not exist |
| 409 | Valid conflict |
| 422 | Validation failure |
| 500 | Genuine unexpected server failure |

Do not globally convert all errors into 200. Do not globally swallow exceptions.

---

## 18. React Router / Frontend Warnings

Development warnings (e.g., React Router v7 future flags) are not the primary issue. They must not distract from actual failures (HTTP 500, broken auth, broken data flow).

---

## 19. Verification Standards

Before declaring any task complete, provide:

1. **Root cause** (if fixing a bug)
2. **Files changed** (exact list)
3. **What was fixed** (concrete changes only)
4. **Endpoint verification table** (before/after status codes)
5. **Security verification** (unauthenticated, invalid token, expired token, cross-workspace)
6. **Test results** (exact counts, pass/fail)
7. **Remaining issues** (categorized: BLOCKER / HIGH / MEDIUM / LOW / NON-BLOCKING WARNING)
8. **React Router warnings** (state whether they remain and affect functionality)
9. **Git commit** (single commit if code changed: `fix: ...` or `chore: ...`)

Do not push remotely. Do not create unrelated commits.

---

## 20. Success Criteria Reference

This task is successful ONLY when:

1. The actual backend root cause of any failure is identified
2. The root cause is fixed
3. Fresh authenticated users can load the application without error storms
4. Empty workspace state does not crash
5. `/auth/me`, `/workspaces`, `/readiness`, `/onboarding`, `/learning/derived` work correctly
6. Unauthenticated access remains protected
7. Cross-workspace isolation remains intact
8. Existing tests still pass (or external-provider failures are explicitly identified)
9. No authentication/security bypass was introduced
10. No fake/demo data was introduced
11. No LinkedIn execution behavior was added
12. No remote push is performed

---

*This constitution is binding. Any contribution that violates these rules must be rejected or corrected before merge.*