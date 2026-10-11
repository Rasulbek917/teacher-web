import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardList,
  Bell,
  Clock,
  ChevronRight,
  School,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  StatCard,
  Spinner,
  ErrorState,
  EmptyState,
  Badge,
  Avatar,
  Card,
  CardHeader,
} from '../../components/ui';
import { dayName, fmtDateTime, tashkentDayNumber } from '../../lib/format';
import type { MyGroup, StudentHomeworkItem } from '../../lib/types';

export function StudentHomePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [homework, setHomework] = useState<StudentHomeworkItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/my/groups'),
      api.get('/my/homework', { params: { pageSize: 100 } }),
      api.get('/notifications/unread-count'),
    ])
      .then(([g, h, n]) => {
        setGroups(g.data);
        setHomework(h.data.items ?? []);
        setUnread(n.data.count ?? 0);
      })
      .catch(() => setError(t('error')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = tashkentDayNumber();
  const todaysLessons = groups.filter((g) => g.lessonDays.includes(today));
  const upcoming = homework
    .filter((h) => h.status === 'PENDING')
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
    .slice(0, 5);
  const pendingCount = homework.filter((h) => h.status === 'PENDING').length;

  return (
    <div className="animate-fade-up">
      {/* Hero */}
      <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-600 to-secondary-600 p-5 text-white shadow-glow sm:p-6">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 right-16 h-32 w-32 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-4">
          <Avatar url={user?.avatarUrl} name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`} size="lg" ring />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/80">{t('hello')},</p>
            <h1 className="truncate font-display text-xl font-extrabold sm:text-2xl">
              {user?.firstName} {user?.lastName}
            </h1>
            <p className="mt-0.5 text-sm text-white/80">
              {dayName(today)} · {groups.length} {t('group')}
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <Spinner label={t('loading')} />}

      {!loading && !error && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard icon={<School className="h-5 w-5" />} label={t('myGroup')} value={groups.length} tone="primary" />
            <Link to="/my-homework">
              <StatCard icon={<ClipboardList className="h-5 w-5" />} label={t('upcomingHomework')} value={pendingCount} tone="cyan" />
            </Link>
            <Link to="/notifications" className="col-span-2 sm:col-span-1">
              <StatCard icon={<Bell className="h-5 w-5" />} label={t('unreadNotifications')} value={unread} tone="amber" />
            </Link>
          </div>

          {/* Today's lesson */}
          <Card className="p-5">
            <CardHeader
              icon={<CalendarDays className="h-4 w-4" />}
              title={`${t('todayLesson')} — ${dayName(today)}`}
              action={
                <Link to="/my-group" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline dark:text-primary-300">
                  {t('schedule')} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="mt-4">
              {todaysLessons.length === 0 ? (
                <EmptyState message={t('noLessonToday')} />
              ) : (
                <div className="space-y-2.5">
                  {todaysLessons.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar url={g.teacher.avatarUrl} name={`${g.teacher.firstName} ${g.teacher.lastName}`} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{g.name}</div>
                          <div className="truncate text-xs text-slate-400">
                            {t('teacherOfGroup')}: {g.teacher.firstName} {g.teacher.lastName}
                          </div>
                        </div>
                      </div>
                      <Badge color="indigo">
                        <Clock className="h-3.5 w-3.5" /> {g.lessonTime}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Upcoming homework */}
          <Card className="p-5">
            <CardHeader
              icon={<ClipboardList className="h-4 w-4" />}
              title={t('upcomingHomework')}
              action={
                <Link to="/my-homework" className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline dark:text-primary-300">
                  {t('viewAll')} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="mt-4">
              {upcoming.length === 0 ? (
                <EmptyState message={t('empty')} />
              ) : (
                <div className="space-y-2.5">
                  {upcoming.map((h) => (
                    <Link
                      key={h.id}
                      to="/my-homework"
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{h.title}</div>
                        <div className="truncate text-xs text-slate-400">
                          {h.groupName} · {fmtDateTime(h.dueAt)}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
