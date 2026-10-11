import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, TrendingUp, ClipboardList, Star, Percent } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Select,
  Input,
  StatCard,
  Spinner,
  ErrorState,
  EmptyState,
  Avatar,
} from '../../components/ui';
import { BarChart } from '../../components/BarChart';
import { fmtDate, todayStr } from '../../lib/format';
import type { GroupOption, GroupStats, StatsRange } from '../../lib/types';

export function StatisticsPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [unit, setUnit] = useState<'week' | 'month'>('week');
  const [data, setData] = useState<GroupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/groups/options').then(({ data }) => {
      setGroups(data);
      if (data.length) setGroupId(data[0].id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/statistics/group', { params: { groupId, date } });
      setData(d);
    } catch (e: any) {
      setError(errMsg(e, t('error')));
    } finally {
      setLoading(false);
    }
  }, [groupId, date, t]);

  useEffect(() => {
    load();
  }, [load]);

  const range: StatsRange | null = data ? (unit === 'week' ? data.week : data.month) : null;

  return (
    <div>
      <PageHeader title={t('statistics')} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Select label={t('group')} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.length === 0 && <option value="">{t('empty')}</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Input label={t('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-end gap-2">
          <Button
            variant={unit === 'week' ? 'primary' : 'outline'}
            onClick={() => setUnit('week')}
            className="flex-1"
          >
            {t('week')}
          </Button>
          <Button
            variant={unit === 'month' ? 'primary' : 'outline'}
            onClick={() => setUnit('month')}
            className="flex-1"
          >
            {t('month')}
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || !range ? (
        <EmptyState message={t('selectGroup')} />
      ) : (
        <div className="space-y-6">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <CalendarDays className="mr-1 inline h-4 w-4" />
            {fmtDate(range.start)} — {fmtDate(range.end)}
          </div>

          {/* Hafta va oy taqqoslash */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={<Percent className="h-5 w-5" />}
              label={`${t('attendance')} (${t('week')})`}
              value={`${data.week.totals.attendancePct}%`}
              tone="green"
            />
            <StatCard
              icon={<Percent className="h-5 w-5" />}
              label={`${t('attendance')} (${t('month')})`}
              value={`${data.month.totals.attendancePct}%`}
              tone="primary"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label={`${t('avgGrade')} (${t('week')})`}
              value={data.week.totals.avgGrade ?? '—'}
              tone="amber"
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label={`${t('avgGrade')} (${t('month')})`}
              value={data.month.totals.avgGrade ?? '—'}
              tone="amber"
            />
          </div>

          {/* Tanlangan davr umumiy ko'rsatkichlari */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<CalendarDays className="h-5 w-5" />} label={t('lessons')} value={range.totals.lessonsCount} />
            <StatCard
              icon={<ClipboardList className="h-5 w-5" />}
              label={t('homework')}
              value={range.totals.homeworksCount}
              tone="primary"
            />
            <StatCard
              icon={<Percent className="h-5 w-5" />}
              label={t('submittedCount')}
              value={`${range.totals.submissionPct}%`}
              tone="green"
            />
            <StatCard
              icon={<Star className="h-5 w-5" />}
              label={t('avgGrade')}
              value={range.totals.avgGrade ?? '—'}
              tone="amber"
            />
          </div>

          {/* Davomat diagrammasi */}
          {range.students.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t('attendance')} (%) — {unit === 'week' ? t('week') : t('month')}
              </h2>
              <BarChart
                data={range.students.map((s) => ({
                  label: s.student.firstName,
                  value: Math.round(s.attendancePct),
                  color: s.attendancePct >= 80 ? '#10b981' : s.attendancePct >= 50 ? '#f59e0b' : '#ef4444',
                }))}
                suffix="%"
                height={150}
              />
            </section>
          )}

          {/* O'quvchilar jadvali */}
          {range.students.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <>
              {/* Mobil: kartalar */}
              <div className="space-y-3 md:hidden">
                {range.students.map((s) => (
                  <div
                    key={s.student.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar url={s.student.avatarUrl} name={`${s.student.firstName} ${s.student.lastName}`} size="sm" />
                      <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200">
                        {s.student.firstName} {s.student.lastName}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-800/60">
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{s.attendancePct}%</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{t('attendance')}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-800/60">
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {s.homework.submitted}/{s.homework.assigned}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{t('homework')}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-800/60">
                        <div className="flex items-center justify-center gap-1 text-sm font-bold text-amber-500">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {s.avgGrade ?? '—'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{t('avgGrade')}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      {t('came')}: {s.present} · {t('notCame')}: {s.absent} · {t('notSubmitted')}: {s.homework.missed}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: jadval */}
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block dark:border-slate-700 dark:bg-slate-900">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                    <th className="px-4 py-3">{t('student')}</th>
                    <th className="px-4 py-3">{t('attendance')}</th>
                    <th className="px-4 py-3">{t('homework')}</th>
                    <th className="px-4 py-3">{t('avgGrade')}</th>
                  </tr>
                </thead>
                <tbody>
                  {range.students.map((s) => (
                    <tr key={s.student.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar url={s.student.avatarUrl} name={`${s.student.firstName} ${s.student.lastName}`} size="sm" />
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {s.student.firstName} {s.student.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{s.attendancePct}%</span>
                        <div className="text-xs text-slate-400">
                          {t('came')}: {s.present} · {t('notCame')}: {s.absent}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-600 dark:text-slate-300">
                          {s.homework.submitted}/{s.homework.assigned}
                        </div>
                        <div className="text-xs text-slate-400">
                          {t('late')}: {s.homework.late} · {t('notSubmitted')}: {s.homework.missed}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 font-bold text-amber-500">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          {s.avgGrade ?? '—'}
                        </span>
                        <div className="text-xs text-slate-400">
                          {t('done')}: {s.homework.done} · {t('wrong')}: {s.homework.wrong}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}