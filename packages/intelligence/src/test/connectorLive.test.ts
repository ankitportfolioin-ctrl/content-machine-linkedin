import { describe, it, expect } from 'vitest';
import { ConnectorRegistry, primeConnectorRegistry, normalizeSignal } from '../researchConnectors';
import { redditConnector } from '../connectors/redditConnector';
import { googleTrendsConnector } from '../connectors/googleTrendsConnector';

// Layer B (Gate 1 §5/§6): OPTIONAL live integration. Skipped in CI and in
// every default run. Enable explicitly with LIVE_CONNECTOR_TESTS=1 from an
// environment with public internet access. When enabled, failures are REAL
// provider evidence (failLOUD with the exact status), never skipped quietly.
const LIVE = process.env.LIVE_CONNECTOR_TESTS === '1';

describe.skipIf(!LIVE)('Live connector probes (explicit opt-in only)', () => {
  it('Reddit public JSON returns parseable posts', async () => {
    const registry = new ConnectorRegistry();
    registry.register(redditConnector);
    primeConnectorRegistry(registry, {});

    const { signals, errors } = await registry.fetchFromAllSources('live-probe', 3, {
      REDDIT: { enabled: true, config: { subreddits: ['programming'], timeFilter: 'day', sortBy: 'hot' } },
    });

    // Honest assertion: a live run must produce signals. If Reddit blocks
    // this network (403/429), the test fails WITH the provider's exact
    // reason — record it in the audit instead of weakening this assertion.
    expect(errors).toEqual([]);
    expect(signals.length).toBeGreaterThan(0);
    const normalized = normalizeSignal({ workspaceId: 'live-probe', signal: signals[0] });
    expect(normalized.dedupeHash).toBeTruthy();
    expect(normalized.raw.url).toContain('reddit.com');
  });

  it('Google Trends CSV endpoints return rows (unofficial API, best-effort)', async () => {
    const registry = new ConnectorRegistry();
    registry.register(googleTrendsConnector);
    primeConnectorRegistry(registry, {});

    const { signals, errors } = await registry.fetchFromAllSources('live-probe', 5, {
      GOOGLE_TRENDS: { enabled: true, config: { topics: ['AI'], geo: 'US', timeRange: 'now 7-d', category: 0 } },
    });

    // Same honesty contract as Reddit above. This endpoint is UNOFFICIAL:
    // a failure here means "endpoint refused this network", not a code bug.
    expect(errors).toEqual([]);
    expect(signals.length).toBeGreaterThan(0);
  });
});
