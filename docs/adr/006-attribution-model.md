# ADR 006: Attribution Model

**Status**: Accepted
**Date**: 2026-09-30

## Context

When content generates business outcomes (leads, conversations, revenue), the system must attribute those outcomes to the specific content, topics, angles, and decisions that produced them. This enables learning and recommendation improvement.

## Decision

### Attribution Chain
```
ContentVersion Published
       ↓
PublishRecord Created (links ContentVersion → OutcomeMetric)
       ↓
OutcomeMetric Recorded (lead, conversation, revenue, etc.)
       ↓
AttributionLink Created (workspace, contentVersionId, outcomeMetricId, weight)
       ↓
Daily Run → Attribution Stage → Aggregates AttributionLinks
       ↓
Attribution Score Per ContentVersion/Topic/Angle
       ↓
Feeds Into RecommendationEngine.attributionScore
```

### AttributionLink (Schema)
- `workspaceId` — isolation
- `contentVersionId` — what content
- `outcomeMetricId` — what outcome
- `weight` — 0.0 to 1.0, how much this content contributed
- `attributionType` — DIRECT, INFLUENCED, ASSISTED
- `createdAt` — when link created

### Attribution Score Calculation
- Sum of weights for each content version / topic / angle
- Time-decay: recent outcomes weighted higher
- Normalized per workspace to 0-1 scale
- Feeds into `RecommendationEngine` as `attributionScore` factor

## Consequences

### Positive
- Quantifies content ROI
- Drives learning: high-attribution patterns recommended more
- Audit trail: every outcome traced to content
- Workspace-isolated

### Negative
- Requires manual outcome entry (no LinkedIn webhook)
- Weight assignment subjective
- AttributionLink table grows large

## Verification / Enforcement

- **Test**: Publish content → record outcome → create attribution → score > 0
- **Test**: Attribution score influences recommendation ranking
- **Test**: Workspace isolation — attribution links not cross-workspace
- **Test**: Time decay — older outcomes weigh less
- **Schema**: `AttributionLink` has all required fields + indexes
- **API**: `/attribution` endpoints return scores per content/topic/angle