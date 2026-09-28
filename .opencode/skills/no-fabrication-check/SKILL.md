---
name: no-fabrication-check
description: Use when touching content generation, analytics, prospect data, or UI that shows metrics. Enforces "no evidence, no claim" and honest unavailable states.
---
## Rules
- Never invent statistics, engagement, revenue, testimonials, prospects, case studies, or social proof.
- Missing data must surface as UNAVAILABLE, INSUFFICIENT_DATA, or SOURCE_REVIEW_REQUIRED, never plausible filler.
- Known, Inferred, and Unknown must stay distinct. Inference is never shown as fact.
- Critical quality failures override numeric scores (unverifiable source = NOT READY).
- Prepared outreach is never labeled "sent". The final prepared state is READY_FOR_AUTHORIZED_EXECUTION.
- Every displayed metric must trace to a recorded value.
## Output
List violations with file path and evidence, or "none found" plus what was actually searched.
