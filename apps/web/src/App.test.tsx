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
    expect(screen.getByRole('link', { name: /^home$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^discover$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^explore$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^your audience$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /what's trending/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^post ideas$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^write a post$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^schedule$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^review posts$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^your results$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^try new things$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^tips$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^connected accounts$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^settings$/i })).toBeInTheDocument();
  });

  it('exposes the command palette trigger with shortcut hint', () => {
    renderApp();
    expect(screen.getByRole('button', { name: /open command palette/i })).toBeInTheDocument();
  });
});
