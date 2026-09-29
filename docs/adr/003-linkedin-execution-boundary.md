# ADR 003: LinkedIn Execution Boundary

**Status**: Accepted
**Date**: 2026-09-30

## Context

Growth Operator prepares LinkedIn content, connection requests, and messages. However, no authorized LinkedIn API integration exists. The system must never execute or simulate execution of LinkedIn actions.

## Decision

### Hard Constraints (Never Violate)

1. **Execution Cap = 0**
   - `WorkspaceSettings.dailyExecutionCap` defaults to 0
   - No UI to increase this cap
   - No API endpoint to increase this cap

2. **No "Sent" State**
   - `PreparedActionStatus` enum: `READY_FOR_AUTHORIZED_EXECUTION`, `BLOCKED`, `EXPIRED`, `REQUIRES_APPROVAL`
   - **No** `SENT`, `EXECUTED`, `DELIVERED`, `PUBLISHED` values
   - Prepared actions remain in `READY_FOR_AUTHORIZED_EXECUTION` indefinitely

3. **No LinkedIn Automation Code**
   - No HTTP calls to LinkedIn APIs
   - No browser automation (Playwright, Selenium, etc.) for LinkedIn
   - No LinkedIn OAuth flow implementation
   - No scraping of LinkedIn pages

4. **Test/Demo Data Rules**
   - Tests must not create "sent" states
   - Demo seeding must not create fake LinkedIn message IDs
   - `no-fabrication-check` skill enforces this

### What IS Allowed
- Preparing content/drafts for human to copy-paste
- Generating connection note text for human to send manually
- Creating outreach drafts for human review
- Tracking human-reported outcomes manually entered

## Consequences

### Positive
- Zero risk of unauthorized LinkedIn API usage
- Clear boundary: system prepares, human executes
- No ToS violation risk
- No need for LinkedIn partnership/approval

### Negative
- Human must manually execute every action
- No automated posting/scheduling
- Manual outcome tracking required

## Verification / Enforcement

- **Schema**: `dailyExecutionCap` default 0 in `WorkspaceSettings`
- **Schema**: `PreparedActionStatus` enum lacks execution-complete states
- **Test**: Worker execution stage is no-op when cap = 0
- **Test**: No PreparedAction ever transitions to "sent" state
- **Skill**: `no-fabrication-check` catches fake execution claims
- **Skill**: `prototype-demo-seeding` forbids fake LinkedIn data in seeds
- **Code Search**: Grep for "linkedin" + "api"/"post"/"send" → must return zero results in production code