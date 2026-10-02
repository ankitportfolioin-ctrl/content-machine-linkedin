import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LoginForm } from './LoginForm';
import { ApiRequestError } from '../services/api';

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
  beforeEach(() => {
    vi.clearAllMocks();
    authState.error = null;
  });

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

  it('shows field-level validation for empty sign-in fields', async () => {
    mocks.login.mockResolvedValue(undefined);
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Email is required, Password is required')).toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('shows field-level validation for empty register fields', async () => {
    mocks.register.mockResolvedValue(undefined);
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Email is required, Password is required, Name is required')).toBeInTheDocument();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('shows field-level validation for missing email only', async () => {
    mocks.login.mockResolvedValue(undefined);
    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('shows field-level validation for missing password only', async () => {
    mocks.login.mockResolvedValue(undefined);
    render(<LoginForm />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('surfaces server field details on weak-password registration (R202610011556-D-001)', async () => {
    mocks.register.mockRejectedValue(
      new ApiRequestError(400, 'VALIDATION_ERROR', 'Validation failed', [
        { field: 'password', message: 'String must contain at least 8 character(s)' },
      ]),
    );
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'New here? Create an account' }));
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'T' } });
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'badpw@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByText('Validation failed — password: String must contain at least 8 character(s)'),
    ).toBeInTheDocument();
  });
});
