# PHASE 4 FORENSIC AUDIT — SALES INTELLIGENCE BASELINE

Audit-only. No implementation. Inspected at commit `6a5627a` (Phase 3 checkpoint).

## 1. Existing Functionality

- **Lead** (`apps/api/src/routes/leads.ts`, 150 lines): list/create/get/patch/delete, workspace triple-middleware, manual `LeadStatus`. No scoring, enrichment, research, or outreach.
- **Conversation** (`conversations.ts`): list/create/get/delete with parent-lead check. No AI reply, no send path.
- **Message** (`messages.ts`): list/create/get/delete; `linkedinMessageId` is an opaque client-supplied string, not an integration.
- **PipelineOpportunity** (`pipeline.ts`, mounted `/api/v1/pipeline`): CRUD with manual stage/probability/value. No transitions enforcement, no automation.
- **ICP** (`icps.ts`): full CRUD incl. Phase 3 fields (targetRoles/industries/companySize/problems/exclusions); consumed only by the content audience resolver — no sales consumer.
- **Profile** (`profiles.ts`): CRUD incl. Phase 3 fields (role/professionalContext); no sales consumer.
- **Content Machine** (Phase 3): plan/draft/evidence/gates/review/approval/preview all real; usable as an input source (approved ideas/versions) for outreach context.
- **Intelligence Engine** (Phase 2): ingestion + SSRF + extraction + claims + topics + trends + gaps; reusable for prospect research. No dedicated tests for research-against-prospect use.
- **AI provider** (`packages/ai`): OpenAI/Anthropic abstraction + registry + Zod request/response types; no retry/timeout inside providers; honest unavailability. Reusable as-is.
- **Auth/workspace isolation**: JWT + triple middleware + `findFirst({id, workspaceId})` pattern on all business routes. No bypasses found.

## 2. Missing Functionality (Phase 4 must build)

Prospect discovery, prospect research synthesis, deterministic qualification, transparent scoring, buying/intent signals, prospect briefs, outreach strategy, evidence-grounded personalization, message drafting, outreach quality gates, outreach review/approval, prepared actions (terminal boundary), conversation classification, follow-up recommendations, CRM stage-transition control, content↔sales bridge signals, and all associated persistence.

## 3. Reusable Phase 2 Services

`SourceIngestionService` (+ `checkSsrfProtection`), `extractHtmlContent`/`extractRssContent`/`extractAtomContent`/`detectContentType`, `ClaimLedgerService` (persist + `detectContradictions`), `SourceUnderstandingService` (structured synthesis). Do not fork any of them.

## 4. Reusable Phase 3 Services

`resolveAudience` (pattern reference for ICP resolution), `ContentPlanService` (pattern for brief-before-artifact), `EvidenceService` (pattern for span→claim binding), `runQualityGates` worst-of-gates pattern, `ReviewService` state-machine pattern, `ContentError` typed codes + `utils/contentErrors.ts` HTTP mapping, `renderPreview`/`assertNoInternalMarkup` pattern. Approved `ContentIdea`/`ContentVersion` rows as outreach context inputs.

## 5. Schema Gaps

No prospect-research, signal, qualification, brief, strategy, draft, review, prepared-action, classification, follow-up, or sales-signal tables exist. `Lead` has no research/qualification columns (additive columns optional; prefer new tables referencing `Lead.id`). `Conversation`/`Message` need classification/follow-up side tables, not rewrites. `PipelineOpportunity.stage` needs transition control at the service layer (no schema change required).

## 6. API Gaps

No `/prospects`, `/prospect-research`, `/qualification`, `/signals`, `/prospect-briefs`, `/outreach-*`, `/prepared-actions`, `/follow-ups`, or `/sales-intelligence` routes exist. Existing sales routes are CRUD-only and must stay untouched except pipeline transition enforcement.

## 7. Frontend Gaps

`LeadsPage`, `InboxPage`, `PipelinePage` are static placeholders; `services/api.ts` has no sales client; `types/index.ts` has no sales types. Brain/Content/Settings patterns (auth gate, honest states, plain-language labels) must be replicated.

## 8. AI Gaps

No sales prompts, schemas, or validators exist. Needed: research synthesis, brief synthesis, strategy, drafting, classification, follow-up recommendation — all Zod-validated with `AI_UNAVAILABLE` honesty, reusing `@growth-operator/ai`.

## 9. Security Gaps

No sales-specific risks found (nothing exists to exploit), but every new endpoint must follow the triple-middleware + scoped-query pattern, with role-gated approval and cross-workspace tests. SSRF reuse is mandatory for any URL ingestion in research.

## 10. Provenance Gaps

No prospect-evidence linkage exists. Every new artifact must carry workspace id, source/claim ID references, and evidence snapshots; personalization statements must map to evidence refs; signals must cite public sources. Nothing may be fabricated.
