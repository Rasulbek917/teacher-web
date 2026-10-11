import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Users, ClipboardList } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Select,
  Input,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  Avatar,
} from '../../components/ui';
import { fmtDate, todayStr } from '../../lib/format';
import type { AttendancePageData, GroupOption } from '../../lib/types';

export function AttendancePage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [homeworkId, setHomeworkId] = useState('');
  const [data, setData] = useState<AttendancePageData | null>(null);
  const [present, setPresent] = useState<Record<string, boolean | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [onlyNotSubmitted, setOnlyNotSubmitted] = useState(false);

  useEffect(() => {
    api.get('/groups/options').then(({ data: g }) => {
      setGroups(g);
      if (g.length) setGroupId(g[0].id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/attendance', {
        params: { groupId, date, homeworkId: homeworkId || undefined },
      });
      setData(d);
      const init: Record<string, boolean | null> = {};
      d.students.forEach((s: any) => {
        init[s.student.id] = s.present;
      });
      setPresent(init);
      if (d.selectedHomework) setHomeworkId(d.selectedHomework.id);
    } catch (e: any) {
      setError(errMsg(e, t('error')));
    } finally {
      setLoading(false);
    }
  }, [groupId, date, homeworkId, t]);

  useEffect(() => {
    load();
  }, [groupId, date, homeworkId]);

  const cycle = (id: string) => {
    setPresent((p) => {
      const cur = p[id];
      const next = cur === null || cur === undefined ? true : cur === true ? false : null;
      return { ...p, [id]: next };
    });
  };

  const allPresent = () => {
    if (!data) return;
    const all: Record<string, boolean | null> = {};
    data.students.forEach((s) => (all[s.student.id] = true));
    setPresent(all);
    toast(t('allPresent'));
  };

  const save = async () => {
    if (!data) return;
    const records = data.students
      .filter((s) => present[s.student.id] === true || present[s.student.id] === false)
      .map((s) => ({ studentId: s.student.id, present: present[s.student.id] === true }));
    if (records.length === 0) {
      toast('Belgilangan o\'quvchi yo\'q', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/attendance', { groupId, date, records });
      toast(t('saveAttendance') + ': ' + t('success'));
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s: string | null) => {
    if (!s) return <span className="text-xs text-slate-400">—</span>;
    const map: Record<string, { label: string; color: any }> = {
      SUBMITTED: { label: t('submitted'), color: 'green' },
      LATE: { label: t('late'), color: 'amber' },
      MISSING: { label: t('notSubmitted'), color: 'red' },
      PENDING: { label: t('pending'), color: 'slate' },
    };
    const m = map[s] ?? { label: s, color: 'slate' };
    return <Badge color={m.color}>{m.label}</Badge>;
  };

  const visibleStudents = data
    ? onlyNotSubmitted
      ? data.students.filter((s) => s.homeworkStatus !== 'SUBMITTED' && s.homeworkStatus !== 'LATE')
      : data.students
    : [];

  const counts = data
    ? {
        present: Object.values(present).filter((v) => v === true).length,
        absent: Object.values(present).filter((v) => v === false).length,
      }
    : { present: 0, absent: 0 };

  return (
    <div>
      <PageHeader title={t('attendance')} />

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
        <Select
          label={t('homework')}
          value={homeworkId}
          onChange={(e) => setHomeworkId(e.target.value)}
        >
          {data?.homeworks.map((h) => (
            <option key={h.id} value={h.id}>
              {h.title} ({fmtDate(h.dueAt)})
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
              <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500" />
              <div className="mt-1 text-lg font-bold text-emerald-600">{counts.present}</div>
              <div className="text-xs text-slate-400">{t('came')}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
              <XCircle className="mx-auto h-5 w-5 text-red-500" />
              <div className="mt-1 text-lg font-bold text-red-600">{counts.absent}</div>
              <div className="text-xs text-slate-400">{t('notCame')}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
              <ClipboardList className="mx-auto h-5 w-5 text-primary-500" />
              <div className="mt-1 text-lg font-bold text-primary-600">{data.summary.submitted}</div>
              <div className="text-xs text-slate-400">{t('submitted')}</div>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={onlyNotSubmitted}
                onChange={(e) => setOnlyNotSubmitted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {t('onlyNotSubmitted')}
            </label>
            <Button variant="outline" size="sm" onClick={allPresent}>
              <Users className="h-4 w-4" /> {t('allPresent')}
            </Button>
          </div>

          {visibleStudents.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              {visibleStudents.map((s) => {
                const v = present[s.student.id];
                return (
                  <div
                    key={s.student.id}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 p-3 last:border-0 dark:border-slate-800"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar url={s.student.avatarUrl} name={`${s.student.firstName} ${s.student.lastName}`} size="sm" />
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {s.student.firstName} {s.student.lastName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {statusBadge(s.homeworkStatus)}
                      <button
                        type="button"
                        onClick={() => cycle(s.student.id)}
                        className={`touch-target inline-flex h-11 min-w-28 items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                          v === true
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : v === false
                              ? 'border-red-500 bg-red-500 text-white'
                              : 'border-slate-300 text-slate-400 dark:border-slate-600'
                        }`}
                      >
                        {v === true ? t('came') : v === false ? t('notCame') : '—'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button onClick={save} loading={saving} size="lg">
              {t('saveAttendance')}
            </Button>
          </div>
        </>
      ) : (
        <EmptyState message={t('selectGroup')} />
      )}
    </div>
  );
}