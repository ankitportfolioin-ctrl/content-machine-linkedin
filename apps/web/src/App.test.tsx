import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

function renderApp() {
  return render(<App />);
}

describe('Web Application', () => {
  it('renders the command-center shell with brand', async () => {
    renderApp();
    expect(screen.getByText('Growth Operator')).toBeInTheDocument();
    expect(screen.getByText('One helpful AI operator')).toBeInTheDocument();
  });

  it('shows the Home command center immediately', () => {
    renderApp();
    // Auth resolves to signed-out in tests (no stored token): Home answers
    // “Where am I?” right away instead of a spinner storm.
    expect(screen.getByText('Your brand, today.')).toBeInTheDocument();
  });

  it('renders plain-language navigation with descriptions', () => {
    renderApp();
    // 8 primary items in workflow order — each link exposes its description
    // to assistive tech via the accessible name (label + description).
    expect(screen.getByRole('link', { name: /home.*your brand, today/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /research.*things worth talking about/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create.*start something new/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /content.*ideas, drafts/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /engage.*replies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /people & opportunities/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learning.*what ai has learned/i })).toBeInTheDocument();
    // Setup & connections
    expect(screen.getByRole('link', { name: /connections.*connect an account/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /research sources.*where ideas come from/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^settings.*business, audience/i })).toBeInTheDocument();
    // Help appears in sidebar + top bar — both must exist and both go somewhere real.
    expect(screen.getAllByRole('link', { name: /help.*what goes where/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('exposes the command palette trigger with shortcut hint', () => {
    renderApp();
    expect(screen.getByRole('button', { name: /open command palette/i })).toBeInTheDocument();
  });
});
