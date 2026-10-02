/**
 * Quora Connector - Tier 2 Optional Source (UNAVAILABLE)
 * 
 * Primary role: Question/answer research, topic discovery, audience pain points
 * 
 * IMPORTANT: Quora does NOT provide an official public API for content retrieval.
 * The Quora API that existed was deprecated. There is no authorized way to
 * programmatically fetch Quora content at scale.
 * 
 * This connector exists to:
 * 1. Maintain the connector interface for future official API availability
 * 2. Clearly report UNAVAILABLE status with honest reasoning
 * 3. Allow the Content Brain to handle "Quora: unavailable" gracefully
 * 4. Prevent fabrication of Quora data
 * 
 * If/when Quora releases an official API, this connector can be implemented.
 * Until then: ALL capabilities report UNAVAILABLE.
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities } from '../researchConnectors';

export class QuoraConnector extends BaseResearchConnector {
  readonly sourceType = 'QUORA';
  readonly displayName = 'Quora';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'NOTHING - No authorized integration exists',
    ],
    limitations: [
      'Quora does not provide an official public API for content retrieval',
      'The previous Quora API was deprecated and is no longer available',
      'No OAuth, no API keys, no authorized access mechanism exists',
      'Scraping Quora violates their Terms of Service and robots.txt',
      'All research, publishing, analytics, comments, audience capabilities: UNAVAILABLE',
    ],
    scopes: [],
    requiresAuth: false,
    tier: 2,
  };

  getAuthorizationUrl(): string {
    return '';
  }

  async exchangeCode(): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('Quora connector does not support OAuth - no authorized API exists');
  }

  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('Quora connector does not support token refresh - no authorized API exists');
  }

  async fetchRecentItems(
    _credentials: Record<string, string>,
    _limit: number,
    _config: Record<string, unknown>
  ): Promise<any[]> {
    // Honestly report unavailability - never fabricate data
    throw new Error('UNAVAILABLE: Quora does not provide an authorized API for content retrieval. No data was fetched.');
  }

  async getHealth(): Promise<any> {
    return {
      status: 'UNAVAILABLE',
      lastSuccessfulSync: null,
      lastAttemptedSync: new Date(),
      recordsDiscovered: 0,
      recordsProcessed: 0,
      errors: [
        'Quora does not provide an official public API',
        'Previous Quora API was deprecated',
        'No authorized integration configured',
        'Research: UNAVAILABLE',
        'Publishing: UNAVAILABLE',
        'Analytics: UNAVAILABLE',
        'Comments: UNAVAILABLE',
        'Audience: UNAVAILABLE',
      ],
      rateLimitState: { remaining: 0, resetAt: null },
      configuration: { 
        reason: 'No authorized production integration configured',
        research: 'UNAVAILABLE',
        publishing: 'UNAVAILABLE',
        analytics: 'UNAVAILABLE',
        comments: 'UNAVAILABLE',
        audience: 'UNAVAILABLE',
      },
    };
  }
}

export const quoraConnector = new QuoraConnector();