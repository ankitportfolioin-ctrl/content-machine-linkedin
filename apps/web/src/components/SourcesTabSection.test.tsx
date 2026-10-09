import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedFreshnessLine } from './SourcesTabSection';

describe('FeedFreshnessLine (Stage 2)', () => {
  it('shows the last fetch time when recorded', () => {
    render(<FeedFreshnessLine lastFetchedAt={new Date().toISOString()} />);
    expect(screen.getByText(/Last fetched/)).toBeInTheDocument();
  });

  it('is honest when a feed was never fetched', () => {
    render(<FeedFreshnessLine lastFetchedAt={null} />);
    expect(screen.getByText(/Never fetched yet/)).toBeInTheDocument();
  });

  it('treats an invalid timestamp as unknown instead of inventing a date', () => {
    render(<FeedFreshnessLine lastFetchedAt="not-a-date" />);
    expect(screen.getByText(/Last fetched/)).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
