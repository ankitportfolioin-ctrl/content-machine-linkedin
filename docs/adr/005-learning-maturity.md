# ADR 005: Learning Maturity Gates

**Status**: Accepted
**Date**: 2026-09-30

## Context

Learning signals (from content performance, engagement, conversion, feedback) must mature before influencing recommendations. Immature learning must not affect ranking.

## Decision

### Learning Lifecycle
```
Outcome Observed
       ↓
LearningSignal Created (sourceType, signalValue, metadata)
       ↓
LearningProposal Created (PROPOSED status)
       ↓
User Discovers Proposal in UI
       ↓
User Confirms/Rejects
       ↓
If Confirmed → CONFIRMED status → Maturity Increases
       ↓
Maturity ≥ Threshold → Affects Recommendation Ranking
```

### Maturity Calculation (`packages/learning/src/maturity.ts`)
- Each confirmed proposal increases maturity for its signal type
- Maturity decays over time without reinforcement
- Threshold: maturity ≥ 0.7 (configurable) to influence recommendations
- Unconfirmed/rejected proposals don't increase maturity

### Recommendation Integration (`packages/decision/src/decisionContext.ts`)
- `decisionContext` reads learning signals filtered by maturity ≥ threshold
- Only mature signals factor into `attributionScore` and `learningBoost`
- Immature signals visible in UI but marked "insufficient maturity"

## Consequences

### Positive
- Users control what learning affects their recommendations
- Prevents noise from single outliers
- Transparent: users see maturity level per signal
- Measurable: can track maturity → ranking correlation

### Negative
- Delay before learning takes effect
- Requires user engagement to confirm
- Complex maturity calculation logic

## Verification / Enforcement

- **Test**: New learning proposal → maturity = 0 → no ranking impact
- **Test**: Confirm proposal → maturity increases → ranking impact measurable
- **Test**: Reject proposal → maturity unchanged → no ranking impact
- **Test**: Maturity decay over time without reinforcement
- **UI**: Learning page shows maturity level per proposal
- **API**: `/learning/derived` returns maturity with each proposal