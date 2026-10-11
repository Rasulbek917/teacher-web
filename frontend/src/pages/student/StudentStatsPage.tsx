import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Percent, Star, ClipboardList, CheckCircle2, XCircle } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Input,
  StatCard,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
} from '../../components/ui';
import { BarChart } from '../../components/BarChart';
import { fmtDate, fmtDateTime, todayStr } from '../../lib/format';
import type { MyStats, StatsRange } from '../../lib/types';

export function StudentStatsPage() {
  const { t } = useI18n();
  const [unit, setUnit] = useState<'week' | 'month'>('week');
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<MyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/my/statistics', { params: { unit, date } });
      setData(d);
    } catch (e: any) {
      setError(errMsg(e, t('error')));
    } finally {
      setLoading(false);
    }
  }, [unit, date, t]);

  useEffect(() => {
    load();
  }, [load]);

  const range: StatsRange | null = data ? (unit === 'week' ? data.week : data.month) : null;
  const my = range?.students?.[0];

  return (
    <div>
      <PageHeader title={t('myAttendance')} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input label={t('date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button variant={unit === 'week' ? 'primary' : 'outline'} onClick={() => setUnit('week')} className="flex-1">
            {t('week')}
          </Button>
          <Button variant={unit === 'month' ? 'primary' : 'outline'} onClick={() => setUnit('month')} className="flex-1">
            {t('month')}
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data || !range || !my ? (
        <EmptyState message={t('empty')} />
      ) : (
        <div className="space-y-5">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <CalendarDays className="mr-1 inline h-4 w-4" /> {fmtDate(range.start)} — {fmtDate(range.end)}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<Percent className="h-5 w-5" />} label={t('attendance')} value={`${my.attendancePct}%`} tone="green" />
            <StatCard icon={<ClipboardList className="h-5 w-5" />} label={t('homework')} value={`${my.homework.submitted}/${my.homework.assigned}`} tone="primary" />
            <StatCard icon={<Star className="h-5 w-5" />} label={t('avgGrade')} value={my.avgGrade ?? '—'} tone="amber" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label={t('came') + '/' + t('notCame')} value={`${my.present}/${my.absent}`} />
          </div>

          {/* Davomat kunlari */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{t('attendance')}</h2>
            {data.detail.days.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">{t('empty')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.detail.days.map((d) => (
                  <div
                    key={d.date}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
                      d.present
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    }`}
                  >
                    {d.present ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {fmtDate(d.date)}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Vazifalar tarixi */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{t('homework')}</h2>
            {data.detail.homeworks.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">{t('empty')}</p>
            ) : (
              <div className="space-y-2.5">
                {data.detail.homeworks.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{h.title}</div>
                      <div className="text-xs text-slate-400">{fmtDateTime(h.dueAt)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        color={
                          h.status === 'SUBMITTED' ? 'green' : h.status === 'LATE' ? 'amber' : h.status === 'MISSING' ? 'red' : 'slate'
                        }
                      >
                        {h.status === 'SUBMITTED'
                          ? t('submitted')
                          : h.status === 'LATE'
                            ? t('late')
                            : h.status === 'MISSING'
                              ? t('notSubmitted')
                              : t('pending')}
                      </Badge>
                      {h.grade && (
                        <span className="flex items-center gap-1 font-bold text-amber-500">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {h.grade}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}