# PHASE 4 IMPLEMENTATION REPORT — SALES INTELLIGENCE / RELATIONSHIP GROWTH MACHINE

## Architecture

New package **`@growth-operator/sales`** (`packages/sales/`), mirroring the Phase 3 content package: deterministic-first services, typed errors, Zod-validated AI boundaries, honest `AI_UNAVAILABLE` with zero prose. No Phase 2/3 system was forked: research reuses ingestion/SSRF/extraction/claims/contradictions; voice/audience patterns reuse content-module designs; the AI registry, auth triple-middleware, and error-code conventions are shared.

| File | Responsibility |
|---|---|
| `src/errors.ts` | `SalesError` + codes (`AI_UNAVAILABLE`, `INSUFFICIENT_DATA`, `UNQUALIFIED_PROSPECT`, `EVIDENCE_MISSING`, `CONTRADICTION_PRESENT`, `QUALITY_BLOCKED`, `APPROVAL_NOT_ALLOWED`, `ACTION_BLOCKED`, `ACTION_EXPIRED`, `INVALID_TRANSITION`, `PLAN_INVALID`) |
| `src/icp.ts` | `resolveIcpMatch` — structured ICP context, unknowns never invented |
| `src/discovery.ts` | `buildProspectCandidate` — caller-supplied data only, unknown-field tracking |
| `src/research.ts` | `ProspectResearchService` — validated persistence + optional AI synthesis |
| `src/qualification.ts` | Deterministic 8-dimension qualification + `QualificationService` (latest-only upsert) |
| `src/scoring.ts` | Transparent score with per-dimension reason/evidence, `INSUFFICIENT_DATA` flag |
| `src/signals.ts` | `SignalService` — evidence-required recording, intent rollup |
| `src/brief.ts` | `BriefService` — persisted brief, auto `no_outreach` without facts, optional AI context |
| `src/strategy.ts` | Strategy validation, personalization grounding rules, HIGH/MODERATE evidence minimums |
| `src/compose.ts` | `OutreachComposer` — approved-strategy-only AI drafting, Zod structure |
| `src/gates.ts` | `runOutreachGates` — 15 gates, worst-of final, secondary score |
| `src/review.ts` | `OutreachReviewService` — state machine, version+hash approval validity, revisions |
| `src/prepared.ts` | `PreparedActionService` — approval-gated preparation, expiry; **no execution code exists** |
| `src/classify.ts` | Deterministic classification (UNCLEAR on ambiguity) + optional AI assist + follow-up recommender |
| `src/pipeline.ts` | Explicit transition map; terminal stages user-recorded only |
| `src/bridge.ts` | `SalesBridgeService` — measured-frequency signals, absolute-quantifier rejection, content-input shaping |

API: `prospects.ts` (`/api/v1/prospects/*`), `outreach.ts` (`/api/v1/outreach/*`), `salesIntelligence.ts` (`/api/v1/sales-intelligence/*`); pipeline PATCH transition enforcement; `utils/salesErrors.ts` HTTP mapping. Frontend: real Leads/Inbox/Pipeline pages + typed client + auth-gated states.

## Database Changes

Migration **`20260927110000_phase4_sales`** (applied via `migrate deploy`; `db:generate` + `db:migrate` report no pending migrations). New enums: `QualificationStatus`, `IntentStatus`, `PersonalizationLevel`, `RelationshipStage`, `OutreachDraftType`, `PreparedActionStatus`, `ConversationClassification`, `FollowUpAction`, `SalesSignalType`. New workspace-scoped models (all cascade-safe): `ProspectResearch`, `ProspectSignal`, `QualificationResult` (unique per workspace+lead), `ProspectBrief`, `OutreachStrategy` (DRAFT/APPROVED status), `OutreachDraft` (versioned), `OutreachReview` (decision history + `draftVersion` + `approvedBodyHash`), `PreparedAction` (terminal states incl. `EXPIRED`), `ConversationClassificationResult`, `FollowUpRecommendation`, `SalesContentSignal`. Back-relations added to `Lead`, `Conversation`, `ProspectBrief`, `Workspace`. No existing model was rewritten.

## Prospect Research

Discovery accepts manual entries and public URLs only (no scraping, no LinkedIn access); every field carries provenance or lands in `unknownFields`. Research persists facts strictly as `{statement, sourceRef, confidence}` triples — missing refs are rejected. AI synthesis is optional, Zod-validated, and honest about absence. Reuses Phase 2 ingestion/extraction/claims/SSRF paths; no second research engine exists.

## Qualification

Eight transparent dimensions (ICP/role/industry/company fit, problem relevance, evidence strength, timing, research completeness), each with score/reason/evidence/missing flags. Statuses `UNQUALIFIED`/`POSSIBLE_FIT`/`QUALIFIED`/`INSUFFICIENT_DATA` derive from evidenced rules — all-unknown inputs yield `INSUFFICIENT_DATA`, mismatches yield `UNQUALIFIED` with reasons. No opaque AI score exists.

## Scoring

Derived transparently from qualification dimensions plus signal/research context; every dimension exposes score/reason/evidence; `insufficientData` is explicit. Never described as conversion probability; no buying prediction is made.

## Signals

Recorded only with type/source/confidence/evidence/interpretation; unknown types and evidenceless signals rejected. Intent rollup (`NO/WEAK/RELEVANT/MULTIPLE`) is counting logic with factual wording — no manufactured urgency, no "they want your product" inference.

## Prospect Brief

Persisted before any outreach: who, why-fit, known facts, unknowns, signals, relevance, risks, do-not-claim, recommended approach. Zero verified facts forces `no_outreach` with recorded risks. Optional AI context synthesis follows the same honesty rules.

## Outreach Strategy

Requires lead or brief context; non-COLD stages need a reference (relationships never assumed); HIGH personalization needs ≥2 evidence refs, MODERATE ≥1; approved content references are validated against the workspace (no fabricated engagement). Strategies approve explicitly (OWNER/ADMIN) before any draft.

## Personalization

Template blacklist (funding/hiring/struggle/assumed-relationship) enforced against evidence via word-overlap grounding; ungrounded matches rejected. HIGH personalization is structurally impossible without evidence.

## Outreach Drafting

Five types (connection note, first message, follow-up, value, content-based) generated only from APPROVED strategies through a fixed structure (opening → relevance → evidence → value → CTA) with per-type guidance. Anti-spam, anti-invention, anti-markup rules live in the prompt and are re-checked deterministically. Empty registry → `AI_UNAVAILABLE`, zero prose (tested).

## Quality Gates

15 gates: prospect_fit, evidence_grounding, personalization_grounding, unsupported_claims, fabricated_details, contradiction, relevance, clarity, spamminess, cta_validity, tone, length, duplicate_message, internal_markup, privacy_boundary (+placeholder detection folded into malformed-output honesty). Hard failures override scores — the 88/100-style fixture with fabricated detail yields BLOCKED. Approval re-runs gates server-side from the current draft; client summaries are never trusted.

## Review/Approval

`OutreachReviewService`: DRAFT→SUBMITTED→APPROVED/REJECTED/CHANGES_REQUESTED, no double-submit, SUBMITTED-only transitions, OWNER/ADMIN approval, gate-aware refusal, cross-workspace denial. Approval pins exact `draftVersion` + body hash; any edit invalidates it (`isApprovalValid`), returning the draft to mutable-unapproved.

## Prepared Actions

Terminal boundary: creation requires a valid approval for the exact current draft; states `REQUIRES_APPROVAL` → `READY_FOR_AUTHORIZED_EXECUTION` / `BLOCKED` / `EXPIRED`. Expiry enforced on read. **The codebase contains no execution path** — no senders, clients, or automation hooks.

## Inbox Intelligence

Deterministic classification (meeting/objection/disinterest/question/positive/negative with evidence quotes; UNCLEAR + low confidence otherwise), optional AI assist only for unclear cases with a 0.6 confidence floor and deterministic fallback. Follow-ups are recommendations with why/evidence/risk/timing — sending remains human.

## Follow-Up Recommendations

Eight recommendation types mapped deterministically from classification state; disinterest closes out; ambiguity without triggers yields NO_FOLLOW_UP. Every recommendation explains itself.

## CRM Integration

Existing `PipelineOpportunity` reused — no second CRM. Transitions validated against an explicit map (skips and terminal exits rejected; `CLOSED_LOST` may reopen to PROSPECTING); WON/LOST set only by direct user PATCH; `closedAt` stamped on closes. Values/probabilities never inferred.

## Content ↔ Sales Bridge

`SalesContentSignal` requires evidence; conversation IDs are verified against the workspace; absolute quantifiers without multi-conversation measurement are rejected; frequency is the measured count. `toContentInput` shapes measured evidence for the Content Machine, which still runs its own plan/evidence/gates/review — no bypass exists. Approved ideas/versions may be referenced by strategies with validated IDs only.

## Frontend

Leads (manual add, discovery candidates with evidence/confidence/unknowns, research, signals+intent, qualification dimensions, briefs, strategies, drafts, reviews, prepared actions), Inbox (conversation records, manual notes labeled as non-sending, classification, follow-ups, signal patterns), Pipeline (deals, transition errors, next-step derivation). Auth-gated, workspace-selected, honest states throughout; no send/schedule/publish controls; no mock data.

## Security

Triple-middleware plus scoped queries on all 30+ new endpoints; role-gated strategy approval, review decisions, and finalization; cross-workspace tests (403s) for prospects, reviews, drafts, and actions; SSRF reuse for research URLs; no secrets, bypasses, or automation surfaces. Adversarial grep clean (only guardrail strings and test fixtures matched).

## Tests

- Phase 1 API: **21/21** · Web: **3/3** · Phase 2: **127/127** · Phase 3 unit: **91/91** · Phase 3 integration: **13/13**
- Phase 4 unit (`@growth-operator/sales`, 11 files): **51/51** — icp, discovery, qualification+scoring, signals, personalization, gates (incl. 88+BLOCKED), classify+follow-up, pipeline transitions, bridge, review state machine + prepared actions + expiry, AI-unavailable matrix
- Phase 4 integration (`salesMachine.test.ts`, real Docker PostgreSQL): **15/15** — setup/isolation, discovery unknowns, research+synthesize-503, signals+intent, qualify QUALIFIED + INSUFFICIENT_DATA, brief no_outreach, HIGH-personalization rejection, strategy approve, compose 503, fabricated-detail BLOCKED, blocked approval, viewer/outsider denial, clean approve→prepare→ready→edit-invalidation, classification, follow-ups, pipeline transitions, bridge measurement
- **Total: 321/321 via `pnpm test:all`** (21+13 API, 3 Web, 127 intelligence, 91 content, 51 sales). Zero failures.

## Runtime

`pnpm install`, `db:generate`, `db:migrate` (none pending), `typecheck` (8 packages), `test:all`, `build` all green. `apps/api/dist/index.js` verified present; compiled server booted: health healthy, ready database-connected. Core workflow additionally executed live by the integration suite.

## Unverified Items

Browser E2E (no browser tooling available); live AI prose quality (no credentials); external-network research; production deployment; load/performance. Analytics/learning remain write-only CRUD by design.

## Phase 5 Boundary

No sales intelligence beyond the above, no prospect research automation beyond authorized inputs, no outreach sending, no inbox AI actions, no LinkedIn integration of any kind, no analytics ingestion, no learning engine/workers/loops. Stop line holds.

**PHASE 4 COMPLETE** — implemented and tested per the evidence above.
