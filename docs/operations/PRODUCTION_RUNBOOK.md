# Production Operations Runbook — Growth Operator

> Scope: operating the CURRENT application as built. Every command, endpoint,
> variable name, and behavior below was verified against the repository at
> WP9 Phase 6. Nothing here is aspirational. Where the repository provides no
> mechanism, this document says so instead of inventing one.

## 1. Scope

Covers: starting and stopping the API, worker, database, and frontend;
environment and secrets; migrations; health checks; pause/kill switch;
cycle recovery; OAuth lifecycle; logging; rollback; release verification.

Does NOT cover: product usage, LinkedIn execution (intentionally absent —
execution cap is 0, EXECUTION stages always SKIP), load capacity (UNPROVEN),
or any infrastructure this repository does not ship (no supervisor configs,
no worker health endpoint, no managed hosting manifests).

## 2. Architecture

Production consists of four processes plus PostgreSQL:

| Process | Entrypoint (production) | Purpose | Required |
|---|---|---|---|
| API | `node apps/api/dist/index.js` (`pnpm --filter=@growth-operator/api start`) | REST API on `PORT` (default 3001) | Yes |
| Worker | `node apps/api/dist/worker/index.js` (`pnpm --filter=@growth-operator/api worker:start`) | pg-boss tick every 15 min + daily-run queue consumer | Yes for unattended loops; API-triggered runs work without it |
| PostgreSQL 17 | `docker compose up -d postgres` (local template) or managed Postgres | System of record, incl. pg-boss tables | Yes |
| Web frontend | static files from `apps/web/dist/` served by the operator's static host / reverse proxy | UI (calls the API over HTTP) | Yes for UI; API is fully usable without it |

The API does NOT serve the frontend: `apps/api/src/index.ts` registers JSON
routes only, no `express.static`. CORS allow-lists one origin (`CORS_ORIGIN`).

pg-boss uses the SAME PostgreSQL database (no Redis). Optional services:
AI providers (features degrade to honest unavailable states without keys),
OAuth/social connectors (report NOT_CONFIGURED without credentials).

## 3. Required Environment Variables

Names only — values live in the deployment environment, never in this file.
Schema enforced at boot by `apps/api/src/config/env.ts` (invalid values exit 1).

| Variable | Required | Purpose | Production requirement |
|---|---|---|---|
| `NODE_ENV` | No (default `development`) | Runtime mode | Must be `production` (enables CSP, HSTS already on, prod OAuth-redirect warning) |
| `PORT` | No (default 3001) | API listen port | Set to the platform's expected port |
| `API_URL` | No (default localhost) | Public API base URL | Public HTTPS URL; OAuth providers must allow-list `${API_URL}/api/v1/social/callback/<platform>` |
| `WEB_URL` | No (default localhost) | Frontend origin (docs/links) | Public HTTPS URL of the static host |
| `DATABASE_URL` | **Yes** | PostgreSQL connection (valid URL) | Managed Postgres URL; missing/invalid fails startup |
| `JWT_SECRET` | **Yes** (min 32 chars) | Session signing | Unique high-entropy value; the documented example placeholder is REFUSED at production boot |
| `JWT_EXPIRES_IN` | No (default `7d`) | Session lifetime | Keep short (e.g. `1d`) — there is no server-side revocation list |
| `BCRYPT_ROUNDS` | No (default 12) | Password hashing cost | 12 |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | No | AI composition/understanding | Optional; absent keys yield honest `AI_UNAVAILABLE`, never silent failure |
| `SOCIAL_CONNECTOR_KEY` | No | AES-256-GCM key (64 hex chars) for stored OAuth tokens | Required before any social Connect; missing key fails Connect loudly, never stores plaintext |
| `SOCIAL_REDIRECT_URI` | No | OAuth callback override | Set when it differs from `${API_URL}/api/v1/social/callback/<platform>` |
| `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` | No | Instagram OAuth app | Only if Instagram is connected; empty = honestly NOT_CONFIGURED |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | No | Facebook OAuth app | Only if Facebook is connected; empty = honestly NOT_CONFIGURED |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | No | LinkedIn OAuth app (`openid profile email` only) | Only if LinkedIn is connected; empty = honestly NOT_CONFIGURED |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | No | YouTube OAuth app | Only if YouTube is connected; empty = honestly NOT_CONFIGURED |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | No | X OAuth app | Only if X is connected; empty = honestly NOT_CONFIGURED |
| `YOUTUBE_API_KEY` / `YOUTUBE_ACCESS_TOKEN` | No | YouTube research credentials | Optional; connector reports NOT_CONFIGURED without them |
| `CORS_ORIGIN` | No (default localhost) | Allowed web origin | Must equal the production frontend origin or browsers block the UI |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | No (defaults 900000/100) | Global API rate limit (health probes bypass it) | Keep; tighten only with measured justification |
| `TEST_DATABASE_URL` | Test only | Dedicated test database | NEVER point at production; the test harness refuses to run against it |

## 4. Secret Generation and Rotation

Generate (examples produce values locally; nothing here is a real secret):

```sh
# JWT secret (any high-entropy string, minimum 32 characters)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Token-vault key (exactly 64 hex characters = 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Rules:

- Production boot REFUSES the documented `.env.example` JWT placeholder and
  exits 1 (`isExampleJwtSecret` in `apps/api/src/config/env.ts`). Any other
  value — however weak — is treated as the operator's explicit decision, so
  choose a strong one.
- OAuth client secrets and AI keys are pasted from the provider consoles;
  they are never committed (only `.env.example` is tracked) and never logged
  (access-log query params `code`, `state`, `token`, `secret`, `password`,
  `api_key` are redacted to `[REDACTED]` by `sanitizeLogUrl`).
- JWT rotation invalidates ALL sessions: tokens are stateless (no key id or
  version), so every user signs in again after rotation. There is no
  zero-downtime dual-secret mechanism — do not assume one.

## 5. Database Provisioning

- PostgreSQL 17. `DATABASE_URL` must be a valid URL or the API exits 1 at boot.
- Apply migrations with the repository command (no dev commands in production):

```sh
pnpm --filter @growth-operator/db db:migrate   # prisma migrate deploy
```

- Verify state:

```sh
pnpm --filter @growth-operator/db exec prisma migrate status
```

Expected: `20 migrations found` (count grows with releases), `Database schema is up to date!`
- Schema/client sync check: `pnpm --filter @growth-operator/db db:generate` (regenerates the client; required after any schema change before typecheck).
- Rollback: Prisma provides NO automatic down migrations. Forward migrations in this repository contain no destructive data operations (the single historical index replacement only re-scoped a unique index per workspace). A schema rollback is a MANUAL, per-release procedure — see §16.

## 6. API Deployment

Development (never production):

```sh
pnpm dev                                            # api :3001 + web :5173, parallel
pnpm --filter @growth-operator/api worker           # tsx dev worker (devDependencies)
```

Production:

```sh
pnpm build                                          # tsc (api) + tsc && vite build (web)
pnpm --filter @growth-operator/api start            # node dist/index.js
```

Do NOT run `tsx` in production (dev-only dependency). The compiled `dist/`
output contains the full worker (`dist/worker/index.js`) and runs under
plain Node 20+.

## 7. Worker Deployment

Production command:

```sh
pnpm --filter @growth-operator/api worker:start    # node dist/worker/index.js
```

Verified behavior (from `apps/api/src/worker/`):

- pg-boss starts against `DATABASE_URL` (creates its own `pgboss.*` tables;
  application tables untouched).
- Tick queue `daily-loop-tick` scheduled `*/15 * * * *` (UTC): per active
  workspace, enqueues today's daily-run job when local time passes
  `dailyRunTime` and no run exists; at most one backfill day per tick;
  unconfigured workspaces (`scheduleConfigured=false`) are never enqueued.
- `daily-run` jobs carry `singletonKey = workspaceId:runDate` (24h): duplicate
  sends resolve to `null` (deduped); the `DailyRun` unique constraint is the
  second guard.
- Job retries: `retryLimit: 3`, `retryDelay: 60s`, backoff enabled.
- Graceful shutdown: `SIGTERM`/`SIGINT` stop pg-boss, disconnect Prisma, exit 0.
- After a process restart, non-terminal runs/stages resume on the next
  trigger or tick; terminal runs are never re-executed.

Explicitly NOT provided by this repository:

- No external process supervisor configuration (systemd unit, container
  restart policy, or hosted-worker manifest). The operator provides it.
- No worker health endpoint (`/health` and `/ready` report the API process
  and database only — never worker liveness).
- No guaranteed cross-process singleton beyond pg-boss job claiming (two
  worker processes both poll; pg-boss awards each job once; idempotency keys
  and unique constraints make double execution safe, not impossible to attempt).

## 8. Health / Readiness

- `GET /api/v1/health` → `{"status":"healthy", ...}`. Liveness only; proves the
  process answers. Registered BEFORE the rate limiter, so it never 429s.
- `GET /api/v1/ready` → `{"status":"ready","dependencies":{"database":"connected"},"migrations":{"applied":N,"pending":[...]}}`
  or `503 {"status":"not ready", ...}` when the database is unreachable.
  It proves API + database + migration state — NOT worker health.

## 9. Deployment Order

1. Provision PostgreSQL 17; set `DATABASE_URL`.
2. Configure environment (unique `JWT_SECRET`, `CORS_ORIGIN`, `API_URL`, optional provider keys).
3. `pnpm build`.
4. `pnpm --filter @growth-operator/db db:migrate`, then verify `migrate status`.
5. Start API (`.../api start`); verify `GET /api/v1/health` → 200.
6. Verify `GET /api/v1/ready` → 200 with `pending: []`.
7. Start worker (`.../api worker:start`); verify log line `pg-boss started: tick every 15 min, daily-run queue ready`.
8. Trigger one run (`POST /api/v1/runs/trigger`) and confirm a terminal status; or run one operator cycle (`POST /api/v1/operator/cycle` with an idempotency key).
9. Serve `apps/web/dist/` from the static host at `CORS_ORIGIN`; sign in through the UI.

## 10. Release Verification Checklist

Build, full API + web + package suites, typecheck (see §22 gate statuses);
`migrate status` clean; `/health` 200; `/ready` 200 with no pending
migrations; login + session expiry; cross-workspace 403s; one daily run and
one operator cycle to terminal status; OAuth Connect still honest for
configured platforms; readiness shows publishing NOT ready on every platform;
no `SENT`/`PUBLISHED` states creatable (enum has none).

## 11. Pause / Kill Switch

Mechanism: `PUT /api/v1/onboarding/kill` with `{paused?: boolean, killSwitch?: boolean}`
(OWNER/ADMIN), enforced by `assertRunAllowed` at cycle/run start AND at every
stage start; kill switch wins over pause.

- `paused: true` → new runs/cycles record `SKIPPED_PAUSED` / `CANCELLED (PAUSED)`.
- `killSwitch: true` → same with `KILL_SWITCH` reason.
- Already-created human-review work (drafts, reviews, prepared actions) is
  NEVER deleted by pause/kill — it waits.
- Limitation (by design, synchronous execution): a cycle already running
  cannot be stopped mid-flight; the gate is checked at stage boundaries, so
  pausing takes effect at the next boundary or next run. Do NOT claim
  real-time cancellation.

## 12. Failed Cycle Recovery

- A throwing stage is recorded `FAILED` with the error; later independent
  stages continue; the run/cycle completes `COMPLETED_WITH_FAILURES`/`PARTIAL`
  (never silently green).
- Resume (`POST /api/v1/runs/trigger` same date, or
  `POST /api/v1/operator/cycle/resume` same idempotency key) re-executes ONLY
  missing stages; `SUCCEEDED`/`FAILED`/`SKIPPED` checkpoints are preserved,
  never duplicated.
- `FAILED` is terminal for that stage within the run: resume does not retry
  it. To redo failed work, trigger a new run/date (daily) or a new
  idempotency key (operator cycle).

## 13. Worker/API Failure

AUTOMATIC: pg-boss job retries (3×, 60s backoff); crash resume of
non-terminal runs/stages on next trigger; request retries are safe
(idempotency keys + unique constraints on cycles, runs, prepared actions,
outcome metrics).

OPERATOR_REQUIRED: API or worker process restart (no in-repo supervisor);
database outage recovery (see §14); failed migration (fix forward, then
`migrate deploy`); provider outages (see §14/§15 in the incident checklist).

## 14. Database Outage

Actual behavior: API `/ready` returns 503; requests fail with 500-class
errors (no fake 200s); the worker throws on tick/run until connectivity
returns; no automatic reconnection beyond the Prisma driver's own behavior.
Recovery is OPERATOR_REQUIRED: restore the database, confirm
`migrate status` clean, restart API and worker, verify `/ready`, then resume
normal operation. No automatic DB recovery exists — do not claim it.

## 15. OAuth Recovery

- Disconnect: `DELETE /api/v1/social/<platform>` deletes the connection row;
  tokens die with it; previously pulled posts are KEPT as inspiration.
- Reconnect: run Connect again (new state, new grant overwrites).
- Expired/replayed/forged callback states are rejected to the app with an
  error, never 500; stale rows expire (10 min) and are pruned.
- LinkedIn reality (verified in code): OIDC identity (`openid profile email`)
  + token exchange only. Member-post reading, publishing, analytics, and
  comment ingestion are NOT implemented and the API/UI report them as such.
  Connect (human OAuth grant) is permanently distinct from autonomous
  execution (which has no integration and stays SKIPPED).

## 16. Rollback

- Code rollback: safe while the schema is unchanged (frontend/backend ship
  independently; API serves JSON only, no server-rendered coupling).
- Schema compatibility: safe only if the new release added no
  backward-incompatible change; additive tables/columns/nullable fields are
  backward compatible with the previous build.
- Migrations have no automatic down path. A schema rollback is MANUAL SQL
  scoped to the specific migration (each migration file documents what its
  reversal would drop). Never run destructive statements without a backup.
- Per-release rollback note: record the release template's Rollback section
  (§Release Template) for every deploy — reason, code target, schema
  considerations, approver.

## 17. Logging

- One structured JSON line per request: `requestId`, `method`, path, `status`,
  `responseTime`, `userAgent`, `ip` (`requestIdMiddleware` accepts an inbound
  `X-Request-ID` or mints a UUID).
- Bodies, headers, and tokens are never logged. Query strings are logged with
  credential params redacted (`code`, `state`, `token`, `access_token`,
  `refresh_token`, `id_token`, `secret`, `client_secret`, `password`,
  `api_key`, `apikey`, `authorization` → `[REDACTED]`); all other params stay
  visible for debugging.
- Cycle/stage rows carry workspace, stage, counts, durations, and failure
  classifications — the audit trail, queryable per workspace.

## 18. Security Checklist

- [ ] Unique high-entropy `JWT_SECRET` (never the documented example —
  production boot refuses it and exits 1).
- [ ] `NODE_ENV=production`.
- [ ] HTTPS everywhere; `API_URL`/`CORS_ORIGIN` are the public HTTPS origins.
- [ ] OAuth redirect bases allow-listed at each provider.
- [ ] `SOCIAL_CONNECTOR_KEY` set (64 hex chars) before any Connect.
- [ ] No `VITE_*` secrets in the frontend (the bundle contains none — the
  client uses relative `/api/v1` URLs).
- [ ] No development credentials (`growth_operator_dev`, example secrets)
  outside local Docker.
- [ ] Workspace authorization verified (cross-workspace 403s in test suites).

## 19. Load Testing Status

PRODUCTION LOAD: UNPROVEN.

Unanswered controlled-environment questions: concurrent-cycle throughput per
workspace; pg-boss throughput with hundreds of due workspaces; Prisma pool
saturation under parallel stage fan-out; AI/connector concurrency under quota;
large-workspace (10k+ rows) stage latency; retry-storm behavior when the DB
flaps. Existing guards (100 req/15 min rate limit, 1 MB payload limit,
per-run budgets, `take` caps, `MAX_*_PER_RUN` caps, singleton dedup) bound
blast radius but have never been measured. Do not manufacture capacity numbers.

## 20. Known Operational Limitations

- No external process supervisor ships in this repository.
- No worker health endpoint (`/ready` covers API + database only).
- Database-outage recovery is manual (restart + verify + resume).
- Mid-flight pause is not observable (gates run at cycle start and stage starts).
- Schema rollback is manual per migration.
- Load capacity is UNPROVEN (see §19).
- No server-side session revocation (stateless JWT; rotation logs everyone out).
- LinkedIn member-post reading, publishing, analytics, and comment ingestion
  are not implemented and are reported as unavailable everywhere.

## 21. Incident Checklist

- **API down**: restart API process → `GET /health` → `GET /ready` → if 503,
  go to DB unavailable.
- **Worker down**: restart worker (`worker:start`) → expect the pg-boss
  started line → non-terminal runs resume on next tick/trigger.
- **DB unavailable**: restore database → `migrate status` clean → restart API
  + worker → verify `/ready` → resume.
- **AI provider unavailable**: no action — features degrade to honest
  `AI_UNAVAILABLE`; verify keys only if availability is contractually required.
- **Research connector unavailable**: no action — provider stays
  BLOCKED/UNAVAILABLE with reasons; replace or accept per product decision.
- **OAuth failure**: check callback error → reconnect; expired states are
  normal (10 min TTL) — start Connect again.
- **Stuck cycle**: inspect cycle/run stages; terminal states are final;
  non-terminal resumes on trigger; FAILED stages are not retried — start a
  new run/date or idempotency key.
- **Failed migration**: do NOT retry blindly — read the error, fix forward,
  re-run `db:migrate`, verify `migrate status`; roll back only via the
  per-release note procedure (§16).

## 22. Production Release Gate

- Build: PASS required (`pnpm build`).
- Tests: PASS required (`pnpm test:all` — covers api, web, intelligence,
  capabilities, content, sales, learning, decision, social, business).
- Typecheck: PASS required (`pnpm typecheck`, all packages).
- Migrations: `migrate status` clean required.
- Secrets/env: §18 checklist required.
- Capability truth: readiness + console must show unavailable states honestly.
- Unauthorized execution: NONE permitted (no `SENT`/`PUBLISHED` states exist).
- Load: UNPROVEN must be acknowledged, never waived silently.

## Release Template

Release:
Commit:
Date:
Environment:
Migration state (`migrate status` output):
API version (`/health` version):
Worker version (image/build id):

Pre-release:
[ ] `pnpm test:all` green
[ ] `pnpm typecheck` green
[ ] `pnpm build` green
[ ] environment variables set per §3 (names verified, values never pasted here)
[ ] unique `JWT_SECRET` (not the documented example)
[ ] `db:migrate` applied + `migrate status` clean
[ ] rollback plan recorded below
[ ] OAuth redirect bases allow-listed (if Connect is offered)

Post-release:
[ ] `GET /api/v1/health` → 200 `healthy`
[ ] `GET /api/v1/ready` → 200 `ready`, `pending: []`
[ ] login + session expiry observed
[ ] cross-workspace access denied (spot-check 403)
[ ] worker log shows pg-boss started; one run/cycle reaches terminal status
[ ] operator cycle completes without unauthorized execution
[ ] readiness shows publishing NOT ready on all platforms

Rollback:
Reason:
Code rollback (target commit/build):
Schema considerations (backward compatible? manual steps?):
Operator approval:

## JWT Rotation Procedure

1. Generate a new secret (see §4 commands).
2. Announce: rotation invalidates ALL sessions — every user signs in again.
   There is no dual-secret mechanism; do not assume zero-downtime rotation.
3. Set the new `JWT_SECRET` in the deployment environment.
4. Restart the API process(es).
5. Verify: new logins succeed; old tokens are rejected (401) on next request.
6. Record the rotation (date, reason, approver) alongside the release note.
