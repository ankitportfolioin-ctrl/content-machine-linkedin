# REALTEST.md — GROWTH OPERATOR: AUTONOMOUS EXECUTION, VERIFICATION, REPAIR & CONTINUOUS-OPERATION SPECIFICATION (v4)

## THE WORKFLOW IN 9 LINES (read this first)

1. SETUP: you prepare the environment yourself (Section 3). The human does nothing.
2. LIVE: you start the website on http://localhost:5173 and the API on http://localhost:3001 with `scripts\qa-live.ps1`.
3. TEST: you use the real browser (Playwright MCP) like a real user, phase by phase (Section 10, T00–T32).
4. FIX: when something is broken, you record it, fix the code immediately, and the live site reloads by itself (Section 7).
5. RETEST: you repeat the EXACT action that failed. Only then is it FIXED.
6. AUTONOMOUS CYCLE: you run the daily loop and prove research → opportunity → decision → preparation → outcome → learning (T30).
7. REPEAT: full passes with a brand-new user until one pass is clean (Section 12).
8. LEDGER: every generated post is recorded complete with lineage (Section 11).
9. REPORT: you write QA_REPORT.md with evidence (Section 13).

The human watches http://localhost:5173 in his own browser. Every fix you make must show up there.

Sections 1 to 7 are HOW YOU OPERATE. They override everything after them.
If you are unsure what to do, follow the stricter rule.

The goal is NOT "user opens the website → manually asks AI to write a post." The goal is a system that continuously observes permitted signals → understands them → identifies opportunities → decides what matters → prepares content/sales actions → learns from outcomes → improves → repeats, stopping honestly at every authorization boundary.

---

# 0. FIRST PRINCIPLES (read before testing anything)

0.1 The Growth Operator is an autonomous growth operating system, not a manual post generator. Every test must ask: did the system observe, understand, decide, prepare, learn — or did a human do the work the system claims?

0.2 24/7 autonomous operation NEVER means: bypassing LinkedIn restrictions, scraping private data, bypassing CAPTCHA, bypassing authentication, violating platform terms, messaging people without authorization, publishing where no authorized integration exists, inventing analytics, customer information, trends, engagement, or business outcomes.

0.3 Where no authorized API/integration exists, the system must stop at the preparation/recommendation boundary and clearly report one of: `UNAVAILABLE`, `BLOCKED`, `REQUIRES_AUTHORIZATION`, `REQUIRES_HUMAN_APPROVAL`, `SOURCE_REVIEW_REQUIRED`, `INSUFFICIENT_DATA`. It must never pretend execution occurred.

0.4 The current repository is the source of truth. Do not reinvent the architecture. Do not replace the system with a new framework. Do not invent a second architecture, second brain, duplicate connectors, or duplicate models. Reuse: Auth, JWT, workspace isolation, onboarding, business profile, audience/ICP, content ideas/plans/drafts/reviews, leads, prospect research, qualification, outreach preparation, Decision Engine, daily loop, approval snapshots, learning, Content DNA, research connectors, social connectors, analytics foundations, AI provider abstraction.

0.5 The product must be GLOBAL and NICHE-AGNOSTIC. Never assume Ankit, Dream Pair, developers, AI, technology, India, or e-books in production logic. Those are test fixtures only (Section 9). A real customer replaces profile, niche, audience, ICP, products, goals, voice, pillars, sources, and sales criteria, and the same system must operate correctly.

0.6 Before every modification ask: "Is this required for the intended product workflow?" If NO, do not change it. If YES, make the smallest change. Never rewrite working modules, rename unrelated APIs, replace frameworks, migrate databases unnecessarily, add Redis/queues/providers unless the architecture truly requires it, or redesign the UI without a functional reason.

---

# 1. FILES YOU MAINTAIN (project root; create if missing)

| File | Purpose | When you write to it |
|---|---|---|
| `QA_STATE.md` | Resume pointer + one result row per step | After EVERY step |
| `QA_DEFECTS.md` | Defect register (original failure is never deleted) | Before touching code, then after each fix |
| `QA_LEDGER.md` | Every generated post, complete text | Immediately when a post exists |
| `QA_HUMAN.md` | Things only the human can do | When you need him |
| `QA_REPORT.md` | Final report | End of the run |
| `.qa/logs/` | Server logs (written by the launcher) | Read only |
| `.qa/shots/` | Screenshots named `<STEP-ID>.png` | When useful |

`QA_STATE.md` header (keep updated):

```text
RUN ID: R<YYYYMMDDHHMM>   PASS: <n>   USER: <email>
SETUP: OK / NOT OK
NEXT STEP: <step id>
LAST COMMAND: <exact command and result in one line>
```

Result row format (one line per step):

```text
| STEP-ID | RESULT | EVIDENCE LEVEL | URL | what I did -> what I saw | console / network | DEFECT ID |
```

## 1.1 Resume protocol
If you start and `QA_STATE.md` already exists: read it, `QA_DEFECTS.md`, recent git history, then run `scripts\qa-live.ps1 -Action status`, and continue from `NEXT STEP`. Never restart a phase that already has results.

---

# 2. OPERATING PROTOCOL (THE NO-STUCK RULES)

## 2.1 Shell rules (Windows PowerShell 5.1)
DO:
- Separate commands with `;`. Quote every path that contains spaces.
- Use `Invoke-WebRequest -UseBasicParsing -TimeoutSec 10` and `Invoke-RestMethod -TimeoutSec 10`.
- Read logs with `Get-Content <file> -Tail 40`.
- Run tests in run-once mode. Read the `package.json` files first to find the exact commands.
- Start, stop and restart servers ONLY with `scripts\qa-live.ps1` (Section 4).

DO NOT:
- Do NOT use `&&`.
- Do NOT use `curl` (it is an alias in PowerShell 5.1).
- Do NOT run in the foreground: `pnpm dev`, `tsx watch`, `vite`, any watch mode, `docker compose up` without `-d`, `docker logs -f`, `Get-Content -Wait`.
- Do NOT put flags like `--parallel` after a script name (`pnpm ... dev --parallel` crashes Vite).
- Do NOT run `taskkill` or `Stop-Process` yourself. Only the launcher stops servers.
- Do NOT run any command that waits for keyboard input.
- Do NOT use sub-agents or "General Task" for setup, servers or tests. Do the work yourself.
- Do NOT print secrets. For `.env`, report only `configured: yes/no`.

## 2.2 Time limits
- Any shell command: 120 seconds. Test commands: 180 seconds. If exceeded: stop it, log it, run a narrower command.
- Any browser action: wait up to 30 seconds for the expected result. Then take one snapshot, retry ONCE, then record the step as FAIL (if the app is wrong) or BLOCKED (if the tool is stuck) and move on.
- Any single step: 10 minutes maximum.
- Never run the same failing command more than 2 times. On the 3rd try, change the approach.
- Max 3 fix attempts per defect (Section 7).

## 2.3 If you feel stuck
Signs: no output twice, same action repeating, waiting for something that will not come.
Do this:
1. Write a `STUCK:` line in `QA_STATE.md` (step, last command, last output).
2. Switch approach (different command, narrower scope, fresh snapshot, reload the page).
3. If there is no other approach: mark the step `BLOCKED (tooling)` with the reason and go to the next independent step.
4. Halt the whole run ONLY for a foundational failure: servers cannot run, database is down, browser cannot open the site. Then use Section 2.4.

## 2.4 Asking the human
Foundational problem -> stop and write in chat exactly:

```text
WAITING FOR HUMAN: <what is wrong> | NEEDED: <exact action> | THEN REPLY: continue
```

Also append it to `QA_HUMAN.md`.
Non-foundational request (for example "approve a schema change") -> append to `QA_HUMAN.md`, mark that item `NEEDS_HUMAN`, and KEEP TESTING. List all open requests at the end of every pass.

## 2.5 Chat discipline
- Keep chat messages to 5 lines or fewer during the run.
- Evidence goes into the files, not into chat.
- After each phase write one line: `T05 done: 22 steps | PASS 19 | FAIL 1 | BLOCKED 2 | defects D-004`.
- After each fix write one line: `FIXED D-003 - reload http://localhost:5173/<page> to see it`.

---

# 3. ENVIRONMENT SETUP (do this first, in order, no human needed)

Write the result of each step in `QA_STATE.md` as `S01`, `S02`, ...

**S01 Location.** Confirm the current folder is the project root (it has `package.json` and `pnpm-workspace.yaml`). Record:
`git rev-parse --short HEAD ; git branch --show-current ; git status --short`

**S02 Tracking files.** Create the files from Section 1. Then keep them out of git without touching tracked files:

```powershell
Add-Content -LiteralPath ".git\info\exclude" -Value "QA_*.md","QA_*.png",".qa/"
```

**S03 Launcher.** If `scripts\qa-live.ps1` does not exist, create it EXACTLY as written in Appendix A. This script is the ONLY way you start, stop or restart servers.

**S04 Toolchain and database.**
- `node --version ; pnpm --version`
- Find how the database runs (look for `docker-compose*.yml`). Run `docker ps --format "{{.Names}} {{.Status}}"`.
- If Docker works but the database container is stopped: start it detached (`docker compose up -d <db service>`).
- If Docker is not running at all: `WAITING FOR HUMAN` (ask him to start Docker Desktop).

**S05 Dependencies.** If `node_modules` is missing: `WAITING FOR HUMAN` (ask him to run `pnpm install`). Otherwise do nothing.

**S06 Environment variables (presence only, never values).** Find the variable names in `.env.example` or `apps\api\src\config\env.ts`. Then, for each name (database, auth secret, AI provider key, social connector key):

```powershell
$names = 'DATABASE_URL','<AI_KEY_NAME>','<SOCIAL_KEY_NAME>'
foreach ($n in $names) { $hit = Select-String -LiteralPath '.env' -Pattern "^$n=.+" -Quiet; "$n configured: $hit" }
```

Record `AI provider configured: yes/no` and `social credentials configured: yes/no`.

**S07 Migrations.** Run the project's existing Prisma "migrate status" command. If migrations are pending, apply them with the project's existing command (earlier runs used `pnpm --filter=@growth-operator/db db:migrate`). Do NOT create or edit migrations or `schema.prisma`.

**S08 Prisma client.** If the client is not generated, generate it now while servers are stopped. (On Windows, generating while the API runs fails with a file-lock error.)

**S09 Current state.** Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action status`.
- Port open and `http_ok=True`: the human already runs it. ADOPT it. Do not restart it.
- Port open but `http_ok=False`: unknown process -> `WAITING FOR HUMAN`.

**S10 Start.** Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action start
```

Expected last lines: `READY`. The command returns by itself in at most about 90 seconds.
If it prints `NOT READY`: read `Get-Content .qa\logs\api.log -Tail 40` and the web log, find the FIRST real error, and fix it using Section 7. Likely causes: missing env variable, database down, pending migration, Prisma client not generated, port already used.
Do NOT edit `vite.config.ts`, ports, host or listen addresses to get around it. After 3 failed attempts: `WAITING FOR HUMAN`.

**S11 HTTP check.**
`Invoke-RestMethod http://localhost:3001/api/v1/health -TimeoutSec 10`
`Invoke-RestMethod http://localhost:3001/api/v1/ready -TimeoutSec 10`
`(Invoke-WebRequest -UseBasicParsing http://localhost:5173 -TimeoutSec 10).StatusCode`

**S12 Browser.** With Playwright, open `http://localhost:5173`. If it fails, try `http://127.0.0.1:5173` once. Take a screenshot `.qa/shots/S12.png`. If it still fails: `WAITING FOR HUMAN`.

**S13 Announce and start.** Write in chat one line:
`LIVE: http://localhost:5173 (API http://localhost:3001). Starting tests.`
Set `SETUP: OK` in `QA_STATE.md` and begin T00 immediately. Do not wait for a reply.

---

# 4. LIVE-CHANGE PROTOCOL (how fixes stay visible on localhost)

- The API runs with `tsx watch` and the web app with Vite HMR. When you save a source file they reload by themselves. Do not restart them for normal code edits.
- After every edit: wait up to 10 seconds, run the launcher with `-Action status`, confirm both show `http_ok=True`, then reload the page in Playwright.
- If the API crashes after your edit: read `Get-Content .qa\logs\api.log -Tail 40`, find the first real error, fix it.
- A restart IS needed only for: Prisma client generate, `.env` changes, new dependencies. Do exactly this:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action stop -Target api
<run the generate / install / migrate command>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action start -Target api
```

- If a server was adopted (started by the human), the launcher prints `CANNOT RESTART`. Then write `WAITING FOR HUMAN` and tell him which window to restart.
- Never change ports. The site is always `http://localhost:5173`. The API is always `http://localhost:3001`.
- Screenshots and Playwright use the SAME URL as the human.

---

# 5. ABSOLUTE RULES (breaking any one invalidates the run)

**A. Evidence**
- R01 The real browser is the primary proof. API, database and source code can support a test. They never replace it.
- R02 PASS only if: the feature was actually exercised, the expected result was seen, it persisted (where persistence is part of the feature), downstream behavior was verified (where it is part of the feature), evidence was captured, and no unresolved critical error affected it.
- R03 Never PASS because: code exists, an API returned 200, a database row exists, a button exists, a component renders, a test file exists, "it looks right", or a related feature passed.
- R04 For intelligence and cross-machine features prove the full path: `PRODUCER -> PERSISTENCE -> READER -> CONSUMER -> VISIBLE RESULT`. If only the producer works, it is not PASS.
- R05 BLOCKED is never PASS. If a dependency blocks testing: mark it BLOCKED or UNAVAILABLE, test the degraded state, and do not mark downstream features PASS.
- R06 Never say "fixed", "passes", "working", "verified" or "pushed" unless you ran the command or action in THIS run and read the real result.

**B. Honesty**
- R07 Never fabricate: sources, URLs, timestamps, statistics, reach, views, likes, comments, shares, saves, clicks, followers, engagement, leads, lead facts, conversations, buying intent, audience intent, testimonials, social proof, business outcomes, AI output.
- R08 When evidence is missing the product must show `UNAVAILABLE`, `INSUFFICIENT_DATA`, `UNKNOWN` or `SOURCE_REVIEW_REQUIRED`. A missing metric must never show as `0`.
- R09 Synthetic test data is allowed. Synthetic results presented as real-world performance are forbidden. All QA-entered outcomes must be labelled `SYNTHETIC-QA` and evidence level is capped at E4.
- R10 Tester-typed drafts are allowed ONLY to exercise review, approval and quality gates. Label them `TESTER-TYPED`. Never count them as product-generated and never claim AI wrote them.

**C. Boundaries**
- R11 Recommendation is not approval. Approval is not execution. Preparation is not execution.
- R12 No fake `sent`, `published`, `connected`, `messaged` or `engaged` state anywhere.
- R13 No real outreach to anyone. No real posting. If a real authorized integration exists, ask the human first (`QA_HUMAN.md`) before any real action.
- R14 Never bypass: authentication, approval, execution limits, CAPTCHA, rate limits, privacy controls, platform terms. Never scrape.
- R15 If any safety boundary can be bypassed through the UI: log as P0, STOP other testing, fix, retest, then resume.

**D. Method**
- R16 Create all data through the UI. Never write to the database. Never call an API to do a UI action.
- R17 Allowed non-browser checks (read-only or negative probes only): health/ready endpoints, a server-side validation probe with an invalid body, test commands, git status/diff/log, reading logs.
- R18 Never delete or weaken a test. Never hide an error. Never change the expected behavior without recording a requirement change in `QA_DEFECTS.md`.
- R19 Do NOT run `git commit`, `git push`, `git checkout`, `git reset`, `git clean`. Fixes stay in the working tree.
- R20 The product must not depend on the Ankit demo profile (see T28-06).
- R21 Never claim a connector works merely because code exists. Each connector must prove its status in the browser: `NOT_IMPLEMENTED` / `IMPLEMENTED` / `CONFIGURED` / `CONNECTED` / `REAL_REQUEST_VERIFIED` / `WORKING` / `BLOCKED` / `UNAVAILABLE` / `REQUIRES_APPROVAL`.
- R22 Never claim `TRENDING` from one arbitrary source. Trend status requires the product's evidence threshold (T12).
- R23 A liker is not a prospect. A commenter is not a buyer. Engagement never auto-converts to a lead.
- R24 Learning maturity must never be skipped: `UNKNOWN -> OBSERVED -> REPEATED_SIGNAL -> HYPOTHESIS -> EXPERIMENT -> SUPPORTED_PATTERN -> CONFIRMED`. One winning post is an observation, not a cause.
- R25 Critical quality failures override numeric scores. A high score never approves a blocked draft.

---

# 6. RESULT STATES AND EVIDENCE LEVELS

Every step ends with exactly ONE state:

| State | Meaning | Required proof |
|---|---|---|
| `PASS` | Performed in the browser; expected = actual; clean | Step row with evidence |
| `FAIL` | Performed; expected != actual | Defect record |
| `PARTIAL` | Some sub-checks passed, some did not | List exactly which |
| `BLOCKED` | Cannot be performed because of a PROVEN cause (no internet, no AI key, no credentials, tooling stuck) | The exact error text and where you saw it |
| `UNAVAILABLE` | The product honestly reports the capability does not exist or is not configured | The visible message |
| `NOT_TESTED` | Not performed | Reason. Allowed only for non-critical steps. Counts against completion |

Invalid excuses (never accept them): "needs opportunities", "needs data", "external limit" without a root cause, "takes too long". If data is missing, create synthetic data through the UI (R16) and continue.

| Level | Meaning |
|---|---|
| E0 | Assumption. Cannot PASS |
| E1 | Source/API existence. Diagnosis only |
| E2 | Real browser action completed. Needed for UI PASS |
| E3 | Survived refresh / reopen / logout-login. Needed for persistence PASS |
| E4 | Consumed by the intended downstream feature. Needed for bridge PASS |
| E5 | Real outcome measured and fed into learning |

Autonomous-cycle evidence (T30): a bridge step may only claim E4 when all five links are recorded: producer (what created it, record ID), persistence (survives refresh/logout-login), reader (what read it), consumer (what used it), visible/behavioral result with source attribution. Learning-influence claims additionally require the future recommendation that cites the learning (E5 when a measured outcome fed it).

---

# 7. DEFECT -> FIX -> RETEST LOOP (fix mode is ON; the human authorized it)

For EVERY problem, do these steps in order:

1. **FREEZE.** Before touching code, add to `QA_DEFECTS.md`: ID (`D-001`...), severity, phase, step ID, URL, exact user action, expected, actual, console error, network status and URL, screenshot path, timestamp.
2. **DIAGNOSE.** Find the FIRST real error: visible message, network response, `Get-Content .qa\logs\api.log -Tail 40`, then the source code. Inspect current implementation first; reuse existing models, services, routes, workers, connectors.
3. **CLASSIFY.** One of:
   - `PRODUCT_DEFECT`: the app is wrong. Fix it.
   - `ENVIRONMENT_LIMIT`: no internet, no AI key, no credentials. Do NOT fix. Verify the app handles it honestly. If the app shows a 500, blank screen, endless loading or fake success, that is a `PRODUCT_DEFECT`.
   - `TEST_ERROR`: your own mistake. Correct yourself and redo the step.
4. **FIX** with the smallest correct change.
   - Allowed to edit: application source and tests under `apps\` and `packages\`.
   - NOT allowed without the human (mark `NEEDS_HUMAN`, keep testing): `schema.prisma`, migrations, ports/host/Vite config, dependency changes, rewriting auth / approval / workspace isolation architecture, deleting features.
5. **REGRESSION TEST.** Add or update the smallest test. Run it (run-once). Read the result.
6. **LIVE RELOAD.** Wait for the watcher/HMR (Section 4). Check `-Action status`.
7. **EXACT RETEST.** Repeat the EXACT browser action recorded in step 1.
8. **CHECK** console and network for that action.
9. **RELEVANT REGRESSION.** Run the tests and typecheck of the package you changed.
10. **CLOSE.** Mark `FIXED` only if steps 7, 8 and 9 are clean. Otherwise go back to step 2.
    After 3 failed attempts: mark `DEFERRED` with all evidence and continue testing.
11. **CONTINUE.** Re-run the whole step that failed, then proceed. Post the one-line `FIXED` message (Section 2.5).

Never: weaken validation, redesign unrelated pages, rename unrelated APIs, add infrastructure, change product requirements, replace architecture, delete functionality. If you find a bigger architectural problem: record it, fix only what the current defect needs, report the rest separately.

Severity: **P0** safety / security / isolation breach / fake sent-published state / data loss. **P1** critical flow blocked, 500 storm, 403 storm. **P2** feature wrong but a workaround exists. **P3** UX / validation / message problem. **P4** cosmetic.

The original failure stays in the report even after it is fixed.

---

# 8. PRODUCT CONTRACT (what you are testing)

One system, three machines, one shared brain.

## 8.1 Content Generation Machine
`Discover -> Collect -> Extract -> Understand -> Verify -> Filter -> Match -> Strategize -> Generate -> Validate -> Review -> Approve -> Publish/Prepare -> Measure -> Learn`
Content must be creatable from: trend intelligence, research sources, content pillars, user ideas, public URLs, content gaps, high-performing previous content, audience signals, sales signals, sales objections, experiments, learning proposals, daily brain recommendations, business objectives, manual generator. EVERY post has lineage (Section 11.1): why created, which feature, what source/evidence, intended audience, intended objective, Content DNA used, AI used (provider/model), user- vs system-created, validation, post-publication outcome.

## 8.2 Growth Intelligence Machine
`Consistent Publishing -> Measure -> Compare -> Patterns -> Evidence -> Hypothesis -> Experiment -> New Content -> Measure Again -> Learn`. It must never guarantee "maximum reach". Required outputs: what was observed, what evidence exists, what is correlated, what is unknown, what hypothesis is proposed, what experiment would test it, whether the hypothesis is supported. Maturity ladder (R24) is mandatory.

## 8.3 Sales Machine
`ICP -> Discovery -> Research -> Qualification -> Engagement Analysis -> Intent -> Prioritization -> Personalization -> Outreach Preparation -> Approval -> Authorized Execution -> Response -> Follow-up -> Pipeline -> Outcome -> Learning`. A liker is not a prospect. A commenter is not a buyer. Sales states must include: `WAIT`, `NURTURE`, `NO_OUTREACH`, `DISMISS`, `READY_FOR_REVIEW`, `READY_FOR_AUTHORIZED_EXECUTION`. No prospect becomes a customer without evidence. No blind spam.

## 8.4 Shared Growth Brain
`Business + Audience + Market + Content + Sales + Outcomes + Learning -> Growth Brain -> Decision Engine -> Content/Sales -> Human Approval -> Authorized Action -> Outcome -> Learning`.
Required bridges (each proven PRODUCER -> PERSISTENCE -> READER -> CONSUMER -> VISIBLE RESULT, R04):
1. Trend -> Content. 2. Content Performance -> Learning. 3. Audience Engagement -> Sales. 4. Sales Objection -> Content. 5. Sales Outcome -> Learning. 6. Content Performance -> Audience/Sales. 7. Business Objective -> Decision. 8. Learning -> Future Decision. 9. Sales Signals -> Content Opportunities. 10. Content Signals -> Sales Opportunities.

## 8.5 Autonomous daily loop (conceptual; verified in T25/T30)
INTELLIGENCE (ingest permitted sources, dedupe, freshness, topics, trends, gaps, signals) -> DECISION (rank with objectives, fit, freshness, learning; produce why + why-not) -> CONTENT (opportunities, plans, drafts if AI available, validate, queue) -> SALES (research, qualify, relevant content, outreach, queue) -> APPROVAL (snapshot with evidence/risk/provenance) -> EXECUTION (only where authorized, else PREPARED/BLOCKED) -> OBSERVE (real outcomes linked to actions) -> LEARN (DNA, brains, proposals, maturity-gated weights) -> DIGEST (completed, blocked, learning, opportunities, human requests) -> repeat. Required properties: scheduled runs, idempotent runs, retry handling, per-stage failure isolation, budgets/quotas, pause, kill switch, workspace isolation, audit trail, run history, stage status with failure reasons.

## 8.6 Boundaries that must stay visible
Research/analyze/rank/prepare/draft/recommend/queue/learn are autonomous. Consequential external actions (messaging, connection requests, publishing, commenting, scraping private data) require explicit authorization or an actually authorized integration inside a defined policy. AI is a dependency, not the system: when unavailable the product reports `AI_UNAVAILABLE` (expected HTTP 503 + visible message), keeps research/deterministic processing running, never fabricates output, never saves empty successful drafts, and resumes AI stages when the provider returns. Analytics distinguishes ATTENTION -> INTEREST -> ENGAGEMENT -> INTENT -> CONVERSATION -> OPPORTUNITY -> BUSINESS OUTCOME; reach is not revenue and no fake growth score may combine them.

---

# 9. SYNTHETIC TEST DATA

**Run ID:** `R<YYYYMMDDHHMM>`, created at the start of each pass.

**User (new for every pass):** name `Ankit Verma Demo QA<pass>`, email `qa.growthoperator+<RUNID>@example.com`, a strong fake local-only password. Store both in `QA_STATE.md`. No real credentials.

## 9.1 Workspace A: "Ankit Demo Growth <RUNID>"
- Person: Ankit Verma, Demo Growth Operator, Developer / AI & Technology Builder.
- Business: a website selling e-books and practical guides about improving existing skills and learning new AI, technology and digital skills that can help people become financially independent.
- Objectives: build authority; grow a relevant technical audience; learn which content attracts the right people; qualified traffic; relevant conversations; potential customers for digital products.
- Themes: AI tools, AI workflows, AI coding, agentic AI, developer tools, software development, automation, emerging technology, AI news, new AI products, practical AI use cases, digital skills, monetizable tech skills, freelancing, startup technology, productivity, coding, AI-assisted development.
- Audience: software developers, full-stack developers, AI/ML engineers, DevOps engineers, technical founders, startup founders, indie hackers, CTOs, tech leads, engineering managers, AI learners, people monetizing digital skills, students/freshers.
- ICP high relevance: Software Developer, Full-Stack Developer, AI Engineer, ML Engineer, DevOps Engineer, Technical Founder, Startup Founder, Indie Hacker, CTO, Tech Lead.
- Buying intent: learning AI; developer productivity; building AI products; monetizable digital skills; freelancing; starting a tech business; buying practical learning resources.
- Exclusions: unrelated profiles, obvious spam, irrelevant promotion, insufficient relevance evidence.
- Voice: practical, plain, no hype. Banned words: `game-changer`, `revolutionary`, `unlock`, `delve`, `supercharge`. Preferred words: `practical`, `step-by-step`, `workflow`.
- Proof points: enter 2 items, each starting with `SYNTHETIC DEMO proof point:`.
- Samples: 2 short sample posts (tester-typed).
- Timezone `Asia/Kolkata`. Schedule: Mon / Wed / Fri 09:00. Budgets: set a LOW daily AI/action cap so T25 can test enforcement.

## 9.2 Workspace B: "Second Demo Workspace <RUNID>" (different niche on purpose)
Dream Pair AI: AI customer-support automation SaaS for Indian ecommerce businesses. Audience: Indian D2C founders, ecommerce operators, growth managers, customer-support teams. Roles: Founder, CEO, Co-Founder, Head of Growth, Growth Manager, Customer Success Lead, Marketing Manager. Pillars: AI automation, Customer experience, Ecommerce growth, AI agents, Startup execution.

## 9.3 Isolation markers
`ISO-A-<RUNID>` goes into records of A. `ISO-B-<RUNID>` goes into records of B. A marker must never appear in the other workspace.

## 9.4 Sources (examples; if one is unreachable, root-cause it, then try the next)
- RSS: `https://news.ycombinator.com/rss`
- Atom: `https://github.com/microsoft/vscode/releases.atom`
- Public blog feed: `https://github.blog/feed/`
- Public technical feed: `https://dev.to/feed`
- Approved public URL: `https://github.com/microsoft/vscode`
- Invalid URL tests: `not a url`, `htp:/broken`, `https://`
- Duplicate test: add the HN RSS source a second time.

## 9.5 Leads (20). Import through the UI (CSV upload or manual entry, whichever the product supports)
LinkedIn URL pattern: `https://www.linkedin.com/in/demo-qa-<id>-<RUNID>`. These are fake. The app must never fetch or scrape them.

| ID | Name | Role | Company | Class | Expected direction |
|---|---|---|---|---|---|
| H1 | Aarav Mehta | Technical Founder / CTO | DemoStack Labs | HIGHLY RELEVANT | READY_FOR_REVIEW at most |
| H2 | Neha Iyer | AI Engineer | DemoML Works | HIGHLY RELEVANT | READY_FOR_REVIEW at most |
| H3 | Kabir Rao | Indie Hacker / Founder | DemoShip Studio | HIGHLY RELEVANT | READY_FOR_REVIEW at most |
| R1 | Rohan Desai | Full-Stack Developer | DemoWeb Co | RELEVANT | NURTURE / READY_FOR_REVIEW |
| R2 | Ishita Nair | DevOps Engineer | DemoCloudOps | RELEVANT | NURTURE / READY_FOR_REVIEW |
| R3 | Vikram Shah | Tech Lead | DemoPay Tech | RELEVANT | NURTURE / READY_FOR_REVIEW |
| R4 | Sana Khan | Software Developer | DemoApps | RELEVANT | NURTURE |
| R5 | Arjun Patel | Startup Founder | DemoLaunch | RELEVANT | NURTURE / READY_FOR_REVIEW |
| R6 | Meera Joshi | ML Engineer | DemoVision AI | RELEVANT | NURTURE |
| R7 | Dev Malhotra | Engineering Manager | DemoSoft | RELEVANT | NURTURE |
| R8 | Tanvi Kulkarni | Student, learning AI | DemoTech Institute | RELEVANT | NURTURE |
| R9 | Rahul Bose | Freelance Developer | Self-employed | RELEVANT | NURTURE |
| R10 | Pooja Reddy | Software Developer (learning AI) | DemoBank Tech | RELEVANT | NURTURE |
| I1 | Mr Promo King | Promoter | DemoPromo | IRRELEVANT (spam) | NO_OUTREACH / DISMISS |
| I2 | Sunita Verma | Real estate agent | DemoHomes | IRRELEVANT | NO_OUTREACH / DISMISS |
| I3 | Karan Bedi | Wedding photographer | DemoClicks | IRRELEVANT | NO_OUTREACH / DISMISS |
| I4 | Growth Hacks 4U | Follower seller | DemoFollowers | IRRELEVANT (spam) | NO_OUTREACH / DISMISS |
| I5 | Anil Gupta | Accountant | DemoAccounts | IRRELEVANT | NO_OUTREACH / DISMISS |
| N1 | Priya S. | (blank) | (blank) | INSUFFICIENT DATA | WAIT, needs more info |
| N2 | Rahul K. | (blank) | DemoCorp | INSUFFICIENT DATA | WAIT, needs more info |

Total 20 = 3 highly relevant + 10 relevant + 5 irrelevant + 2 insufficient. Also prepare 1 duplicate (re-import R1) and 1 malformed row (missing name).
Do not expect exact scores. Check the direction only. No lead may end as READY_FOR_AUTHORIZED_EXECUTION while no authorized integration exists.

## 9.6 Engagement scenarios (T19/T22; only if the UI supports adding engagement signals; otherwise `UNAVAILABLE`)
- E1: I2 (irrelevant) likes 3 posts. It must NOT become a prospect.
- E2: N1 comments once with no profile data. It must stay `INSUFFICIENT_DATA` / WAIT.
- E3: H1 leaves 2 meaningful comments on 2 different posts. It may rise as a high-intent candidate with stated evidence.
- E4: I4 (spam) comments. It must be filtered.
- A single like must never be shown as buying intent.

## 9.7 Own idea (T15 path)
`Why most developers should ship one small AI workflow before learning another framework.`

## 9.8 Tester-typed drafts (label `TESTER-TYPED`; used in T17)
- **TT-A:** Most developers don't need another AI framework. They need one small workflow that removes a repetitive task from their week. Pick one task, automate it, and measure the time saved yourself. Practical beats impressive. What is the one task you would automate first?
- **TT-B:** Learning a monetizable digital skill is less about finding the perfect course and more about shipping one small, useful project. Start with a problem someone already has, build a tiny solution, and document what you learned.
- **TT-C:** A checklist before you adopt a new AI coding tool: 1) Does it fit your current workflow? 2) Can you review everything it writes? 3) What happens to your code and data? 4) Can you stop using it easily?

## 9.9 Negative-control drafts (type through the manual editor; the quality gates MUST catch each)
- **NC1** (unsupported statistic): `Developers who use AI tools ship 340% faster. Studies prove it.`
- **NC2** (fake social proof / testimonial): `10,000+ developers already love our guides. One reader said: "This changed my life."`
- **NC3** (unsupported experience claim): `After 15 years building AI systems at Google, I can tell you this is the only way.`
- **NC4** (banned vocabulary): `This game-changer will unlock revolutionary results and supercharge your career.`
- **NC5** (exact duplicate): an exact copy of TT-A.
- **NC6** (near duplicate): TT-A with two words changed.

Each NC must be flagged, and a critical failure must prevent READY / APPROVED even if a numeric score is high.

---

# 10. TEST PHASES

Run in order. Every step gets a row in `QA_STATE.md` (Section 1). A phase is closed only when EVERY step has a result. Re-read Sections 5 and 6 before each phase.

## T00 Environment
- T00-01 Frontend opens in the real browser at `http://localhost:5173`; no blank screen. Screenshot.
- T00-02 `/api/v1/health` returns OK.
- T00-03 `/api/v1/ready` shows the database connected and reports pending migrations honestly.
- T00-04 No persistent 500 storm in console or network on first load.
- T00-05 Record: commit, branch, frontend URL, backend URL, DB, browser + version, viewport, AI provider configured yes/no, integrations configured yes/no, start time.

## T01 Auth
- T01-01 Register the fresh account (Section 9).
- T01-02 Invalid registration: empty fields show field-level messages (for example "Email is required"); bad email; weak password.
- T01-03 Duplicate registration is rejected with a clear message.
- T01-04 Login.
- T01-05 Wrong password: clear message.
- T01-06 Unknown email: clear message.
- T01-07 Empty login fields: field-level messages, not "Invalid credentials".
- T01-08 Session persists after a browser refresh.
- T01-09 A protected route while logged out is denied or redirected.
- T01-10 Click the visible logout control. The login screen appears. (Source inspection is never enough.)
- T01-11 After logout, a protected route is denied via direct URL AND the browser back button.
- T01-12 Login again.
- T01-13 Expired session: clear the auth token stored in the browser, perform an action. Expected: clean redirect or message, no blank screen, no redirect loop.
- T01-14 Server-side validation (allowed probe, R17): send an empty body to the login endpoint. Expected 400, not 500.

## T02 Workspace creation
- T02-01 A fresh account shows a clear "create workspace" control. No 403 requests, no console errors, no "Something went wrong".
- T02-02 Create Workspace A (9.1).
- T02-03 The active workspace is shown.
- T02-04 Create Workspace B (9.2). If the UI cannot, that is a P1 defect: fix it, retest. Never insert it any other way.

## T03 Workspace isolation
- T03-01 Switch A -> B. T03-02 Switch B -> A.
- T03-03 Create records in A containing `ISO-A-<RUNID>` (a profile field, a source or idea, a lead).
- T03-04 For each page, confirm the A marker does not appear in B, one result per page: (a) dashboard (b) profile (c) audience (d) content (e) leads (f) intelligence (g) recommendations (h) learning (i) settings.
- T03-05 Create records in B containing `ISO-B-<RUNID>`; confirm none appear in A (same 9 pages).
- T03-06 Refresh; isolation still holds.
- T03-07 Logout, login: the LAST USED workspace reopens (not always the first).
- T03-08 Re-check isolation in both directions after login.

## T04 Profile (in Workspace A)
`ENTER -> SAVE -> REFRESH -> REOPEN -> VERIFY`: headline, role, summary, professional context, industry, location, LinkedIn URL. Invalid inputs (empty required, over-long, bad URL): clear messages. The system must not invent profile facts left empty.

## T05 Audience / ICP (in Workspace A)
`ENTER -> SAVE -> REFRESH -> REOPEN -> VERIFY` for: ideal audiences, ICP (name, roles, industries, problems, exclusions), behavioral segments. Invalid inputs: clear messages. No invented audience facts.

## T06 Business objectives (in Workspace A)
`ENTER -> SAVE -> REFRESH -> REOPEN -> VERIFY` for: pillars, objectives, offers, sales goals, brand, proof points (2 items starting `SYNTHETIC DEMO proof point:`), content samples (2 tester-typed). No invented business facts.

## T07 Voice (in Workspace A)
`ENTER -> SAVE -> REFRESH -> REOPEN -> VERIFY` for: voice profile (tone, style), banned vocabulary (9.1 list), preferred vocabulary (9.1 list). Invalid inputs: clear messages.

## T08 Schedule, budgets, autonomy (in Workspace A)
`ENTER -> SAVE -> REFRESH -> REOPEN -> VERIFY` for: autonomy policy, timezone `Asia/Kolkata`, schedule Mon/Wed/Fri 09:00, LOW daily AI/action caps (needed by T25), pause control, kill switch. Negative budgets rejected clearly.

## T09 Invalid-input sweep
Invalid inputs per section visited in T04–T08 (empty required, over-long, bad URL, negative budget): clear messages, no 500, no silent corruption.

## T10 Research sources
For each source in 9.4: add, save, validate, run discovery, provenance (source URL kept), timestamp kept, freshness shown, deduplication (run twice, no duplicates), failure handling.
- T10-01 RSS (HN). T10-02 Atom (GitHub). T10-03 Public blog feed. T10-04 Public technical feed. T10-05 Approved public URL.
- T10-06 Invalid URLs are rejected clearly.
- T10-07 Duplicate source is rejected clearly.
- T10-08 Edit a source. T10-09 Pause and resume (a paused source is not fetched). T10-10 Remove a source.
- T10-11 Failure isolation: one failing source does not stop the others and does not make the whole system look successful.
- T10-12 ROOT-CAUSE EVERY FAILED SOURCE. Read the UI message, the network response, and `Get-Content .qa\logs\api.log -Tail 40`. Classify: `NETWORK` (this machine cannot reach it) / `BAD_URL` / `APP_DEFECT` (the app's own fetcher, guard or parser is wrong). `APP_DEFECT` goes through Section 7. Only `NETWORK` may be labelled BLOCKED.
- T10-13 If every source fails for NETWORK reasons: mark `BLOCKED` with proof, then check whether the product lets a user add an opportunity or idea by hand. If not, log a product gap (do not fabricate one).
- T10-14 Connector statuses (only if the UI has a Connectors area): Instagram, Facebook, LinkedIn, YouTube, X each show an honest status (Not configured / Not connected / Connected / Error / Expired) per R21. With no connector connected the app works as before. No credentials -> `Not configured` plus guidance. Live OAuth is `BLOCKED` with that reason. Never simulate a connection. Workspace A's connection never appears in B. No token in network responses or page source. A missing connector key gives an honest message, not a 500.

## T11 Intelligence ingestion
- T11-01 For fetched material, verify the chain step by step: extraction -> claims -> topics -> trends -> relevance -> freshness -> audience fit -> gaps -> opportunities (one result each).
- T11-02 Every opportunity answers: What is it? Where did it come from? Why relevant? To whom? How fresh? What evidence? How confident? Why might it not be useful?
- T11-03 A single source is NOT labelled TRENDING without the product's evidence threshold (R22).
- T11-04 Claims are linked to evidence or flagged `SOURCE_REVIEW_REQUIRED`.
- T11-05 Research continues where possible when AI is unavailable; deterministic processing is not blocked by an AI outage.

## T12 Trend detection
- T12-01 Topics emerge from collected sources, not from hardcoded lists.
- T12-02 Trend status distinguishes EMERGING / RECENT / RELEVANT / TRENDING / EVERGREEN / UNKNOWN with the product's evidence threshold visible or honestly absent.
- T12-03 Recency, frequency, source diversity, audience fit, and business relevance are visible or honestly marked unknown. Missing signals are never treated as zero.

## T13 Content opportunities
- T13-01 Opportunities carry provenance (source IDs, claim IDs, trend IDs) and survive refresh.
- T13-02 Accept/state-change is NOT approval and executes nothing.
- T13-03 Reject/dismiss is recorded and does not silently return.

## T14 Decision Engine
- T14-01 The queue shows an honest empty state when there is nothing.
- T14-02 For each type, record whether the queue produced it or why not: trends, content opportunities, content gaps, audience signals, sales signals, follow-ups, stale work, reviews, learning, business objectives.
- T14-03 Every recommendation shows: recommendation, objective level, score/reasoning, evidence, freshness, signal confidence, recommendation confidence, why-not, next action.
- T14-04 ACCEPT: state changes; it is NOT an approval; nothing executes. Check the approvals list and loop status.
- T14-05 REJECT: state changes; recorded; does not silently return.
- T14-06 DEFER / DISMISS / ARCHIVE (where supported): state and downstream effect verified.
- T14R-01 After T21, re-run T14-02 to T14-06 with the full data and report which types now appear.

## T15 Content generation
- T15-00 AI preflight. Trigger ONE AI-dependent action in the browser. Record: `AI_STATE = AVAILABLE` only if the UI shows real AI output AND the request succeeded (record provider/model). `AI_STATE = UNAVAILABLE` if the product honestly shows AI unavailable (expected HTTP 503 + visible message). Anything else (500, blank, fake text) is a defect.
- One attempt through EACH path. Record the post in `QA_LEDGER.md` the moment it exists. Paths: Trend Intelligence, Content Pillar, User's Own Idea (9.7), Public URL Research, Content Gap, High-Performing Post Learning, Audience Signal, Sales Signal, Sales Objection, Experiment/Learning, Daily Brain Recommendation, Manual Content Generator.
  - A path with no draft because `AI_STATE = UNAVAILABLE` -> `UNAVAILABLE` (after seeing the honest message for that path).
  - A path with no upstream signal -> create the signal through the UI if possible, otherwise `BLOCKED` with the reason.
  - Never silently replace one path with another.
- T15-13 Negative controls NC1 to NC6 (9.9). One step each: each is caught by the quality gates.
- T15-14 Quality gates are visible for each draft (Section 11.3). A critical failure blocks READY / APPROVED (R25).
- T15-15 Submitting the same idea twice is flagged as a duplicate.
- T15-16 Every generated post has complete lineage (Section 11.1).

## T16 Content validation (deterministic gates)
For product-generated and tester-typed drafts, verify each gate fires on the right input: source validity, claim validity, factuality, freshness, originality, exact duplicate, near duplicate, audience fit, ICP fit, voice, banned words, unsupported statistics, unsupported social proof, unsupported experience claims, CTA, objective, readability. Critical failures override numeric scores (R25).

## T17 Review, approval, publishing boundary
Use product-generated drafts when they exist. Otherwise use TT-A, TT-B, TT-C labelled `TESTER-TYPED`.
- T17-01 Open. T17-02 Edit. T17-03 Save. T17-04 Review. T17-05 Approve one draft. T17-06 Reject another. T17-07 Reopen. T17-08 State transitions are legal and visible.
- T17-09 A rejected draft cannot silently become approved.
- T17-10 Approval uses the final content snapshot (edit after approval: record what the product does).
- T17-11 Approval does NOT publish anything (R11).
- T17-12 Publishing boundary: if no authorized integration exists the UI shows an honest unavailable state with NO "published" status (content stays authorization-ready). If a real authorized integration exists: STOP and ask the human in `QA_HUMAN.md` before any real publish. Never simulate publication by changing a database row.

## T18 Sales import
- T18-01 Import the 20 leads (9.5) through the UI. T18-02 The malformed row is rejected with a reason. T18-03 The duplicate is reported, not duplicated.
- T18-04 Import one lead with the SAME LinkedIn URL into Workspace A and Workspace B: both succeed (per-workspace dedupe).

## T19 Prospect research
- T19-01 Research a sample of leads: evidence appears as readable facts (never raw JSON, never blank); facts are not turned into unsupported claims.
- T19-02 Fit, qualification, relevance for all classes; direction matches 9.5.
- T19-03 Irrelevant leads end as NO_OUTREACH / DISMISS with reasons.
- T19-04 Insufficient-data leads end as WAIT with "missing information" and no invented facts.
- T19-05 Every recommendation shows: why relevant, evidence, confidence, missing information, why-not, next action.
- T19-06 No prospect is treated as a customer without evidence.
- T19-07 Engagement scenarios E1–E4 (9.6) if the UI supports engagement signals, else `UNAVAILABLE` + product gap. A single like is never buying intent (R23).

## T20 Sales qualification
- T20-01 Qualification states across classes: WAIT / NURTURE / NO_OUTREACH / DISMISS / READY_FOR_REVIEW, each with a stated reason. No lead ends as READY_FOR_AUTHORIZED_EXECUTION while no authorized integration exists.

## T21 Outreach preparation
For H1, H2, H3:
- T21-01 Research. T21-02 Fit analysis. T21-03 Relevant content. T21-04 Personalization uses ONLY facts on the lead record (check each claim against the record). T21-05 Outreach plan. T21-06 Message draft. T21-07 Human approval. T21-08 Execution boundary: nothing is sent; no "sent" state.
- T21-09 The system explains: why contact, why now, evidence, missing information, why not, next action.
- T21-10 Outcomes/conversations entered through the product UI labelled `SYNTHETIC-QA` (cap E4): classify a response, identify intent, identify objections, recommend follow-up (prepared, not sent), move pipeline stage by explicit user action, record an outcome, confirm learning is generated and labelled.
- T21-11 Objection bridge: two distinct synthetic objections from two different leads -> content opportunity -> draft. If the product requires a higher threshold, do NOT pad data: record `INSUFFICIENT_DATA` with the threshold.

## T22 Cross-machine intelligence
Each bridge needs five results: producer (what created it, record ID), persistence (survives refresh and logout-login), reader (what read it), consumer (what used it), visible/behavioral result (with source attribution). One step per bridge.
- T22-A Trend -> Content. T22-B Content Performance -> Learning -> Content. T22-C Audience Engagement -> Sales. T22-D Sales Objection -> Content. T22-E Sales Outcome -> Learning -> Decision. T22-F Content Performance -> Audience -> Sales. T22-G Business Objective -> Decision -> Content/Sales. T22-H Learning -> Future Decision. T22-I Sales Signals -> Content Opportunities. T22-J Content Signals -> Sales Opportunities.
Never PASS because a UI element exists. If upstream data cannot exist (for example no performance data), the result is `BLOCKED` or `INSUFFICIENT_DATA` with the exact reason.

## T23 Analytics
- T23-01 With no platform metrics, every metric shows `UNAVAILABLE`, never `0` (R08).
- T23-02 No fabricated metrics anywhere (dashboard, post detail, comparisons).
- T23-03 If the UI offers manual outcome entry: enter outcomes for at least 6 posts, labelled `SYNTHETIC-QA`. Check post detail, metrics, ranking, top/weak posts, comparisons, labels. If it does not: `UNAVAILABLE` and log a product gap. Provenance and freshness accompany every metric; no fake growth score.

## T24 Growth learning
- T24-01 One observation: maturity is at most `OBSERVED`; no causal wording (R24).
- T24-02 Identify strongest and weakest post; compare attributes and baseline.
- T24-03 Repeated patterns are separated from one-offs; correlation is not described as causation.
- T24-04 A learning proposal is created. T24-05 Confirm one, reject one.
- T24-06 Create next content influenced by the learning; the recommendation references it (mandatory learning -> future-decision proof).
- T24-07 A new outcome updates the learning (evidence count or maturity changes).
- T24-08 Immature learning is labelled and is NOT used as an authoritative rule.
- T24-09 Experiments, learning dashboard, today's brain, weekly learning: honest empty or real states.
- T24-10 If learning influence on a future decision cannot be proven: mark `LEARNING_IMPLEMENTED_BUT_NOT_PROVEN`, not PASS.

## T25 Daily growth loop
Run the safest available version: Intelligence -> Decision -> Content -> Sales -> Approval -> Execution -> Observe/Learn -> Digest.
- T25-01 Each stage reports its real status (execution `SKIPPED` if no authorized integration).
- T25-02 Idempotency: run twice; no duplicate recommendations, drafts or digests.
- T25-03 Budget: with the low cap from 9.1, the cap is enforced.
- T25-04 Pause: the loop does not act. T25-05 Kill switch: everything stops. Resume afterwards.
- T25-06 Failure isolation: a failing source or AI does not stop other stages (one connector failing must not crash the brain; one AI failure must not erase research).
- T25-07 Workspace isolation: running in A does not touch B.
- T25-08 Audit trail exists. T25-09 The digest is honest (completed, blocked, learning, opportunities, human requests).

## T26 Scheduling
- T26-01 Scheduled runs, run history, stage status with failure reasons, and recovery state are visible or honestly absent (no fake scheduler claims).

## T27 Error and degraded states
Expected for every case: a useful message, no silent corruption, no fake success, no raw internal exception, retry where designed. Never: 500, blank screen, endless loading.
- T27-01 invalid form. 02 missing field. 03 duplicate. 04 invalid URL. 05 unavailable AI. 06 unavailable source. 07 malformed source. 08 expired session. 09 unauthorized request. 10 empty workspace. 11 empty content state. 12 empty sales state. 13 insufficient data. 14 double-click submit. 15 refresh while loading. 16 back / forward navigation.
- T27-17 Network failure: use Playwright offline emulation if available.
- T27-18 Backend failure: stop the API with `scripts\qa-live.ps1 -Action stop -Target api`, use the UI, then start it again. (If the API was adopted, ask the human.)
- T27-19 Timeout: if it cannot be simulated safely, `NOT_TESTED` with the reason.
- T27-20 Degraded operation: with AI unavailable, research + deterministic processing continue; with one source failing, others continue; with no publishing integration, preparation + learning continue (Section 8.6).

## T28 Security and isolation
- T28-01 Unauthenticated protected routes are denied.
- T28-02 Authenticated access works.
- T28-03 Workspace isolation (browser-proven in T03, re-checked here after the full data exists).
- T28-04 No unauthorized consequential action (nothing sent, published, executed).
- T28-05 Logout clears state (back button shows nothing private).
- T28-06 Global-product check: in Workspace B, confirm defaults, scoring, prompts and recommendations do not mention Ankit, Dream Pair, "AI/technology" or "developers" unless the data is B's own. Hard-coded demo logic is a defect.
- T28-07 Any "sent / published / connected / messaged / engaged" word anywhere in the UI is backed by a real state (R12).

## T29 Responsive
Test at 1440x900, 900x800 and 390x844 (mobile, if supported). Pages: navigation, forms, content editor, cards, tables, modals, dashboards, lead detail, settings. Check scrolling, overflow, buttons, error states, loading states. Fix only functional breakage.

## T30 Full autonomous cycle
After onboarding the synthetic business: RUN THE SYSTEM on available sources and verify, in order: (1) research runs, (2) sources stored, (3) topics extracted, (4) trends identified, (5) opportunities created, (6) Decision Engine ranks them, (7) content opportunities produced, (8) content plans produced, (9) drafts generated if AI is available, (10) drafts pass validation, (11) approval items created, (12) sales opportunities created where evidence exists, (13) outreach prepared where appropriate, (14) no unauthorized action occurs, (15) run status stored, (16) failures isolated, (17) digest generated, (18) learning records created where evidence exists. Then run the loop again and verify idempotency: the second run must not duplicate everything blindly.

## T31 Final regression
Run the project's real unit/integration suites (run-once) plus typecheck. Record exact command output: pass/fail counts. Never delete or weaken a failing test to get green (R18).

## T32 Clean second pass
If any defect was found or any fix was made in pass 1, run another FULL pass (T00–T31) with a brand-new user and brand-new workspaces. A pass that included a fix is never the final pass. Stop with success at one clean pass (Section 12).

---

# 11. CONTENT RECORDS

## 11.1 Lineage (every generated item)
`TRIGGER -> SOURCE -> OPPORTUNITY -> DECISION -> PLAN -> GENERATION -> VALIDATION -> REVIEW -> APPROVAL -> PUBLICATION/PREP -> PERFORMANCE -> LEARNING`

## 11.2 Ledger entry (write to `QA_LEDGER.md` immediately; reprint in the final report)

```text
## POST-<ID>
Feature:            which exact feature created it
Creation path:      e.g. Trend Intelligence -> Opportunity -> Decision Engine -> Content Plan -> AI Writer
Origin:             PRODUCT-GENERATED / TESTER-TYPED
Trigger:
Source:
Source URL:         actual URL or UNAVAILABLE
Evidence:
Freshness:          actual timestamp or status
Topic / Pillar / Audience / ICP / Objective:
Format / Angle / Hook type / Hook / Visual / CTA / Hashtags:
AI provider/model:  or none
Validation:         what passed / failed
Approval:           draft / reviewed / approved / rejected
Performance:        real metrics only, else UNAVAILABLE
Learning impact:    only if evidence exists
### COMPLETE DRAFT
<the entire post exactly as generated; never a summary, excerpt or title>
```

The ledger must let anyone answer: "Which feature created this post, why, with what evidence, and what exactly did the user receive?"

## 11.3 Quality gates (check every draft)
source validity, claim validity, factuality, freshness, originality, exact duplicate, near duplicate, audience fit, ICP fit, voice, banned words, unsupported statistics, unsupported social proof, unsupported experience claims, CTA, objective, readability. Critical failures override numeric scores.

## 11.4 Accounting (computed from real records, at the end)
Total drafts; drafts by feature (12 paths); drafts by creation path; PRODUCT-GENERATED vs TESTER-TYPED; approved; rejected; blocked; requiring source review; using AI; without AI; duplicate / near-duplicate detections; drafts influenced by learning.

---

# 12. PASSES, EXIT AND STOP RULES

- Run ALL phases (T00 to T32) in one pass, with a brand-new user and brand-new workspaces.
- If any defect was found or any fix was made in a pass, run another full pass. A pass that included a fix is never the final pass.
- A CLEAN PASS has: zero new defects, zero fixes, zero unexpected 500 errors, zero unexpected console errors, zero unexpected 403/401 during new-user setup, safety boundaries intact, both servers still healthy at the end.
- Stop with success when one clean pass is finished. Environment limits (no internet, no AI key, no credentials) do not prevent a clean pass if the app handles them honestly, but they still limit the final verdict (Section 14).
- Stop and report honestly if: a defect fails 3 attempts (it becomes DEFERRED, continue), the same defect appears in 2 consecutive passes, 4 passes were run, or the environment cannot run.
- At the end of every pass write a summary in `QA_STATE.md`: defects found, fixed, open, blocked, open human requests, and either "Starting pass N+1 because ..." or "CLEAN PASS".
- Never write "perfect", "complete" or "production-ready" unless the gates in Section 14 are literally met.

---

# 13. FINAL REPORT (write `QA_REPORT.md`, then give a SHORT summary in chat)

- **A. Run metadata:** run ID, date/time, commit, branch, frontend, backend, DB, browser + version, viewports, AI provider/status, integrations, fix mode ON, passes run.
- **B. Executive verdict:** exactly one of `E2E VERIFIED` / `E2E PARTIALLY VERIFIED` / `E2E BLOCKED`, with the decisive evidence. No quality score.
- **C. Coverage matrix** (counts derived from `QA_STATE.md` rows; they must add up to the total step count):

| Area | PASS | FAIL | PARTIAL | BLOCKED | UNAVAILABLE | NOT_TESTED |
|---|---:|---:|---:|---:|---:|---:|
| Boot | | | | | | |
| Auth | | | | | | |
| Workspace | | | | | | |
| Onboarding (profile/audience/objectives/voice/schedule) | | | | | | |
| Intelligence (sources/trends/opportunities) | | | | | | |
| Decision | | | | | | |
| Content (generation/validation/review) | | | | | | |
| Analytics | | | | | | |
| Growth Learning | | | | | | |
| Sales | | | | | | |
| Cross-Machine | | | | | | |
| Autonomy (loop/schedule/degraded) | | | | | | |
| Safety | | | | | | |
| Responsive | | | | | | |
| Persistence | | | | | | |

- **D. Defect register:** from `QA_DEFECTS.md`. Per defect: ID, severity, area, page, URL, exact action, expected, actual, evidence, console, network, root cause, fix, changed files, regression test, targeted test result, exact browser retest, final status. The original failure stays visible.
- **E. Complete generated content:** every ledger entry with the COMPLETE DRAFT, plus the accounting from 11.4.
- **F. Growth intelligence:** posts analyzed, real vs unavailable metrics, strongest/weakest, baseline, comparison, patterns, evidence, hypotheses, proposals, maturity of each conclusion (OBSERVED / HYPOTHESIS / SUPPORTED_PATTERN / CONFIRMED), next recommendations. Never say "this is why it went viral" without supporting evidence.
- **G. Sales:** imported, rejected, duplicate, relevant, irrelevant, highly relevant, insufficient-data, engagement signals, intent signals, WAIT / NURTURE / NO_OUTREACH / DISMISS / READY_FOR_REVIEW counts, outreach drafts, approvals, pipeline changes, outcomes, learning.
- **H. Cross-machine:**

| Bridge | Producer | Persistence | Reader | Consumer | Evidence level | Result |
|---|---|---|---|---|---|---|
| Trend -> Content | | | | | | |
| Content -> Learning | | | | | | |
| Audience -> Sales | | | | | | |
| Sales -> Content | | | | | | |
| Sales Outcome -> Learning | | | | | | |
| Content -> Audience/Sales | | | | | | |
| Business Goal -> Decision | | | | | | |
| Learning -> Future Decision | | | | | | |
| Sales Signals -> Content | | | | | | |
| Content Signals -> Sales | | | | | | |

- **I. Browser evidence:** console errors, failed requests with HTTP statuses (counts of 500 / 403 / 401 / 400, expected vs unexpected), screenshots, visible errors, broken pages, unexpected redirects. Separate React / router warnings from functional failures.
- **J. Data integrity and security:** persistence per entity (T20-style SAVE -> REFRESH -> REOPEN checks), workspace isolation, authorization, protected routes, session handling, no cross-user leakage, no unauthorized consequential action.
- **K. Honesty report** (YES/NO each; any YES is a critical issue): fabricated source? metric? engagement? lead information? business outcome? AI result? Platform action falsely claimed? AI unavailable handled honestly?
- **L. Final summary:** what actually worked (browser-proven), what failed, what was fixed (and retested), what remains blocked, what was unavailable, what was not tested, generated content count and count by feature, learning generated, sales opportunities generated, open human requests, ONE consistent browser-action count, final verdict.
- **M. Autonomous operation verdict:**

| Machine | Verdict |
|---|---|
| CONTENT MACHINE | WORKING / PARTIAL / BLOCKED |
| GROWTH INTELLIGENCE | WORKING / PARTIAL / BLOCKED |
| SALES MACHINE | WORKING / PARTIAL / BLOCKED |
| SHARED GROWTH BRAIN | WORKING / PARTIAL / BLOCKED |
| LEARNING | WORKING / PARTIAL / BLOCKED |
| 24/7 ORCHESTRATION | WORKING / PARTIAL / BLOCKED |
| AUTHORIZED EXECUTION | WORKING / PARTIAL / BLOCKED / NOT_AVAILABLE |
| AI | WORKING / UNAVAILABLE / UNVERIFIED |
| RESEARCH | WORKING / PARTIAL / BLOCKED |
| ANALYTICS | WORKING / PARTIAL / BLOCKED |

---

# 14. FINAL PASS GATES

`E2E VERIFIED` requires ALL of these:
1. fresh-user flow passes; 2. authentication passes; 3. logout is browser-verified; 4. workspace creation passes; 5. multi-workspace isolation passes; 6. onboarding persists; 7. intelligence workflow is browser-verified; 8. decision workflow is browser-verified; 9. content generation paths are exercised, or proven unavailable with an honest product state AND the cause is not fixable by you; 10. generated content has lineage; 11. every generated draft is in the ledger; 12. review/approval works; 13. publishing boundary is honest; 14. real analytics are used when available; 15. growth learning is tested with real or explicitly labelled test evidence; 16. sales workflow is browser-verified; 17. sales authorization boundary works; 18. all required bridges are proven end to end; 19. persistence passes; 20. workspace/security isolation passes; 21. no unresolved P0/P1 defect; 22. no fabricated result; 23. no critical workflow remains BLOCKED, UNAVAILABLE or NOT_TESTED; 24. final regression suite and typecheck pass (real command output); 25. both servers are still healthy at the end.

If ANY gate fails, `E2E VERIFIED` is forbidden. Use `E2E PARTIALLY VERIFIED`, or `E2E BLOCKED` if a foundational dependency prevented meaningful testing.
(Note: with no AI provider or no platform metrics, gates 9, 14 and 23 usually cannot be met. The honest verdict is then `E2E PARTIALLY VERIFIED`.)

The test is NOT complete just because pages were visited, buttons were clicked, unit tests passed, no console errors appeared, the UI looked good, or drafts were generated. It is complete when the required workflows ran and their data, state and output transitions were proven.

---

# START NOW

1. Do Section 3 (S01 to S13). Do not wait for the human unless a step says `WAITING FOR HUMAN`.
2. Then run Pass 1 from T00.
3. Keep `QA_STATE.md` current after every step.

---

# APPENDIX A — `scripts\qa-live.ps1` (create EXACTLY this if the file does not exist)

```powershell
# qa-live.ps1 - start / stop / status for the Growth Operator dev servers.
# Windows PowerShell 5.1 compatible. ASCII only.
#
# Run from the project root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action status
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action start   [-Target api|web|all]
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action stop    [-Target api|web|all]
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action restart [-Target api|web|all]
#
# Each server runs in its OWN minimized window, so this script ALWAYS returns.
# It never waits for a server to exit. Logs: .qa\logs\api.log and .qa\logs\web.log
# Exit codes: 0 = ok/ready, 1 = not ready in time, 2 = cannot restart (server not started by this script)

param(
  [Parameter(Mandatory = $true)][ValidateSet('start', 'stop', 'status', 'restart')][string]$Action,
  [ValidateSet('api', 'web', 'all')][string]$Target = 'all',
  [int]$WaitSeconds = 90
)

$ErrorActionPreference = 'Continue'
$root   = Split-Path -Parent $PSScriptRoot
$qaDir  = Join-Path $root '.qa'
$logDir = Join-Path $qaDir 'logs'
$pidDir = Join-Path $qaDir 'pids'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $pidDir | Out-Null

$svc = @{
  api = @{ Port = 3001; Filter = '@growth-operator/api'; Url = 'http://localhost:3001/api/v1/health' }
  web = @{ Port = 5173; Filter = '@growth-operator/web'; Url = 'http://localhost:5173/' }
}

function Test-PortOpen([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('localhost', $Port, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(1500, $false) -and $client.Connected) { return $true }
    return $false
  } catch { return $false }
  finally { $client.Close() }
}

function Test-Http([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400)
  } catch { return $false }
}

function Get-PidFile([string]$Name) { return (Join-Path $pidDir ($Name + '.pid')) }

function Start-Svc([string]$Name) {
  $s = $svc[$Name]
  if (Test-PortOpen $s.Port) {
    Write-Output ("{0}: port {1} already open - ADOPTING the running server (not restarting it)" -f $Name, $s.Port)
    return
  }
  $log    = Join-Path $logDir ($Name + '.log')
  $runner = Join-Path $qaDir ('run-' + $Name + '.ps1')
  $lines = @(
    "Set-Location -LiteralPath '$root'",
    "`$host.UI.RawUI.WindowTitle = 'growth-operator $Name'",
    "pnpm --filter=$($s.Filter) dev 2>&1 | Tee-Object -FilePath '$log'"
  )
  Set-Content -LiteralPath $runner -Value $lines -Encoding UTF8
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', ('"' + $runner + '"'))
  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -WindowStyle Minimized -PassThru
  Set-Content -LiteralPath (Get-PidFile $Name) -Value $p.Id
  Write-Output ("{0}: launched in its own window (PID {1}); log: {2}" -f $Name, $p.Id, $log)
}

function Stop-Svc([string]$Name) {
  $pf = Get-PidFile $Name
  if (Test-Path -LiteralPath $pf) {
    $id = [int]((Get-Content -LiteralPath $pf -Raw).Trim())
    & taskkill.exe /PID $id /T /F 2>&1 | Out-Null
    Remove-Item -LiteralPath $pf -Force -ErrorAction SilentlyContinue
    Write-Output ("{0}: stopped (window PID {1} and its child processes)" -f $Name, $id)
    $deadline = (Get-Date).AddSeconds(10)
    while ((Test-PortOpen $svc[$Name].Port) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Seconds 1 }
  } else {
    Write-Output ("{0}: no PID recorded - it was NOT started by this script. Not touching it." -f $Name)
  }
}

function Show-Status {
  foreach ($n in @('api', 'web')) {
    $s = $svc[$n]
    $open = Test-PortOpen $s.Port
    $ok = $false
    if ($open) { $ok = Test-Http $s.Url }
    $owned = Test-Path -LiteralPath (Get-PidFile $n)
    Write-Output ("{0}: port {1} open={2} http_ok={3} started_by_script={4} log=.qa\logs\{0}.log" -f $n, $s.Port, $open, $ok, $owned)
  }
}

function Wait-Ready([string[]]$Names, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $allOk = $true
    foreach ($n in $Names) {
      $s = $svc[$n]
      if (-not ((Test-PortOpen $s.Port) -and (Test-Http $s.Url))) { $allOk = $false }
    }
    if ($allOk) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Start-And-Wait([string[]]$Names) {
  foreach ($n in $Names) { Start-Svc $n }
  if (Wait-Ready $Names $WaitSeconds) {
    Write-Output 'READY'
    Show-Status
    exit 0
  }
  Write-Output 'NOT READY within the time limit. Read the logs: Get-Content .qa\logs\api.log -Tail 40 ; Get-Content .qa\logs\web.log -Tail 40'
  Show-Status
  exit 1
}

$names = @('api', 'web')
if ($Target -ne 'all') { $names = @($Target) }

switch ($Action) {
  'status' { Show-Status; exit 0 }
  'stop'   { foreach ($n in $names) { Stop-Svc $n }; exit 0 }
  'start'  { Start-And-Wait $names }
  'restart' {
    foreach ($n in $names) {
      if (-not (Test-Path -LiteralPath (Get-PidFile $n)) -and (Test-PortOpen $svc[$n].Port)) {
        Write-Output ("{0}: CANNOT RESTART - it was not started by this script. Ask the human to restart it." -f $n)
        exit 2
      }
    }
    foreach ($n in $names) { Stop-Svc $n }
    Start-Sleep -Seconds 3
    Start-And-Wait $names
  }
}
```
