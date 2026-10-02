import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ApiRequestError,
  AUTH_EXPIRED_EVENT,
  TOKEN_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  clearStoredAuth,
  fetchCurrentUser,
  getStoredToken,
  getStoredWorkspaceId,
  listWorkspaces,
  login as loginRequest,
  register as registerRequest,
} from '../services/api';
import { User, Workspace } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  workspaceId: string | null;
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  selectWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: (email?: string) => Promise<Workspace[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): { token: string | null; workspaceId: string | null } {
  const rawToken = getStoredToken();
  const rawWorkspace = getStoredWorkspaceId();
  const token = typeof rawToken === 'string' && rawToken.length > 0 ? rawToken : null;
  const workspaceId = typeof rawWorkspace === 'string' && rawWorkspace.length > 0 ? rawWorkspace : null;
  return { token, workspaceId };
}

const LAST_WORKSPACE_PREFIX = 'go_last_workspace:';

function lastWorkspaceKey(email: string): string {
  return `${LAST_WORKSPACE_PREFIX}${email.trim().toLowerCase()}`;
}

export function readLastWorkspace(email: string | null | undefined): string | null {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(lastWorkspaceKey(email));
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeLastWorkspace(email: string | null | undefined, workspaceId: string): void {
  if (!email) return;
  try {
    localStorage.setItem(lastWorkspaceKey(email), workspaceId);
  } catch {
    // ignore storage failures
  }
}

/**
 * Resolve which workspace to use: the stored selection wins when it is still
 * a member workspace, otherwise the user's last-used workspace (survives
 * logout), otherwise the first workspace. Never invents an id.
 */
export function resolveWorkspaceId(
  workspaceIds: string[],
  storedId: string | null,
  lastUsedId: string | null,
): string | null {
  if (storedId && workspaceIds.includes(storedId)) return storedId;
  if (lastUsedId && workspaceIds.includes(lastUsedId)) return lastUsedId;
  return workspaceIds[0] ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True once the session claim has been settled: token validated (or
  // rejected) AND the initial workspace resolution finished. Gated pages must
  // wait for this, otherwise they fire workspace-scoped requests before the
  // workspace context exists and eat avoidable 403s on every fresh sign-in.
  const [sessionReady, setSessionReady] = useState(false);

  const refreshWorkspaces = useCallback(async (email?: string) => {
    const { token: storedToken } = readStoredAuth();
    if (!storedToken) {
      setWorkspaces([]);
      return [];
    }
    try {
      const data = await listWorkspaces();
      const list = data.workspaces ?? [];
      setWorkspaces(list);
      const { workspaceId: storedWorkspace } = readStoredAuth();
      const resolved = resolveWorkspaceId(
        list.map((w) => w.id),
        storedWorkspace,
        readLastWorkspace(email),
      );
      if (resolved) {
        try {
          localStorage.setItem(WORKSPACE_STORAGE_KEY, resolved);
        } catch {
          // ignore storage failures
        }
        setWorkspaceId(resolved);
      }
      return list;
    } catch {
      // Keep workspaces empty on failure; pages surface honest errors.
      setWorkspaces([]);
      return [];
    }
  }, []);

  const signOutLocally = useCallback((message: string | null) => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
    setWorkspaceId(null);
    setWorkspaces([]);
    setError(message);
    setSessionReady(true);
  }, []);

  useEffect(() => {
    // A stored token is only a *claim* of a session. Prove it against the API
    // before treating the user as signed in; otherwise a stale token keeps
    // every gated page firing requests that can only 401.
    const { token: storedToken, workspaceId: storedWorkspace } = readStoredAuth();
    if (!storedToken) {
      setSessionReady(true);
      setLoading(false);
      return;
    }
    setToken(storedToken);
    setWorkspaceId(storedWorkspace);
    void (async () => {
      try {
        const me = await fetchCurrentUser();
        setUser(me.user);
        await refreshWorkspaces(me.user.email);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) {
          // Dead session (expired/invalid/revoked): sign out so the UI shows
          // the sign-in state instead of 401-storming protected endpoints.
          signOutLocally('Your session expired. Please sign in again.');
        } else {
          // Network/server failure: keep the claimed session so a blip does
          // not log the user out; pages surface honest per-request errors.
          await refreshWorkspaces();
        }
      } finally {
        setSessionReady(true);
        setLoading(false);
      }
    })();
  }, [refreshWorkspaces, signOutLocally]);

  // A 401 on any protected request means the session died after bootstrap
  // (expiry/revocation in another tab, server restart, reseeded DB...).
  // Converge to signed-out instead of retrying doomed requests.
  useEffect(() => {
    const handleExpired = () => signOutLocally('Your session expired. Please sign in again.');
    const handleStorage = (event: StorageEvent) => {
      if (event.key === TOKEN_STORAGE_KEY && (event.newValue === null || event.newValue === '')) {
        signOutLocally(null);
      }
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
      window.removeEventListener('storage', handleStorage);
    };
  }, [signOutLocally]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      // Hold pages on signed-out until the workspace context is resolved,
      // so the first data load already carries X-Workspace-ID.
      setSessionReady(false);
      try {
        const data = await loginRequest(email, password);
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        } catch {
          // ignore storage failures
        }
        setToken(data.token);
        setUser(data.user);
        await refreshWorkspaces(email);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
        setError(message);
        throw err;
      } finally {
        setSessionReady(true);
      }
    },
    [refreshWorkspaces],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      setError(null);
      setSessionReady(false);
      try {
        const data = await registerRequest({ name, email, password });
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        } catch {
          // ignore storage failures
        }
        setToken(data.token);
        setUser(data.user);
        await refreshWorkspaces(email);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
        setError(message);
        throw err;
      } finally {
        setSessionReady(true);
      }
    },
    [refreshWorkspaces],
  );

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
    setToken(null);
    setUser(null);
    setWorkspaceId(null);
    setWorkspaces([]);
    setError(null);
    setSessionReady(true);
  }, []);

  const selectWorkspace = useCallback((id: string) => {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    } catch {
      // ignore storage failures
    }
    // Remember per user so logout → login restores the last-used workspace
    // (validated against membership on next sign-in, never trusted blindly).
    writeLastWorkspace(user?.email, id);
    setWorkspaceId(id);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      workspaceId,
      workspaces,
      loading,
      error,
      isAuthenticated: Boolean(token) && sessionReady,
      login,
      register,
      logout,
      selectWorkspace,
      refreshWorkspaces,
    }),
    [user, token, workspaceId, workspaces, loading, error, sessionReady, login, register, logout, selectWorkspace, refreshWorkspaces],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
