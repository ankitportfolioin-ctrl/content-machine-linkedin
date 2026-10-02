# Content Brain Redesign - Component Mapping

## CURRENT COMPONENT → REQUIRED ROLE → CHANGE REQUIRED

| Current Component | Required Role | Change Required |
|-------------------|---------------|-----------------|
| `FeedSource` (RSS, ATOM, HACKERNEWS, GITHUB_RELEASES, BLOG, SITE) | Tier 1 Core Research Sources | **EXTEND**: Add Reddit, YouTube, Google Trends, LinkedIn, X connectors; promote Instagram/TikTok to optional Tier 2 |
| `SourceIngestionService` | Universal connector normalization | **EXTEND**: Add unified `ResearchSignal` interface; maintain provenance |
| `SourceUnderstandingService` | AI Understanding Layer | **EXTEND**: Extract topic, subtopics, audience, problem, question, intent, format, hook, angle, novelty, trend relevance, business relevance, content relevance, evidence quality |
| `TopicClusteringService` | Topic Engine | **EXTEND**: Cluster signals around topics with source lineage |
| `TrendSignalService` | Trend Engine | **EXTEND**: Multi-source trend detection (recency, multiple sources, search growth, conversation growth, relevance, source confidence, content velocity) |
| `ContentGapService` | Content Gap Engine | **EXTEND**: Identify gaps between audience wants + discussed content + existing content + YFP published |
| `ContentOpportunityService` | Content Opportunity Engine | **EXTEND**: Structured opportunities with evidence, scoring, audience relevance, business relevance |
| `Decision Engine` (OperatorActionService) | Decision Engine | **KEEP**: Already exists, feed opportunities into it |
| `ContentMachine` (ContentPlanService, DraftComposer) | Content Generation | **KEEP**: Already exists, consume opportunities |
| `SocialConnection` (YouTube, Instagram, Facebook, LinkedIn, X) | Tier 1/2 Connectors | **EXTEND**: Add Reddit, Google Trends, YouTube (already exists), promote Instagram/TikTok to optional Tier 2 |
| `FeedSource` (RSS, ATOM, HACKERNEWS, GITHUB_RELEASES, BLOG, SITE) | Research Sources | **EXTEND**: Add Reddit, YouTube, Google Trends, X; promote Instagram/TikTok to optional Tier 2 |
| `LearningDerivationService` | Learning Engine | **KEEP**: Already exists, extend with content performance feedback |
| `BrainPage.tsx` | Content Brain UI | **EXTEND**: Show connector status, research signals, topics, trends, gaps, opportunities |

---

## IMPLEMENTATION ORDER

### STEP 1 — Repository audit ✓ COMPLETE

### STEP 2 — Connector architecture
- Implement/adapt unified connector boundaries
- Start with: Reddit, YouTube, Google Trends, LinkedIn, X
- Then support: Instagram, TikTok as optional Tier 2

### STEP 3 — Normalization
- Ensure all sources converge into unified `ResearchSignal` structure

### STEP 4 — Intelligence
- Implement topic detection, trend detection, problem detection, content gap detection

### STEP 5 — Opportunity generation
- Convert intelligence into structured Content Opportunities

### STEP 6 — Decision integration
- Feed opportunities into existing Decision Engine

### STEP 7 — Content Machine integration
- Ensure opportunities flow into existing content generation

### STEP 8 — Lineage
- Ensure every generated post traces back to opportunity → signal → source → evidence

### STEP 9 — Learning
- Ensure published content performance feeds learning → opportunity ranking

### STEP 10 — UI
- Minimum UI changes to expose redesigned Brain

### STEP 11 — Browser verification

### STEP 12 — Regression