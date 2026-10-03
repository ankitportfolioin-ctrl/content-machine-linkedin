/**
 * LinkedIn Connector - member-post research explicitly UNAVAILABLE.
 *
 * Product architecture (OIDC-minimal): the LinkedIn account connection links
 * the member's professional identity (OpenID Connect sign-in) only. Reading
 * member posts requires the restricted r_member_social permission, which is
 * not provisioned for this application — so this connector NEVER attempts
 * member-post retrieval and NEVER treats an OIDC identity token as a
 * research credential. It exists to report that unavailability
 * deterministically instead of fabricating data or failing opaquely.
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials } from '../researchConnectors';

// NOTE: no network helpers remain in this file. Member-post retrieval
// requires the restricted r_member_social permission, which is not
// provisioned for this application, so this connector makes no HTTP calls:
// an OIDC identity token is never treated as a research credential.

export class LinkedInConnector extends BaseResearchConnector {
  readonly sourceType = 'LINKEDIN';
  readonly displayName = 'LinkedIn';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Explicit unavailable state: reports that LinkedIn member-post research cannot run for this application',
    ],
    limitations: [
      'Reading member posts requires the restricted r_member_social permission, which is not provisioned for this application',
      'Never attempts member-post retrieval and never treats an OIDC identity token as a research credential',
      'No reactions, comments, impressions, or reach — engagement never read or stored',
      'No feed search or public trends — LinkedIn research is unavailable',
      'No publishing and no analytics — neither is implemented for LinkedIn',
    ],
    scopes: ['openid', 'profile', 'email'],
    requiresAuth: true,
    tier: 1,
  };

  getAuthorizationUrl(credentials: Record<string, string>, state: string): string {
    const clientId = credentials.clientId;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !redirectUri) {
      throw new Error('Missing clientId or redirectUri');
    }
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    }).toString()}`;
  }

  async exchangeCode(credentials: Record<string, string>, code: string) {
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing clientId or redirectUri');
    return this.tokenPost('https://www.linkedin.com/oauth/v2/accessToken', {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    });
  }

  async refreshAccessToken(
    _credentials: Record<string, string>,
    _refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('LinkedIn access tokens are short-lived and do not refresh silently; re-run Connect when expired.');
  }

  private async tokenPost(url: string, params: Record<string, string>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.access_token !== 'string' || !payload.access_token) {
      throw new Error('Token endpoint returned no access token.');
    }
    return {
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
      expiresAt: typeof payload.expires_in === 'number'
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null,
    };
  }

  async fetchRecentItems(
    credentials: Record<string, string>,
    _limit: number,
    _config: Record<string, unknown>
  ): Promise<any[]> {
    const accessToken = credentials.accessToken;
    if (!accessToken) throw new Error('No access token provided');
    // Deterministic unavailability: reading member posts requires the
    // restricted r_member_social permission, which is not provisioned for
    // this application. No endpoint is called — not even userinfo — because
    // an OIDC identity token must never be treated as a research credential.
    // (The presence check above only proves a token value was passed.)
    throw new Error('UNAVAILABLE: LinkedIn member-post research is not available to this application (restricted r_member_social is not provisioned). No data was fetched.');
  }

  async getHealth(credentials: Record<string, string>): Promise<any> {
    const lastAttemptedSync = new Date();

    if (!credentials.accessToken) {
      return {
        status: 'AUTH_REQUIRED',
        lastSuccessfulSync: null,
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: ['No access token provided'],
        rateLimitState: { remaining: 0, resetAt: null },
        configuration: { role: 'unavailable' },
      };
    }

    // Deterministic unavailability (no network): even a valid token cannot
    // run member-post research without the restricted r_member_social
    // permission, which is not provisioned for this application.
    return {
      status: 'SOURCE_UNAVAILABLE',
      lastSuccessfulSync: null,
      lastAttemptedSync,
      recordsDiscovered: 0,
      recordsProcessed: 0,
      errors: [
        'LinkedIn member-post research is not available to this application (restricted r_member_social is not provisioned)',
        'Research: UNAVAILABLE',
        'Publishing: UNAVAILABLE',
        'Analytics: UNAVAILABLE',
      ],
      rateLimitState: { remaining: 0, resetAt: null },
      configuration: { role: 'unavailable' },
    };
  }

}

export const linkedinConnector = new LinkedInConnector();