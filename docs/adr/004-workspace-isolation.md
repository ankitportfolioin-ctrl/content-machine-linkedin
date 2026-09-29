# ADR 004: Workspace Isolation

**Status**: Accepted
**Date**: 2026-09-30

## Context

Growth Operator is multi-tenant. Each workspace must be completely isolated — no data leakage between workspaces under any circumstances.

## Decision

### Enforcement Layers

1. **Database Layer (Prisma)**
   - Every model has `workspaceId` field (except `User` which is global)
   - All relations cascade delete on workspace
   - `@@index([workspaceId])` on every model
   - Unique constraints include `workspaceId` where needed

2. **API Layer (Middleware)**
   - `authMiddleware` resolves `workspaceId` from authenticated context
   - `X-Workspace-ID` header accepted but validated against user's memberships
   - All routes under `/api/v1/*` require workspace context

3. **Query Layer (Services/Repositories)**
   - Every `prisma.model.findMany()` includes `where: { workspaceId }`
   - Every `update`/`delete` includes `where: { workspaceId, id }`
   - Joins never pull from other workspaces (enforced by `workspaceId` on all models)

4. **Frontend Layer**
   - `WorkspaceSelector` sets active workspace in context
   - All API calls include `X-Workspace-ID` header
   - No cross-workspace UI navigation

### Membership Model
- `WorkspaceMembership` links `User` ↔ `Workspace` with `UserRole`
- User can belong to multiple workspaces
- Active workspace derived from context, never assumed

## Consequences

### Positive
- Strong data isolation guarantee
- Clear audit trail per workspace
- Supports multi-workspace users (agencies, freelancers)
- Cascade delete simplifies workspace removal

### Negative
- Every query must include workspaceId (boilerplate)
- Cross-workspace analytics require explicit aggregation service
- Membership management adds complexity

## Verification / Enforcement

- **Skill**: `workspace-isolation-review` — checks every query/route
- **Test**: Workspace A cannot read Workspace B data (at least one test)
- **Test**: Workspace A cannot update Workspace B data
- **Test**: Workspace A cannot delete Workspace B data
- **Code Review**: Every Prisma query audited for `workspaceId` filter
- **Middleware Test**: Invalid `X-Workspace-ID` returns 403
- **Schema**: All models (except User) have `workspaceId` field