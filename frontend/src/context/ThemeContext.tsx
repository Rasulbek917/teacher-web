import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../lib/api';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('et_theme') as Theme) || 'light',
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('et_theme', theme);
  }, [theme]);

  const apply = useCallback((t: Theme) => {
    setTheme(t);
    api.patch('/users/me/preferences', { theme: t.toUpperCase() }).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    apply(theme === 'dark' ? 'light' : 'dark');
  }, [theme, apply]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useThemeCtx = () => useContext(Ctx);