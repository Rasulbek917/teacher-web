import React, { useCallback, useEffect, useState } from 'react';
import { Star, ChevronRight, ArrowLeft, Filter } from 'lucide-react';
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
import { GradeModal } from '../../components/GradeModal';
import { fmtDate } from '../../lib/format';
import { submissionStatusMeta } from '../../lib/homeworkStatus';
import type { GroupOption, GroupSummaryRow, StudentHomeworksRow, Submission } from '../../lib/types';

export function GradesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useState('');
  const [summary, setSummary] = useState<GroupSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);

  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [rows, setRows] = useState<StudentHomeworksRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [gradeTarget, setGradeTarget] = useState<{ submission: Submission; studentName: string } | null>(null);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    api.get('/groups/options').then(({ data }) => {
      setGroups(data);
      if (data.length) setGroupId(data[0].id);
    });
  }, []);

  const loadSummary = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/submissions/group/${groupId}/summary`);
      setSummary(data);
    } catch (e: any) {
      setError(errMsg(e, t('error')));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const openStudent = async (row: GroupSummaryRow) => {
    setSelected({ id: row.student.id, name: `${row.student.firstName} ${row.student.lastName}` });
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/submissions/student/${row.student.id}`, { params: { groupId } });
      setRows(data);
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const reloadDetail = async () => {
    if (!selected) return;
    const { data } = await api.get(`/submissions/student/${selected.id}`, { params: { groupId } });
    setRows(data);
    loadSummary();
  };

  const grade = async (gradeValue: number | null, comment: string) => {
    if (!gradeTarget) return;
    setGrading(true);
    try {
      await api.patch(`/submissions/${gradeTarget.submission.id}/review`, {
        grade: gradeValue,
        comment,
      });
      toast(t('gradeSaved'), 'success');
      setGradeTarget(null);
      reloadDetail();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setGrading(false);
    }
  };

  const statusBadge = (s: string, reviewed: boolean) => {
    const meta = submissionStatusMeta(reviewed, s as any);
    return <Badge color={meta.color}>{t(meta.key)}</Badge>;
  };

  const visible = onlyUnchecked ? summary.filter((s) => s.uncheckedCount > 0) : summary;

  return (
    <div>
      <PageHeader title={t('grades')} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Select label={t('group')} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.length === 0 && <option value="">{t('empty')}</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={onlyUnchecked}
            onChange={(e) => setOnlyUnchecked(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          {t('onlyUnchecked')}
        </label>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadSummary} />
      ) : visible.length === 0 ? (
        <EmptyState message={t('empty')} />
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <button
              key={row.student.id}
              type="button"
              onClick={() => openStudent(row)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <Avatar url={row.student.avatarUrl} name={`${row.student.firstName} ${row.student.lastName}`} />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    {row.student.firstName} {row.student.lastName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{t('gradedCount')}: {row.gradedCount}</span>
                    {row.uncheckedCount > 0 && (
                      <span className="text-red-500">{t('unchecked')}: {row.uncheckedCount}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="flex items-center gap-1 text-lg font-bold text-amber-500">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {row.averageGrade ?? '—'}
                  </div>
                  <div className="text-[10px] uppercase text-slate-400">{t('avgGrade')}</div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Student detail sheet */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-100 dark:bg-slate-950">
          <header className="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selected.name}</div>
          </header>
          <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4">
            {detailLoading ? (
              <Spinner label={t('loading')} />
            ) : rows.length === 0 ? (
              <EmptyState message={t('empty')} />
            ) : (
              <div className="space-y-3">
                {rows.map((r) => (
                  <div
                    key={r.homeworkId}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-100">{r.title}</div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {r.dueAt ? fmtDate(r.dueAt) : t('noDeadline')}
                        </div>
                      </div>
                      {statusBadge(r.status, !!(r.submission?.result || r.submission?.reviewedAt))}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        {r.submission?.grade != null ? (
                          <span className="flex items-center gap-1 font-bold text-amber-500">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            {r.submission.grade}
                          </span>
                        ) : r.submission ? (
                          <span className="text-xs text-slate-400">{t('unchecked')}</span>
                        ) : (
                          <span className="text-xs text-slate-400">{t('didNotSubmit')}</span>
                        )}
                        {r.submission?.comment && (
                          <span className="truncate text-xs text-slate-400">{r.submission.comment}</span>
                        )}
                      </div>
                      {r.submission && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setGradeTarget({
                              submission: r.submission!,
                              studentName: selected.name,
                            })
                          }
                        >
                          {r.submission.result || r.submission.reviewedAt ? t('edit') : t('putGrade')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <GradeModal
        open={!!gradeTarget}
        onClose={() => setGradeTarget(null)}
        submission={gradeTarget?.submission ?? null}
        studentName={gradeTarget?.studentName}
        saving={grading}
        onSave={grade}
      />
    </div>
  );
}