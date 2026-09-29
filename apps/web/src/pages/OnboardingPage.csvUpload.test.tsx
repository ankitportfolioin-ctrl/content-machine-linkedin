import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingPage } from './OnboardingPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>
  );
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'a@example.com', name: 'Ada' },
    token: 't',
    workspaceId: 'ws-1',
    workspaces: [],
    loading: false,
    error: null,
    isAuthenticated: true,
    login: async () => undefined,
    register: async () => undefined,
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => undefined,
  }),
}));

const apiMocks = vi.hoisted(() => ({
  importLeads: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  const emptyProgress = {
    onboarding: {
      steps: {},
      currentStep: 'leads',
      complete: false,
      counts: { writingSamples: 0, icps: 0, audienceSegments: 0, activeFeedSources: 0, completedLeadBatches: 0, leads: 0 },
    },
    settings: null,
    policy: null,
  };
  return {
    ...actual,
    importLeads: apiMocks.importLeads,
    getOnboarding: vi.fn(async () => emptyProgress),
    refreshOnboarding: vi.fn(async () => emptyProgress),
    listFeeds: vi.fn(async () => ({ feeds: [] })),
    createFeed: vi.fn(),
    updateFeed: vi.fn(),
    deleteFeed: vi.fn(),
    getBusinessProfile: vi.fn(async () => ({ business: null, brand: null, strategy: null })),
    updateBusiness: vi.fn(),
    updateStrategy: vi.fn(),
    updateVoiceProfile: vi.fn(),
    updatePolicy: vi.fn(),
    updateSchedule: vi.fn(),
    updateKillSwitch: vi.fn(),
  };
});

describe('OnboardingPage CSV file upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a chosen file locally and imports its text with skip reasons', async () => {
    apiMocks.importLeads.mockResolvedValue({
      imported: 2,
      deduped: false,
      skipped: [{ rowNumber: 4, reason: 'missing linkedinUrl' }],
      batch: { status: 'COMPLETED_WITH_SKIPS' },
    });
    renderPage();
    const picker = await screen.findByLabelText('Choose a CSV file');
    const csv = 'name,linkedinUrl,headline,company\nJane,https://linkedin.com/in/jane,CTO,Acme\nBob,https://linkedin.com/in/bob,CEO,Acme';
    fireEvent.change(picker, { target: { files: [new File([csv], 'leads.csv', { type: 'text/csv' })] } });

    await waitFor(() => expect(screen.getByText(/leads\.csv/)).toBeInTheDocument());
    expect(screen.getByText(/header looks valid/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import leads' }));
    await waitFor(() => expect(apiMocks.importLeads).toHaveBeenCalledWith(csv, 'leads.csv'));
    expect(await screen.findByText(/Imported 2/)).toBeInTheDocument();
    expect(screen.getByText(/Row 4: missing linkedinUrl/)).toBeInTheDocument();
  });

  it('warns on a header without a name column', async () => {
    renderPage();
    const picker = await screen.findByLabelText('Choose a CSV file');
    fireEvent.change(picker, { target: { files: [new File(['email,url\na@b.c,x'], 'bad.csv', { type: 'text/csv' })] } });
    await waitFor(() => expect(screen.getByText(/header row should include name/)).toBeInTheDocument());
  });

  it('rejects oversized files before any import call', async () => {
    renderPage();
    const picker = await screen.findByLabelText('Choose a CSV file');
    const big = `${'x'.repeat(600000)}`;
    fireEvent.change(picker, { target: { files: [new File([big], 'big.csv', { type: 'text/csv' })] } });
    await waitFor(() => expect(screen.getByText(/larger than 500 KB/)).toBeInTheDocument());
    expect(apiMocks.importLeads).not.toHaveBeenCalled();
  });
});
