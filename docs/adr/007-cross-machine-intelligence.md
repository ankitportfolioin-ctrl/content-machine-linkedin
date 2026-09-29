# ADR 007: Cross-Machine Intelligence

**Status**: Accepted
**Date**: 2026-09-30

## Context

Growth Operator has multiple "machines" (Intelligence, Decision, Content, Sales, Learning) that must interoperate. Each machine produces data that other machines consume. Broken bridges (producer without consumer, consumer without producer) are a recurring failure mode.

## Decision

### Bridge Contract
Every cross-machine bridge MUST have:
```
Producer (Machine A)
    → Persistence (Database)
    → Reader (Service/Repository)
    → Consumer (Machine B)
    → Observable Outcome (Testable)
```

### Current Bridges

| Producer | Persistence | Reader | Consumer | Outcome |
|----------|-------------|--------|----------|---------|
| Intelligence | IntelligenceSource, SourceDocument, SourceClaim, Topic, TrendSignal | intelligenceService | Decision | Trend signals → opportunity scoring |
| Intelligence | TopicMention | topicService | Content | Topics → content ideas |
| Sales | ProspectResearch, ProspectSignal, QualificationResult | salesService | Content | Qualified prospects → relevant content |
| Sales | OutreachStrategy, OutreachDraft | salesService | Decision | Outreach context → recommendation |
| Content | ContentDNA, ContentStageHistory | contentService | Learning | Performance → learning signals |
| Learning | LearningSignal, LearningProposal | learningService | Decision | Mature learning → recommendation boost |
| Decision | Recommendation, Attribution | decisionService | Content/Sales | Prioritized opportunities → content/sales work |

### Enforcement Rules
1. **No Dead-End Producers**: Every write path must have a documented consumer
2. **No Orphan Consumers**: Every read path must have a documented producer
3. **Integration Tests**: Each bridge has at least one integration test
4. **Schema Documentation**: Cross-machine relations documented in Prisma schema comments

## Consequences

### Positive
- Prevents "feature complete" claims for isolated producers
- Forces end-to-end thinking
- Testable integration points
- Clear ownership of data flows

### Negative
- More upfront design required
- Cross-package coordination needed
- Integration test complexity

## Verification / Enforcement

- **Production Audit Skill**: Scans for write-without-reader, reader-without-writer
- **Test**: Each bridge has integration test (producer → consumer → outcome)
- **Code Review**: New models must declare intended consumers
- **Schema**: Cross-machine relations have comments linking to consumer
- **Documentation**: This ADR updated when bridges added/removed