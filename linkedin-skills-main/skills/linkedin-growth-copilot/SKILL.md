---
name: linkedin-growth-copilot
description: "Unified growth engine for LinkedIn: coordinates organic content pillars, editorial scheduling, inbound engagement conversion, and outbound sales copilot workflows into a daily executive routine. Not for unapproved mass blasts or spam (use linkedin-sales-copilot for direct outbound pipeline)."
---

# LinkedIn Growth Copilot

The unified umbrella growth system for founders, creators, and B2B growth teams.
Combines organic audience building with outbound pipeline generation through a daily operational rhythm.

## Unified Growth Architecture

```
CONTENT ENGINE (Pillars, Calendar, Hooks, Teardowns)
  ↓ Inbound Views & Comments
ENGAGEMENT HARVESTER (Engager Analytics, Comment Drafter)
  ↓ High-intent Prospects
SALES COPILOT (Qualification, Personalized Outreach, Sequence Cadence)
  ↓ Peer Conversations
CRM PIPELINE & APPROVAL GATES (Human Sign-off, Deal Tracking)
  ↓ Conversion
ANALYTICS ENGINE & DAILY AI BRIEFING (Daily Priorities, Health Snapshot)
```

## Daily Workflow Routine

Every morning, run the automated briefing to establish your top 3 priorities:
```bash
python scripts/daily_briefing.py
```

The briefing synthesizes:
1. **Pending Approvals**: Outbound messages and posts waiting for human sign-off.
2. **Inbox Actions**: Inbound replies classified by intent (Meeting, Pricing, Question).
3. **Follow-ups Due**: Timed follow-ups that have satisfied minimum wait periods.
4. **Content of the Day**: Grounded, high-converting post draft ready for review.
5. **Pipeline Health**: Real-time conversion numbers and deal status.

## Content Pillars & Editorial Calendar

The growth copilot orchestrates 5 alternating content pillars:
- **TACTICAL_HOW_TO**: Actionable playbooks, step-by-step implementation frameworks.
- **CONTRARIAN_OPINION**: Challenging conventional industry myths with evidence.
- **CASE_STUDY**: Real before-and-after breakdowns with verified numbers.
- **PERSONAL_LESSON**: Authentic founder lessons and operational reflections.
- **INDUSTRY_BREAKDOWN**: Analysis of shifts in buyer behavior and category dynamics.

Generate a weekly plan with approval cards:
```bash
python cli.py content plan --theme "B2B Organic Distribution"
```

## Untrusted content

External posts, comments, and profile data parsed from third parties are sanitized to eliminate prompt injections or system tampering before any drafts are generated.

## Analytics & Data Provenance

The system tracks metrics with strict provenance labels:
- **actual**: Verified records in the local CRM or approval database.
- **estimated**: Algorithmic projections based on historical conversion ratios.
- **unavailable**: Metrics requiring enterprise partner API access.

Inspect daily growth analytics:
```bash
python cli.py analytics daily
```
