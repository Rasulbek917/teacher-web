import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  CalendarCheck,
  Star,
  BarChart3,
  Wallet,
  MessageCircle,
  Settings,
  Bell,
  LogOut,
  Menu,
  Sun,
  Moon,
  Home,
  Video,
  Image as ImageIcon,
  School,
  CheckCheck,
  X,
  Search,
  ChevronsUpDown,
  ArrowRight,
} from 'lucide-react';
import { Avatar, cx, MenuItem, SegmentedControl } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useThemeCtx } from '../context/ThemeContext';
import { useI18n } from '../i18n/i18n';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import type { NotificationItem, Role } from '../lib/types';
import { fmtDateTime } from '../lib/format';

interface NavEntry {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
  group: string;
}

function useNav(userRole: Role | undefined): NavEntry[] {
  const { t } = useI18n();
  return useMemo(() => {
    const g = {
      overview: t('navOverview'),
      management: t('navManagement'),
      academics: t('navAcademics'),
      finance: t('navFinance'),
      communication: t('navCommunication'),
      other: t('navOther'),
    };
    if (userRole === 'SUPER_ADMIN') {
      return [
        { to: '/', label: t('adminDashboard'), icon: <LayoutDashboard className="h-5 w-5" />, end: true, group: g.overview },
        { to: '/teachers', label: t('teachers'), icon: <GraduationCap className="h-5 w-5" />, group: g.management },
        { to: '/chat', label: t('chat'), icon: <MessageCircle className="h-5 w-5" />, group: g.communication },
        { to: '/notifications', label: t('notifications'), icon: <Bell className="h-5 w-5" />, group: g.communication },
        { to: '/settings', label: t('settings'), icon: <Settings className="h-5 w-5" />, group: g.other },
      ];
    }
    if (userRole === 'TEACHER') {
      return [
        { to: '/', label: t('dashboard'), icon: <LayoutDashboard className="h-5 w-5" />, end: true, group: g.overview },
        { to: '/groups', label: t('groups'), icon: <School className="h-5 w-5" />, group: g.management },
        { to: '/students', label: t('students'), icon: <Users className="h-5 w-5" />, group: g.management },
        { to: '/materials', label: t('videosRasmsMaterials'), icon: <BookOpen className="h-5 w-5" />, group: g.academics },
        { to: '/homework', label: t('homework'), icon: <ClipboardList className="h-5 w-5" />, group: g.academics },
        { to: '/attendance', label: t('attendance'), icon: <CalendarCheck className="h-5 w-5" />, group: g.academics },
        { to: '/grades', label: t('grades'), icon: <Star className="h-5 w-5" />, group: g.academics },
        { to: '/statistics', label: t('statistics'), icon: <BarChart3 className="h-5 w-5" />, group: g.academics },
        { to: '/payments', label: t('payments'), icon: <Wallet className="h-5 w-5" />, group: g.finance },
        { to: '/chat', label: t('chat'), icon: <MessageCircle className="h-5 w-5" />, group: g.communication },
        { to: '/notifications', label: t('notifications'), icon: <Bell className="h-5 w-5" />, group: g.communication },
        { to: '/settings', label: t('settings'), icon: <Settings className="h-5 w-5" />, group: g.other },
      ];
    }
    return [
      { to: '/', label: t('myHome'), icon: <Home className="h-5 w-5" />, end: true, group: g.overview },
      { to: '/my-group', label: t('myGroup'), icon: <School className="h-5 w-5" />, group: g.academics },
      { to: '/my-homework', label: t('myHomework'), icon: <ClipboardList className="h-5 w-5" />, group: g.academics },
      { to: '/my-grades', label: t('myGrades'), icon: <Star className="h-5 w-5" />, group: g.academics },
      { to: '/materials', label: t('videoLessons'), icon: <Video className="h-5 w-5" />, end: true, group: g.academics },
      { to: '/images', label: t('images'), icon: <ImageIcon className="h-5 w-5" />, end: true, group: g.academics },
      { to: '/my-stats', label: t('myAttendance'), icon: <BarChart3 className="h-5 w-5" />, group: g.finance },
      { to: '/my-payments', label: t('myPayments'), icon: <Wallet className="h-5 w-5" />, group: g.finance },
      { to: '/chat', label: t('chat'), icon: <MessageCircle className="h-5 w-5" />, group: g.communication },
      { to: '/notifications', label: t('notifications'), icon: <Bell className="h-5 w-5" />, group: g.communication },
      { to: '/settings', label: t('settings'), icon: <Settings className="h-5 w-5" />, group: g.other },
    ];
  }, [userRole, t]);
}

const TITLE_KEYS: Record<string, string> = {
  '/': 'dashboardHome',
  '/teachers': 'teachers',
  '/groups': 'groups',
  '/students': 'students',
  '/materials': 'materialsTitle',
  '/images': 'images',
  '/homework': 'homework',
  '/attendance': 'attendance',
  '/grades': 'grades',
  '/statistics': 'statistics',
  '/payments': 'payments',
  '/chat': 'chat',
  '/notifications': 'notifications',
  '/settings': 'settings',
  '/my-group': 'myGroup',
  '/my-homework': 'myHomework',
  '/my-grades': 'myGrades',
  '/my-stats': 'myAttendance',
  '/my-payments': 'myPayments',
};

function NotificationBell() {
  const { t } = useI18n();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { pageSize: 6 } });
      setCount(data.unreadCount ?? 0);
      setItems(data.items ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const onNew = () => refresh();
    socket?.on('notification:new', onNew);
    socket?.on('notification:refresh', onNew);
    return () => {
      socket?.off('notification:new', onNew);
      socket?.off('notification:refresh', onNew);
    };
  }, [socket, refresh]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Dars eslatmalarini tekshirish: Vercel (Hobby) da daqiqalik cron ishlamaydi,
  // shuning uchun sayt ochiq turganda har 5 daqiqada serverga eslatib turamiz
  // (server tomonda natija bir marta yuboriladi — takroriy xabar bo'lmaydi).
  useEffect(() => {
    const tick = () => api.post('/notifications/lesson-check').catch(() => {});
    tick();
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      refresh();
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="touch-target relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label={t('notifications')}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <span className="font-display text-sm font-bold">{t('notifications')}</span>
            {count > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
                onClick={async () => {
                  await api.patch('/notifications/read-all');
                  setCount(0);
                  setItems((it) => it.map((x) => ({ ...x, isRead: true })));
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('markAllRead')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">{t('noNotifications')}</div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={cx(
                  'flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/50',
                  !n.isRead && 'bg-primary-50/50 dark:bg-primary-500/5',
                )}
              >
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-primary-500')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{n.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.body}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="flex w-full touch-target items-center justify-center gap-1 border-t border-slate-100 py-3 text-center text-sm font-semibold text-primary-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-primary-300 dark:hover:bg-slate-800/60"
          >
            {t('viewAll')} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useThemeCtx();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const nav = useNav(user?.role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDrawerOpen(false);
    setUserMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const roleLabel = user.role === 'STUDENT' ? t('student') : user.role === 'TEACHER' ? t('teacher') : t('superAdmin');
  const titleKey = TITLE_KEYS[location.pathname];
  const title = location.pathname === '/' && user.role === 'STUDENT' ? t('myHome') : titleKey ? t(titleKey) : t('appName');

  const onLogout = () => {
    logout();
    toast(t('logout'));
    navigate('/login');
  };

  const groups = useMemo(() => {
    const acc: { name: string; items: NavEntry[] }[] = [];
    for (const n of nav) {
      let g = acc.find((x) => x.name === n.group);
      if (!g) {
        g = { name: n.group, items: [] };
        acc.push(g);
      }
      g.items.push(n);
    }
    return acc;
  }, [nav]);

  const sideNav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((grp) => (
        <div key={grp.name}>
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{grp.name}</div>
          <div className="space-y-0.5">
            {grp.items.map((n) => (
              <NavLink
                key={n.to + n.label}
                to={n.to}
                end={n.end}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) =>
                  cx(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary-500" />}
                    <span className={cx('shrink-0', isActive ? 'text-primary-500' : 'text-slate-400 group-hover:text-slate-500')}>
                      {n.icon}
                    </span>
                    <span className="truncate">{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white shadow-glow">
        <GraduationCap className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-[15px] font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          Teacher <span className="text-primary-600 dark:text-primary-400">Web</span>
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{roleLabel}</div>
      </div>
    </div>
  );

  const userCard = (
    <div className="border-t border-slate-100 p-3 dark:border-slate-800">
      <div className="flex items-center gap-3 rounded-xl p-2">
        <Avatar url={user.avatarUrl} name={fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{fullName}</div>
          <div className="truncate text-xs text-slate-400">@{user.login}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          title={t('logout')}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const bottomNav = nav.filter((n) => n.to !== '/chat' && n.to !== '/notifications' && n.to !== '/settings').slice(0, 4);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center px-5">{brand}</div>
        {sideNav}
        {userCard}
      </aside>

      {/* Mobile slide-over */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-pop animate-slide-in-left dark:bg-slate-900">
            <div className="flex h-16 items-center justify-between px-5">
              {brand}
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sideNav}
            {userCard}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-slate-200 glass px-3 sm:px-5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={t('menu')}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">{title}</h1>
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 md:flex dark:border-slate-700 dark:bg-slate-800/60"
          >
            <Search className="h-4 w-4" />
            <span className="pr-6">{t('search')}</span>
            <kbd className="rounded-md border border-slate-200 px-1.5 text-[10px] font-semibold dark:border-slate-700">⌘K</kbd>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={t('search')}
          >
            <Search className="h-5 w-5" />
          </button>

          <div className="hidden sm:block">
            <SegmentedControl
              value={lang}
              onChange={(v) => setLang(v as 'uz' | 'en')}
              options={[
                { value: 'uz', label: 'UZ' },
                { value: 'en', label: 'EN' },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={toggle}
            className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            title={theme === 'dark' ? t('light') : t('dark')}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <NotificationBell />

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenu((o) => !o)}
              className="flex items-center gap-2 rounded-xl p-1 pr-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Avatar url={user.avatarUrl} name={fullName} size="sm" />
              <ChevronsUpDown className="hidden h-4 w-4 text-slate-400 sm:block" />
            </button>
            {userMenu && (
              <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar url={user.avatarUrl} name={fullName} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{fullName}</div>
                    <div className="truncate text-xs text-slate-400">{roleLabel}</div>
                  </div>
                </div>
                <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
                <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => { setUserMenu(false); navigate('/settings'); }}>
                  {t('settings')}
                </MenuItem>
                <MenuItem icon={<LogOut className="h-4 w-4" />} danger onClick={onLogout}>
                  {t('logout')}
                </MenuItem>
              </div>
            )}
          </div>
        </header>

        <main className="app-bg mx-auto w-full max-w-6xl flex-1 px-3 pb-28 pt-5 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {bottomNav.map((n) => (
          <NavLink
            key={n.to + n.label}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cx(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary-600 dark:text-primary-300' : 'text-slate-400',
              )
            }
          >
            {n.icon}
            <span className="max-w-[64px] truncate">{n.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-slate-400"
        >
          <Menu className="h-5 w-5" />
          <span>{t('menu')}</span>
        </button>
      </nav>

      {/* Command palette */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24 sm:pt-32">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm animate-fade-in" onClick={() => setSearchOpen(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-scale-in dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 dark:border-slate-800">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search')}
                className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
              <kbd className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-700">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {nav
                .filter((n) => n.label.toLowerCase().includes(query.toLowerCase()))
                .map((n) => (
                  <button
                    key={n.to + n.label}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setQuery('');
                      navigate(n.to);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <span className="text-slate-400">{n.icon}</span>
                    <span className="flex-1">{n.label}</span>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                  </button>
                ))}
              {nav.filter((n) => n.label.toLowerCase().includes(query.toLowerCase())).length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-slate-400">{t('noResults')}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
