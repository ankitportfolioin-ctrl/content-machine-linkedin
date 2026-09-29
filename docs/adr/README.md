# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Growth Operator project. Each ADR documents a significant architectural decision, its context, and consequences.

## ADR Index

| ADR | Title | Status |
|-----|-------|--------|
| 001 | Growth Operator Overall Architecture | Accepted |
| 002 | Human Approval Boundary | Accepted |
| 003 | LinkedIn Execution Boundary | Accepted |
| 004 | Workspace Isolation | Accepted |
| 005 | Learning Maturity Gates | Accepted |
| 006 | Attribution Model | Accepted |
| 007 | Cross-Machine Intelligence | Accepted |

## ADR Format

Each ADR follows this structure:

- **Status**: Proposed / Accepted / Superseded / Deprecated
- **Context**: What problem are we solving?
- **Decision**: What did we decide?
- **Consequences**: What are the trade-offs?
- **Verification / Enforcement**: How do we ensure compliance?

## Creating New ADRs

1. Copy `template.md` (if exists) or create new file as `NNN-title.md`
2. Fill in all sections
3. Link from this README
4. Reference in relevant code/comments