# ADR 002: Human Approval Boundary

**Status**: Accepted
**Date**: 2026-09-30

## Context

Growth Operator generates content, outreach, and sales actions. All consequential actions must have explicit human approval before execution. The system must enforce this at the API and database layer, not just the UI.

## Decision

### Approval Flow
```
Content/Outreach/Action Created
       ↓
   Review Requested
       ↓
Human Reviews (Approve/Reject/Changes Requested)
       ↓
If Approved → ApprovalSnapshot Captured (frozen state)
       ↓
Daily Run → Execution Stage → Checks ApprovalSnapshot
       ↓
Only Approved Items → PreparedAction (READY_FOR_AUTHORIZED_EXECUTION)
```

### ApprovalSnapshot Design (Phase 14)
- One row per daily run per workspace (upsert)
- `items` JSON stores **plain copied values**: ids, scores, reasons, version identifiers
- **Never live references** — later human decisions cannot silently rewrite what the run saw
- Captured at snapshot time via `capturedAt` timestamp
- Resume logic skips SUCCEEDED stages, so snapshot written once per run

### Enforcement Points
1. **API Layer**: `POST /content-reviews`, `POST /outreach-reviews` require human action
2. **Worker Stage**: Execution stage reads `ApprovalSnapshot`, filters to approved only
3. **Database**: `PreparedAction.status` enum has no "EXECUTED" or "SENT" — only `READY_FOR_AUTHORIZED_EXECUTION`, `BLOCKED`, `EXPIRED`, `REQUIRES_APPROVAL`

## Consequences

### Positive
- Human always in control of consequential actions
- Audit trail of what was approved when
- Resume-safe: re-running daily run doesn't re-approve
- Cannot bypass via API — worker enforces snapshot

### Negative
- Adds latency (human review required)
- Snapshot storage grows over time
- Complex resume logic needed

## Verification / Enforcement

- **Test**: Create content → request review → approve → verify snapshot captures exact item state
- **Test**: Modify content after approval → verify snapshot unchanged
- **Test**: Daily run execution stage only processes approved items from snapshot
- **Test**: No path creates PreparedAction without approval snapshot reference
- **Schema**: `PreparedActionStatus` enum lacks "SENT"/"EXECUTED" values