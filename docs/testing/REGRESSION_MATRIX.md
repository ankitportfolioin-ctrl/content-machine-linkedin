# Regression Matrix

Maps golden flows to actual tests. **Do not mark VERIFIED just because a test file exists.** Inspect the actual test. If uncertain, mark UNKNOWN.

| ID          | Area       | Protected Behavior                                      | Test Type | Current Test                            | Status     |
|-------------|------------|--------------------------------------------------------|-----------|-----------------------------------------|------------|
| AUTH-001    | Auth       | Register → login → session → authenticated API         | Integration | `apps/api/src/authFlow.test.ts`        | UNKNOWN    |
| AUTH-002    | Auth       | Expired/invalid session → safe unauthenticated state   | Integration | `apps/api/src/authFlow.test.ts`        | UNKNOWN    |
| AUTH-003    | Auth       | Cross-workspace access → denied                        | Integration | `apps/api/src/authFlow.test.ts`        | UNKNOWN    |
| ONBOARD-001 | Onboarding | Fresh user → workspace → profile → ICP → objectives → feeds → leads → policy → schedule | E2E | `apps/api/src/onboarding.test.ts` | UNKNOWN    |
| INTEL-001   | Intelligence | Source → ingestion → normalization → dedup → provenance → signal | Integration | `apps/api/src/feedAdapters.test.ts` | UNKNOWN    |
| INTEL-002   | Intelligence | HN/GitHub → actual adapter → stored intelligence       | Integration | `apps/api/src/feedAdapters.test.ts`    | UNKNOWN    |
| DECISION-001| Decision   | Objective → score → recommendation                     | Unit      | `packages/decision/src/*.test.ts`      | UNKNOWN    |
| DECISION-002| Decision   | Attribution → recommendation score                     | Unit      | `packages/decision/src/*.test.ts`      | UNKNOWN    |
| DECISION-003| Decision   | Learning → recommendation score                        | Unit      | `packages/decision/src/*.test.ts`      | UNKNOWN    |
| DECISION-004| Decision   | Audience/sales signal → recommendation                 | Unit      | `packages/decision/src/*.test.ts`      | UNKNOWN    |
| CONTENT-001 | Content    | Opportunity → idea → plan → draft → review → approval → final → record → DNA → analytics | Integration | `apps/api/src/contentMachine.test.ts` | UNKNOWN    |
| SALES-001   | Sales      | Lead import → research → qualification → scoring → relevant content → strategy → draft → approval → prepared action | Integration | `apps/api/src/salesMachine.test.ts` | UNKNOWN    |
| LEARNING-001| Learning   | Outcome → proposal → user confirmation → maturity → next recommendation impact | Integration | `apps/api/src/learningMachine.test.ts` | UNKNOWN    |
| SAFETY-001  | Safety     | No unauthorized LinkedIn execution                     | Unit      | `apps/api/src/operatorMachine.test.ts` | UNKNOWN    |
| SAFETY-002  | Safety     | Execution cap remains zero/unavailable                 | Unit      | `apps/api/src/operatorMachine.test.ts` | UNKNOWN    |

## Test Coverage Notes

### Authentication Tests (`apps/api/src/authFlow.test.ts`)
- Tests register, login, token validation
- **Need to verify**: Tests check 401 for expired/invalid tokens, not 500
- **Need to verify**: Tests check cross-workspace 403

### Onboarding Tests (`apps/api/src/onboarding.test.ts`)
- Tests onboarding state creation and progression
- **Need to verify**: Tests cover fresh user with 0 workspaces
- **Need to verify**: Tests check empty state handling (NOT_CONFIGURED)

### Intelligence Tests (`apps/api/src/feedAdapters.test.ts`)
- Tests feed adapter functions
- **Need to verify**: Tests actually invoke real HTTP (not mocked)
- **Need to verify**: Tests check HN/GitHub adapters store sources

### Decision Tests (`packages/decision/src/`)
- Unit tests for recommendation engine
- **Need to verify**: Tests cover attribution, learning, audience/sales signals
- **Need to verify**: Tests verify score breakdown explainability

### Content Tests (`apps/api/src/contentMachine.test.ts`)
- Tests content lifecycle
- **Need to verify**: Tests cover full chain opportunity → analytics

### Sales Tests (`apps/api/src/salesMachine.test.ts`)
- Tests sales pipeline
- **Need to verify**: Tests verify PreparedAction never "sent"
- **Need to verify**: Tests check relevant content linking

### Learning Tests (`apps/api/src/learningMachine.test.ts`)
- Tests learning derivation and proposals
- **Need to verify**: Tests cover maturity gating
- **Need to verify**: Tests verify confirmed learning affects recommendations

### Safety Tests (`apps/api/src/operatorMachine.test.ts`)
- Tests daily run stages
- **Need to verify**: Tests verify execution cap = 0 behavior
- **Need to verify**: Tests verify no "sent" state possible

## Status Definitions

- **VERIFIED**: Test exists, inspected, passes, covers the protected behavior
- **PARTIAL**: Test exists but covers only subset of protected behavior
- **UNKNOWN**: Test file exists but not inspected, or unclear if it covers the behavior
- **MISSING**: No test found for this protected behavior

## Action Required

Before any release, all UNKNOWN → VERIFIED or PARTIAL with documented gaps.