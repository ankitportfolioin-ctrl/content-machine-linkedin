---
name: prototype-demo-seeding
description: Use when creating or changing demo/seed data for the runnable prototype. Seed data must go through the real database, never the frontend.
---
## Rules
- Seed through the real DB using the repo's existing seed mechanism (check package.json).
- No hardcoded demo data in frontend code or API responses.
- Seed data must be plainly demo data, never realistic-looking fabricated engagement, revenue, or testimonials.
- Seeds must be idempotent and workspace-scoped.
- Seed only records the domain model actually supports. Do not add fake LinkedIn connection or "sent" states.
## Output
Show the seed command, its actual output, and a read-only DB query proving the rows exist.
