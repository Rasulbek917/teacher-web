import React, { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n/i18n';
import { Button, Input } from '../components/ui';
import { formatPhoneInput, isValidPhone } from '../lib/format';

export function RegisterPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    login: '',
    password: '',
    confirmPassword: '',
    centerName: '',
    city: '',
  });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      setError(t('firstName') + '/' + t('lastName') + ': kamida 2 belgi');
      return;
    }
    if (!isValidPhone(form.phone)) {
      setError(t('invalidPhone'));
      return;
    }
    if (!/^[A-Za-z0-9_]{4,}$/.test(form.login.trim())) {
      setError(t('login') + ': a-z, A-Z, 0-9, _ — kamida 4 belgi');
      return;
    }
    if (form.password.length < 6) {
      setError(t('password') + ': kamida 6 belgi');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError(t('passwordsDontMatch'));
      return;
    }
    if (form.centerName.trim().length < 2 || form.city.trim().length < 2) {
      setError(t('centerName') + '/' + t('city') + ': kamida 2 belgi');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register-teacher', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone,
        login: form.login.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        centerName: form.centerName.trim(),
        city: form.city.trim(),
      });
      localStorage.setItem('et_token', data.token);
      const user = await login(form.login.trim(), form.password);
      toast(`Xush kelibsiz, ${user.firstName}!`);
      navigate('/', { replace: true });
    } catch (e: any) {
      if (e?.response?.status === 400) setError(errMsg(e, t('loginTaken')));
      else setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-8">
      <Link
        to="/login"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-300"
      >
        <ArrowLeft className="h-4 w-4" /> {t('signIn')}
      </Link>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-slate-100">{t('registerTeacher')}</h1>
        <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{t('appName')}</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('firstName')}
              value={form.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              required
            />
            <Input
              label={t('lastName')}
              value={form.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              required
            />
          </div>
          <Input
            label={t('phone')}
            value={form.phone}
            onChange={(e) => update('phone', formatPhoneInput(e.target.value))}
            placeholder="+998 90 123 45 67"
            inputMode="tel"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('centerName')}
              value={form.centerName}
              onChange={(e) => update('centerName', e.target.value)}
              required
            />
            <Input
              label={t('city')}
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              required
            />
          </div>
          <Input
            label={t('login')}
            value={form.login}
            onChange={(e) => update('login', e.target.value)}
            placeholder="login"
            autoComplete="username"
            required
          />
          <div className="relative">
            <Input
              label={t('password')}
              type={show ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder="Kamida 6 belgi"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="touch-target absolute right-0 top-6 inline-flex h-10 w-10 items-center justify-center text-slate-400"
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <Input
            label={t('confirmPassword')}
            type={show ? 'text' : 'password'}
            value={form.confirmPassword}
            onChange={(e) => update('confirmPassword', e.target.value)}
            autoComplete="new-password"
            required
          />

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </div>
          )}

          <Button type="submit" fullWidth size="lg" loading={loading}>
            {t('register')}
          </Button>
        </form>
      </div>
    </div>
  );
}