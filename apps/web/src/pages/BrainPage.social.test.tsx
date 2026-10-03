import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrainPage } from './BrainPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 'test-token',
    workspaceId: 'ws-1',
    workspaces: [{ id: 'ws-1', name: 'WS' }],
    loading: false,
    error: null,
    isAuthenticated: true,
    login: async () => undefined,
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => undefined,
  }),
}));

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    getIntelligenceOverview: vi.fn(),
    listSources: vi.fn(),
    createSource: vi.fn(),
    listSocialConnections: vi.fn(),
    listSocialPosts: vi.fn(),
    listConnectors: vi.fn(),
    updateConnectorConfig: vi.fn(),
    verifyConnector: vi.fn(),
    connectSocial: vi.fn(),
    refreshSocial: vi.fn(),
    pauseSocial: vi.fn(),
    resumeSocial: vi.fn(),
    disconnectSocial: vi.fn(),
    saveSocialIdea: vi.fn(),
    listFeeds: vi.fn(),
    createFeed: vi.fn(),
    updateFeed: vi.fn(),
    deleteFeed: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getIntelligenceOverview: apiMocks.getIntelligenceOverview,
    listSources: apiMocks.listSources,
    createSource: apiMocks.createSource,
    listSocialConnections: apiMocks.listSocialConnections,
    listSocialPosts: apiMocks.listSocialPosts,
    listConnectors: apiMocks.listConnectors,
    updateConnectorConfig: apiMocks.updateConnectorConfig,
    verifyConnector: apiMocks.verifyConnector,
    connectSocial: apiMocks.connectSocial,
    refreshSocial: apiMocks.refreshSocial,
    pauseSocial: apiMocks.pauseSocial,
    resumeSocial: apiMocks.resumeSocial,
    disconnectSocial: apiMocks.disconnectSocial,
    saveSocialIdea: apiMocks.saveSocialIdea,
    listFeeds: apiMocks.listFeeds,
    createFeed: apiMocks.createFeed,
    updateFeed: apiMocks.updateFeed,
    deleteFeed: apiMocks.deleteFeed,
  };
});

const DISPLAY_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
};

function connection(platform: string, overrides: Record<string, unknown> = {}) {
  const upper = platform.toUpperCase();
  return {
    platform,
    displayName: DISPLAY_NAMES[platform] ?? platform,
    configured: true,
    connected: false,
    status: 'NOT_CONNECTED',
    accountLabel: null,
    active: true,
    lastPulledAt: null,
    lastError: null,
    postCount: 0,
    provides: ['Own posts: text and time'],
    limitations: ['No engagement data'],
    scopes: ['read'],
    capabilities: {
      research: false,
      publishing: false,
      analytics: false,
      comments: false,
      audience: false,
      verification: 'NOT_VERIFIED',
      lastVerifiedAt: null,
    },
    account: {
      supported: true,
      status: 'NOT_CONNECTED',
      connectable: true,
      reasonCode: 'NOT_CONNECTED',
    },
    server: {
      configured: true,
      redirectUri: `https://api.example.test/api/v1/social/callback/${platform}`,
      redirectUriSource: 'API_URL',
      requiredEnvVars: [`${upper}_CLIENT_ID`, `${upper}_CLIENT_SECRET`],
      docsUrl: 'https://example.com/docs',
      docsLabel: 'Example provider docs',
    },
    research: {
      supported: true,
      wired: false,
      status: 'NOT_AVAILABLE',
      note: 'Account connection does not enable research.',
    },
    publishing: {
      supported: false,
      wired: false,
      status: 'NOT_AVAILABLE',
      note: 'Publishing is not implemented for any platform.',
    },
    ...overrides,
  };
}

function notConfiguredConnection(platform: string) {
  return connection(platform, {
    configured: false,
    status: 'NOT_CONFIGURED',
    account: {
      supported: true,
      status: 'NOT_AVAILABLE',
      connectable: false,
      reasonCode: 'SERVER_CONFIGURATION_REQUIRED',
    },
  });
}

function catalogueEntry(sourceType: string, group: string, overrides: Record<string, unknown> = {}) {
  return {
    sourceType,
    displayName: sourceType,
    group,
    description: `${sourceType} description`,
    authKind: 'NONE',
    sourceOfTruth: 'packages/somewhere/connector.ts',
    workerEligible: group === 'RESEARCH',
    notWiredReason: group === 'RESEARCH' ? null : 'Not wired in this version',
    accountConnectable: false,
    requiresAccountNote: null,
    userAction: 'Enable it',
    enabled: false,
    enabledState: 'DISABLED',
    configState: 'NOT_CONFIGURED',
    config: {},
    accountState: 'NOT_CONNECTED',
    serverCredsPresent: true,
    workerWillRun: false,
    probe: { status: 'NEVER_PROBED', checkedAt: null, error: null },
    ...overrides,
  };
}

function feed(id: string, type: string, url: string, active = true) {
  return {
    id,
    url,
    type,
    name: null,
    active,
    lastFetchedAt: null,
    lastError: null,
  };
}

const ALL_PLATFORMS = ['linkedin', 'youtube', 'instagram', 'facebook', 'x'];

function mockBaseline() {
  apiMocks.getIntelligenceOverview.mockResolvedValue({});
  apiMocks.listSources.mockResolvedValue({ sources: [] });
  apiMocks.createSource.mockResolvedValue({ id: 's-1', url: 'https://example.com/a' });
  apiMocks.listSocialPosts.mockResolvedValue({ posts: [] });
  apiMocks.listFeeds.mockResolvedValue({ feeds: [] });
  apiMocks.createFeed.mockResolvedValue({ feed: feed('f-new', 'RSS', 'https://example.com/feed') });
  apiMocks.updateFeed.mockImplementation(async (_id: string, input: Record<string, unknown>) => ({
    feed: { ...feed('f-1', 'RSS', 'https://example.com/feed'), ...input },
  }));
  apiMocks.deleteFeed.mockResolvedValue(undefined);
  apiMocks.saveSocialIdea.mockResolvedValue({ contentIdea: { id: 'idea-1', title: 'Idea' } });
  apiMocks.refreshSocial.mockResolvedValue({ platform: 'linkedin', fetched: 0, stored: 0 });
}

async function openSourcesTab() {
  render(
    <MemoryRouter initialEntries={['/brain']}>
      <BrainPage />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByText('Sources'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBaseline();
});

describe('BrainPage Sources & Connections (redesigned UX)', () => {
  it('shows the Connections & Sources control center with both sections separated', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: ALL_PLATFORMS.map((p) => connection(p)),
    });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    await openSourcesTab();

    expect(await screen.findByText('Sources & Connections')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Connect your accounts and choose the information sources Growth Operator can use for research, content and authorized actions.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Connect your platforms')).toBeInTheDocument();
    expect(await screen.findByText('Research sources')).toBeInTheDocument();
    expect(await screen.findByText('Feeds & websites')).toBeInTheDocument();
    // Quora is never an account-connection card.
    expect(screen.queryByText('Quora')).not.toBeInTheDocument();
  });

  it('disconnected platforms show a Connect button that calls the real OAuth endpoint', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: ALL_PLATFORMS.map((p) => connection(p)),
    });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    apiMocks.connectSocial.mockResolvedValue({
      authorizationUrl: 'https://provider.example/auth',
      state: 'state-123',
    });
    await openSourcesTab();

    const connectButton = await screen.findByRole('button', { name: 'Connect LinkedIn' });
    expect(connectButton).toBeEnabled();
    expect(await screen.findByRole('button', { name: 'Connect YouTube' })).toBeEnabled();
    fireEvent.click(connectButton);
    expect(apiMocks.connectSocial).toHaveBeenCalledWith('linkedin');
    // No fake connected state appears while disconnected.
    expect(screen.queryByText(/✓ .* Connected/)).not.toBeInTheDocument();
  });

  it('connected platforms show Connected state with capability truth and Manage connection', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: [
        connection('linkedin', {
          connected: true,
          status: 'CONNECTED',
          accountLabel: 'Jane Doe',
          postCount: 3,
          research: {
            supported: false,
            wired: false,
            status: 'NOT_AVAILABLE',
            note: 'Reading member posts requires LinkedIn access that is not available to this application.',
          },
        }),
      ],
    });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    await openSourcesTab();

    expect(await screen.findByText('✓ LinkedIn Connected')).toBeInTheDocument();
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    // Capability rows come from the backend capability model: a connected
    // account does not imply research / publishing / analytics.
    const unavailable = await screen.findAllByText('Not available');
    expect(unavailable.length).toBeGreaterThanOrEqual(3);
    // The research row explains the provider restriction (not "temporary").
    expect(
      await screen.findByText(/Reading member posts requires LinkedIn access/),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Manage connection' }));
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Show pulled items (3)' })).toBeInTheDocument();
  });

  it('configuration-required platforms show Configure with administrator setup requirements', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: ALL_PLATFORMS.map(notConfiguredConnection),
    });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    await openSourcesTab();

    expect((await screen.findAllByText('Setup required')).length).toBeGreaterThanOrEqual(5);
    const configureButtons = await screen.findAllByRole('button', { name: /Configure / });
    expect(configureButtons).toHaveLength(5);
    for (const button of configureButtons) {
      expect(button).toBeEnabled();
    }
    // No dead disabled Connect buttons.
    expect(screen.queryByRole('button', { name: /Connect LinkedIn/ })).not.toBeInTheDocument();

    const first = configureButtons[0] as HTMLElement;
    fireEvent.click(first);
    expect(await screen.findByText('Setup requirements')).toBeInTheDocument();
    expect(await screen.findByText('LINKEDIN_CLIENT_ID')).toBeInTheDocument();
    expect(
      await screen.findByText('https://api.example.test/api/v1/social/callback/linkedin'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Official setup instructions')).toBeInTheDocument();
  });

  it('errored platforms show attention state with Reconnect and the honest backend error', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: [
        connection('youtube', {
          connected: true,
          status: 'ERROR',
          lastError: 'The provider refused the token (401).',
        }),
      ],
    });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    await openSourcesTab();

    expect(await screen.findByText('Connection needs attention')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
    expect(await screen.findByText('The provider refused the token (401).')).toBeInTheDocument();
  });

  it('TikTok renders as Coming soon, never as connectable or connected', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: ALL_PLATFORMS.map((p) => connection(p)),
    });
    apiMocks.listConnectors.mockResolvedValue({
      connectors: [catalogueEntry('TIKTOK', 'CONNECTED_PLATFORM')],
    });
    await openSourcesTab();

    const card = (await screen.findByText('TikTok')).closest('li');
    expect(card).not.toBeNull();
    expect(await screen.findByText('Coming soon')).toBeInTheDocument();
    expect(
      await screen.findByText('Coming later. Connection is not available in this version.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Connect TikTok/ })).not.toBeInTheDocument();
  });

  it('research sources enable and test through the real connector endpoints', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({
      connectors: [
        catalogueEntry('REDDIT', 'RESEARCH'),
        catalogueEntry('GOOGLE_TRENDS', 'RESEARCH'),
        catalogueEntry('QUORA', 'UNAVAILABLE'),
      ],
    });
    apiMocks.updateConnectorConfig.mockResolvedValue({
      connector: { sourceType: 'REDDIT', enabled: true, config: {}, probe: { status: 'NEVER_PROBED' } },
    });
    apiMocks.verifyConnector.mockResolvedValue({
      probe: { status: 'VERIFIED', scope: 'probe-only' },
      note: 'Reddit probe request succeeded just now.',
    });
    await openSourcesTab();

    const enableButtons = await screen.findAllByText('Enable source');
    expect(enableButtons.length).toBe(2);
    for (const button of enableButtons) {
      expect(button).toBeEnabled();
    }
    fireEvent.click(enableButtons[0] as HTMLElement);
    await waitFor(() =>
      expect(apiMocks.updateConnectorConfig).toHaveBeenCalledWith('REDDIT', {
        enabled: true,
        config: {},
      }),
    );

    const testButtons = await screen.findAllByText('Test source');
    expect(testButtons.length).toBe(2);
    fireEvent.click(testButtons[0] as HTMLElement);
    await waitFor(() => expect(apiMocks.verifyConnector).toHaveBeenCalledWith('REDDIT'));

    // Quora stays honestly unavailable with no action buttons.
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
  });

  it('backend probe failures render honestly without inventing success', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({
      connectors: [catalogueEntry('REDDIT', 'RESEARCH')],
    });
    apiMocks.verifyConnector.mockRejectedValue(new Error('Reddit probe failed: network down'));
    await openSourcesTab();

    fireEvent.click(await screen.findByText('Test source'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reddit probe failed: network down');
  });

  it('keeps internal connector paths behind Technical status expanders only', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({
      connectors: [
        catalogueEntry('REDDIT', 'RESEARCH'),
        catalogueEntry('QUORA', 'UNAVAILABLE'),
      ],
    });
    const { container } = await (async () => {
      render(
        <MemoryRouter initialEntries={['/brain']}>
          <BrainPage />
        </MemoryRouter>,
      );
      fireEvent.click(await screen.findByText('Sources'));
      return { container: document.body };
    })();
    await screen.findByText('Enable source');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const leaks: string[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue?.includes('packages/somewhere/connector.ts')) {
        if ((node.parentElement?.closest('details') ?? null) === null) {
          leaks.push(node.nodeValue);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it('feeds distinguish built-in from custom sources and add through the feeds endpoint', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    apiMocks.listFeeds.mockResolvedValue({
      feeds: [
        feed('f-hn', 'HACKERNEWS', 'https://news.ycombinator.com', true),
        feed('f-rss', 'RSS', 'https://example.com/feed.xml', true),
      ],
    });
    await openSourcesTab();

    expect(await screen.findByText('Built-in sources')).toBeInTheDocument();
    expect(await screen.findByText('Your sources')).toBeInTheDocument();
    expect(await screen.findByText('https://example.com/feed.xml')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Paste a public article, blog, RSS feed or website URL'), {
      target: { value: 'https://example.com/new.xml' },
    });
    fireEvent.click(await screen.findByText('Add source'));
    expect(apiMocks.createFeed).toHaveBeenCalledWith({
      url: 'https://example.com/new.xml',
      type: 'rss',
    });
  });

  it('shows an honest custom-sources empty state instead of claiming no sources exist', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    apiMocks.listFeeds.mockResolvedValue({
      feeds: [feed('f-gh', 'GITHUB_RELEASES', 'https://github.com/example/releases', true)],
    });
    await openSourcesTab();

    // System rows exist, so no blanket "No sources yet" may appear.
    expect(await screen.findByText('Built-in sources')).toBeInTheDocument();
    expect(await screen.findByText('No custom sources yet.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add your first source' })).toBeEnabled();
    expect(screen.queryByText('No sources yet')).not.toBeInTheDocument();
  });

  it('saved articles render from the backend and save through the existing endpoint', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    apiMocks.listSources.mockResolvedValue({
      sources: [{ id: 's-1', title: 'Saved piece', url: 'https://example.com/piece', status: 'READY' }],
    });
    await openSourcesTab();

    expect(await screen.findByText('Single articles & links')).toBeInTheDocument();
    expect(await screen.findByText('Saved piece')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Paste a single article or page URL to save it'), {
      target: { value: 'https://example.com/other' },
    });
    fireEvent.click(await screen.findByText('Save article'));
    expect(apiMocks.createSource).toHaveBeenCalledWith('https://example.com/other');
  });
});
