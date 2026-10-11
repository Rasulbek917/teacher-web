import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, tokenStore } from '../lib/api';

interface AuthCtx {
  user: any | null;
  token: string | null;
  ready: boolean;
  login: (login: string, password: string) => Promise<any>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (u: any) => void;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(tokenStore.get());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const t = tokenStore.get();
    if (!t) {
      setUser(null);
      setToken(null);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      setToken(t);
    } catch {
      tokenStore.clear();
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const login = useCallback(async (login: string, password: string) => {
    const { data } = await api.post('/auth/login', { login, password });
    tokenStore.set(data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    // Serverdagi fayl cookie'sini ham tozalaymiz (best effort).
    api.post('/auth/logout').catch(() => undefined);
    tokenStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, ready, login, logout, refresh, setUser }),
    [user, token, ready, login, logout, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);