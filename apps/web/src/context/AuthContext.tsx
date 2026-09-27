import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  TOKEN_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  getStoredToken,
  getStoredWorkspaceId,
  listWorkspaces,
  login as loginRequest,
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
  logout: () => void;
  selectWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): { token: string | null; workspaceId: string | null } {
  const rawToken = getStoredToken();
  const rawWorkspace = getStoredWorkspaceId();
  const token = typeof rawToken === 'string' && rawToken.length > 0 ? rawToken : null;
  const workspaceId = typeof rawWorkspace === 'string' && rawWorkspace.length > 0 ? rawWorkspace : null;
  return { token, workspaceId };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    const { token: storedToken } = readStoredAuth();
    if (!storedToken) {
      setWorkspaces([]);
      return;
    }
    try {
      const data = await listWorkspaces();
      setWorkspaces(data.workspaces ?? []);
      const { workspaceId: storedWorkspace } = readStoredAuth();
      if (!storedWorkspace && data.workspaces.length > 0) {
        const first = data.workspaces[0];
        if (first) {
          try {
            localStorage.setItem(WORKSPACE_STORAGE_KEY, first.id);
          } catch {
            // ignore storage failures
          }
          setWorkspaceId(first.id);
        }
      }
    } catch {
      // Keep workspaces empty on failure; pages surface honest errors.
      setWorkspaces([]);
    }
  }, []);

  useEffect(() => {
    const { token: storedToken, workspaceId: storedWorkspace } = readStoredAuth();
    setToken(storedToken);
    setWorkspaceId(storedWorkspace);
    if (storedToken) {
      void refreshWorkspaces().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshWorkspaces]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const data = await loginRequest(email, password);
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        } catch {
          // ignore storage failures
        }
        setToken(data.token);
        setUser(data.user);
        await refreshWorkspaces();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
        setError(message);
        throw err;
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
  }, []);

  const selectWorkspace = useCallback((id: string) => {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    } catch {
      // ignore storage failures
    }
    setWorkspaceId(id);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      workspaceId,
      workspaces,
      loading,
      error,
      isAuthenticated: Boolean(token),
      login,
      logout,
      selectWorkspace,
      refreshWorkspaces,
    }),
    [user, token, workspaceId, workspaces, loading, error, login, logout, selectWorkspace, refreshWorkspaces],
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
