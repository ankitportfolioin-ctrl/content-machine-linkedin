# CONTENT BRAIN REDESIGN — EXECUTION SPEC (opencode-ready)

You are upgrading ONE subsystem of an existing repository: the **Content Brain /
Content Intelligence research layer and its connectors**. Everything else in the
repo (Sales Machine, Business Brain, Decision Engine core, Learning Engine core,
auth, workspace isolation, onboarding, unrelated UI) is OUT OF SCOPE. Preserve it
exactly as-is unless a step below explicitly requires touching it.

Read this entire file before writing any code. Then execute the phases in order.
Do not skip ahead. Do not reorder. Do not expand scope beyond what a phase asks for.

---

## 0. HOW TO BEHAVE WHEN BLOCKED OR UNCERTAIN (read this first)

This is the most important section. Follow it every time you hit friction.

1. **Never stop the task to ask the user a clarifying question.** If a decision
   doesn't affect safety, scope, or data integrity (rules in §1), make the most
   reasonable choice yourself, write one line in your running implementation log
   explaining what you chose and why, and continue.
2. **A missing API key, missing credential, or unavailable external service is
   not a blocker.** Mark that specific connector `NOT_CONFIGURED` or
   `SOURCE_UNAVAILABLE`, log it, and move on to the next piece of work. Never let
   one unavailable connector stop the rest of the phase.
3. **If you cannot find an existing component the spec assumes exists** (e.g. "the
   existing deduplication system"), search the repo once, record what you found
   (or didn't find) in the log, and proceed using the closest existing abstraction.
   Only build something new if nothing reusable exists — and say so explicitly.
4. **If a requirement seems to conflict with an existing working feature**, do not
   silently override the existing feature. Keep the existing behavior, log the
   conflict in one sentence, and continue with the rest of the phase.
5. **The only things that should ever make you stop and surface a question to the
   user immediately** (not wait until the final report) are:
   - a step that would require bypassing authentication, CAPTCHA, rate limits, or
     a platform's terms of service
   - a step that would delete or irreversibly overwrite production data outside
     the Content Brain's own tables
   - a step that would enable automatic publishing or automatic outbound
     messaging where none exists today
   For everything else: decide, log, continue.
6. **Work in the phase order below. Each phase has an exit checklist.** Do not
   move to the next phase until the current phase's exit checklist is true, but
   also do not go back and re-polish a finished phase "just in case" — move
   forward.

---

## 1. NON-NEGOTIABLE RULES (apply to every phase)

**Never fabricate data.** If a number, metric, timestamp, or piece of evidence is
unavailable, output the literal string `UNAVAILABLE` or `INSUFFICIENT_DATA` —
never a plausible-looking placeholder. This applies to: engagement metrics,
search volume, trend scores, timestamps, AI analysis, testimonials, audience
pain points, learning conclusions, and source citations.

**Never bypass platform restrictions.** No CAPTCHA solving, no proxy rotation to
evade rate limits, no scraping behind authentication you don't legitimately have,
no ignoring robots/API terms. If official access isn't available, the connector
status is `SOURCE_UNAVAILABLE` — not a workaround.

**Never remove the human-approval boundary.** No change in this task enables
automatic publishing or automatic outbound messaging. If it isn't automatic today,
it stays manual-approval after this task too.

**Never hardcode the demo workspace into the core engine.** "Developer / AI
e-books / LinkedIn" is test data only, used in §7. The engine itself must derive
relevance from whatever workspace profile, audience, and content pillars are
configured — so a fitness coach or real-estate agent workspace works identically
without code changes.

**Reuse before you build.** Before creating any new model, service, connector
interface, dedup logic, or scoring engine, search the repo for an existing
equivalent. Extend it. Only build new if nothing reusable exists, and say so in
the log.

**Keep every downstream item traceable to its source.** Every generated content
item must be traceable back through: opportunity → topic → signal → source URL.
If that chain breaks anywhere, that's a bug to fix before moving on, not an
acceptable gap.

---

## 2. TARGET ARCHITECTURE (what you're building toward)

```
SOURCES → CONNECTORS → NORMALIZATION → DEDUPLICATION → FRESHNESS
   → AI UNDERSTANDING → TOPICS → TRENDS → AUDIENCE PROBLEMS → CONTENT GAPS
   → CONTENT OPPORTUNITIES → DECISION ENGINE → CONTENT PLAN
   → CONTENT GENERATION → HUMAN APPROVAL → PUBLISH
   → PERFORMANCE DATA → LEARNING → better future opportunities
```

The product should feel like "a brain that understands the market, the audience,
and its own results" — not "a scraper that writes posts." Every phase below
builds one link in that chain.

---

## 3. PHASE 0 — AUDIT (no code yet)

**Do:**
Search the repo and produce a table with these exact columns:

| Concept | Current implementation (file/module, or "none found") | Keep / Extend / Fix / Build new |
|---|---|---|

Cover: Content Brain, Content Intelligence, research pipeline, existing source
adapters/feed connectors, normalization logic, deduplication logic, trend logic,
`ContentIdea`/`ContentOpportunity` models, `ContentDNA`, Decision Engine
integration, Learning Engine integration, Content Machine generation flow,
relevant UI, relevant tests.

**Exit checklist (must be true before Phase 1):**
- [ ] The table above exists and is committed to the log/report.
- [ ] Every later phase's "reuse" instruction can point at a specific row in this table.

---

## 4. PHASE 1 — UNIFIED CONNECTOR INTERFACE

**Do:**
Define one connector contract (interface/abstract class — match the repo's
existing conventions) that every source implements. Each connector call returns
one of these statuses, never a silent empty success:

```
AVAILABLE | DEGRADED | SOURCE_UNAVAILABLE | AUTH_REQUIRED
RATE_LIMITED | NOT_CONFIGURED | INSUFFICIENT_DATA
```

Build/adapt connectors in this priority order. Do not let a stuck connector block
the next one — implement, test what's testable, mark status honestly, move on.

**Tier 1 (build first):**
1. **Reddit** — role: surfacing questions, confusions, and pain points (not
   verified facts). Workspace-configurable subreddit list; nothing hardcoded.
2. **YouTube** — role: topic/format discovery. Query-driven, queries generated
   from workspace profile + audience + pillars, not hardcoded.
3. **Google Trends (or equivalent search-demand source)** — role: rising search
   interest. Only store relative trend data as given by the source (direction,
   relative interest) — never convert to a fabricated absolute volume.
4. **LinkedIn** — two roles, keep them separate:
   - *Research*: only official/available capabilities; anything else is
     `SOURCE_UNAVAILABLE`.
   - *Publish + learn*: existing publish/approval flow stays untouched; do not
     enable auto-publish as part of this task.
5. **X** — role: fast-moving AI/tech conversation signal, not a source of truth.
   Every extracted claim keeps its source, timestamp, and confidence.

**Tier 2 (optional, build after Tier 1 is solid):**
6. **Instagram** — role: visual/format pattern research. Not a hard dependency —
   Brain must run fine if this is `SOURCE_UNAVAILABLE`.
7. **TikTok** — role: short-form trend/format research. Same non-dependency rule.

**Exit checklist:**
- [ ] One shared connector interface exists and Reddit + YouTube + Google Trends
      use it end-to-end with a real (or honestly `NOT_CONFIGURED`) test each.
- [ ] LinkedIn and X connectors exist with correct role separation and honest status reporting.
- [ ] Killing/disconnecting any one connector does not crash or block the others (prove this with a test).

---

## 5. PHASE 2 — NORMALIZATION

**Do:**
Converge every connector's output into one internal `ResearchSignal` shape
(reuse the repo's existing research/source model if one already covers this —
do not create a parallel model). At minimum retain:

```
id, workspaceId, source, sourceType, externalId, url, canonicalUrl,
title, description, content, author, publishedAt, observedAt,
engagement (typed per-source, never force-equivalent across sources),
keywords, hashtags, topicCandidates, audienceCandidates,
contentType, format, language, region,
evidence, confidence, freshness, rawMetadata
```

Do not treat YouTube views, Reddit score, X engagement, LinkedIn impressions, and
Google Trends relative-interest as the same kind of number. Each keeps its own
metric type and meaning.

**Exit checklist:**
- [ ] Every Tier 1 connector's output passes through the same normalization function/module.
- [ ] A unit test proves two different sources produce structurally comparable `ResearchSignal` records with source-specific metrics intact (not flattened into one generic "score").

---

## 6. PHASE 3 — DEDUPLICATION + FRESHNESS

**Do:**
Reuse the repo's existing dedup logic if one exists (canonical URL, tracking-param
stripping, hash/Jaccard similarity — whatever's already there). Apply it to all
normalized signals.

Freshness buckets: `BREAKING | FRESH | RECENT | AGING | STALE | UNKNOWN`. If a
source gives no timestamp, the bucket is `UNKNOWN` — never guessed as recent.

**Exit checklist:**
- [ ] Duplicate/near-duplicate signals across sources are provably collapsed (test with two URLs differing only by tracking params).
- [ ] Every signal has a freshness bucket, and signals with no timestamp are `UNKNOWN`, not defaulted to `FRESH`.

---

## 7. PHASE 4 — AI UNDERSTANDING + TOPIC/TREND/PROBLEM/GAP ENGINES

**Do, in this order:**

1. **AI understanding layer** — for each signal, extract topic, subtopics,
   audience, problem/question, intent, format, hook pattern, angle, novelty,
   evidence quality. Anywhere the AI can't support a conclusion from the signal
   itself, output `INSUFFICIENT_DATA`. If the AI provider is down, mark affected
   signals `AI_ANALYSIS_DEFERRED` and keep the rest of the pipeline running
   (normalization, dedup, freshness, storage all work without AI).
2. **Topic engine** — cluster signals from different sources into shared topics
   when they represent the same underlying thing (e.g. Reddit + YouTube + Trends
   all discussing "Claude Code" become one topic with multi-source lineage, not
   three separate opportunities).
3. **Trend engine** — a topic is only `TRENDING` when multiple independent
   sources and/or genuine recency support it. A single weak signal is not a
   trend. Never invent velocity.
4. **Audience problem engine** — a "problem" must be backed by actual signal
   evidence (repeated Reddit questions, etc.), not just an AI guess that a
   problem "sounds plausible."
5. **Content gap engine** — a gap must state *why* it's a gap (what's discussed
   heavily vs. what's rarely addressed), not just flag any unused angle as a gap.

**Test with demo-workspace queries only** (not hardcoded into the engine):
`AI coding, Claude Code, AI agents, vibe coding, automation, developer tools,
technology skills, freelancing with AI, earning with digital skills, building
projects with AI`.

**Exit checklist:**
- [ ] At least one real multi-source topic cluster exists from test data, with lineage to 2+ source signals.
- [ ] Trend/problem/gap classifications each have a one-line evidence explanation attached, not just a label.
- [ ] Simulating AI-provider failure does not crash normalization/dedup/freshness/storage.

---

## 8. PHASE 5 — CONTENT OPPORTUNITY ENGINE

**Do:**
Produce structured `ContentOpportunity` records (reuse existing model if present)
with at minimum: topic, why-now, audience problem, existing-conversation level,
content gap, suggested angle, recommended format, potential hook, and the list of
evidence/source signals backing it.

No opportunity may exist without at least one real backing signal. No orphan
opportunities.

**Exit checklist:**
- [ ] At least 3 real opportunities generated from Phase 4 test data, each traceable to specific signal IDs.
- [ ] A test asserts an opportunity cannot be created with zero backing signals.

---

## 9. PHASE 6 — DECISION ENGINE INTEGRATION

**Do:**
Feed opportunities into the **existing** Decision Engine — do not build a second
scoring system. Scoring inputs may include audience relevance, topic relevance,
freshness, trend evidence, problem strength, gap strength, business relevance,
historical performance, source confidence. Keep **signal confidence** and
**recommendation confidence** as two separate values, never merged into one number.
Every ranked opportunity must have a one-line "why this" explanation, and ideally
a "why not the alternatives" note.

**Exit checklist:**
- [ ] Opportunities from Phase 5 are scored and ranked using the existing Decision Engine's code path (no parallel ranking function created).
- [ ] Each scored opportunity exposes both confidence values separately and a human-readable "why" string.

---

## 10. PHASE 7 — CONTENT GENERATION INTEGRATION + LINEAGE

**Do:**
Wire opportunities into the existing Content Machine as an additional input path
(alongside whatever paths already exist — user ideas, pillars, manual generation,
etc.; the spec's original list of 12 paths in the appendix below is the reference
if you need it). Generated content must be an original YFP-voice take on the
extracted facts/patterns/angle — never a rewrite of source text.

Every generated post must retain a full lineage chain, queryable end to end:
`post → opportunity → topic → signal(s) → source URL(s) → evidence`.

**Exit checklist:**
- [ ] One real generated draft exists with the full lineage chain populated and queryable (show the actual chain in the report, not a description of it).
- [ ] Human-approval step is still required before anything is marked publishable — confirm this wasn't weakened.

---

## 11. PHASE 8 — LEARNING LOOP

**Do:**
Wire real (not simulated) published-post performance metrics — whatever the
platform connector actually returns — back into the existing Content DNA /
Learning Engine. Unavailable metrics are `UNAVAILABLE`, never zero.

Classify learning strength honestly: `Observed → Repeated signal → Hypothesis →
Experiment → Supported pattern → Confirmed`. One successful post is never
"Confirmed" — it's at most an early hypothesis.

**Exit checklist:**
- [ ] A real or realistic test shows performance data flowing from a published post back into a learning record.
- [ ] A test proves a single data point cannot be classified as `Confirmed`.

---

## 12. PHASE 9 — UI (minimum necessary only)

**Do:**
Only touch the Content Brain / research UI. For each connector, surface: status,
last successful sync, last attempted sync, records discovered/processed, errors,
rate-limit state. Surface the Content Brain dashboard sections: what's happening
(trends/problems/gaps), what's performing (research patterns + own history),
what to do next (top opportunities + why), what we learned (pattern strength
labels). Do not touch unrelated UI.

**Exit checklist:**
- [ ] Connector status is visible and accurate in the UI for every Tier 1 connector.
- [ ] No unrelated page/component was modified (confirm via diff review).

---

## 13. PHASE 10 — TESTS + REGRESSION

**Do:**
- Unit tests: normalization, dedup, freshness, provenance, evidence, trend
  classification, topic clustering, opportunity generation/scoring, originality
  check, AI-unavailable fallback, workspace isolation.
- Integration test: connector → signal → topic → trend/problem/gap → opportunity
  → Decision Engine → content plan, end to end.
- Browser test: connect a source → ingest → view research → inspect a topic →
  inspect an opportunity → generate content → approve → view lineage.
- Run the full existing regression suite. Do not weaken or delete existing tests
  to make new code pass — fix the new code instead.

**Exit checklist:**
- [ ] All new test categories above exist and pass, with exact counts recorded.
- [ ] Full existing regression suite still passes.
- [ ] Typecheck and build both pass.

---

## 14. PHASE 11 — DEVIL'S-ADVOCATE SELF-CHECK

Before writing the final report, actively try to break your own work. Check
specifically for: a connector reporting success on an empty response; duplicate
signals that slipped past dedup; a stale signal marked fresh; a trend based on
one weak source; an AI claim with no backing evidence; a generated post with a
broken lineage chain; any hardcoded YFP/AI/developer assumption inside the core
engine (vs. the demo workspace config); a single post mistaken for confirmed
learning; an unavailable metric shown as zero; one failed connector breaking
others; generated content that's really just a rewrite of source text; anything
that could publish without human approval. Fix what you find, log what you found
and fixed.

---

## 15. FINAL REPORT (required output format)

Do not end the task with "done." Produce:

**A. Files changed** — file, what changed, why (one row per file).
**B. Files intentionally left untouched** — the important ones, and why.
**C. Connector status table:**

| Connector | Status | Real test performed | Records | Notes |
|---|---|---|---|---|
| Reddit | | | | |
| YouTube | | | | |
| Google Trends | | | | |
| LinkedIn | | | | |
| X | | | | |
| Instagram | | | | |
| TikTok | | | | |

**D. End-to-end flow actually implemented** (the real pipeline, as built, not the aspirational one).
**E. One real lineage example** — an actual source → signal → opportunity → generated post chain, with real IDs/URLs.
**F. Test results** — unit / integration / browser / regression / typecheck / build, each with exact pass counts.
**G. Every failure hit along the way** — original failure, root cause, fix, how it's now covered by a test.
**H. Remaining limitations, stated plainly** — e.g. "TikTok: NOT_CONFIGURED, no API credentials available" — never hide a gap.

Only use the word "complete" if every exit checklist above is genuinely checked off. If something isn't done, say so directly in section H instead of overstating status.

---

## APPENDIX — Content opportunity input paths (reference, not a new checklist)

Preserve/support opportunities arriving via: trend intelligence, content pillar,
user-submitted idea, public URL, content gap, historical-winner pattern (never
copy the winning post itself), audience signal, sales signal, sales objection,
experiment/learning hypothesis, daily-brain recommendation, and the existing
manual generator. These are inputs into the same opportunity → decision →
generation pipeline built in Phases 5–7, not separate systems.

## APPENDIX — Example opportunity record shape (reference)

```
Topic: Vibe Coding
Why now: rising search interest + independent discussion across 2+ sources
Audience problem: beginners can generate code but don't know how to turn it into a real project
Existing conversation: high
Content gap: most content covers tools, little covers "generated code → real project"
Angle: stop asking AI to build random apps — build your first real project instead
Format: LinkedIn carousel
Hook: "You don't need 10 programming languages to build your first real project."
Evidence: Reddit + YouTube + Google Trends signal IDs [list actual IDs]
```
