import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import { ApiRequestError } from '../services/api';

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
  getMyProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  listIcps: vi.fn(async () => ({ icps: [] })),
  getVoiceProfile: vi.fn(async () => ({ profile: null })),
  listReceipts: vi.fn(async () => ({ receipts: [] })),
  listSamples: vi.fn(async () => ({ samples: [] })),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getMyProfile: apiMocks.getMyProfile,
    createProfile: apiMocks.createProfile,
    updateProfile: apiMocks.updateProfile,
    listIcps: apiMocks.listIcps,
    getVoiceProfile: apiMocks.getVoiceProfile,
    listReceipts: apiMocks.listReceipts,
    listSamples: apiMocks.listSamples,
    createIcp: vi.fn(),
    updateIcp: vi.fn(),
    createReceipt: vi.fn(),
    deleteReceipt: vi.fn(),
    createSample: vi.fn(),
    deleteSample: vi.fn(),
    updateVoiceProfile: vi.fn(),
  };
});

function notFound(): ApiRequestError {
  return new ApiRequestError(404, 'NOT_FOUND', 'Profile not found');
}

describe('SettingsPage profile section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listIcps.mockResolvedValue({ icps: [] });
  });

  it('offers profile creation when none exists (empty state, no fake data)', async () => {
    apiMocks.getMyProfile.mockRejectedValueOnce(notFound());
    render(<SettingsPage />);
    expect(await screen.findByText(/no profile in this workspace yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create profile' })).toBeInTheDocument();
    expect(screen.queryByText(/no profile found yet/i)).not.toBeInTheDocument();
  });

  it('creates the profile through the real API path and shows it', async () => {
    apiMocks.getMyProfile.mockRejectedValueOnce(notFound());
    apiMocks.createProfile.mockResolvedValueOnce({
      profile: { id: 'p-1', headline: 'Founder at Acme', role: 'Founder' },
    });
    render(<SettingsPage />);
    await screen.findByRole('button', { name: 'Create profile' });
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Founder at Acme' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Founder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    await waitFor(() => expect(apiMocks.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({ headline: 'Founder at Acme', role: 'Founder' }),
    ));
    expect(await screen.findByText('Profile created.')).toBeInTheDocument();
  });

  it('loads and edits an existing profile with real columns', async () => {
    apiMocks.getMyProfile.mockResolvedValueOnce({
      profile: { id: 'p-1', headline: 'Founder at Acme', role: 'Founder', industry: 'SaaS' },
    });
    apiMocks.updateProfile.mockResolvedValueOnce({
      profile: { id: 'p-1', headline: 'CEO at Acme', role: 'Founder', industry: 'SaaS' },
    });
    render(<SettingsPage />);
    await screen.findByRole('button', { name: 'Save profile' });
    expect(screen.getByLabelText('Headline')).toHaveValue('Founder at Acme');
    expect(screen.getByLabelText('Industry')).toHaveValue('SaaS');
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'CEO at Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(apiMocks.updateProfile).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({ headline: 'CEO at Acme' }),
    ));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
  });
});
