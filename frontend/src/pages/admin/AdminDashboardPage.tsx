import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  School,
  Wallet,
  UserCheck,
  UserX,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  StatCard,
  ErrorState,
  Card,
  CardHeader,
  Avatar,
  Badge,
  Skeleton,
} from '../../components/ui';
import { AreaChart, DonutChart, LineChart } from '../../components/charts';
import { fmtMoney, fmtNumber, MONTH_NAMES } from '../../lib/format';

interface AdminData {
  totalTeachers: number;
  activeTeachers: number;
  blockedTeachers: number;
  totalStudents: number;
  activeStudents: number;
  totalGroups: number;
  totalUsers: number;
  activeUsers: number;
  revenueThisMonth: number;
  revenueTrend: number;
  teacherTrend: number;
  studentTrend: number;
  growth: {
    months: { year: number; month: number }[];
    teachers: number[];
    students: number[];
    revenue: number[];
  };
  recentTeachers: {
    id: string;
    firstName: string;
    lastName: string;
    login: string;
    avatarUrl: string | null;
    isBlocked: boolean;
    createdAt: string;
    _count: { teacherGroups: number };
  }[];
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmtNumber(value)}</span>
    </div>
  );
}

export function AdminDashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/admin/dashboard');
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
  }, []);

  const labels = (data?.growth.months ?? []).map((m) => MONTH_NAMES[m.month - 1]?.slice(0, 3) ?? '');

  return (
    <div className="animate-fade-up">
      <PageHeader title={t('dashboardHome')} sub={t('welcomeBack') + ' 👋'} />

      {error && <ErrorState message={error} onRetry={load} />}

      {loading && !data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="mt-4 h-7 w-24" />
                <Skeleton className="mt-2 h-3 w-20" />
              </Card>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <Skeleton className="h-56 w-full" />
            </Card>
            <Card className="p-5">
              <Skeleton className="mx-auto h-44 w-44 rounded-full" />
            </Card>
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<GraduationCap className="h-5 w-5" />}
              label={t('totalTeachers')}
              value={fmtNumber(data.totalTeachers)}
              trend={data.teacherTrend}
              sub={`${data.activeTeachers} ${t('active')}`}
              tone="primary"
              spark={data.growth.teachers}
            />
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label={t('totalStudents')}
              value={fmtNumber(data.totalStudents)}
              trend={data.studentTrend}
              sub={`${data.activeStudents} ${t('active')}`}
              tone="cyan"
              spark={data.growth.students}
            />
            <StatCard
              icon={<School className="h-5 w-5" />}
              label={t('totalGroups')}
              value={fmtNumber(data.totalGroups)}
              sub={`${fmtNumber(data.activeUsers)} ${t('active')}`}
              tone="violet"
            />
            <StatCard
              icon={<Wallet className="h-5 w-5" />}
              label={t('monthlyRevenue')}
              value={fmtMoney(data.revenueThisMonth)}
              trend={data.revenueTrend}
              tone="green"
              spark={data.growth.revenue}
            />
          </div>

          {/* Growth + status */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <CardHeader
                icon={<TrendingUp className="h-4 w-4" />}
                title={t('teacherGrowth') + ' · ' + t('studentGrowth')}
                sub={t('thisMonth')}
              />
              <div className="mt-5">
                <LineChart
                  labels={labels}
                  formatValue={(v) => fmtNumber(Math.round(v))}
                  series={[
                    { name: t('teachers'), color: '#6366f1', data: data.growth.teachers },
                    { name: t('students'), color: '#06b6d4', data: data.growth.students },
                  ]}
                />
              </div>
            </Card>

            <Card className="flex flex-col p-5">
              <CardHeader icon={<UserCheck className="h-4 w-4" />} title={t('teacherStatus')} sub={t('activeVsBlocked')} />
              <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-5">
                <DonutChart
                  size={168}
                  data={[
                    { label: t('active'), value: data.activeTeachers, color: '#22c55e' },
                    { label: t('blocked'), value: data.blockedTeachers, color: '#ef4444' },
                  ]}
                  centerValue={fmtNumber(data.totalTeachers)}
                  centerLabel={t('teachers')}
                />
                <div className="w-full space-y-2.5">
                  <LegendRow color="#22c55e" label={t('activeTeachers')} value={data.activeTeachers} />
                  <LegendRow color="#ef4444" label={t('blockedTeachers')} value={data.blockedTeachers} />
                  <div className="flex items-center gap-2.5">
                    <UserX className="h-3.5 w-3.5 text-slate-300" />
                    <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">{t('totalStudents')}</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmtNumber(data.totalStudents)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Revenue */}
          <Card className="p-5">
            <CardHeader icon={<Wallet className="h-4 w-4" />} title={t('revenueTrend')} sub={`${t('monthlyRevenue')} — ${t('thisMonth')}`} />
            <div className="mt-5">
              <AreaChart
                data={data.growth.months.map((m, i) => ({
                  label: labels[i],
                  value: data.growth.revenue[i] ?? 0,
                }))}
                color="#22c55e"
                formatValue={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
              />
            </div>
          </Card>

          {/* Recent teachers */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <CardHeader icon={<GraduationCap className="h-4 w-4" />} title={t('teachers')} sub={t('recentActivity')} />
              <Link
                to="/teachers"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline dark:text-primary-300"
              >
                {t('viewAll')} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentTeachers.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-slate-400">{t('empty')}</div>
              )}
              {data.recentTeachers.map((tr) => (
                <div key={tr.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar url={tr.avatarUrl} name={`${tr.firstName} ${tr.lastName}`} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {tr.firstName} {tr.lastName}
                    </div>
                    <div className="truncate text-xs text-slate-400">@{tr.login}</div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {tr._count.teacherGroups}
                    </div>
                    <div className="text-[11px] text-slate-400">{t('groups')}</div>
                  </div>
                  <Badge color={tr.isBlocked ? 'red' : 'green'} dot>
                    {tr.isBlocked ? t('blocked') : t('active')}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
