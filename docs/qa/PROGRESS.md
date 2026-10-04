# Growth Operator — Engineering Progress Log

Principal-engineer run starting 2026-10-04. This file is the run memory.
Every claim below comes from commands actually executed in the Phase 0 session
and output actually read. Prior agent reports were used as pointers only.

## Phase 0 baseline (2026-10-04, session-verified)

- Real HEAD: `3456352a8dabae32234bda2629a506291adfb398` ("feat: LinkedIn
  OIDC-minimal account linking, member-post research explicitly unavailable",
  2026-10-04). Verified via `git rev-parse HEAD` + `git log --oneline -5`.
- Branch state: detached HEAD. Tracked tree clean; only untracked artifacts
  are `.playwright-mcp/*` snapshots and `USERPROFILE.md`
  (`git status --porcelain=v1`).
- Live services: API `:3001` healthy, readiness `ready`, DB connected,
  migrations 18 applied / 0 pending (live `GET /health`, `GET /ready`;
  `pnpm --filter=@growth-operator/db db:migrate status` → "No pending
  migrations to apply").
- Env (names only, never values): `OPENROUTER_API_KEY=SET` (AI available),
  `LINKEDIN_CLIENT_ID=SET` (OAuth attemptable), `OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY` empty/absent (YouTube research
  NOT_CONFIGURED here).

### Real test counts (commands run, output read this session)

| Command | Result |
|---|---|
| `pnpm --filter=@growth-operator/api test` | 32 files, **339 passed**, 3 skipped, 0 failed (76.66s) |
| `pnpm --filter=@growth-operator/web test` | 22 files, **84 passed**, 0 failed |
| `pnpm --filter=@growth-operator/intelligence test` | 19 passed + 1 skipped file, **276 passed**, 2 skipped (live-connector opt-in) |
| `pnpm --filter=@growth-operator/content test` | 13 files, **95 passed** |
| `pnpm --filter=@growth-operator/sales test` | 14 files, **71 passed** |
| `pnpm --filter=@growth-operator/learning test` | 7 files, **34 passed** |
| `pnpm --filter=@growth-operator/decision test` | 11 files, **102 passed** |
| `pnpm --filter=@growth-operator/social test` | 1 file, **7 passed** |
| `pnpm --filter=@growth-operator/business test` | 1 file, **10 passed** |
| `pnpm typecheck` (all 11 packages) | PASS, no errors |
| `pnpm build` (API tsc + web vite) | PASS; one non-blocking chunk-size warning |
| **Total** | **1018 passed, 0 failed** |

### Regression-matrix standing (from `docs/testing/REGRESSION_MATRIX.md`, read, not re-probed)
VERIFIED 5 (AUTH-001/003, CONTENT-001, SALES-001, LEARNING-001, SAFETY-002);
PARTIAL 8; UNKNOWN 2 (INTEL-002 live-adapter run, Decision→Content/Sales bridges).

## Production blockers, ranked by dependency

1. **LinkedIn E2E grant never completed** — code IMPLEMENTED
   (`apps/api/src/routes/social.ts`, `packages/social/src/adapters.ts`
   LinkedInAdapter OIDC `openid profile email`), dev DB `socialConnection=0`,
   capability `endToEndVerified:false`. Needs HUMAN (click Connect + approve).
   Nothing engineering can substitute.
2. **Restricted LinkedIn permissions unprovisioned** — `r_member_social`
   refused as restricted; research/publishing/analytics deterministically
   UNAVAILABLE (`packages/intelligence/src/connectors/linkedinConnector.ts`,
   `PLATFORM_CAPABILITIES` linkedin research/publishing false). Needs
   PROVIDER approval decision (apply vs accept identity-only). Business call.
3. **Reddit HTTP 403 network-wide / Google Trends CSV HTTP 400** — recorded
   BLOCKED (`a03a163`, `49a093d`); code is real, providers refuse. Needs one
   engineering re-probe (WP2), then replace-or-accept fallback mesh.
4. **GitHub releases ingestion fix (`c200f06`) never re-probed live** —
   BLOCKED record (`241319f`) predates the fix. Engineering re-probe (WP2).
5. **No publishing/analytics integration for any platform** — correctly
   absent (`dailyExecutionCap` 0, EXECUTION always SKIPPED, publishing false
   in two places). Needs provider approvals + execution design (WP5) before
   any code; building the publisher without approvals would be fake capability.
6. **Zero live learning signals** — derivation/maturity/influence code tested,
   dev DB `learningSignal=0`. Unblocks only via real/manual outcomes (WP7/8).
7. **Unattended scheduling unproven** — daily loop triggerable + idempotent,
   cron/distributed-lock not demonstrated (WP9).

## WP log

- [x] Phase 0 RECON — baseline above. No code changed.
- [x] WP1 CAPABILITY REGISTRY — commit `5e5331b`.
  - New package `@growth-operator/capabilities` (zero-dep): `CAPABILITY_REGISTRY`
    with 42 entries across RESEARCH (14) / EXECUTION (8) / OBSERVATION (6) /
    SALES (9) / LEARNING (5). Every entry: state (9-state set) + reason +
    evidence[] + liveVerified (false everywhere at baseline — nothing
    re-probed live in WP1) + verifyNote + requiresAuth/Approval + provenance
    + userAction.
  - `packages/intelligence/src/connectorCatalogue.ts` and
    `packages/social/src/capabilities.ts` are now pure derivations (same
    exported shapes); `routes/social.ts` and `routes/readiness.ts` inline
    maps deleted, replaced by `platformCapabilityFlags` /
    `executionImplementedById`. No runtime behavior changed (worker-eligible
    set identical; UI untouched — renders API payloads).
  - Tests: `packages/capabilities/src/registry.test.ts` (7 invariant tests) +
    `apps/api/src/capabilityRegistry.test.ts` (7 parity tests: connectors API
    vs registry, legacy catalogue vs registry, connections blocks vs registry
    incl. connected-overlay rule, readiness vs registry, uniform publishing
    unavailability).
  - Commands run + real results:
    `pnpm --filter=@growth-operator/capabilities test` → 7 passed;
    `pnpm --filter=@growth-operator/api test` → 33 files, 346 passed,
    3 skipped, 0 failed; web 84; intelligence 276; social 7; content 95;
    sales 71; learning 34; decision 102; business 10 (all 0 failed);
    `pnpm typecheck` → PASS all packages; `pnpm build` → PASS (chunk-size
    warning only); total 1032 passed, 0 failed.
  - Open: WP2 re-probes (GitHub, Reddit, Trends, YouTube-if-key, HN, feeds)
    will flip registry states with evidence; `endToEndVerified` still false
    everywhere (no human grant — blocked on human, WP5).
- [ ] WP2 RESEARCH RELIABILITY AND QUALITY
- [x] WP2 RESEARCH RELIABILITY AND QUALITY — commit `68c9d00`.
  - Live re-probes executed 2026-10-04 (real classes + direct fetch):
    Reddit → HTTP 403 on r/programming/hot.json (BLOCKED reconfirmed);
    Google Trends → CSV HTTP 400 + HTML error page (BLOCKED reconfirmed);
    HN topstories → HTTP 200, 500 ids, item with title/url/time (AVAILABLE,
    liveVerified); GitHub react releases.atom → HTTP 200, real
    extractAtomContent parsed 10 entries with dates — c200f06 fix confirmed
    on a live payload (UNKNOWN → AVAILABLE, liveVerified); blog RSS →
    HTTP 200, real extractRssContent parsed 10 items (AVAILABLE,
    liveVerified); YouTube → no server key, runtime NOT_CONFIGURED
    (priming path unit-tested; no probe possible without credentials).
  - Registry flips: research.github UNKNOWN→AVAILABLE; liveVerified true for
    rss/atom/hackernews/github; reddit/trends verifyNotes carry today's
    exact errors. Fallback mesh that feeds production today: RSS/Atom/HN/
    GitHub/websites (all verified live).
  - Claim provenance now stamps model/version: `SourceUnderstandingService.
    understand()` returns provider+model; `ClaimLedgerService.persistClaims`
    writes generatedBy/aiProvider/aiModel into provenance (unknown, never
    invented, when absent); worker stages.ts passes it through. Tests: 2 new
    (stamp present / absent→unknown).
  - Trend labels: kept the TrendStatus enum (no DB rewrite). Justification:
    the substantive rules are already enforced and tested — single source →
    INSUFFICIENT_HISTORY, TRENDING needs ≥3 sources + recency/diversity/
    frequency thresholds, STALE after 60d; STALE/others are excluded from
    the operator queue by decision collectors (TRENDING/RELEVANT only) and
    the eligibility gate. A label rename is cosmetic, not a production gap.
  - Commands run + real results:
    `LIVE_CONNECTOR_TESTS=1 ... connectorLive.test.ts` → 2 failed as
    designed (403 + 400 evidence, assertions not weakened);
    capabilities 7 passed; intelligence 278 passed (276 + 2 new), 2 skipped;
    api 346 passed, 3 skipped; social 7; web 84; content 95; sales 71;
    learning 34; decision 102; business 10 (all 0 failed);
    `pnpm typecheck` → PASS; `pnpm build` → PASS; total 1034 passed, 0 failed.
  - Lesson: api tsc resolves workspace deps via dist .d.ts — rebuild a
    package's dist after changing its exported types before api typecheck.
  - Open: YouTube probe needs a server key (human-provided, none requested
    yet); LinkedIn research stays UNAVAILABLE (provider permission).
- [ ] WP3 DECISION ENGINE + OPERATOR QUEUE + "WHY NOT"
- [ ] WP4 CONTENT MACHINE + CALENDAR
- [ ] WP5 EXECUTION CONTROL PLANE + LINKEDIN CONNECTION
- [ ] WP6 SALES MACHINE + AUTHORIZED MESSAGING
- [ ] WP7 OBSERVATION + COMMENT BRAIN + AUDIENCE BRAIN
- [ ] WP8 LEARNING LOOP + EXPERIMENTS
- [ ] WP9 AUTONOMOUS WORKER + AUTONOMY TIERS + BUDGETS + DIGEST
- [ ] WP10 PRODUCTION HARDENING
- [ ] WP11 UI, ONBOARDING, OPERATOR HOME
- [ ] WP12 GOLDEN FLOWS, BROWSER QA, FINAL REPORTS

## Blocked-on-human/provider (carried forward, not asked yet)
- Human LinkedIn OAuth grant (WP5 will mark action-required and continue).
- LinkedIn restricted-product approvals (business decision: apply vs accept).
- No secrets requested; none committed.
