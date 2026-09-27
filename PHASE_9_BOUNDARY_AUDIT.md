# PHASE 9 BOUNDARY AUDIT

Audit only. No product code modified, no tests added, no migrations, no dependencies, no commit,
no push, Phase 10 not started. Prior reports treated as evidence, never authority — material claims
below were re-verified against code, schema, routes, UI, or fresh test/typecheck/build runs in this pass.

## 1. Starting checkpoint

- `git status --short`: empty (clean) at audit start.
- `git log -1`: `7efdfee phase 8: complete cross-machine recommendations`, parent `a03067d`.
- Phase 8 status: ACCEPTED WITH UNVERIFIED ITEMS. Proceeding.

## 2. Repository state

HEAD is the Phase 8 commit; working tree clean; 45 Prisma models across 6 in-sync migrations;
11 decision collectors; 5 Phase 7/8 cross-machine read endpoints plus the operator/explanation
surface; 9 web pages; single AI registry with guarded call sites; nothing outbound (no LinkedIn,
senders, queues, workers, schedulers — grep-verified standing state, unchanged by Phases 7–8).

## 3. Architecture

```
apps/web (React 18 + Router v6, fetch client; Home/Content/Brain/Leads/Inbox/Pipeline/Analytics/Settings)
  → apps/api (Express · JWT + workspace triple-middleware · Zod · typed error codes;
      operator/content*/sales-intelligence/intelligence/learning/prospect/outreach/pipeline routes)
    → packages/decision (11 collectors / eligibility exhaustive-switch / deterministic 0–100 scorer /
        explainer / OperatorAction refresh + dismiss/complete)
    → packages/content (idea → plan → draft → gates → review → approval → immutable final → preview)
    → packages/sales (ICP → discovery → research → qualification → scoring → brief → strategy →
        compose → gates → review → prepared action → classify → follow-up → pipeline + objections/relevance)
    → packages/intelligence (ingest → extract → claims → topics/mentions → trends/gaps/opportunities +
        learning-adjusted scoring view)
    → packages/learning (publish/outcome record → aggregation → derivation → PROPOSED lifecycle →
        confirm/revoke → qualification + opportunity + ranking influence; zero AI calls)
    → packages/ai (OpenAI + Anthropic; honest AI_UNAVAILABLE) → packages/db (PostgreSQL 17) + shared + schemas
```

## 4. Capability matrix

CONTENT: idea creation (manual, ungated, status defaults draft) IMPLEMENTED; source/research/
evidence/contradictions/audience-ICP/voice/strategy/hooks/composition/gates/review/approval/immutable
final/preview/publication/outcome-recording IMPLEMENTED; performance analytics (summary + rate pairs)
IMPLEMENTED; content learning (outcome rules → proposals → opportunity scoring) ACTIVE; content
recommendations (no consumer for confirmed learning in creation choices) MISSING; visual planning
MISSING (zero references in code or UI).
SALES: ICP/discovery(manual)/research/qualification/scoring/personalization/drafting/review/approval/
prepared-actions/inbox/follow-up/pipeline/outcomes IMPLEMENTED; sales learning (no sales-specific
rules) PARTIAL; sales recommendations (relevance actions exist; no workflow initiation) PARTIAL;
external execution intentionally MISSING.
INTELLIGENCE: ingestion/extraction/claims/evidence/contradictions/topics/mentions/trends/gaps/
opportunities/feedback/diversity/scoring/explanations IMPLEMENTED; research discovery MISSING
(caller-supplied URLs only — route code unchanged since Phase 7); topic→prospect relevance computed
ACTIVE, consumed only by operator actions; objection patterns computed ACTIVE, consumed only by
operator actions; intelligence→operator actions ACTIVE (11 collectors).
DECISION: collectors (11 kinds) / eligibility / scoring / explanation / dedup / lifecycle / Home /
Brain explanations / cross-machine recommendations all IMPLEMENTED. No collector kind for initiating
workflows — actions are read-only pointers.
LEARNING: recording/aggregation/derivation/lifecycle/confirm/revoke IMPLEMENTED; qualification +
opportunity + ranking influence ACTIVE; content/sales-strategy influence MISSING; workspace-scoped,
bounded (±0.2), provenance-carrying VERIFIED unchanged.
ANALYTICS: raw events (record/list only — `AnalyticsEvent` has no readers; verified again this pass:
only `analytics.ts` references it) and `LearningSignal` (only `learning.ts`) are WRITE-ONLY;
OutcomeMetric consumed by learning + summary; defined-pair rates + honest empty states IMPLEMENTED;
funnels/cohorts/attribution/content→lead/lead→opportunity joins/recommendation-performance MISSING.
EXTERNAL: LinkedIn auth/identity/data/publishing/messaging, platform analytics, external discovery —
all MISSING (intentional; prerequisites absent). INFRASTRUCTURE: workers/queues/schedulers/retries/
notifications MISSING (intentional; synchronous workload, suites run in seconds).

## 5. End-to-end flows

- FLOW A (idea→…→outcome→learning→recommendation): IMPLEMENTED except research caller-supplied and
  no content-creation recommendation consumer.
- FLOW B (prospect→…→pipeline→outcome→learning→recommendation): IMPLEMENTED except manual discovery
  and intentional non-execution.
- FLOW C (source→…→opportunity→action→human decision): IMPLEMENTED.
- FLOW D (objection→pattern→recommendation→content workflow): PARTIAL — stops at advice text. The
  action says "create a content idea via Content (manual)"; the user must navigate away, retype the
  objection, and the system never links action to idea. **This is the precise dead end.**
- FLOW E (topic→relevance→recommendation→sales workflow): PARTIAL — stops at "review the prospect
  in Leads" (one click via Open, but no deeper use; `relevantContentId` uncomputed).
- FLOW F (outcome→proposal→confirm→influence): IMPLEMENTED and live-tested.

## 6. Bottlenecks

After Phase 8 the binding constraint is no longer visibility (Home shows 11 ranked kinds) but
**actuation linkage**: recommendations cannot spawn the workflows they recommend, so (a) operators
retype context across pages, and (b) the system cannot tell which recommendations produced work —
"Outcomes → future recommendations" and "recommendation performance" stay partial forever. Candidate
bottleneck answers: (1) missing capability — human-initiated, provenance-linked workflow initiation
from actions; (2) data already produced — objection patterns with quotes/conversation ids; (3)
consumers — none, actions are terminal pointers; (4) smallest safe transformation — one explicit
POST that validates action + eligibility and creates a DRAFT-status idea prefilled from recorded
evidence; (5–6) no new model/migration — `ContentIdea` exists, linkage fits `subjectMeta` Json;
(7–9) no credentials/AI/workers; (10) no autonomy — explicit click only; (11–13) deterministic,
existing rails, locally testable; (14) completes Flow D end-to-end (…→publish→outcome→learning).

## 7. Cross-machine matrix

Objections→opportunities DEAD END (patterns never reach generation; unchanged). Objections→strategy
MISSING (strategy takes no sales input; verified). Topics→relevance ACTIVE computation, PARTIAL use
(actions only). Engagement→prioritization MISSING (no model). Relevant content→outreach PARTIAL
(validated optional field, nothing computes it). Research→content/sales PARTIAL (mutually readable,
`toContentInput` uncalled). Content performance→learning ACTIVE (outcome rules → scoring). Sales
outcomes→learning PARTIAL (generic derivation only). Learning→qualification/scoring/ranking ACTIVE.
Learning→content recommendations MISSING. Intelligence→actions ACTIVE (11 kinds). Actions→workflow
completion DEAD END (**new finding of this audit — the Phase 9 target**). Outcomes→recommendations
PARTIAL.

## 8. Decision Engine audit

All 11 collectors recorded with source/eligibility/score/provenance/identity/lifecycle/destination/
gate (detail in working notes; pattern uniform). Verdict: a coherent operator layer, not a generic
list — shared scorer/explainer/lifecycle with kind-specific rules. The one architectural gap is
terminality: candidates can only be dismissed/completed, never acted upon in-system. No redesign
needed; the gap is a missing (small, explicit) transition, not a structural flaw.

## 9. Learning audit

Behavior-changing consumers: qualification scoring, opportunity scoring, decision boost — all
confirmed-only and bounded. Stored-but-inert: proposals awaiting confirmation (by design),
`LearningSignal` rows (no readers). Largest dead ends: content-creation choices and sales strategy
ignore confirmed learning. Explicitly NOT selected for Phase 9: no consumer shape exists for them
yet, and inventing one is lower-leverage than closing the already-shaped Flow D loop.

## 10. Analytics audit

`OutcomeMetric`: written via outcomes API, read by aggregation/derivation/contentOutcome/summary —
meaningfully consumed. `AnalyticsEvent`/`LearningSignal`: written, never read — dormant by design
carve-out; NOT recommended for consumption (no producers in UI, no question they answer — the
analytics-deepening trap). Analytics produce decisions only via the learning loop, otherwise honest
reports. No dashboard recommended.

## 11. UX audit

Users can: work ranked actions (Open/dismiss/"Mark done"), explain any action, run full content and
sales workflows, record outcomes, confirm learning. Invisible backend: objection/relevance endpoints
(API-only), dormant event models. No UI claims exceed backend reality (re-verified). Break point:
acting on an objection/relevance recommendation means manual cross-page retyping with no linkage —
Home cannot answer "did acting on this produce anything?". No redesign proposed; the fix is one
button + one endpoint (§17).

## 12. External integration assessment

Phase 9 must NOT introduce LinkedIn OAuth/API, browser automation, scraping, or platform analytics:
no internal bottleneck requires them (the Flow D joint is purely internal), and the 14 prerequisites
(identity mapping, approval binding, capability abstraction, idempotency, rate limits, retries, audit
logging, disconnect/revocation, external action state, token lifecycle) remain absent. Re-audited and
unchanged. External execution stays a coherent later phase of its own.

## 13. Infrastructure assessment

Synchronous architecture is NOT the bottleneck: worst-case refresh fan-out is capped (~303 bounded
reads), suites run in seconds, no external calls exist in hot paths. Queues/workers explicitly NOT
recommended — no measured or structural justification.

## 14. Data model assessment

Existing models support the selected transformation: `ContentIdea` (title required, rest optional,
draft default) accepts prefilled creation; `OperatorAction.subjectMeta` (Json) accepts result linkage
without migration. No missing relationship, no weak identity, no isolation risk introduced. Dormant
models (`AnalyticsEvent`, `LearningSignal`) deliberately untouched. No new model recommended.

## 15. AI assessment

AI current use unchanged (understanding/synthesis/composition/classification-assist/optional
summaries, all validated with honest unavailable states). The selected transformation is fully
deterministic (template prefill from recorded quotes — no ranking, no facts, no prose generation).
AI explicitly NOT required for Phase 9.

## 16. Phase 9 candidates

- **A. Objection-to-idea initiation (SELECTED).** Problem: Flow D stops at advice text; retyping;
  no action→artifact link. Evidence: §5/§7 + creation schema verified (title-only required, draft
  default, ungated create route). Transformation: explicit POST creates DRAFT idea prefilled from
  pattern + records result id in action subjectMeta. Inputs: PENDING objection_pattern action.
  Outputs: draft idea + linked action. Rails reused: ideas API shapes, eligibility, refresh,
  dismiss/complete, Home. New models/endpoints: none / one POST. AI: none. Infra: none. Gates:
  explicit click; all downstream gates intact. Testable locally. Risks: duplicate clicks (solved by
  409-with-existing-id); refresh wiping linkage (solved by preserving result keys on upsert).
  Non-goals: §24 of prior phases carried over + relevance-side creation.
- **B. Relevant-content suggestions for strategy composition.** Read-only ideas-by-topic relevance
  for a lead. Smaller, but serves a less-broken flow (strategy form already manual and complete);
  consumer shape (where suggestions render) less defined. DEFERRED.
- **C. Learning → content recommendations.** Real dead end, but no defined consumer shape; inventing
  one now is lower-leverage than closing shaped Flow D. DEFERRED.
- **D. Sales-specific learning rules.** Serves the already-working qualification path. DEFERRED.
- **E. Recommendation performance linkage (general).** Valuable measurability, but needs the
  initiation events from A to exist first; premature as a standalone. DEFERRED (A's linkage covers
  the objection path minimally).
No numeric ranking; A wins on shapedness + loop-closure per evidence above.

## 17. Selected boundary

**PHASE 9 — Objection-Driven Content Initiation.** Human-initiated creation of a DRAFT content idea
prefilled from a recorded objection pattern, with bidirectional provenance, through existing rails.
If the evidence did not support a tighter option than A, no boundary would be declared — it does.

## 18. Phase 9 definition

- NAME: Phase 9 — Objection-Driven Content Initiation.
- PROBLEM: Flow D ends at advice text; operators retype; system blind to action outcomes.
- CURRENT STATE: §5/§7; idea creation ungated draft-default; subjectMeta Json extensible.
- TRANSFORMATION: `POST /operator/actions/:id/ideas` — validate (exists, workspace, PENDING,
  kind=objection_pattern, eligibility recompute passes, no existing resultIdeaId else 409 with id) →
  create `ContentIdea` {title: quote ≤200, description: pattern+counts+conversation refs, tags:
  ['objection-driven'], status draft} → merge `{resultIdeaId, resultIdeaTitle, initiatedAt}` into
  action subjectMeta (refresh upsert preserves these keys — surgical change with test) → 201.
  Nothing else created (no plan/draft/review); action stays PENDING for manual completion.
- INPUTS: one PENDING objection_pattern action id. OUTPUTS: draft idea + linked action.
- DATA FLOW: action+pattern rows → validated prefill → idea row + subjectMeta merge.
- API SURFACE: the one POST; error codes 404/403/409/400 per §22-Test-equivalents below. No other
  endpoint changes.
- UI SURFACE: "Start idea" button on objection_pattern Home cards → success navigates to /content.
  No new pages/tabs.
- PERSISTENCE: `ContentIdea` row + subjectMeta merge only. No migration.
- WORKSPACE ISOLATION: action lookup + eligibility + idea creation all under caller's workspace id;
  negative tests (foreign action 404/403, outsider 403).
- PROVENANCE: idea description cites pattern fingerprint/count/conversations; action links idea id;
  both directions recorded-data-only.
- ELIGIBILITY: recompute before creation; stale/ineligible → 409, nothing created.
- SCORING: none (initiation is not ranking; existing scorer untouched).
- LEARNING/ANALYTICS: none new (idea flows into existing publish/outcome/learning rails by itself).
- AI: none. HUMAN-IN-THE-LOOP: explicit click; idea is draft; plan/review/approval gates unchanged;
  completion stays manual.
- PERFORMANCE/CAPS: single-row reads + one create; no fan-out. ERROR HANDLING: 404 unknown/foreign,
  403 non-member, 409 wrong-kind/non-pending/stale/already-initiated, 400 validation; no partial writes
  (create+link in one transaction or ordered with rollback-safe sequence — implementation detail with test).
- TEST PLAN: unit (prefill mapping/truncation, 409 matrix, subjectMeta merge/preserve); integration on
  Docker PostgreSQL (initiate→DRAFT idea with provenance; repeat→409 same id; wrong-kind→409;
  stale-pattern→409; foreign/outsider denial; refresh preserves linkage; full manual cycle onward
  untouched); regression full suite.
- DEFINITION OF DONE: every created idea traces to pattern rows; ineligible/duplicate/foreign attempts
  create nothing (proven by tests); linkage survives refresh; UI button only on the right kind;
  suite green; typecheck; build; boot/health/ready.
- EXPLICIT NON-GOALS: relevance→strategy creation; relevantContentId suggestion; AI prefill;
  auto-creation of any kind; plan/draft/review creation in this step; general complete-with-resultRef;
  dismissal reasons; analytics expansion; LinkedIn/workers/prod/load; UI redesign.
- STOP CONDITIONS: §19 hard list applies unchanged (ws-leak, migration need, autonomy, AI need,
  fan-out, rewrite, approval bypass — any triggers STOP, not expansion).
- UNVERIFIED ITEMS: browser/E2E, live-AI prose, external network, production, load (carried forward).

## 19. Hard stop conditions

As §18 plus the standing list: unapproved credentials, LinkedIn execution, browser automation,
scraping, CAPTCHA bypass, autonomous outreach/follow-up/publishing, unjustified workers/queues, new
table without necessity, fabricated metrics, unsupported attribution, isolation weakening, approval
bypass, unbounded fan-out, architectural rewrite, unverifiable AI responsibility.

## 20. Audit report contents

This file constitutes the audit record (§§1–21 as structured above). Factual language used
throughout; nothing is called implemented, verified, or accepted.

## 21. Final state

Verification commands and results recorded below after writing. No code changed, no commit, no push,
Phase 9 not implemented. STOP.
