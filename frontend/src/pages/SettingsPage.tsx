import React, { useEffect, useRef, useState } from 'react';
import { Camera, Globe, Moon, Sun, KeyRound, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useI18n, tokenStore } from '../i18n/i18n';
import { useThemeCtx } from '../context/ThemeContext';
import { api, errMsg, fileUrl } from '../lib/api';
import { Button, Input, PageHeader, Avatar, Badge } from '../components/ui';
import { formatPhoneInput, isValidPhone } from '../lib/format';
import { uploadFileChunked } from '../lib/upload';

interface TelegramStatus {
  available: boolean;
  role?: string;
  linked: boolean;
  linkedAt?: string | null;
  url: string;
  botUsername?: string;
}

export function SettingsPage() {
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useThemeCtx();
  const avatarRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    login: user?.login ?? '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPwd, setSavingPwd] = useState(false);

  const [tg, setTg] = useState<TelegramStatus | null>(null);
  const [tgBusy, setTgBusy] = useState(false);

  const loadTelegram = async () => {
    try {
      const { data } = await api.get('/users/me/telegram');
      setTg(data);
    } catch {
      setTg(null);
    }
  };

  useEffect(() => {
    loadTelegram();
  }, []);

  const openTelegram = () => {
    if (!tg?.url) {
      toast(t('telegramNotAvailable'), 'error');
      return;
    }
    window.open(tg.url, '_blank', 'noopener');
    toast(t('telegramOpenBot'));
  };

  const unlinkTelegram = async () => {
    setTgBusy(true);
    try {
      await api.post('/users/me/telegram/unlink');
      toast(t('telegramUnlinked'));
      await loadTelegram();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setTgBusy(false);
    }
  };

  if (!user) return null;

  const saveProfile = async () => {
    if (profile.firstName.trim().length < 2 || profile.lastName.trim().length < 2) {
      toast('Ism/Familiya: kamida 2 belgi', 'error');
      return;
    }
    if (!isValidPhone(profile.phone)) {
      toast(t('invalidPhone'), 'error');
      return;
    }
    if (!/^[A-Za-z0-9_]{4,}$/.test(profile.login.trim())) {
      toast('Login: a-z, A-Z, 0-9, _ — kamida 4 belgi', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const { data } = await api.patch('/users/me', {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        phone: profile.phone,
        login: profile.login.trim(),
      });
      setUser({ ...user, ...data, teacherProfile: user.teacherProfile, studentProfile: user.studentProfile });
      toast(t('success'));
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      // Avatar avval bo'laklab yuklanadi, so'ng URL saqlanadi.
      const uploaded = await uploadFileChunked(file, { kind: 'avatar', scope: 'AVATAR' });
      const { data } = await api.post('/users/me/avatar', { fileUrl: uploaded.url });
      setUser({ ...user, avatarUrl: data.avatarUrl });
      toast(t('upload') + ': ' + t('success'));
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const changePassword = async () => {
    if (pwd.newPassword.length < 6) {
      toast('Yangi parol: kamida 6 belgi', 'error');
      return;
    }
    if (pwd.newPassword !== pwd.confirmPassword) {
      toast(t('passwordsDontMatch'), 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await api.patch('/users/me/password', {
        oldPassword: pwd.oldPassword,
        newPassword: pwd.newPassword,
        confirmPassword: pwd.confirmPassword,
      });
      setPwd({ oldPassword: '', newPassword: '', confirmPassword: '' });
      toast(t('success'));
    } catch (e: any) {
      toast(errMsg(e, 'Eski parol noto\'g\'ri'), 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const switchLang = async (l: 'uz' | 'en') => {
    setLang(l);
    toast(t('language') + ': ' + (l === 'uz' ? "O'zbekcha" : 'English'));
  };

  return (
    <div>
      <PageHeader title={t('settings')} />

      <div className="space-y-6">
        {/* Profil */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">{t('profile')}</h2>
          <div className="mb-5 flex items-center gap-4">
            <Avatar url={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size="lg" />
            <input
              ref={avatarRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = '';
              }}
            />
            <Button variant="outline" size="sm" loading={uploadingAvatar} onClick={() => avatarRef.current?.click()}>
              <Camera className="h-4 w-4" /> {t('uploadAvatar')}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('firstName')}
              value={profile.firstName}
              onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
            />
            <Input
              label={t('lastName')}
              value={profile.lastName}
              onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
            />
            <Input
              label={t('phone')}
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: formatPhoneInput(e.target.value) })}
              inputMode="tel"
            />
            <Input
              label={t('login')}
              value={profile.login}
              onChange={(e) => setProfile({ ...profile, login: e.target.value })}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveProfile} loading={savingProfile}>
              {t('save')}
            </Button>
          </div>
        </section>

        {/* Til va mavzu */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('language')} & {t('theme')}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button
              variant={lang === 'uz' ? 'primary' : 'outline'}
              onClick={() => switchLang('uz')}
            >
              <Globe className="h-4 w-4" /> O'zbekcha
            </Button>
            <Button
              variant={lang === 'en' ? 'primary' : 'outline'}
              onClick={() => switchLang('en')}
            >
              <Globe className="h-4 w-4" /> English
            </Button>
            <Button variant="outline" onClick={toggle}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === 'dark' ? t('light') : t('dark')}
            </Button>
          </div>
        </section>

        {/* Telegram bildirishnomalar */}
        {tg?.available && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <Send className="h-5 w-5" /> {t('telegramLink')}
            </h2>
            <div className="mb-3">
              <Badge color={tg.linked ? 'green' : 'slate'}>
                {tg.linked ? t('telegramLinked') : t('telegramNotLinked')}
              </Badge>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {tg.role === 'TEACHER' ? t('telegramTeacherHint') : t('telegramStudentHint')}
            </p>
            <div className="flex flex-wrap gap-2">
              {!tg.linked && (
                <Button onClick={openTelegram}>
                  <Send className="h-4 w-4" /> {t('telegramOpenBot')}
                </Button>
              )}
              {tg.linked && (
                <Button variant="outline" loading={tgBusy} onClick={unlinkTelegram}>
                  {t('unlinkTelegram')}
                </Button>
              )}
            </div>
          </section>
        )}

        {/* Parol */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
            <KeyRound className="h-5 w-5" /> {t('password')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label={t('oldPassword')}
              type="password"
              value={pwd.oldPassword}
              onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })}
            />
            <Input
              label={t('newPassword')}
              type="password"
              value={pwd.newPassword}
              onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
              placeholder="Kamida 6 belgi"
            />
            <Input
              label={t('confirmPassword')}
              type="password"
              value={pwd.confirmPassword}
              onChange={(e) => setPwd({ ...pwd, confirmPassword: e.target.value })}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={changePassword} loading={savingPwd}>
              {t('save')}
            </Button>
          </div>
        </section>

        {user.teacherProfile && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">{t('registerTeacher')}</h2>
            <p className="text-sm text-slate-500">
              {user.teacherProfile.centerName} — {user.teacherProfile.city}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}