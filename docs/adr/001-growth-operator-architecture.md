# ADR 001: Growth Operator Overall Architecture

**Status**: Accepted
**Date**: 2026-09-30

## Context

Growth Operator is a human-guided AI operating system for LinkedIn growth. It needs to:
- Manage users, workspaces, and authentication
- Generate content ideas, drafts, and versions
- Track leads, conversations, and sales pipeline
- Ingest intelligence from feeds (HN, GitHub, RSS)
- Learn from outcomes and improve recommendations
- Enforce human approval for all consequential actions
- Never execute LinkedIn actions without authorized integration

## Decision

### Monorepo Structure
```
apps/
  web/          # React + Vite + TypeScript frontend
  api/          # Node.js + Express + TypeScript backend
packages/
  db/           # Prisma database layer (PostgreSQL)
  ai/           # AI provider abstraction (OpenRouter, Anthropic, OpenAI)
  schemas/      # Shared Zod validation schemas
  shared/       # Shared utilities and types
  intelligence/ # Feed ingestion, source extraction, signals
  decision/     # Recommendation engine, scoring, attribution
  content/      # Content machine, DNA, quality gates
  sales/        # Sales machine, qualification, outreach
  learning/     # Learning signals, maturity, proposals
```

### Technology Choices
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 17 via Prisma ORM
- **API**: Express.js with REST endpoints under `/api/v1`
- **Frontend**: React 18 + React Router v6 + Vite
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Auth**: JWT with bcrypt password hashing (12 rounds)
- **Workspace Isolation**: Enforced at DB query level + API middleware

### Key Architectural Principles

1. **Workspace Isolation First**: Every query filters by `workspaceId`. No cross-workspace data access.

2. **Human-in-the-Loop**: No consequential action executes without explicit human approval. Approval snapshots freeze state at decision time.

3. **Execution Boundary**: LinkedIn execution cap = 0. Prepared actions remain `READY_FOR_AUTHORIZED_EXECUTION` forever unless authorized integration exists.

4. **Data Honesty**: Never invent metrics. Use `UNKNOWN`, `UNAVAILABLE`, `INSUFFICIENT_DATA` when evidence missing.

5. **Producer → Consumer Chains**: Every bridge must have producer → persistence → reader → consumer → observable outcome.

6. **Fresh User Safety**: Zero-workspace users must complete onboarding through UI without 500 errors.

## Consequences

### Positive
- Clear separation of concerns across packages
- Workspace isolation prevents data leaks
- Human approval boundary protects users
- No fake execution possible
- Type safety across API boundary via shared schemas

### Negative
- More packages to maintain
- Cross-package changes require coordinated updates
- Prisma client regeneration needed after schema changes
- Test setup complexity for integration tests

## Verification / Enforcement

- **Workspace Isolation**: `workspace-isolation-review` skill checks every query/route
- **Approval Boundary**: Tests verify approval snapshot captures frozen state
- **Execution Boundary**: `dailyExecutionCap` default 0 in schema; tests verify no "sent" state
- **Data Honesty**: `no-fabrication-check` skill on content generation/analytics
- **Fresh User**: E2E test registers user → completes onboarding without 500
- **Schema Sync**: `pnpm db:generate` + `pnpm db:migrate status` in CI