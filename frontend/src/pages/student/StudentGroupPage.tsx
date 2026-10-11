import React, { useEffect, useState } from 'react';
import { Clock, GraduationCap, Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import { PageHeader, Spinner, EmptyState, Badge, Avatar } from '../../components/ui';
import { dayName, dayShort, fmtLessonDays, fmtMoney, tashkentDayNumber } from '../../lib/format';
import type { MyGroup } from '../../lib/types';

export function StudentGroupPage() {
  const { t } = useI18n();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/my/groups')
      .then(({ data }) => setGroups(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = tashkentDayNumber();

  return (
    <div>
      <PageHeader title={t('myGroup')} />
      {loading ? (
        <Spinner label={t('loading')} />
      ) : groups.length === 0 ? (
        <EmptyState message={t('empty')} />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-slate-800 dark:text-slate-100">{g.name}</span>
                      <Badge color="indigo">{g.level}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <Avatar url={g.teacher.avatarUrl} name={`${g.teacher.firstName} ${g.teacher.lastName}`} size="xs" />
                      {t('teacherOfGroup')}: {g.teacher.firstName} {g.teacher.lastName}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" /> {t('lessonTime')}
                  </div>
                  <div className="mt-0.5 text-base font-bold text-slate-800 dark:text-slate-100">{g.lessonTime}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Wallet className="h-3.5 w-3.5" /> {t('monthlyPrice')}
                  </div>
                  <div className="mt-0.5 text-base font-bold text-slate-800 dark:text-slate-100">{fmtMoney(g.effectivePrice)}</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{t('lessonDays')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <div
                      key={d}
                      title={dayName(d)}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${
                        g.lessonDays.includes(d)
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600'
                      } ${d === today ? 'ring-2 ring-primary-400 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                    >
                      {dayShort(d)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}