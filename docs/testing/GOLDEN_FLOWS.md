# Golden Workflows — Critical Flows That Must Never Break

These are the protection targets for regression testing. They represent the critical user journeys that future changes must preserve.

**NOTICE**: These are protection targets, not claims that every flow is currently passing. Status is tracked in REGRESSION_MATRIX.md.

---

## Authentication

### AUTH-001: Register → Login → Session → Authenticated API
**Flow**: User registers → logs in → receives JWT → authenticated API calls work
**Protected Behavior**:
- `POST /api/v1/auth/register` → 201 with user
- `POST /api/v1/auth/login` → 200 with access token
- `GET /api/v1/auth/me` → 200 with user (with valid token)
- `GET /api/v1/auth/me` → 401 (without token)
- Token refresh works before expiry

### AUTH-002: Expired/Invalid Session → Safe Unauthenticated State
**Flow**: Token expires or is invalid → frontend handles gracefully → redirects to login
**Protected Behavior**:
- Expired token → 401 (not 500)
- Invalid token → 401 (not 500)
- Malformed token → 401 (not 500)
- Frontend clears auth state on 401
- No 500 errors for any auth failure

### AUTH-003: Cross-Workspace Access → Denied
**Flow**: User in Workspace A tries to access Workspace B data
**Protected Behavior**:
- `GET /api/v1/workspaces` returns only user's workspaces
- `GET /api/v1/...?workspaceId=B` → 403 if not member
- `X-Workspace-ID: B` header → 403 if not member
- No data leakage in any response

---

## Onboarding

### ONBOARD-001: Fresh User → Workspace → Profile → ICP → Objectives → Feeds → Leads → Policy → Schedule
**Flow**: Complete onboarding through actual UI (no curl, no manual DB)
**Protected Behavior**:
- Fresh user (0 workspaces) → creates workspace → succeeds
- Profile step → saves LinkedIn URL, headline, role → persists
- ICP step → creates at least one ICP → persists all fields
- Objectives step → sets business goals → persists
- Feeds step → adds at least one feed source → ingestion works
- Leads step → imports CSV or adds manually → research runs
- Policy step → sets autonomy tier, caps → persists
- Schedule step → sets daily run time → daily run triggers
- **No 500 errors at any step**
- **All empty states handled** (NOT_CONFIGURED, [], INSUFFICIENT_DATA)

---

## Intelligence

### INTEL-001: Source → Ingestion → Normalization → Dedup → Provenance → Signal
**Flow**: Feed source added → daily run ingests → sources stored with provenance
**Protected Behavior**:
- RSS/Atom/HN/GitHub feed → fetched → parsed → normalized
- Canonical URL dedup prevents duplicates
- Content hash dedup prevents re-processing
- SourceDocument stores raw + clean content
- SourceClaim extracts claims with evidence
- TopicMention links topics with strength scores
- TrendSignal calculated from mentions

### INTEL-002: HN/GitHub → Actual Adapter → Stored Intelligence
**Flow**: HN/GitHub feed source → adapter executes → sources in DB
**Protected Behavior**:
- HN adapter makes real HTTP request to HN API
- GitHub adapter makes real HTTP request to GitHub API
- Sources stored in `IntelligenceSource` table
- Documents stored in `SourceDocument` table
- Claims stored in `SourceClaim` table
- Not mocked in integration tests

---

## Decision

### DECISION-001: Objective → Score → Recommendation
**Flow**: User sets objective → decision engine scores opportunities → recommendations returned
**Protected Behavior**:
- Objective created via API
- `decisionContext` builds context (objectives, ICPs, audience, signals)
- `recommendationEngine` scores ContentOpportunities
- Top-N recommendations returned via API
- Scores explainable (breakdown available)

### DECISION-002: Attribution → Recommendation Score
**Flow**: High-attribution content → higher recommendation scores for similar patterns
**Protected Behavior**:
- AttributionLink created for outcomes
- Attribution score calculated per topic/angle/format
- RecommendationEngine reads attribution scores
- High attribution → boosts similar opportunities

### DECISION-003: Learning → Recommendation Score
**Flow**: Confirmed learning (maturity ≥ threshold) → boosts matching recommendations
**Protected Behavior**:
- LearningProposal confirmed by user
- Maturity calculated and ≥ 0.7 threshold
- DecisionContext reads mature learning signals
- RecommendationEngine applies learningBoost

### DECISION-004: Audience/Sales Signal → Recommendation
**Flow**: Audience problem/sales signal → relevant content opportunities surfaced
**Protected Behavior**:
- AudienceSignal created from research
- ProspectSignal created from sales activity
- DecisionContext includes both signal types
- Recommendations reference source signals

---

## Content

### CONTENT-001: Opportunity → Idea → Plan → Draft → Review → Approval → Final → Record → DNA → Analytics
**Flow**: Full content lifecycle from opportunity to analytics
**Protected Behavior**:
- ContentOpportunity → ContentIdea (author, title, angle)
- ContentIdea → ContentPlan (objective, angle, format, narrative, evidence)
- ContentPlan → ContentDraft (body, structure, version)
- ContentDraft → ContentReview (requested, reviewed, approved)
- Approved → ContentVersion (isFinal=true)
- PublishRecord created on publish
- ContentDNA extracted from final version
- OutcomeMetric linked via PublishRecord

---

## Sales

### SALES-001: Lead Import → Research → Qualification → Scoring → Relevant Content → Strategy → Draft → Approval → Prepared Action
**Flow**: Full sales pipeline from lead to prepared action
**Protected Behavior**:
- Lead imported (CSV or manual)
- ProspectResearch runs (company, role, signals)
- QualificationResult scores fit
- RelevantContent finds matching content
- OutreachStrategy generated
- OutreachDraft created
- OutreachReview approves
- PreparedAction created (READY_FOR_AUTHORIZED_EXECUTION)
- **Never** transitions to "sent" state

---

## Learning

### LEARNING-001: Outcome → Proposal → User Confirmation → Maturity → Next Recommendation Impact
**Flow**: Outcome observed → learning proposed → user confirms → affects future recommendations
**Protected Behavior**:
- OutcomeMetric recorded
- LearningProposal created (PROPOSED)
- User sees proposal in Learning page
- User confirms → CONFIRMED
- Maturity increases for signal type
- Next recommendation includes learningBoost
- Rejected proposal → no maturity increase → no impact

---

## Safety

### SAFETY-001: No Unauthorized LinkedIn Execution
**Protected Behavior**:
- No code path calls LinkedIn API
- No browser automation for LinkedIn
- PreparedAction status never "sent"
- Execution cap = 0 enforced

### SAFETY-002: Execution Cap Remains Zero/Unavailable Without Integration
**Protected Behavior**:
- `WorkspaceSettings.dailyExecutionCap` default 0
- No UI to change cap
- No API to change cap
- Worker execution stage no-ops when cap = 0
- Tests verify cap=0 behavior