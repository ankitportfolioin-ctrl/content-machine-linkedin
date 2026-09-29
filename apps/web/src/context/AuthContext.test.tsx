import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { AUTH_EXPIRED_EVENT, TOKEN_STORAGE_KEY, WORKSPACE_STORAGE_KEY } from '../services/api';

function installMemoryStorage(initial: Record<string, string> = {}) {
  let store: Record<string, string> = { ...initial };
  const storage = {
    getItem: (key: string): string | null => (key in store ? store[key]! : null),
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
  };
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    configurable: true,
    value: storage,
  });
  return storage;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function Probe() {
  const auth = useAuth();
  return (
    <pre data-testid="auth-state">
      {JSON.stringify({
        isAuthenticated: auth.isAuthenticated,
        user: auth.user,
        workspaceId: auth.workspaceId,
        workspaces: auth.workspaces,
        loading: auth.loading,
        error: auth.error,
      })}
    </pre>
  );
}

function readState() {
  return JSON.parse(screen.getByTestId('auth-state').textContent ?? '{}') as {
    isAuthenticated: boolean;
    user: { id: string; email: string; name: string } | null;
    workspaceId: string | null;
    workspaces: Array<{ id: string; name: string }>;
    loading: boolean;
    error: string | null;
  };
}

async function waitForSettled() {
  await waitFor(() => expect(readState().loading).toBe(false));
}

describe('AuthContext session validation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    installMemoryStorage();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fires no protected requests when no session is stored', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitForSettled();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readState().isAuthenticated).toBe(false);
  });

  it('signs out a stale stored token instead of 401-storming protected endpoints', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'dead-token');
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, 'ws-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid token' } }, 401),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitForSettled();

    // Exactly one request (the session validation) — no follow-up workspace
    // or data requests are fired with a dead session.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/auth/me');
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();

    const state = readState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.workspaces).toEqual([]);
    expect(state.error).toMatch(/session expired/i);
  });

  it('establishes the session and workspace for a live stored token', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'live-token');
    const user = { id: 'u-1', email: 'a@example.com', name: 'Ada' };
    fetchMock.mockImplementation(async (url: unknown) => {
      if (url === '/api/v1/auth/me') return jsonResponse({ user });
      if (url === '/api/v1/workspaces') {
        return jsonResponse({ workspaces: [{ id: 'ws-1', name: 'Acme', slug: 'acme' }] });
      }
      throw new Error(`unexpected request to ${String(url)}`);
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitForSettled();

    const state = readState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(user);
    expect(state.workspaceId).toBe('ws-1');
    expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe('ws-1');
  });

  it('resolves the workspace context before reporting authenticated after login', async () => {
    const user = { id: 'u-1', email: 'a@example.com', name: 'Ada' };
    fetchMock.mockImplementation(async (url: unknown, init?: unknown) => {
      if (url === '/api/v1/auth/login') return jsonResponse({ user, token: 'fresh-token' });
      if (url === '/api/v1/workspaces') {
        return jsonResponse({ workspaces: [{ id: 'ws-1', name: 'Acme', slug: 'acme' }] });
      }
      throw new Error(`unexpected request to ${String(url)}: ${JSON.stringify((init as RequestInit)?.headers)}`);
    });

    const observations: Array<{ isAuthenticated: boolean; workspaceStored: string | null }> = [];
    function LoginProbe() {
      const auth = useAuth();
      observations.push({
        isAuthenticated: auth.isAuthenticated,
        workspaceStored: window.localStorage.getItem(WORKSPACE_STORAGE_KEY),
      });
      return null;
    }
    function Trigger() {
      const auth = useAuth();
      const started = React.useRef(false);
      React.useEffect(() => {
        if (started.current) return;
        started.current = true;
        void auth.login('a@example.com', 'secret123');
      });
      return null;
    }

    render(
      <AuthProvider>
        <Probe />
        <LoginProbe />
        <Trigger />
      </AuthProvider>,
    );

    await waitFor(() => expect(readState().isAuthenticated).toBe(true));
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('fresh-token');
    expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe('ws-1');
    expect(readState().workspaceId).toBe('ws-1');
    // Pages gate on isAuthenticated: it must never read true while the
    // workspace context they attach to every request is still missing.
    const violations = observations.filter((o) => o.isAuthenticated && o.workspaceStored !== 'ws-1');
    expect(violations).toEqual([]);
  });

  it('converges to signed-out when a protected request reports an expired session', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'live-token');
    const user = { id: 'u-1', email: 'a@example.com', name: 'Ada' };
    fetchMock.mockImplementation(async (url: unknown) => {
      if (url === '/api/v1/auth/me') return jsonResponse({ user });
      if (url === '/api/v1/workspaces') {
        return jsonResponse({ workspaces: [{ id: 'ws-1', name: 'Acme', slug: 'acme' }] });
      }
      throw new Error(`unexpected request to ${String(url)}`);
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitForSettled();
    expect(readState().isAuthenticated).toBe(true);

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    });

    await waitFor(() => expect(readState().isAuthenticated).toBe(false));
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(readState().error).toMatch(/session expired/i);
  });
});
