import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidenceView } from './LeadsPage';

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
    register: async () => undefined,
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => undefined,
  }),
}));

function renderEvidence(value: unknown) {
  return render(
    <MemoryRouter initialEntries={['/leads']}>
      <EvidenceView value={value} />
    </MemoryRouter>,
  );
}

describe('EvidenceView regression (F5: no raw JSON for research payloads)', () => {
  it('renders research facts as readable statements', () => {
    const research = [
      {
        name: 'Rahul Sharma',
        title: 'Founder at DemoCommerce Labs',
        company: 'DemoCommerce Labs',
        location: 'Bengaluru',
        facts: [
          { sourceRef: 'lead:1', statement: 'Headline: Founder at DemoCommerce Labs' },
          { sourceRef: 'lead:1', statement: 'Company: DemoCommerce Labs' },
        ],
        unknowns: ['Public background not yet researched from public sources.'],
      },
    ];
    const { container } = renderEvidence(research);
    expect(screen.getByText('Headline: Founder at DemoCommerce Labs')).toBeInTheDocument();
    expect(screen.getByText('Company: DemoCommerce Labs')).toBeInTheDocument();
    expect(screen.getByText(/Still unknown/)).toBeInTheDocument();
    // No raw JSON dump
    expect(container.querySelector('pre')).toBeNull();
  });

  it('still renders plain strings and empty states', () => {
    renderEvidence('direct note');
    expect(screen.getByText('direct note')).toBeInTheDocument();
  });

  it('renders an honest empty state for null', () => {
    renderEvidence(null);
    expect(screen.getByText('None noted')).toBeInTheDocument();
  });

  it('renders an honest empty state for empty arrays (no blank, no JSON)', () => {
    const { container } = renderEvidence([]);
    expect(screen.getByText('None noted')).toBeInTheDocument();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('skips finding entries with no renderable content instead of blank blocks', () => {
    const { container } = renderEvidence([
      { name: null, title: null, company: null, facts: [], unknowns: [] },
    ]);
    // Falls back to the raw view only when truly unrecognized; empty
    // findings must not render an empty content block.
    expect(container.textContent ?? '').not.toBe('');
  });
});
