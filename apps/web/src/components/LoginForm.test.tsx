import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LoginForm } from './LoginForm';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  error: null as string | null,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    workspaceId: null,
    workspaces: [],
    loading: false,
    error: authState.error,
    isAuthenticated: false,
    login: mocks.login,
    register: mocks.register,
    logout: () => undefined,
    selectWorkspace: () => undefined,
    refreshWorkspaces: async () => undefined,
  }),
}));

describe('LoginForm auth bootstrap', () => {
  it('signs in by default', async () => {
    mocks.login.mockResolvedValue(undefined);
    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Sign in' });
    expect(mocks.login).toHaveBeenCalledWith('a@example.com', 'secret123');
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('surfaces an expired-session notice from auth state', async () => {
    authState.error = 'Your session expired. Please sign in again.';
    try {
      render(<LoginForm />);
      expect(screen.getByText('Your session expired. Please sign in again.')).toBeInTheDocument();
    } finally {
      authState.error = null;
    }
  });

  it('creates an account through the real register flow', async () => {
    mocks.register.mockResolvedValue(undefined);
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('button', { name: 'Create account' });
    expect(mocks.register).toHaveBeenCalledWith('Ada', 'ada@example.com', 'secret123');
  });
});
