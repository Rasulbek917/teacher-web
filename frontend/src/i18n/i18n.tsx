import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { uz, UzDict } from './uz';
import { en } from './en';
import { api, tokenStore } from '../lib/api';

type Lang = 'uz' | 'en';

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunc;
}

type TFunc = (key: keyof UzDict | string, vars?: Record<string, any>) => string;

const Ctx = createContext<I18nCtx>({ lang: 'uz', setLang: () => {}, t: (k: any) => k });

function resolve(val: any, vars?: Record<string, any>): string {
  if (typeof val === 'function') {
    const v = vars ?? {};
    // Funksiyalar (n1, n2) yoki boshqa placeholderlarni qabul qiladi
    return String(val(v.n1 ?? v.p ?? '', v.n2 ?? v.a ?? '', v.s ?? '', v.m ?? ''));
  }
  if (typeof val !== 'string') return String(val ?? '');
  if (!vars) return val;
  return val.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem('et_lang') as Lang) || 'uz',
  );

  const apply = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('et_lang', l);
    // Backendga saqlash (xatoni indirmaymiz)
    api.patch('/users/me/preferences', { language: l.toUpperCase() }).catch(() => {});
  }, []);

  const t: TFunc = useCallback(
    (key: any, vars?: Record<string, any>) => {
      const dict: UzDict = lang === 'uz' ? uz : en;
      const val = dict[key];
      if (val === undefined) return String(key);
      return resolve(val, vars);
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang: apply, t }), [lang, apply, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export { tokenStore };