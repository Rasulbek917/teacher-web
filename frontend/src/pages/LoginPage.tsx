import React, { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  GraduationCap,
  Sun,
  Moon,
  Check,
  Users,
  Wallet,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useThemeCtx } from '../context/ThemeContext';
import { useI18n } from '../i18n/i18n';
import { Button, Input, SegmentedControl } from '../components/ui';
import { errMsg } from '../lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useThemeCtx();
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: '', password: '' });
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[A-Za-z0-9_]{4,}$/.test(form.login.trim())) {
      setError(t('login') + ': a-z, A-Z, 0-9, _ — kamida 4 belgi');
      return;
    }
    if (form.password.length < 6) {
      setError(t('password') + ': kamida 6 belgi');
      return;
    }
    setLoading(true);
    try {
      const user = await login(form.login.trim(), form.password);
      toast(`${t('hello')}, ${user.firstName}!`);
      navigate('/', { replace: true });
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 429) setError(t('tooMany'));
      else if (status === 403) setError(t('blockedAccount'));
      else setError(errMsg(e, t('wrongCredentials')));
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: <Users className="h-4 w-4" />, text: t('feature1') },
    { icon: <Wallet className="h-4 w-4" />, text: t('feature2') },
    { icon: <MessageCircle className="h-4 w-4" />, text: t('feature3') },
  ];

  return (
    <div className="flex min-h-full">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-secondary-700 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-16 top-10 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 -left-10 h-80 w-80 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <GraduationCap className="h-6 w-6" />
          </div>
          <span className="font-display text-xl font-extrabold tracking-tight">Teacher Web</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <h2 className="font-display text-3xl font-extrabold leading-tight">{t('brandTagline')}</h2>
          <ul className="mt-8 space-y-4">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-3 text-white/90">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                  <Check className="h-4 w-4" />
                </span>
                <span className="text-sm">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-10 text-xs text-white/60">© {new Date().getFullYear()} Teacher Web</div>
      </div>

      {/* Form panel */}
      <div className="relative flex w-full flex-col items-center justify-center bg-slate-50 px-4 py-10 lg:w-1/2 dark:bg-slate-950">
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <SegmentedControl
            value={lang}
            onChange={(v) => setLang(v as 'uz' | 'en')}
            options={[
              { value: 'uz', label: 'UZ' },
              { value: 'en', label: 'EN' },
            ]}
          />
          <button
            type="button"
            onClick={toggle}
            className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
            title={theme === 'dark' ? t('light') : t('dark')}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>

        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white shadow-glow lg:hidden">
              <GraduationCap className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">{t('welcomeBack')}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t('signIn')} · {t('appName')}
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Input
              label={t('login')}
              leftIcon={<UserIcon className="h-5 w-5" />}
              value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value })}
              placeholder="login"
              autoComplete="username"
              required
            />
            <div className="relative">
              <Input
                label={t('password')}
                type={show ? 'text' : 'password'}
                leftIcon={<Lock className="h-5 w-5" />}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="touch-target absolute right-1 top-7 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                title={show ? t('hidePassword') : t('showPassword')}
              >
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2 text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800"
                />
                {t('rememberMe')}
              </label>
              <button
                type="button"
                onClick={() => toast(t('contactAdmin'), 'info')}
                className="font-medium text-primary-600 hover:underline dark:text-primary-300"
              >
                {t('forgotPassword')}
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {error}
              </div>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading}>
              {t('signIn')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('registerTeacher')}?{' '}
            <Link to="/register" className="font-semibold text-primary-600 hover:underline dark:text-primary-300">
              {t('register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
