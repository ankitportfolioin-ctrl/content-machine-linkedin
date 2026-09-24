# LinkedIn Skills Studio

LinkedIn Skills Studio is a local-first content operating system for tech, AI, and founder education. It helps you discover current public-source content, match it to your content pillars, draft a LinkedIn post in your configured voice, run quality checks, and publish or schedule through Publora.

## What was repaired and added

- Fixed the Vite/esbuild dependency conflict.
- Added a reliable `npm test` command.
- Added public RSS/Atom discovery across Google AI, OpenAI, Anthropic, GitHub, Vercel, Hacker News, and TechCrunch AI feeds.
- Added content-pillar matching and freshness scoring.
- Added a new `/api/discovery/latest` endpoint.
- Upgraded the daily routine to run discovery → pillar matching → AI draft → validation → schedule/publish.
- Added source URLs to routine logs so each run can be traced back to the material used.
- Replaced the automation dashboard with a simpler source-to-post workflow.
- Preserved safe preview mode: missing credentials never cause a fake live publish.
- Added support for both `APIFY_API_TOKEN` and `APIFY_TOKEN` names in diagnostics.

## Quick start

Prerequisites: Node.js 20 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Configuration

Set these values in `.env`:

```bash
# Optional but recommended for AI-written drafts
GEMINI_API_KEY=

# Required for live LinkedIn scheduling/publishing through Publora
PUBLORA_API_KEY=
LINKEDIN_PLATFORM_ID=

# Optional for the separate LinkedIn monitoring skills in linkedin-skills-main
APIFY_API_TOKEN=

# Optional visual generation integration
PIXFARO_API_KEY=
```

The application does **not** print secret values. If Publora or the LinkedIn channel ID is missing, the app stays in preview mode and logs a simulated result instead of calling the live publishing API.

## How to use the automation pipeline

1. Open **Profile** and configure your voice, audience, receipts, and content pillars.
2. Open **Automation**.
3. Click **Refresh sources** to fetch current public RSS/Atom items.
4. Review the matched items and source links.
5. Leave **Safe preview mode** enabled while testing.
6. Click **Find, draft, and preview**.
7. Inspect the generated draft in the editor and run the Humanizer and Detector tabs if desired.
8. When the credentials and draft are ready, turn off preview mode and choose either **Find, draft, and publish** or publish the current editor draft.

Live publishing is intentionally explicit in the UI. No system should silently publish public content without making the live/safe state visible.

## Content discovery behavior

The discovery service reads public RSS/Atom feeds and does not scrape private LinkedIn pages. It:

- Fetches the configured public feeds with timeouts.
- Parses titles, summaries, links, and publication dates.
- Removes duplicate URLs.
- Scores items by overlap with configured content pillars and freshness.
- Passes the top relevant source context to the AI drafter.
- Keeps source URLs in the routine log for traceability.

If a feed is temporarily unavailable, the run continues with the feeds that succeeded and reports warnings in the UI and API response.

## API endpoints

- `GET /api/health` — service health.
- `GET /api/config` — safe credential and connection status.
- `GET /api/discovery/latest` — latest public-source items matched to pillars.
- `POST /api/routine/run-daily` — complete discovery-to-schedule pipeline.
- `POST /api/linkedin/post-now` — publish or safely simulate the current post.
- `POST /api/linkedin/schedule` — schedule or safely simulate a post.
- `GET /api/linkedin/history` — local routine history.

Example dry-run call:

```bash
curl -X POST http://localhost:3000/api/routine/run-daily \
  -H 'Content-Type: application/json' \
  -d '{"dryRun":true}'
```

## Quality and safety boundaries

AI-generated content is not automatically factual. Review claims, numbers, source context, and customer-sensitive material before publishing. The post validator checks for an empty draft, LinkedIn’s character limit, a long mobile opening, URLs in the body, and a missing P.S. line. These are review signals, not proof that a post is correct.

Use only public sources that you are allowed to access. Respect feed terms, copyright, attribution requirements, rate limits, and LinkedIn’s platform rules. Do not paste private customer data or secrets into AI prompts.

## Verification

```bash
npm test
npm run build
```

The included `linkedin-skills-main` directory contains the related skills, references, and Python tests from the original project. The main Studio app uses the TypeScript server and React frontend at the repository root.
