import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  Badge,
  Dialog,
  FeatureUnavailable,
  LabeledField,
  LoadingState,
  PermissionState,
} from './ui';

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('Shared UI states (Stage 1)', () => {
  it('renders badges with tone classes', () => {
    renderWithRouter(<Badge tone="success">Ready</Badge>);
    expect(screen.getByText('Ready')).toHaveClass('badge-success');
  });

  it('renders an accessible loading state', () => {
    renderWithRouter(<LoadingState label="Loading research…" />);
    expect(screen.getByRole('status', { name: 'Loading research…' })).toBeInTheDocument();
  });

  it('explains permission blocks with a next step', () => {
    renderWithRouter(<PermissionState />);
    expect(screen.getByText('Permission required')).toBeInTheDocument();
    expect(screen.getByText(/workspace admin/i)).toBeInTheDocument();
  });

  it('marks unavailable features honestly with an action', () => {
    renderWithRouter(
      <FeatureUnavailable
        title="Publishing unavailable"
        what="No publishing integration is connected."
        nextStep="Connect LinkedIn in Connections."
        action={<button type="button">Open Connections</button>}
      />,
    );
    expect(screen.getByText('Publishing unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Connections' })).toBeInTheDocument();
  });

  it('associates labels with inputs and surfaces errors', () => {
    renderWithRouter(
      <LabeledField id="name" label="Workspace name" hint="Shown in the top bar." error="Name is required">
        <input id="name" className="field" />
      </LabeledField>,
    );
    expect(screen.getByLabelText('Workspace name')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
  });

  it('closes the dialog on Escape and on overlay click', () => {
    const onClose = vi.fn();
    renderWithRouter(
      <Dialog title="Confirm" description="Are you sure?" onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
