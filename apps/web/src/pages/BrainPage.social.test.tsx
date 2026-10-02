import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    listSocialConnections: vi.fn(),
    listSocialPosts: vi.fn(),
    listConnectors: vi.fn(),
    updateConnectorConfig: vi.fn(),
    verifyConnector: vi.fn(),
  },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getIntelligenceOverview: apiMocks.getIntelligenceOverview,
    listSources: apiMocks.listSources,
    listSocialConnections: apiMocks.listSocialConnections,
    listSocialPosts: apiMocks.listSocialPosts,
    listConnectors: apiMocks.listConnectors,
    updateConnectorConfig: apiMocks.updateConnectorConfig,
    verifyConnector: apiMocks.verifyConnector,
    connectSocial: vi.fn(),
    refreshSocial: vi.fn(),
    pauseSocial: vi.fn(),
    resumeSocial: vi.fn(),
    disconnectSocial: vi.fn(),
    saveSocialIdea: vi.fn(),
  };
});

function connection(platform: string) {
  return {
    platform,
    displayName: platform,
    configured: false,
    connected: false,
    status: 'NOT_CONFIGURED',
    accountLabel: null,
    active: true,
    lastPulledAt: null,
    lastError: null,
    postCount: 0,
    provides: ['Own posts: text and time'],
    limitations: ['No engagement data'],
    scopes: ['read'],
  };
}

function catalogueEntry(sourceType: string, group: string) {
  return {
    sourceType,
    displayName: sourceType,
    group,
    description: `${sourceType} description`,
    authKind: 'NONE',
    sourceOfTruth: 'packages/somewhere/connector.ts',
    workerEligible: group === 'RESEARCH',
    notWiredReason: group === 'RESEARCH' ? null : 'Not wired',
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
  };
}

describe('BrainPage connectors section (honest zero-connector state)', () => {
  it('shows every platform as Not configured without nagging or dead-ends', async () => {
    apiMocks.getIntelligenceOverview.mockResolvedValue({ overview: {} });
    apiMocks.listSources.mockResolvedValue({ sources: [] });
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: ['instagram', 'facebook', 'linkedin', 'youtube', 'x'].map(connection),
    });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [] });
    render(
      <MemoryRouter initialEntries={['/brain']}>
        <BrainPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('Sources'));
    expect(await screen.findByText('Connected platforms (optional)')).toBeInTheDocument();
    expect((await screen.findAllByText('Not configured')).length).toBeGreaterThanOrEqual(5);
    // No dead disabled Connect buttons: setup guidance replaces them.
    expect(screen.queryByTitle('Server has no developer credentials for this platform')).not.toBeInTheDocument();
    expect(await screen.findAllByText('View setup requirements')).toHaveLength(5);
    // Existing feed-source UI still present alongside connectors
    expect(screen.getByText('Add a source')).toBeInTheDocument();
    expect(apiMocks.listSources).toHaveBeenCalled();
  });

  it('renders the research catalogue without internal paths in the primary view', async () => {
    apiMocks.getIntelligenceOverview.mockResolvedValue({ overview: {} });
    apiMocks.listSources.mockResolvedValue({ sources: [] });
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({
      connectors: [
        catalogueEntry('REDDIT', 'RESEARCH'),
        catalogueEntry('LINKEDIN', 'CONNECTED_PLATFORM'),
        catalogueEntry('QUORA', 'UNAVAILABLE'),
      ],
    });
    const { container } = render(
      <MemoryRouter initialEntries={['/brain']}>
        <BrainPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('Sources'));
    expect(await screen.findByText('Research catalogue')).toBeInTheDocument();
    expect(await screen.findByText('Enable')).toBeInTheDocument();
    // Internal file paths stay behind collapsed developer toggles only:
    // every text node containing one must sit inside a <details> element.
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
});
