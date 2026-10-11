import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  Wallet,
  AlertCircle,
  CheckCircle2,
  School,
  UserPlus,
  ClipboardList,
  CalendarCheck,
  CreditCard,
  Plus,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  StatCard,
  Spinner,
  ErrorState,
  Badge,
  Select,
  Card,
  CardHeader,
  ProgressBar,
  Skeleton,
} from '../../components/ui';
import { DonutChart } from '../../components/charts';
import { fmtMoney, fmtDate, MONTH_NAMES, yearMonthNow } from '../../lib/format';
import type { TeacherDashboard } from '../../lib/types';

export function TeacherDashboardPage() {
  const { t } = useI18n();
  const now = yearMonthNow();
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/dashboard', { params: { year, month } });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const years = Array.from({ length: 4 }, (_, i) => now.year - i);

  const paidOnly = data?.paidList.filter((p) => p.status === 'PAID').length ?? 0;
  const partial = data?.paidList.filter((p) => p.status === 'PARTIAL').length ?? 0;
  const unpaidOnly = data?.unpaidList.filter((u) => u.paidAmount === 0).length ?? 0;
  const outstanding = data?.unpaidList.reduce((a, u) => a + u.monthlyPrice, 0) ?? 0;
  const collected = data?.totalIncome ?? 0;
  const expected = collected + outstanding;
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

  const actions = [
    { to: '/groups', label: t('newGroup'), icon: <School className="h-5 w-5" />, tone: 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300' },
    { to: '/students', label: t('newStudent'), icon: <UserPlus className="h-5 w-5" />, tone: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300' },
    { to: '/homework', label: t('newHomework'), icon: <ClipboardList className="h-5 w-5" />, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300' },
    { to: '/attendance', label: t('markAttendance'), icon: <CalendarCheck className="h-5 w-5" />, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
    { to: '/payments', label: t('addPayment'), icon: <CreditCard className="h-5 w-5" />, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t('dashboardHome')}
        sub={t('welcomeTeacher')}
        action={
          <div className="flex items-center gap-2">
            <Select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="w-24">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <Select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))} className="w-32">
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !data && <Spinner label={t('loading')} />}

      {data && (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={<School className="h-5 w-5" />} label={t('totalGroups')} value={data.groupsCount} tone="violet" />
            <StatCard icon={<Users className="h-5 w-5" />} label={t('totalStudents')} value={data.studentsCount} tone="cyan" />
            <StatCard icon={<Wallet className="h-5 w-5" />} label={t('monthIncome')} value={fmtMoney(data.totalIncome)} tone="green" />
            <StatCard icon={<AlertCircle className="h-5 w-5" />} label={t('unpaidCount')} value={data.unpaidCount} tone="red" />
          </div>

          {/* Collection + quick actions */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <CardHeader icon={<Wallet className="h-4 w-4" />} title={t('overview')} sub={`${t('monthIncome')} — ${MONTH_NAMES[month - 1]} ${year}`} />
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div className="flex items-center justify-center">
                  <DonutChart
                    size={168}
                    data={[
                      { label: t('paid'), value: paidOnly, color: '#22c55e' },
                      { label: t('partial'), value: partial, color: '#f59e0b' },
                      { label: t('unpaid'), value: unpaidOnly, color: '#ef4444' },
                    ]}
                    centerValue={`${collectionRate}%`}
                    centerLabel={t('totalPaid')}
                  />
                </div>
                <div className="flex flex-col justify-center gap-4">
                  <ProgressBar value={collectionRate} color="#22c55e" showLabel />
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">{t('paidStudents')}</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{paidOnly}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">{t('partialPayments')}</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{partial}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">{t('unpaidStudents')}</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{unpaidOnly}</span>
                    </div>
                    <div className="flex items-center gap-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                      <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">{t('outstanding')}</span>
                      <span className="text-sm font-bold text-red-500">{fmtMoney(outstanding)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <CardHeader icon={<Plus className="h-4 w-4" />} title={t('quickActions')} />
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {actions.map((a) => (
                  <Link
                    key={a.to + a.label}
                    to={a.to}
                    className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-soft dark:border-slate-800 dark:hover:border-slate-700"
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.tone}`}>{a.icon}</span>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{a.label}</span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          {/* Paid / Unpaid lists */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <h2 className="font-display text-sm font-bold text-slate-800 dark:text-slate-100">{t('paidList')}</h2>
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {data.paidList.length}
                </span>
              </div>
              {data.paidList.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">{t('empty')}</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.paidList.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{p.studentName}</div>
                        <div className="truncate text-xs text-slate-400">
                          {p.groupName} · {fmtDate(p.paidAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Badge color={p.status === 'PAID' ? 'green' : 'amber'}>{p.status === 'PAID' ? t('paid') : t('partial')}</Badge>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmtMoney(p.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                </span>
                <h2 className="font-display text-sm font-bold text-slate-800 dark:text-slate-100">{t('unpaidList')}</h2>
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {data.unpaidList.length}
                </span>
              </div>
              {data.unpaidList.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-400">{t('empty')}</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.unpaidList.map((u) => (
                    <div key={u.studentId + u.groupId} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{u.studentName}</div>
                        <div className="truncate text-xs text-slate-400">{u.groupName}</div>
                      </div>
                      <div className="text-right">
                        <Badge color={u.paidAmount > 0 ? 'amber' : 'red'}>{u.paidAmount > 0 ? t('partial') : t('unpaid')}</Badge>
                        <div className="mt-0.5 text-xs text-slate-400">{fmtMoney(u.monthlyPrice)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
