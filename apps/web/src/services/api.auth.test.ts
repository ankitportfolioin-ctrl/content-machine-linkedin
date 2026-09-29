import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUTH_EXPIRED_EVENT,
  ApiRequestError,
  TOKEN_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  fetchCurrentUser,
  listWorkspaces,
  login,
} from './api';

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

const unauthorizedBody = {
  error: { code: 'AUTHENTICATION_ERROR', message: 'Invalid token' },
};

describe('api client authentication behavior', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    installMemoryStorage();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the stored Bearer token and workspace header on protected requests', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'live-token');
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, 'ws-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ workspaces: [] }));

    await listWorkspaces();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/workspaces');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer live-token');
    expect(headers['X-Workspace-ID']).toBe('ws-1');
  });

  it('sends no Authorization header when no session is stored (honest 401)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(unauthorizedBody, 401));

    const expired: string[] = [];
    window.addEventListener(AUTH_EXPIRED_EVENT, () => expired.push('expired'), { once: true });
    await expect(listWorkspaces()).rejects.toBeInstanceOf(ApiRequestError);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    // Nothing stored, nothing to clear — but the expiry signal still fires so
    // any claimed in-memory session converges to signed-out.
    expect(expired).toEqual(['expired']);
  });

  it('clears the dead session and signals expiry on a 401 from a protected route', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'dead-token');
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, 'ws-1');
    fetchMock.mockResolvedValueOnce(jsonResponse(unauthorizedBody, 401));

    const expired: string[] = [];
    window.addEventListener(AUTH_EXPIRED_EVENT, () => expired.push('expired'), { once: true });
    const failure = await listWorkspaces().catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(ApiRequestError);
    expect((failure as ApiRequestError).status).toBe(401);
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
    expect(expired).toEqual(['expired']);
  });

  it('does not wipe the session on a 401 from an auth route (failed login)', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'live-token');
    fetchMock.mockResolvedValueOnce(jsonResponse(unauthorizedBody, 401));

    const expired: string[] = [];
    window.addEventListener(AUTH_EXPIRED_EVENT, () => expired.push('expired'));
    await expect(login('a@example.com', 'wrong')).rejects.toBeInstanceOf(ApiRequestError);

    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('live-token');
    expect(expired).toEqual([]);
  });

  it('validates the session through GET /auth/me with the Bearer token', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'live-token');
    const user = { id: 'u-1', email: 'a@example.com', name: 'Ada' };
    fetchMock.mockResolvedValueOnce(jsonResponse({ user }));

    await expect(fetchCurrentUser()).resolves.toEqual({ user });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/me');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer live-token');
  });
});
