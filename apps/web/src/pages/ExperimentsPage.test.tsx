import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExperimentsPage } from './ExperimentsPage';

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
  apiMocks: { listExperiments: vi.fn(), createExperiment: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, listExperiments: apiMocks.listExperiments, createExperiment: apiMocks.createExperiment };
});

describe('ExperimentsPage', () => {
  it('records a new experiment with hypothesis and variable', async () => {
    apiMocks.listExperiments.mockResolvedValue({ experiments: [] });
    apiMocks.createExperiment.mockResolvedValue({ experiment: { id: 'x-1' } });
    render(
      <MemoryRouter initialEntries={['/experiments']}>
        <Routes>
          <Route path="/experiments" element={<ExperimentsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No experiments yet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hypothesis'), { target: { value: 'Shorter hooks earn more saves' } });
    fireEvent.change(screen.getByLabelText('Variable'), { target: { value: 'hook length' } });
    fireEvent.click(screen.getByText('Record experiment'));
    expect(apiMocks.createExperiment).toHaveBeenCalledWith({
      hypothesis: 'Shorter hooks earn more saves',
      variable: 'hook length',
      controlDescription: 'Current approach',
      variantDescription: 'hook length',
    });
  });
});
