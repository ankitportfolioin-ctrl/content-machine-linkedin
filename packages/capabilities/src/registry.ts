/**
 * CAPABILITY_REGISTRY — the single source of truth for what this product
 * can actually do, per product-loop domain.
 *
 * Ownership rule: this file OWNS capability state. The intelligence
 * connector catalogue, the social platform descriptors, the social
 * connections endpoint, and the readiness endpoint DERIVE from it and keep
 * no parallel booleans. The parity test
 * (apps/api/src/capabilityRegistry.test.ts) enforces the agreement.
 *
 * Honesty rule: `state` is the best-known EFFECTIVE state (static code +
 * last live probe), never a roadmap. `liveVerified` is true only for
 * entries whose verification was actually executed and read — code
 * existing, a test file existing, or a button existing never counts.
 * Baseline: nothing below is liveVerified until WP2 re-probes it.
 */

import type {
  CapabilityDomain,
  CapabilityEntry,
  ResearchCapabilityEntry,
} from './types';

function research(
  id: string,
  displayName: string,
  entry: Omit<ResearchCapabilityEntry, 'id' | 'domain' | 'displayName'>,
): ResearchCapabilityEntry {
  return { id, domain: 'RESEARCH', displayName, ...entry };
}

function entry(
  id: string,
  domain: CapabilityDomain,
  displayName: string,
  rest: Omit<CapabilityEntry, 'id' | 'domain' | 'displayName'>,
): CapabilityEntry {
  return { id, domain, displayName, ...rest };
}

// ---------------------------------------------------------------------------
// RESEARCH (14): RSS, Atom, websites, HN, GitHub, Reddit, Google Trends,
// YouTube, LinkedIn, X, Instagram, Facebook, TikTok, Quora.
// ---------------------------------------------------------------------------

const RESEARCH: ResearchCapabilityEntry[] = [
  research('research.rss', 'RSS', {
    state: 'AVAILABLE',
    reason: 'Generic RSS ingestion (fetch, SSRF guard, xml2js parse, hash dedupe) is implemented and exercised by extraction and feed tests.',
    evidence: [
      'packages/intelligence/src/sourceIngestion.ts (SourceIngestionService.ingest)',
      'packages/intelligence/src/test/sourceExtraction.test.ts (40 tests)',
      'apps/api/src/feedAdapters.test.ts',
    ],
    liveVerified: true,
    verifyNote: 'Verified live 2026-10-04: blog RSS returned HTTP 200 and the real extractRssContent parser produced 10 items with titles.',
    requiresAuth: false,
    requiresApproval: false,
    provenance: 'OBSERVED',
    userAction: 'Add an RSS feed URL as a feed source.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'RESEARCH',
        description: 'Feed-driven source. Runs through the FeedSource loop (fetch, parse, dedupe, provenance).',
        authKind: 'NONE',
        sourceOfTruth: 'packages/intelligence/src/sourceIngestion.ts (generic RSS path; FeedSource loop)',
        notWiredReason: null,
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'Add the feed URL as a feed source.',
      },
    },
  }),
  research('research.atom', 'Atom', {
    state: 'AVAILABLE',
    reason: 'Generic Atom ingestion shares the RSS path, including the xml2js object-content normalization fix.',
    evidence: [
      'packages/intelligence/src/sourceIngestion.ts (extractAtomContent)',
      'apps/api/src/feedAdapters.test.ts',
    ],
    liveVerified: true,
    verifyNote: 'Verified live 2026-10-04: react releases.atom returned HTTP 200 (138KB) and the real extractAtomContent parser produced 10 entries with published dates.',
    requiresAuth: false,
    requiresApproval: false,
    provenance: 'OBSERVED',
    userAction: 'Add an Atom feed URL as a feed source.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'RESEARCH',
        description: 'Feed-driven source. Runs through the FeedSource loop (fetch, parse, dedupe, provenance).',
        authKind: 'NONE',
        sourceOfTruth: 'packages/intelligence/src/sourceIngestion.ts (generic ATOM path; FeedSource loop)',
        notWiredReason: null,
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'Add the feed URL as a feed source.',
      },
    },
  }),
  research('research.website', 'Websites', {
    state: 'AVAILABLE',
    reason: 'HTML article extraction (jsdom DOM parse of fetched HTML, SSRF-guarded) covers blogs, sites, and user URLs.',
    evidence: [
      'packages/intelligence/src/sourceIngestion.ts (extractHtmlContent)',
      'packages/intelligence/src/ssrfProtection.ts',
      'packages/intelligence/src/test/ssrfProtection.test.ts',
    ],
    liveVerified: false,
    verifyNote: 'Covered by unit/integration tests with fixtures; no live-site re-probe executed in the WP1 session.',
    requiresAuth: false,
    requiresApproval: false,
    provenance: 'OBSERVED',
    userAction: 'Add a blog, site, or article URL as a feed source.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: ['BLOG', 'SITE', 'USER_URL'],
      catalogue: {
        group: 'RESEARCH',
        description: 'Feed-driven source. Runs through the FeedSource loop (fetch, parse, dedupe, provenance).',
        authKind: 'NONE',
        sourceOfTruth: 'packages/intelligence/src/sourceIngestion.ts (HTML path; FeedSource loop)',
        notWiredReason: null,
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'Add the page URL as a feed source.',
      },
    },
  }),
  research('research.hackernews', 'Hacker News', {
    state: 'AVAILABLE',
    reason: 'Official HN Firebase API expansion (top stories + item records) is implemented; title/url/published-time only, no engagement values.',
    evidence: [
      'packages/intelligence/src/feedAdapters.ts (expandHackerNewsFeed)',
      'apps/api/src/feedAdapters.test.ts',
      'docs/qa/AUTONOMOUS_GROWTH_REPORT.md (2026-10-02 real run: story documents stored)',
    ],
    liveVerified: true,
    verifyNote: 'Verified live 2026-10-04: HN topstories returned HTTP 200 (500 ids) and an item record carried title, URL, and publish time.',
    requiresAuth: false,
    requiresApproval: false,
    provenance: 'OBSERVED',
    userAction: 'Add a Hacker News URL as a feed source.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: ['HACKERNEWS'],
      catalogue: {
        group: 'RESEARCH',
        description: 'Feed-driven source. Frontpage/discussion URLs expand through the official Hacker News API.',
        authKind: 'NONE',
        sourceOfTruth: 'packages/intelligence/src/feedAdapters.ts (expandHackerNewsFeed; FeedSource loop)',
        notWiredReason: null,
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'Add a Hacker News URL as a feed source.',
      },
    },
  }),
  research('research.github', 'GitHub', {
    state: 'AVAILABLE',
    reason: 'Releases-Atom resolution plus parsing verified live 2026-10-04: react releases.atom returned HTTP 200 and the real parser produced 10 entries with dates (c200f06 fix confirmed on a live payload).',
    evidence: [
      'packages/intelligence/src/feedAdapters.ts (resolveReleaseFeedUrl)',
      'packages/shared/src/intelligence/sourceExtraction.ts (extractAtomContent)',
      'WP2 live probe 2026-10-04: HTTP 200, 138KB, 10 entries parsed (react releases.atom)',
    ],
    liveVerified: true,
    verifyNote: 'Verified live 2026-10-04 as above. Prior gate-4 BLOCKED record (Atom content defect) is superseded for the fetch+parse path.',
    requiresAuth: false,
    requiresApproval: false,
    provenance: 'OBSERVED',
    userAction: 'Add a GitHub repository URL as a feed source.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: ['GITHUB_RELEASES'],
      catalogue: {
        group: 'RESEARCH',
        description: 'Feed-driven source. Repository URLs resolve to the official releases Atom feed.',
        authKind: 'NONE',
        sourceOfTruth: 'packages/intelligence/src/feedAdapters.ts (resolveReleaseFeedUrl; FeedSource loop)',
        notWiredReason: null,
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'Add a GitHub repository URL as a feed source; verification pending.',
      },
    },
  }),
research('research.reddit', 'Reddit', {
    state: 'AVAILABLE_WITH_AUTH',
    reason: 'App-only OAuth (script-type app, client_credentials grant) enables research when server holds credentials. Public JSON endpoint is blocked by provider (HTTP 403/404).',
    evidence: [
      'packages/intelligence/src/connectors/redditConnector.ts (RedditConnector.fetchRecentItems; app-only OAuth via oauth.reddit.com with bearer token)',
      'docs gate-2 record a03a163 (HTTP 403 network-wide on public endpoints)',
    ],
    liveVerified: false,
    verifyNote: 'Requires REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET in server env for OAuth path. Public endpoint remains blocked by provider.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'OBSERVED',
    userAction: 'Provide Reddit script-app credentials (client ID + secret) in server env to enable OAuth-based research.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'CONNECTED_PLATFORM',
        description: 'Research role: discover questions, discussions and problems from selected public subreddits via app-only OAuth (script-type app, client_credentials grant). Requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET on the server.',
        authKind: 'OAUTH',
        sourceOfTruth: 'packages/intelligence/src/connectors/redditConnector.ts (RedditConnector.fetchRecentItems; app-only OAuth via oauth.reddit.com with bearer token)',
        notWiredReason: null,
        accountConnectable: true,
        requiresAccountNote: 'Reddit research requires app-only OAuth credentials (script-type app: client ID + secret). Public JSON endpoint is blocked by provider and never used when credentials are present.',
        userAction: 'Provide Reddit script-app credentials (client ID + secret) in server env to enable OAuth-based research.',
      },
    },
  }),
  research('research.google_trends', 'Google Trends', {
    state: 'BLOCKED',
    reason: 'Last live probe failed (CSV HTTP 400 on the unofficial public endpoints). Connector code is real and the worker attempts it; attempts fail honestly.',
    evidence: [
      'packages/intelligence/src/connectors/googleTrendsConnector.ts (GoogleTrendsConnector.fetchRecentItems; unofficial CSV endpoints)',
      'docs gate-3 record 49a093d (CSV HTTP 400)',
    ],
    liveVerified: false,
    verifyNote: 'Re-probed live 2026-10-04: relatedsearches CSV endpoint returned HTTP 400 with an HTML error page. Unofficial endpoints, best-effort by design.',
    requiresAuth: false,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'Enable and choose topics; expect honest failure until the endpoint answers.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'RESEARCH',
        description: 'Rising and top related queries plus relative interest (0–100, never absolute volume) for chosen topics. Uses unofficial public Google Trends endpoints — not an official Google API.',
        authKind: 'NONE',
        sourceOfTruth: 'packages/intelligence/src/connectors/googleTrendsConnector.ts (GoogleTrendsConnector.fetchRecentItems; unofficial CSV endpoints)',
        notWiredReason: null,
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'Enable and choose topics, region, time range and category.',
      },
    },
  }),
  research('research.youtube', 'YouTube', {
    state: 'AVAILABLE_WITH_AUTH',
    reason: 'Query-driven public video search code is real; it runs only when the server holds a Data API key or OAuth token. No key is configured on this server, so runtime resolution is NOT_CONFIGURED here.',
    evidence: [
      'packages/intelligence/src/connectors/youtubeConnector.ts (YouTubeConnector.fetchRecentItems; needs credentials.apiKey and/or credentials.accessToken)',
      'packages/intelligence/src/researchConnectors.ts (primeConnectorRegistry: YOUTUBE primed only with key/token)',
    ],
    liveVerified: false,
    verifyNote: 'WP2 confirms no YOUTUBE_API_KEY/ACCESS_TOKEN on this server, so runtime resolution is NOT_CONFIGURED (priming path unit-tested). No live probe possible without credentials.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'OBSERVED',
    userAction: 'Ask the operator for API credentials, or connect your account for inspiration pulls.',
    fields: {
      workerAttempt: true,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'CONNECTED_PLATFORM',
        description: 'Research role: query-driven public video search (title, description, publish time, watch URL). Runs only when the server holds a Data API key or OAuth token.',
        authKind: 'API_KEY',
        sourceOfTruth: 'packages/intelligence/src/connectors/youtubeConnector.ts (YouTubeConnector.fetchRecentItems; needs credentials.apiKey and/or credentials.accessToken)',
        notWiredReason: null,
        accountConnectable: true,
        requiresAccountNote: 'Connecting your YouTube account enables inspiration pulls only. Research search runs only when server API credentials exist, and is a separate capability.',
        userAction: 'Ask the operator for API credentials, or connect your account for inspiration pulls.',
      },
    },
  }),
  research('research.linkedin', 'LinkedIn', {
    state: 'UNAVAILABLE',
    reason: 'Reading member posts requires the restricted r_member_social permission, which is not provisioned for this application. The connector reports this deterministically and never calls member-post endpoints.',
    evidence: [
      'packages/intelligence/src/connectors/linkedinConnector.ts (fetchRecentItems throws UNAVAILABLE; no HTTP)',
      'packages/social/src/adapters.ts (LinkedInAdapter: OIDC identity only, scopes openid profile email)',
    ],
    liveVerified: false,
    verifyNote: 'Unavailability is by provider permission, not by network; no re-probe can change it without a provider grant (human/provider decision).',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'Connect your account to link your professional identity. Research is unavailable in this version.',
    fields: {
      workerAttempt: false,
      researchCodeExists: false,
      covers: [],
      catalogue: {
        group: 'CONNECTED_PLATFORM',
        description: 'Account role: links your LinkedIn professional identity via OpenID Connect sign-in (member ID, name, photo, email). Member-post reading is unavailable: it requires the restricted r_member_social permission, which is not provisioned for this application.',
        authKind: 'OAUTH',
        sourceOfTruth: 'packages/social/src/adapters.ts (LinkedInAdapter.fetchAccountIdentity) for identity linking; packages/intelligence/src/connectors/linkedinConnector.ts deterministically reports research UNAVAILABLE and never calls member-post endpoints',
        notWiredReason: 'Member-post research is unavailable: reading member posts requires restricted LinkedIn access this application does not hold, and the worker holds no per-workspace LinkedIn token. Account connection links identity only.',
        accountConnectable: true,
        requiresAccountNote: 'A connected LinkedIn account links your professional identity only. It does not enable LinkedIn research, publishing, or analytics.',
        userAction: 'Connect your account to link your professional identity. Research is unavailable in this version.',
      },
    },
  }),
  research('research.x', 'X', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Registry research execution is not wired: the worker holds no per-workspace X token and never calls this connector. Account connection enables inspiration pulls only.',
    evidence: [
      'packages/intelligence/src/connectors/xConnector.ts (exists but receives no workspace token)',
      'packages/social/src/adapters.ts (XAdapter) for account pulls',
    ],
    liveVerified: false,
    verifyNote: 'No research execution path exists to verify; account-pull code is unit-tested with mocks only.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
    fields: {
      workerAttempt: false,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'CONNECTED_PLATFORM',
        description: 'Account role: read your own recent posts (free tier is narrow; rate limits surface honestly). Registry research is not wired to workspace tokens in this version.',
        authKind: 'OAUTH',
        sourceOfTruth: 'packages/social/src/adapters.ts (XAdapter) for account pulls; packages/intelligence/src/connectors/xConnector.ts exists but receives no workspace token',
        notWiredReason: 'Research execution is not wired: the worker holds no per-workspace X token and never calls this connector. Account connection enables inspiration pulls only.',
        accountConnectable: true,
        requiresAccountNote: 'A connected X account does not enable X research. Research stays off regardless of account state.',
        userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
      },
    },
  }),
  research('research.instagram', 'Instagram', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Registry research execution is not wired: the worker holds no per-workspace Instagram token and never calls this connector. Account connection enables inspiration pulls only.',
    evidence: [
      'packages/intelligence/src/connectors/instagramConnector.ts (exists but receives no workspace token)',
      'packages/social/src/adapters.ts (InstagramAdapter) for account pulls',
    ],
    liveVerified: false,
    verifyNote: 'No research execution path exists to verify; account-pull code is unit-tested with mocks only.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
    fields: {
      workerAttempt: false,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'CONNECTED_PLATFORM',
        description: 'Account role: read your own business/creator media (personal accounts are not readable via the API). Registry research is not wired to workspace tokens in this version.',
        authKind: 'OAUTH',
        sourceOfTruth: 'packages/social/src/adapters.ts (InstagramAdapter) for account pulls; packages/intelligence/src/connectors/instagramConnector.ts exists but receives no workspace token',
        notWiredReason: 'Research execution is not wired: the worker holds no per-workspace Instagram token and never calls this connector. Account connection enables inspiration pulls only.',
        accountConnectable: true,
        requiresAccountNote: 'A connected Instagram account does not enable Instagram research. Research stays off regardless of account state.',
        userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
      },
    },
  }),
  research('research.facebook', 'Facebook', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Research execution has no runnable path: neither the daily worker nor the research trigger invokes this connector. Account connection enables inspiration pulls only.',
    evidence: [
      'packages/intelligence/src/connectors/facebookConnector.ts (no worker or trigger path invokes it)',
      'packages/social/src/adapters.ts (FacebookAdapter) for account pulls',
    ],
    liveVerified: false,
    verifyNote: 'No research execution path exists to verify; account-pull code is unit-tested with mocks only.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
    fields: {
      workerAttempt: false,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'CONNECTED_PLATFORM',
        description: 'Account role: read posts from Pages you administer (personal timelines are not readable). Registry research has no runnable caller in this version.',
        authKind: 'OAUTH',
        sourceOfTruth: 'packages/social/src/adapters.ts (FacebookAdapter) for account pulls; packages/intelligence/src/connectors/facebookConnector.ts exists but no worker or trigger path invokes it',
        notWiredReason: 'Research execution has no runnable path: neither the daily worker nor the research trigger invokes this connector. Account connection enables inspiration pulls only.',
        accountConnectable: true,
        requiresAccountNote: 'A connected Facebook account does not enable Facebook research. Research stays off regardless of account state.',
        userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
      },
    },
  }),
  research('research.tiktok', 'TikTok', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Own-videos research exists as a backend class, but there is no supported execution path: no server app-credential wiring and no account adapter.',
    evidence: [
      'packages/intelligence/src/connectors/tiktokConnector.ts (class only — no TIKTOK_* env wiring in apps/api/src/config/env.ts, no adapter in packages/social/src/adapters.ts)',
    ],
    liveVerified: false,
    verifyNote: 'Nothing runnable exists to verify. Enabling is rejected by the API rather than stored falsely.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'No action available yet. This card exists so the limitation is visible.',
    fields: {
      workerAttempt: false,
      researchCodeExists: true,
      covers: [],
      catalogue: {
        group: 'CONNECTED_PLATFORM',
        description: 'Own videos research exists as a backend class, but there is no supported execution path yet: no server app-credential wiring and no account adapter.',
        authKind: 'OAUTH',
        sourceOfTruth: 'packages/intelligence/src/connectors/tiktokConnector.ts (class only — no TIKTOK_* env wiring in apps/api/src/config/env.ts, no adapter in packages/social/src/adapters.ts)',
        notWiredReason: 'Not yet connectable: the server has no TikTok app-credential configuration and no account adapter, so neither research nor account connection can run.',
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'No action available yet. This card exists so the limitation is visible.',
      },
    },
  }),
  research('research.quora', 'Quora', {
    state: 'UNAVAILABLE',
    reason: 'Quora provides no official public API for content retrieval, and scraping would violate its Terms of Service. The connector reports UNAVAILABLE instead of fabricating data.',
    evidence: [
      'packages/intelligence/src/connectors/quoraConnector.ts (fetchRecentItems always throws UNAVAILABLE; getHealth reports UNAVAILABLE)',
    ],
    liveVerified: false,
    verifyNote: 'Unavailability is structural (no API exists); enabling is rejected by the API.',
    requiresAuth: false,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'No action available. Shown for transparency only.',
    fields: {
      workerAttempt: false,
      researchCodeExists: false,
      covers: [],
      catalogue: {
        group: 'UNAVAILABLE',
        description: 'Quora provides no official public API for content retrieval, and scraping would violate its Terms of Service. This source cannot be enabled.',
        authKind: 'NONE',
        sourceOfTruth: 'packages/intelligence/src/connectors/quoraConnector.ts (fetchRecentItems always throws UNAVAILABLE; getHealth reports UNAVAILABLE)',
        notWiredReason: 'Unavailable by design: no authorized integration exists. The connector reports UNAVAILABLE instead of fabricating data.',
        accountConnectable: false,
        requiresAccountNote: null,
        userAction: 'No action available. Shown for transparency only.',
      },
    },
  }),
];

// ---------------------------------------------------------------------------
// EXECUTION
// ---------------------------------------------------------------------------

const EXECUTION: CapabilityEntry[] = [
  entry('execution.linkedin_publish', 'EXECUTION', 'LinkedIn publishing', {
    state: 'NOT_IMPLEMENTED',
    reason: 'No publisher exists and no LinkedIn publishing permission is provisioned. Publishing is hardcoded unavailable; the worker EXECUTION stage always skips.',
    evidence: [
      'packages/social/src/capabilities.ts (linkedin publishing supported:false, wired:false)',
      'apps/api/src/routes/readiness.ts (LINKEDIN publishing:false)',
      'apps/api/src/worker/stages.ts (EXECUTION unconditional skip)',
      'packages/db/prisma/schema.prisma (WorkspaceSettings.dailyExecutionCap default 0)',
    ],
    liveVerified: false,
    verifyNote: 'WP5 will build the publisher interface only if a legitimate permission exists; otherwise this stays NOT_IMPLEMENTED.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'Publish approved content manually on LinkedIn, then record the publication in the app.',
  }),
  entry('execution.linkedin_messaging', 'EXECUTION', 'LinkedIn messaging', {
    state: 'NOT_IMPLEMENTED',
    reason: 'No messaging integration exists. Outreach preparation ends at READY_FOR_AUTHORIZED_EXECUTION plus an export workflow; nothing is ever sent.',
    evidence: [
      'packages/sales/src/prepared.ts (PreparedAction terminal state READY_FOR_AUTHORIZED_EXECUTION)',
      'docs/adr/003-linkedin-execution-boundary.md',
    ],
    liveVerified: false,
    verifyNote: 'No send path exists to verify.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'Copy approved outreach from the app and send it manually; record replies back in the app.',
  }),
  entry('execution.x_publish', 'EXECUTION', 'X publishing', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Publishing is not implemented for any platform.',
    evidence: ['packages/social/src/capabilities.ts (x publishing supported:false, wired:false)'],
    liveVerified: false,
    verifyNote: 'No publisher exists to verify.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'No action available.',
  }),
  entry('execution.instagram_publish', 'EXECUTION', 'Instagram publishing', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Publishing is not implemented for any platform.',
    evidence: ['packages/social/src/capabilities.ts (instagram publishing supported:false, wired:false)'],
    liveVerified: false,
    verifyNote: 'No publisher exists to verify.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'No action available.',
  }),
  entry('execution.facebook_publish', 'EXECUTION', 'Facebook publishing', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Publishing is not implemented for any platform.',
    evidence: ['packages/social/src/capabilities.ts (facebook publishing supported:false, wired:false)'],
    liveVerified: false,
    verifyNote: 'No publisher exists to verify.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'No action available.',
  }),
  entry('execution.youtube_publish', 'EXECUTION', 'YouTube publishing', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Publishing is not implemented for any platform.',
    evidence: ['packages/social/src/capabilities.ts (youtube publishing supported:false, wired:false)'],
    liveVerified: false,
    verifyNote: 'No publisher exists to verify.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'No action available.',
  }),
  entry('execution.tiktok_publish', 'EXECUTION', 'TikTok publishing', {
    state: 'NOT_IMPLEMENTED',
    reason: 'Publishing is not implemented for any platform; TikTok has no account adapter either.',
    evidence: ['packages/intelligence/src/connectors/tiktokConnector.ts (class only, no adapter)'],
    liveVerified: false,
    verifyNote: 'No publisher exists to verify.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'No action available.',
  }),
  entry('execution.dispatch', 'EXECUTION', 'Execution dispatch (worker)', {
    state: 'NOT_IMPLEMENTED',
    reason: 'The worker EXECUTION stage exists as code but always skips: no authorized integration exists and the execution budget defaults to 0. It dispatches nothing.',
    evidence: [
      'apps/api/src/worker/stages.ts (EXECUTION stage skip)',
      'apps/api/src/worker/budget.ts (execution cap default 0)',
      'apps/api/src/operatorMachine.test.ts (EXECUTION SKIPPED asserted)',
    ],
    liveVerified: false,
    verifyNote: 'Skip behavior is asserted by tests; dispatch itself has nothing to verify until WP5.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'No action available. Execution stays unavailable until an authorized integration exists.',
  }),
  entry('execution.approval_gate', 'EXECUTION', 'Human approval enforcement', {
    state: 'AVAILABLE',
    reason: 'Content/sales approval gates (role checks, quality gates, hash-pinned reviews, approval snapshots, draft immutability) are implemented and tested.',
    evidence: [
      'packages/content/src/gates.ts + review.ts',
      'packages/sales/src/gates.ts + review.ts',
      'apps/api/src/approvalSnapshot.test.ts',
      'apps/api/src/contentMachine.test.ts',
      'apps/api/src/salesMachine.test.ts',
    ],
    liveVerified: false,
    verifyNote: 'Enforced by integration tests (viewer cannot approve, blocked approvals refused); no live human-approval observation recorded in WP1 session.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'OBSERVED',
    userAction: 'Use the review flows to approve or reject prepared work.',
  }),
];

// ---------------------------------------------------------------------------
// OBSERVATION
// ---------------------------------------------------------------------------

const OBSERVATION: CapabilityEntry[] = [
  entry('observation.post_metrics', 'OBSERVATION', 'Post metrics observation', {
    state: 'NOT_IMPLEMENTED',
    reason: 'No platform analytics ingestion exists. Engagement numbers are never read or stored, by architecture.',
    evidence: [
      'packages/social/src/types.ts (SocialItem: no engagement fields)',
      'packages/intelligence/src/researchConnectors.ts (engagement never consumed by ranking)',
    ],
    liveVerified: false,
    verifyNote: 'Nothing is read, so there is nothing to verify except the absence (grep-clean).',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'Record outcomes manually; they are labeled USER_REPORTED, never observed.',
  }),
  entry('observation.comment_manual', 'OBSERVATION', 'Manual comment ingest', {
    state: 'AVAILABLE',
    reason: 'Comments can be ingested manually with classification (sentiment, intent, objection, question, opportunity, spam) feeding Content, Sales, Audience, and Learning.',
    evidence: [
      'packages/business/src/comments.ts (CommentBrainService)',
      'apps/api/src/routes/comments.ts',
    ],
    liveVerified: false,
    verifyNote: 'Ingest/classify path is integration-tested; no live comment workflow observed in WP1 session.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'USER_REPORTED',
    userAction: 'Paste comments into the app for classification.',
  }),
  entry('observation.comment_linkedin', 'OBSERVATION', 'LinkedIn comment reading', {
    state: 'NOT_IMPLEMENTED',
    reason: 'No LinkedIn comment integration exists; comment permission was never provisioned.',
    evidence: ['apps/api/src/routes/social.ts (linkedin comments:false)'],
    liveVerified: false,
    verifyNote: 'No code path exists to verify.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'No action available.',
  }),
  entry('observation.audience_signals', 'OBSERVATION', 'Audience signals (manual)', {
    state: 'AVAILABLE',
    reason: 'Audience signals with evidence and strength can be recorded manually and merged per hypothesis.',
    evidence: [
      'packages/db/prisma/schema.prisma (AudienceSignal)',
      'apps/api/src/routes/comments.ts (signals endpoint)',
    ],
    liveVerified: false,
    verifyNote: 'Storage and retrieval tested; no live signal workflow observed in WP1 session.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'USER_REPORTED',
    userAction: 'Record audience observations with their evidence.',
  }),
  entry('observation.follower_demographics', 'OBSERVATION', 'Follower demographics', {
    state: 'NOT_IMPLEMENTED',
    reason: 'No provider supplies follower data. The Audience Brain never pretends follower demographics exist.',
    evidence: ['apps/api/src/routes/social.ts (linkedin audience:false)'],
    liveVerified: false,
    verifyNote: 'No code path exists to verify.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'UNKNOWN',
    userAction: 'No action available.',
  }),
  entry('observation.conversation_outcomes', 'OBSERVATION', 'Conversation/outcome recording', {
    state: 'AVAILABLE',
    reason: 'Conversations, messages (manual records), pipeline transitions, publish records, and outcome metrics can be recorded with provenance.',
    evidence: [
      'apps/api/src/routes/conversations.ts',
      'apps/api/src/routes/messages.ts',
      'apps/api/src/routes/outcomes.ts',
      'apps/api/src/routes/publishRecords.ts (user-assertion notice)',
      'apps/api/src/learningMachine.test.ts',
    ],
    liveVerified: false,
    verifyNote: 'Recording paths tested; all rows are human assertions, never platform observations.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'USER_REPORTED',
    userAction: 'Record conversations and outcomes as they happen externally.',
  }),
];

// ---------------------------------------------------------------------------
// SALES
// ---------------------------------------------------------------------------

const SALES: CapabilityEntry[] = [
  entry('sales.lead_import', 'SALES', 'Lead import + normalization', {
    state: 'AVAILABLE',
    reason: 'CSV and manual lead import with validation, dedupe on (workspaceId, linkedinUrl), and honest skip counts.',
    evidence: [
      'apps/api/src/routes/leads.ts',
      'apps/api/src/salesMachine.test.ts',
      'apps/api/src/onboarding.test.ts (CSV import with skips)',
    ],
    liveVerified: false,
    verifyNote: 'Import paths integration-tested; no live import observed in WP1 session.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'USER_REPORTED',
    userAction: 'Import leads via CSV or add them manually.',
  }),
  entry('sales.qualification', 'SALES', 'Qualification + scoring', {
    state: 'AVAILABLE',
    reason: 'Deterministic 8-dimension qualification with INSUFFICIENT_DATA/UNQUALIFIED honesty; transparent scores with per-dimension reason/evidence, never conversion probability.',
    evidence: [
      'packages/sales/src/qualification.ts',
      'packages/sales/src/scoring.ts',
      'apps/api/src/salesMachine.test.ts',
    ],
    liveVerified: false,
    verifyNote: 'Scoring logic unit- and integration-tested.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'INFERRED',
    userAction: 'Review qualification results and their evidence.',
  }),
  entry('sales.prospect_research', 'SALES', 'Prospect research + briefs', {
    state: 'AVAILABLE',
    reason: 'Fact-based research records ({statement, sourceRef} mandatory) with AI-gated synthesis and auto no_outreach default.',
    evidence: ['packages/sales/src/research.ts', 'apps/api/src/salesMachine.test.ts'],
    liveVerified: false,
    verifyNote: 'Synthesis returns honest AI_UNAVAILABLE without a provider key.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'USER_REPORTED',
    userAction: 'Add research facts with their sources.',
  }),
  entry('sales.outreach_prep', 'SALES', 'Outreach preparation', {
    state: 'AVAILABLE',
    reason: 'Five draft types from APPROVED strategies with fixed structure, 16 deterministic gates, and anti-spam/anti-invention rules.',
    evidence: [
      'packages/sales/src/compose.ts',
      'packages/sales/src/gates.ts',
      'apps/api/src/salesMachine.test.ts',
    ],
    liveVerified: false,
    verifyNote: 'Gate evaluation and approval pinning integration-tested.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'INFERRED',
    userAction: 'Prepare outreach from an approved strategy, then review it.',
  }),
  entry('sales.approval', 'SALES', 'Outreach approval', {
    state: 'AVAILABLE',
    reason: 'Hash-pinned outreach reviews with role-gated approval; approved drafts invalidate on edit.',
    evidence: ['packages/sales/src/review.ts', 'apps/api/src/salesMachine.test.ts'],
    liveVerified: false,
    verifyNote: 'Approval transitions integration-tested.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'OBSERVED',
    userAction: 'Approve or reject prepared outreach.',
  }),
  entry('sales.authorized_execution', 'SALES', 'Authorized message execution', {
    state: 'NOT_IMPLEMENTED',
    reason: 'No messaging adapter exists (no official API permission). Prepared actions end at READY_FOR_AUTHORIZED_EXECUTION; no DM scraping or browser automation is used instead.',
    evidence: [
      'packages/sales/src/prepared.ts',
      'docs/adr/003-linkedin-execution-boundary.md',
    ],
    liveVerified: false,
    verifyNote: 'No send path exists to verify; schema enum lacks any SENT state.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'Send approved outreach manually; record replies back in the app.',
  }),
  entry('sales.reply_classification', 'SALES', 'Reply classification', {
    state: 'AVAILABLE',
    reason: 'Deterministic inbox classification (INTERESTED/OBJECTION/QUESTION/UNCLEAR fallback) with optional AI assist.',
    evidence: ['packages/sales/src/classify.ts', 'apps/api/src/salesMachine.test.ts'],
    liveVerified: false,
    verifyNote: 'Classification fallback logic tested.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'INFERRED',
    userAction: 'Record replies to get classification and follow-up suggestions.',
  }),
  entry('sales.followup', 'SALES', 'Follow-up recommendations', {
    state: 'AVAILABLE',
    reason: 'Recommendation-only follow-ups (FOLLOW_UP_LATER/WAIT/NURTURE/NO_OUTREACH/DISMISS first-class); nothing is ever auto-sent.',
    evidence: ['packages/sales/src/signals.ts', 'apps/api/src/salesMachine.test.ts'],
    liveVerified: false,
    verifyNote: 'Recommendation logic tested; WAIT/NURTURE/NO_OUTREACH/DISMISS are honored outcomes.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'INFERRED',
    userAction: 'Accept, adjust, or dismiss follow-up recommendations.',
  }),
  entry('sales.pipeline', 'SALES', 'Opportunity pipeline', {
    state: 'AVAILABLE',
    reason: 'Transition-controlled pipeline (WON/LOST user-recorded, no inferred revenue).',
    evidence: ['apps/api/src/routes/pipeline.ts', 'apps/api/src/salesMachine.test.ts'],
    liveVerified: false,
    verifyNote: 'Transition guards integration-tested.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'USER_REPORTED',
    userAction: 'Move opportunities through stages as they progress externally.',
  }),
];

// ---------------------------------------------------------------------------
// LEARNING
// ---------------------------------------------------------------------------

const LEARNING: CapabilityEntry[] = [
  entry('learning.outcome_ingestion', 'LEARNING', 'Outcome ingestion', {
    state: 'AVAILABLE',
    reason: 'Outcome metrics and publish records can be recorded manually with source and provenance; publish records carry an explicit user-assertion notice.',
    evidence: [
      'apps/api/src/routes/outcomes.ts',
      'apps/api/src/routes/publishRecords.ts',
      'apps/api/src/learningMachine.test.ts',
    ],
    liveVerified: false,
    verifyNote: 'Recording tested; every row is USER_REPORTED, never platform-observed.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'USER_REPORTED',
    userAction: 'Record outcomes as they happen externally.',
  }),
  entry('learning.attribution', 'LEARNING', 'Attribution', {
    state: 'AVAILABLE',
    reason: 'Attribution links (DIRECT/INFERRED/UNKNOWN) with evidence requirements; DIRECT without evidence is rejected.',
    evidence: [
      'packages/decision/src/collectors.ts (attribution collection)',
      'apps/api/src/batch2.test.ts (D section)',
    ],
    liveVerified: false,
    verifyNote: 'Link validation tested; score impact on ranking is PARTIAL (see REGRESSION_MATRIX DECISION-002).',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'INFERRED',
    userAction: 'Link outcomes to the content or actions that caused them, with evidence.',
  }),
  entry('learning.maturity', 'LEARNING', 'Learning maturity gating', {
    state: 'AVAILABLE',
    reason: 'Maturity ladder (UNKNOWN/OBSERVED/REPEATED/HYPOTHESIS/EXPERIMENT/SUPPORTED/CONFIRMED) gates influence; one data point never rewrites strategy.',
    evidence: [
      'packages/learning/src/maturity.ts',
      'docs/adr/005-learning-maturity.md',
      'apps/api/src/batch2.test.ts (C section)',
    ],
    liveVerified: false,
    verifyNote: 'Gating logic tested; no live progression observed in WP1 session.',
    requiresAuth: true,
    requiresApproval: false,
    provenance: 'INFERRED',
    userAction: 'Confirm or reject learning proposals to move them along the ladder.',
  }),
  entry('learning.confirmed_influence', 'LEARNING', 'Confirmed influence on ranking', {
    state: 'AVAILABLE',
    reason: 'Confirmed learning (maturity at threshold) is read by the decision context and boosts matching recommendations; proposals are discoverable with confirm/reject flow.',
    evidence: [
      'packages/learning/src/derivation.ts',
      'packages/learning/src/influence.ts',
      'apps/api/src/learningMachine.test.ts (confirmed learning affects scoring)',
      'apps/web/src/pages/LearningPage.tsx (confirm flow)',
    ],
    liveVerified: false,
    verifyNote: 'Mechanism tested end-to-end with fixtures; zero live learning signals exist, so no real ranking change has ever been observed.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'INFERRED',
    userAction: 'Confirm learning proposals you agree with; watch subsequent rankings.',
  }),
  entry('learning.experiments', 'LEARNING', 'Experiments', {
    state: 'AVAILABLE',
    reason: 'Experiment design flow exists (hypothesis, control, variant, metric, minimum evidence, duration, decision rule); insufficient sample yields INSUFFICIENT_DATA, never fake significance.',
    evidence: ['packages/db/prisma/schema.prisma (Experiment)', 'packages/business/src/experiments.ts'],
    liveVerified: false,
    verifyNote: 'Design flow exists; no completed live experiment is on record.',
    requiresAuth: true,
    requiresApproval: true,
    provenance: 'UNKNOWN',
    userAction: 'Design experiments from the content or learning views.',
  }),
];

export const CAPABILITY_REGISTRY: ReadonlyArray<CapabilityEntry | ResearchCapabilityEntry> = [
  ...RESEARCH,
  ...EXECUTION,
  ...OBSERVATION,
  ...SALES,
  ...LEARNING,
];

export function getCapability(id: string): CapabilityEntry | ResearchCapabilityEntry | undefined {
  return CAPABILITY_REGISTRY.find((e) => e.id === id);
}

export function capabilitiesByDomain(
  domain: CapabilityEntry['domain'],
): ReadonlyArray<CapabilityEntry | ResearchCapabilityEntry> {
  return CAPABILITY_REGISTRY.filter((e) => e.domain === domain);
}

export function researchCapabilities(): ResearchCapabilityEntry[] {
  return RESEARCH.slice();
}
