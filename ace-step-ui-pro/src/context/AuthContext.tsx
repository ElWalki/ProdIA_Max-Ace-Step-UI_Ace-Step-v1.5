import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  isAdmin?: boolean;
  avatar_url?: string;
}

interface AuthResponse { user: User; token: string; }

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setupUser: (username: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const TOKEN_KEY = 'acestep_token';

async function apiFetch<T>(endpoint: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(endpoint, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(`${res.status}: ${err.error || err.message || 'Request failed'}`);
  }
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { user: u, token: t } = await apiFetch<AuthResponse>('/api/auth/auto');
        setUser(u); setToken(t);
        localStorage.setItem(TOKEN_KEY, t);
      } catch {
        setToken(null); setUser(null);
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setupUser = useCallback(async (username: string) => {
    const { user: u, token: t } = await apiFetch<AuthResponse>('/api/auth/setup', { method: 'POST', body: { username } });
    setUser(u); setToken(t);
    localStorage.setItem(TOKEN_KEY, t);
  }, []);

  const logout = useCallback(() => {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null); setToken(null);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const value = useMemo(() => ({
    user, token, isLoading, isAuthenticated: !!user && !!token, setupUser, logout,
  }), [user, token, isLoading, setupUser, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
