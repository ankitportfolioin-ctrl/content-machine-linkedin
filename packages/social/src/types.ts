/**
 * Optional social connectors feeding the Content Brain.
 *
 * One interface, one adapter per platform (Instagram, Facebook, LinkedIn,
 * YouTube, X). Adapters use official platform APIs with OAuth read-only
 * scopes only. A broken adapter can never affect the others: every adapter
 * call is failure-isolated by the caller.
 *
 * Honesty rules (non-negotiable):
 * - No credentials configured → the adapter reports NOT_CONFIGURED before any
 *   network call. Nothing is fabricated.
 * - Only fields actually returned by the platform API are mapped. Engagement
 *   numbers, reach, and trends are NEVER read or stored.
 * - Every pulled item keeps platform + external id/URL + fetched-at time.
 */

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'x';

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'instagram',
  'facebook',
  'linkedin',
  'youtube',
  'x',
];

export type ConnectorFailureKind =
  | 'NOT_CONFIGURED'
  | 'NOT_CONNECTED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'RATE_LIMITED'
  | 'API_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class ConnectorError extends Error {
  kind: ConnectorFailureKind;
  retryAfterSeconds?: number;

  constructor(kind: ConnectorFailureKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ConnectorError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A single pulled item. Only real API fields — never metrics or engagement. */
export interface SocialItem {
  externalId: string;
  url: string | null;
  title: string | null;
  text: string | null;
  author: string | null;
  publishedAt: string | null;
  mediaKind: string | null;
  hashtags: string[];
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

export interface PlatformCapabilities {
  /** Human-readable list of what the official API can provide. */
  provides: string[];
  /** Human-readable list of what it cannot provide (shown instead of faking). */
  limitations: string[];
  /** OAuth scopes requested (read-only). */
  scopes: string[];
}

/**
 * Verified account identity from the provider's OIDC user-identity endpoint.
 * Only fields the endpoint actually returns are mapped; picture and email
 * are present only when the granted scopes and the member's profile provide
 * them. Identity proves *who* connected — never what they posted.
 */
export interface SocialAccountIdentity {
  /** Provider-side member identifier (LinkedIn `sub`). */
  id: string;
  /** Display name, when provided. */
  name: string | null;
  /** Profile photo URL, when provided. */
  picture: string | null;
  /** Email address, when provided. */
  email: string | null;
}

export interface SocialAdapter {
  readonly platform: SocialPlatform;
  readonly displayName: string;
  capabilities(): PlatformCapabilities;
  /** Throws NOT_CONFIGURED when credentials are absent. */
  authorizationUrl(credentials: OAuthCredentials, state: string): string;
  exchangeCode(credentials: OAuthCredentials, code: string): Promise<TokenPair>;
  refreshAccessToken(credentials: OAuthCredentials, refreshToken: string): Promise<TokenPair>;
  /** Returns recent own/channel posts. Throws classified ConnectorError. */
  fetchRecentItems(accessToken: string, limit: number): Promise<SocialItem[]>;
  /**
   * Optional identity verification: proves the access token authenticates and
   * returns the linked account's identity fields. Adapters whose connection
   * is identity-only (no post reading) implement this; post-reading adapters
   * derive identity from their normal pulls instead.
   */
  fetchAccountIdentity?(accessToken: string): Promise<SocialAccountIdentity>;
}

export interface AdapterRegistry {
  get(platform: SocialPlatform): SocialAdapter;
  all(): SocialAdapter[];
}

function requireCredentials(
  platform: SocialPlatform,
  credentials: Partial<OAuthCredentials> | null | undefined,
): asserts credentials is OAuthCredentials {
  if (!credentials?.clientId || !credentials?.clientSecret) {
    throw new ConnectorError(
      'NOT_CONFIGURED',
      `No developer credentials are configured for ${platform}. ` +
        `Add the ${platform.toUpperCase()}_CLIENT_ID and ${platform.toUpperCase()}_CLIENT_SECRET ` +
        `environment variables, then reconnect. Nothing was fetched.`,
    );
  }
}

export function assertConfigured(
  platform: SocialPlatform,
  credentials: Partial<OAuthCredentials> | null | undefined,
): asserts credentials is OAuthCredentials {
  requireCredentials(platform, credentials);
}

const FETCH_TIMEOUT_MS = 20000;

export async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new ConnectorError(
        'EXPIRED',
        `The platform rejected the stored token (HTTP ${response.status}). ` +
          `Reconnect to grant access again.`,
      );
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : undefined;
      throw new ConnectorError(
        'RATE_LIMITED',
        'The platform rate-limited this pull. Wait before refreshing again.',
        Number.isFinite(seconds) ? seconds : undefined,
      );
    }
    if (!response.ok) {
      throw new ConnectorError(
        'API_UNAVAILABLE',
        `The platform API responded with HTTP ${response.status}. Nothing was stored.`,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ConnectorError('INVALID_RESPONSE', 'The platform API returned an unreadable payload.');
    }
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    throw new ConnectorError(
      'API_UNAVAILABLE',
      `Could not reach the platform API (${err instanceof Error ? err.message : 'network error'}). Nothing was stored.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const tags = new Set<string>();
  for (const match of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    if (match[1]) tags.add(match[1].toLowerCase());
    if (tags.size >= 20) break;
  }
  return [...tags];
}
