import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

export interface User {
  id: string;
  username: string;
  isAdmin?: boolean;
  avatar_url?: string;
  bio?: string;
}

export interface Profile {
  id: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  hasPassword: boolean;
  createdAt: string;
}

interface AuthResponse { user: User; token: string; }

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  profiles: Profile[];
  needsLogin: boolean;
  setupUser: (username: string, password?: string) => Promise<void>;
  loginUser: (username: string, password?: string) => Promise<void>;
  logout: () => void;
  refreshProfiles: () => Promise<void>;
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
    throw new Error(err.error || err.message || 'Request failed');
  }
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);

  const refreshProfiles = useCallback(async () => {
    try {
      const data = await apiFetch<{ profiles: Profile[] }>('/api/auth/profiles');
      setProfiles(data.profiles);
    } catch {
      setProfiles([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Try auto-login for single-user backward compat
        const { user: u, token: t } = await apiFetch<AuthResponse>('/api/auth/auto');
        setUser(u); setToken(t);
        localStorage.setItem(TOKEN_KEY, t);
      } catch {
        // No auto-login — fetch profiles and show login screen
        setToken(null); setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        await refreshProfiles();
        setNeedsLogin(true);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshProfiles]);

  const setupUser = useCallback(async (username: string, password?: string) => {
    const body: Record<string, string> = { username };
    if (password) body.password = password;
    const { user: u, token: t } = await apiFetch<AuthResponse>('/api/auth/setup', { method: 'POST', body });
    setUser(u); setToken(t);
    localStorage.setItem(TOKEN_KEY, t);
    setNeedsLogin(false);
    await refreshProfiles();
  }, [refreshProfiles]);

  const loginUser = useCallback(async (username: string, password?: string) => {
    const body: Record<string, string> = { username };
    if (password) body.password = password;
    const { user: u, token: t } = await apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body });
    setUser(u); setToken(t);
    localStorage.setItem(TOKEN_KEY, t);
    setNeedsLogin(false);
  }, []);

  const logout = useCallback(() => {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null); setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    setNeedsLogin(true);
    refreshProfiles();
  }, [refreshProfiles]);

  const value = useMemo(() => ({
    user, token, isLoading, isAuthenticated: !!user && !!token,
    profiles, needsLogin,
    setupUser, loginUser, logout, refreshProfiles,
  }), [user, token, isLoading, profiles, needsLogin, setupUser, loginUser, logout, refreshProfiles]);

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
