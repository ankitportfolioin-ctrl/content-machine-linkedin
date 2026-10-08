import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AudiencePage } from './AudiencePage';

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
  apiMocks: { listAudienceProblems: vi.fn() },
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, listAudienceProblems: apiMocks.listAudienceProblems };
});

describe('AudiencePage', () => {
  it('renders problem clusters with evidence and hooks', async () => {
    apiMocks.listAudienceProblems.mockResolvedValue({
      groups: [
        {
          id: 'g-1',
          problem: 'Beginners struggle to turn AI knowledge into real projects.',
          audience: 'Beginner developers',
          evidence: [
            { sourceId: 's-1', sourceTitle: 'Thread', sourceUrl: 'https://example.com/1', sourceType: 'REDDIT', quote: 'How do I ship?', publishedAt: null },
            { sourceId: 's-2', sourceTitle: 'Post', sourceUrl: 'https://example.com/2', sourceType: 'BLOG', quote: 'Tutorial hell is real', publishedAt: null },
          ],
          frequency: 7,
          suggestedContent: { angle: 'Build one real thing', format: 'CAROUSEL', hook: 'Knowing AI is not the hard part.', educationalValue: 'HIGH' },
          yfpRelevance: 'HIGH',
          businessAlignment: 'Core offer',
          confidence: 0.87,
        },
      ],
      totalSignalsAnalyzed: 24,
      groupedCount: 2,
      ungroupedCount: 22,
      errors: [],
    });
    render(
      <MemoryRouter initialEntries={['/audience']}>
        <Routes>
          <Route path="/audience" element={<AudiencePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Beginners struggle to turn AI knowledge into real projects.')).toBeInTheDocument();
    expect(screen.getByText('Recurring across 7 independent sources')).toBeInTheDocument();
    expect(screen.getByText(/Knowing AI is not the hard part/)).toBeInTheDocument();
  });

  it('shows an honest empty state with no invented problems', async () => {
    apiMocks.listAudienceProblems.mockResolvedValue({ groups: [], totalSignalsAnalyzed: 0, groupedCount: 0, ungroupedCount: 0, errors: [] });
    render(
      <MemoryRouter initialEntries={['/audience']}>
        <Routes>
          <Route path="/audience" element={<AudiencePage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('No audience problems yet')).toBeInTheDocument();
  });
});
