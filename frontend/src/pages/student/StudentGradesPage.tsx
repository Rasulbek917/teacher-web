import React, { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import { PageHeader, Spinner, EmptyState, Badge, StatCard } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import type { StudentHomeworkItem } from '../../lib/types';

export function StudentGradesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<StudentHomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/my/homework', { params: { pageSize: 100 } })
      .then(({ data }) => setItems(data.items ?? []))
      .catch((e) => setError(errMsg(e, t('error'))))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const graded = useMemo(() => items.filter((i) => i.result !== null), [items]);
  const avg = useMemo(() => {
    const withGrade = graded.filter((i) => typeof i.grade === 'number');
    if (!withGrade.length) return null;
    const sum = withGrade.reduce((a, b) => a + (b.grade ?? 0), 0);
    return Math.round((sum / withGrade.length) * 10) / 10;
  }, [graded]);
  const unchecked = items.filter((i) => i.status === 'SUBMITTED' || i.status === 'LATE').filter((i) => i.result === null).length;

  return (
    <div>
      <PageHeader title={t('myGrades')} />
      {loading ? (
        <Spinner label={t('loading')} />
      ) : error ? (
        <EmptyState message={error} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={<Star className="h-5 w-5" />} label={t('avgGrade')} value={avg ?? '—'} tone="amber" />
            <StatCard icon={<Star className="h-5 w-5" />} label={t('gradedCount')} value={graded.length} tone="green" />
            <StatCard icon={<Star className="h-5 w-5" />} label={t('uncheckedCount')} value={unchecked} tone="red" />
          </div>

          {graded.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <div className="space-y-3">
              {graded.map((h) => (
                <div key={h.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{h.title}</div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {h.groupName} · {h.dueAt ? fmtDateTime(h.dueAt) : t('noDeadline')}
                      </div>
                      {h.comment && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{h.comment}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge color="green">{t('statusReviewed')}</Badge>
                      {h.grade != null && (
                        <span className="flex items-center gap-1 text-lg font-bold text-amber-500">
                          <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {h.grade}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}