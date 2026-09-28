---
name: workspace-isolation-review
description: Use when adding or reviewing any query, service, or API route. Checks that all data access is scoped by workspaceId and nothing leaks across workspaces.
---
## Checklist
- Every DB query filters by workspaceId (reads, updates, deletes).
- Every API route derives workspaceId from the authenticated context, never only from a client-supplied field.
- Joins do not pull rows from other workspaces.
- Learning, feedback, voice, signals, leads, content, and recommendations are all workspace-scoped.
- There is at least one test proving workspace A cannot read or affect workspace B.
## Output
List each file checked, PASS/FAIL per item, with file path and line evidence. If not checked, say "NOT CHECKED".
