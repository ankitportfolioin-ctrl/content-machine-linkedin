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
    expect(screen.getByText('AI Growth OS')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderApp();
    expect(screen.getByText('Checking connection...')).toBeInTheDocument();
  });

  it('renders command-center navigation', () => {
    renderApp();
    expect(screen.getByRole('link', { name: /^overview$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^radar$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^observatory$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^audience$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^trends$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^opportunities$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^studio$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^calendar$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /approval queue/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^performance$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^experiments$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^insights$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^connections$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^settings$/i })).toBeInTheDocument();
  });

  it('exposes the command palette trigger with shortcut hint', () => {
    renderApp();
    expect(screen.getByRole('button', { name: /open command palette/i })).toBeInTheDocument();
  });
});
