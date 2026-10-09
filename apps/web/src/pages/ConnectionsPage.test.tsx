import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConnectionsPage } from './ConnectionsPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: 't',
    workspaceId: 'ws-1',
    workspaces: [],
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
  apiMocks: { listSocialConnections: vi.fn(), listConnectors: vi.fn(), listFeeds: vi.fn(), connectSocial: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    listSocialConnections: apiMocks.listSocialConnections,
    listConnectors: apiMocks.listConnectors,
    listFeeds: apiMocks.listFeeds,
    connectSocial: apiMocks.connectSocial,
  };
});

function platformEntry(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'LINKEDIN',
    displayName: 'LinkedIn',
    group: 'CONNECTED_PLATFORM',
    description: 'd',
    authKind: 'OAUTH',
    sourceOfTruth: 's',
    workerEligible: false,
    notWiredReason: null,
    accountConnectable: true,
    requiresAccountNote: null,
    userAction: 'u',
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

describe('ConnectionsPage', () => {
  it('shows connected accounts, connector states, and feeds honestly', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({
      connections: [
        {
          platform: 'linkedin',
          displayName: 'LinkedIn',
          configured: true,
          connected: true,
          status: 'CONNECTED',
          accountLabel: 'Ada Operator',
          active: true,
          lastPulledAt: new Date(Date.now() - 18 * 60000).toISOString(),
          lastError: null,
          postCount: 12,
          provides: [],
          limitations: [],
          scopes: [],
          capabilities: {},
        },
      ],
    });
    apiMocks.listConnectors.mockResolvedValue({
      connectors: [
        {
          sourceType: 'REDDIT',
          displayName: 'Reddit',
          group: 'RESEARCH',
          description: 'd',
          authKind: 'NONE',
          sourceOfTruth: 's',
          workerEligible: true,
          notWiredReason: null,
          accountConnectable: false,
          requiresAccountNote: null,
          userAction: 'u',
          enabled: false,
          enabledState: 'DISABLED',
          configState: 'NOT_CONFIGURED',
          config: {},
          accountState: 'NOT_CONNECTED',
          serverCredsPresent: true,
          workerWillRun: false,
          probe: { status: 'NEVER_PROBED', checkedAt: null, error: null },
        },
      ],
    });
    apiMocks.listFeeds.mockResolvedValue({ feeds: [] });

    render(
      <MemoryRouter initialEntries={['/connections']}>
        <Routes>
          <Route path="/connections" element={<ConnectionsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByText('Ada Operator')).toBeInTheDocument();
    expect(screen.getByText('Reddit')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows a Connect button for connectable platforms that calls the real OAuth endpoint', async () => {
    const { fireEvent } = await import('@testing-library/react');
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({ connectors: [platformEntry()] });
    apiMocks.listFeeds.mockResolvedValue({ feeds: [] });
    apiMocks.connectSocial.mockResolvedValue({ authorizationUrl: 'https://provider.example/auth', state: 's' });

    render(
      <MemoryRouter initialEntries={['/connections']}>
        <Routes>
          <Route path="/connections" element={<ConnectionsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const connectButton = await screen.findByRole('button', { name: 'Connect LinkedIn' });
    expect(connectButton).toBeEnabled();
    fireEvent.click(connectButton);
    expect(apiMocks.connectSocial).toHaveBeenCalledWith('linkedin');
  });

  it('shows honest unavailable text instead of a dead button for non-connectable platforms', async () => {
    apiMocks.listSocialConnections.mockResolvedValue({ connections: [] });
    apiMocks.listConnectors.mockResolvedValue({
      connectors: [
        platformEntry({
          sourceType: 'TIKTOK',
          displayName: 'TikTok',
          accountConnectable: false,
          notWiredReason: 'TikTok is not yet connectable in this version.',
        }),
      ],
    });
    apiMocks.listFeeds.mockResolvedValue({ feeds: [] });

    render(
      <MemoryRouter initialEntries={['/connections']}>
        <Routes>
          <Route path="/connections" element={<ConnectionsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('TikTok is not yet connectable in this version.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Connect TikTok/ })).not.toBeInTheDocument();
  });
});
