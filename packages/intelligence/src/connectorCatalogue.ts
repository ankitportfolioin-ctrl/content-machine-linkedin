/**
 * Workspace connector catalogue — single source of truth for user-visible
 * connector claims AND worker execution eligibility.
 *
 * Purpose: the UI catalogue, the connectors API, and the intelligence worker
 * must never disagree about what a source can do. Every entry documents:
 * - what the backend can actually execute (workerEligible)
 * - where the capability lives (sourceOfTruth: file/class reference)
 * - what the user must do (authKind + userAction)
 *
 * Rules enforced by the invariant test
 * (apps/api/src/connectorCatalogue.test.ts):
 * - workerEligible === true  =>  the worker MUST attempt this connector when
 *   the workspace enables it (and must skip it when disabled/missing).
 * - workerEligible === false =>  the worker MUST NEVER call its fetch method,
 *   and the catalogue MUST say why (notWiredReason).
 * - No entry may claim OAuth research execution: per-workspace OAuth tokens
 *   are never plumbed into the research loop, so a connected account never
 *   enables research (see requiresAccountNote).
 */

export type ConnectorGroup = 'RESEARCH' | 'CONNECTED_PLATFORM' | 'UNAVAILABLE';

export type ConnectorAuthKind = 'NONE' | 'API_KEY' | 'OAUTH';

export interface ConnectorCatalogueEntry {
  /** Registry sourceType. Only genuine registry connectors — never feed types. */
  sourceType: string;
  displayName: string;
  group: ConnectorGroup;
  description: string;
  authKind: ConnectorAuthKind;
  /** Exact backend capability that backs this card (file + class/method). */
  sourceOfTruth: string;
  /**
   * Whether the intelligence worker can actually execute this connector.
   * False means: visible for transparency, never executed.
   */
  workerEligible: boolean;
  /** Required when workerEligible is false: honest user-facing reason. */
  notWiredReason: string | null;
  /** True when a Connect button may be shown (server app creds + adapter exist). */
  accountConnectable: boolean;
  /** Shown next to account state; always clarifies account != research. */
  requiresAccountNote: string | null;
  /** User-facing action label (never a fake promise). */
  userAction: string;
}

/**
 * Feed-driven sources keep FeedSource as their source of truth and are NOT
 * catalogue entries here. The API rejects them for WorkspaceConnector rows.
 */
export const FEED_OWNED_SOURCE_TYPES = [
  'RSS',
  'ATOM',
  'HACKERNEWS',
  'GITHUB_RELEASES',
  'BLOG',
  'SITE',
  'USER_URL',
] as const;

export const RESEARCH_CONNECTOR_TYPES = [
  'REDDIT',
  'GOOGLE_TRENDS',
  'YOUTUBE',
  'LINKEDIN',
  'X',
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'QUORA',
] as const;

export type ResearchConnectorType = (typeof RESEARCH_CONNECTOR_TYPES)[number];

export const CONNECTOR_CATALOGUE: readonly ConnectorCatalogueEntry[] = [
  {
    sourceType: 'REDDIT',
    displayName: 'Reddit',
    group: 'RESEARCH',
    description:
      'Discover questions, discussions and problems from selected public subreddits (self-posts with problem-discovery signal).',
    authKind: 'NONE',
    sourceOfTruth:
      'packages/intelligence/src/connectors/redditConnector.ts (RedditConnector.fetchRecentItems; public reddit.com JSON, no key)',
    workerEligible: true,
    notWiredReason: null,
    accountConnectable: false,
    requiresAccountNote: null,
    userAction: 'Enable and choose subreddits, sort and time window.',
  },
  {
    sourceType: 'GOOGLE_TRENDS',
    displayName: 'Google Trends',
    group: 'RESEARCH',
    description:
      'Rising and top related queries plus relative interest (0–100, never absolute volume) for chosen topics. Uses unofficial public Google Trends endpoints — not an official Google API.',
    authKind: 'NONE',
    sourceOfTruth:
      'packages/intelligence/src/connectors/googleTrendsConnector.ts (GoogleTrendsConnector.fetchRecentItems; unofficial CSV endpoints)',
    workerEligible: true,
    notWiredReason: null,
    accountConnectable: false,
    requiresAccountNote: null,
    userAction: 'Enable and choose topics, region, time range and category.',
  },
  {
    sourceType: 'YOUTUBE',
    displayName: 'YouTube',
    group: 'CONNECTED_PLATFORM',
    description:
      'Research role: query-driven public video search (title, description, publish time, watch URL). Runs only when the server holds a Data API key or OAuth token.',
    authKind: 'API_KEY',
    sourceOfTruth:
      'packages/intelligence/src/connectors/youtubeConnector.ts (YouTubeConnector.fetchRecentItems; needs credentials.apiKey and/or credentials.accessToken)',
    workerEligible: true,
    notWiredReason: null,
    accountConnectable: true,
    requiresAccountNote:
      'Connecting your YouTube account enables inspiration pulls only. Research search runs only when server API credentials exist, and is a separate capability.',
    userAction: 'Ask the operator for API credentials, or connect your account for inspiration pulls.',
  },
  {
    sourceType: 'LINKEDIN',
    displayName: 'LinkedIn',
    group: 'CONNECTED_PLATFORM',
    description:
      'Account role: links your LinkedIn professional identity via OpenID Connect sign-in (member ID, name, photo, email). Member-post reading is unavailable: it requires the restricted r_member_social permission, which is not provisioned for this application.',
    authKind: 'OAUTH',
    sourceOfTruth:
      'packages/social/src/adapters.ts (LinkedInAdapter.fetchAccountIdentity) for identity linking; packages/intelligence/src/connectors/linkedinConnector.ts deterministically reports research UNAVAILABLE and never calls member-post endpoints',
    workerEligible: false,
    notWiredReason:
      'Member-post research is unavailable: reading member posts requires restricted LinkedIn access this application does not hold, and the worker holds no per-workspace LinkedIn token. Account connection links identity only.',
    accountConnectable: true,
    requiresAccountNote:
      'A connected LinkedIn account links your professional identity only. It does not enable LinkedIn research, publishing, or analytics.',
    userAction: 'Connect your account to link your professional identity. Research is unavailable in this version.',
  },
  {
    sourceType: 'X',
    displayName: 'X',
    group: 'CONNECTED_PLATFORM',
    description:
      'Account role: read your own recent posts (free tier is narrow; rate limits surface honestly). Registry research is not wired to workspace tokens in this version.',
    authKind: 'OAUTH',
    sourceOfTruth:
      'packages/social/src/adapters.ts (XAdapter) for account pulls; packages/intelligence/src/connectors/xConnector.ts exists but receives no workspace token',
    workerEligible: false,
    notWiredReason:
      'Research execution is not wired: the worker holds no per-workspace X token and never calls this connector. Account connection enables inspiration pulls only.',
    accountConnectable: true,
    requiresAccountNote:
      'A connected X account does not enable X research. Research stays off regardless of account state.',
    userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
  },
  {
    sourceType: 'INSTAGRAM',
    displayName: 'Instagram',
    group: 'CONNECTED_PLATFORM',
    description:
      'Account role: read your own business/creator media (personal accounts are not readable via the API). Registry research is not wired to workspace tokens in this version.',
    authKind: 'OAUTH',
    sourceOfTruth:
      'packages/social/src/adapters.ts (InstagramAdapter) for account pulls; packages/intelligence/src/connectors/instagramConnector.ts exists but receives no workspace token',
    workerEligible: false,
    notWiredReason:
      'Research execution is not wired: the worker holds no per-workspace Instagram token and never calls this connector. Account connection enables inspiration pulls only.',
    accountConnectable: true,
    requiresAccountNote:
      'A connected Instagram account does not enable Instagram research. Research stays off regardless of account state.',
    userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
  },
  {
    sourceType: 'FACEBOOK',
    displayName: 'Facebook',
    group: 'CONNECTED_PLATFORM',
    description:
      'Account role: read posts from Pages you administer (personal timelines are not readable). Registry research has no runnable caller in this version.',
    authKind: 'OAUTH',
    sourceOfTruth:
      'packages/social/src/adapters.ts (FacebookAdapter) for account pulls; packages/intelligence/src/connectors/facebookConnector.ts exists but no worker or trigger path invokes it',
    workerEligible: false,
    notWiredReason:
      'Research execution has no runnable path: neither the daily worker nor the research trigger invokes this connector. Account connection enables inspiration pulls only.',
    accountConnectable: true,
    requiresAccountNote:
      'A connected Facebook account does not enable Facebook research. Research stays off regardless of account state.',
    userAction: 'Connect your account for inspiration pulls. Research is unavailable in this version.',
  },
  {
    sourceType: 'TIKTOK',
    displayName: 'TikTok',
    group: 'CONNECTED_PLATFORM',
    description:
      'Own videos research exists as a backend class, but there is no supported execution path yet: no server app-credential wiring and no account adapter.',
    authKind: 'OAUTH',
    sourceOfTruth:
      'packages/intelligence/src/connectors/tiktokConnector.ts (class only — no TIKTOK_* env wiring in apps/api/src/config/env.ts, no adapter in packages/social/src/adapters.ts)',
    workerEligible: false,
    notWiredReason:
      'Not yet connectable: the server has no TikTok app-credential configuration and no account adapter, so neither research nor account connection can run.',
    accountConnectable: false,
    requiresAccountNote: null,
    userAction: 'No action available yet. This card exists so the limitation is visible.',
  },
  {
    sourceType: 'QUORA',
    displayName: 'Quora',
    group: 'UNAVAILABLE',
    description:
      'Quora provides no official public API for content retrieval, and scraping would violate its Terms of Service. This source cannot be enabled.',
    authKind: 'NONE',
    sourceOfTruth:
      'packages/intelligence/src/connectors/quoraConnector.ts (fetchRecentItems always throws UNAVAILABLE; getHealth reports UNAVAILABLE)',
    workerEligible: false,
    notWiredReason:
      'Unavailable by design: no authorized integration exists. The connector reports UNAVAILABLE instead of fabricating data.',
    accountConnectable: false,
    requiresAccountNote: null,
    userAction: 'No action available. Shown for transparency only.',
  },
];

/** Source types the worker may ever attempt (subset of the catalogue). */
export const WORKER_ELIGIBLE_SOURCE_TYPES: readonly string[] = CONNECTOR_CATALOGUE.filter(
  (e) => e.workerEligible,
).map((e) => e.sourceType);

export function getCatalogueEntry(sourceType: string): ConnectorCatalogueEntry | undefined {
  return CONNECTOR_CATALOGUE.find((e) => e.sourceType === sourceType);
}

export function isResearchConnectorType(value: string): value is ResearchConnectorType {
  return (RESEARCH_CONNECTOR_TYPES as readonly string[]).includes(value);
}

export function isFeedOwnedSourceType(value: string): boolean {
  return (FEED_OWNED_SOURCE_TYPES as readonly string[]).includes(value);
}
