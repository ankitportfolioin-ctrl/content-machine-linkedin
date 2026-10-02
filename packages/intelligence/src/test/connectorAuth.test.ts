import { describe, it, expect } from 'vitest';
import { linkedinConnector } from '../connectors/linkedinConnector';
import { xConnector } from '../connectors/xConnector';
import { instagramConnector } from '../connectors/instagramConnector';
import { tiktokConnector } from '../connectors/tiktokConnector';
import { youtubeConnector } from '../connectors/youtubeConnector';
import type { BaseResearchConnector } from '../researchConnectors';

// Regression coverage for the duplicate-method repair in the OAuth
// connectors: every assertion below runs fully offline (validation happens
// before any network call), and pins the honest unauthenticated states.
const oauthConnectors: Array<{ name: string; connector: BaseResearchConnector }> = [
  { name: 'LinkedIn', connector: linkedinConnector },
  { name: 'X', connector: xConnector },
  { name: 'Instagram', connector: instagramConnector },
  { name: 'TikTok', connector: tiktokConnector },
  { name: 'YouTube', connector: youtubeConnector },
];

const NEVER_WITHOUT_CREDENTIALS = ['CONNECTED', 'WORKING', 'AUTHORIZED', 'PUBLISHABLE'];

describe('OAuth connector unauthenticated boundaries', () => {
  for (const { name, connector } of oauthConnectors) {
    it(`${name}: getAuthorizationUrl rejects missing credentials without network`, () => {
      expect(() => connector.getAuthorizationUrl({}, 'state')).toThrow(/Missing clientId/);
    });

    it(`${name}: getHealth without a token is honest and never connected`, async () => {
      const health = await connector.getHealth({});
      expect(health.status).toBe('AUTH_REQUIRED');
      expect(health.errors.length).toBeGreaterThan(0);
      expect(NEVER_WITHOUT_CREDENTIALS).not.toContain(health.status);
    });

    it(`${name}: fetchRecentItems without a token fails before network`, async () => {
      await expect(connector.fetchRecentItems({}, 5, {})).rejects.toThrow(/access token/i);
    });

    it(`${name}: exchangeCode with missing credentials fails before network`, async () => {
      await expect(connector.exchangeCode({}, 'code')).rejects.toThrow(/Missing/);
    });
  }

  it('LinkedIn: tokens never refresh silently (re-run Connect instead)', async () => {
    await expect(linkedinConnector.refreshAccessToken({}, 'refresh')).rejects.toThrow(
      /short-lived|re-run Connect/i
    );
  });
});
