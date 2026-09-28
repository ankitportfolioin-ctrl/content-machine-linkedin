import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

function renderApp() {
  return render(<App />);
}

describe('Web Application', () => {
  it('renders home page with health check', async () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Growth Operator' })).toBeInTheDocument();
    expect(screen.getByText('Human-guided AI operating system for LinkedIn growth')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderApp();
    expect(screen.getByText('Checking connection...')).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    renderApp();
    expect(screen.getByRole('link', { name: /^content$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /brain \/ intelligence/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /today's brain/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^learning$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /leads/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /inbox/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });
});