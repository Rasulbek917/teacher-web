import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Paperclip,
  X,
  Zap,
  CheckCircle2,
  ListChecks,
} from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  ConfirmDialog,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  Pagination,
  Avatar,
  IconButton,
} from '../../components/ui';
import { GradeModal } from '../../components/GradeModal';
import { fmtDateTime } from '../../lib/format';
import { homeworkStatusMeta, submissionStatusMeta } from '../../lib/homeworkStatus';
import type { GroupOption, HomeworkItem, HomeworkSubmissions, Paginated, Submission } from '../../lib/types';

const emptyForm = { groupId: '', title: '', description: '', dueAt: '' };
const ACCEPT = 'image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt';

function toInputValue(iso: string): string {
  // UTC -> Asia/Tashkent (+5) devor vaqti
  return new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function HomeworkPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<HomeworkItem> | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groupId, setGroupId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ---- Create / edit ----
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HomeworkItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [keepUrls, setKeepUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- Submissions / grading ----
  const [subs, setSubs] = useState<HomeworkSubmissions | null>(null);
  const [subsOpen, setSubsOpen] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [quickGrades, setQuickGrades] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [gradeTarget, setGradeTarget] = useState<{ submission: Submission; studentName: string } | null>(null);
  const [grading, setGrading] = useState(false);

  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/homework', {
        params: { page, pageSize: 10, search: debounced, groupId },
      });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, groupId, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/groups/options').then(({ data }) => setGroups(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      setDebounced(search.trim());
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const buildQuickGrades = (d: HomeworkSubmissions) => {
    const map: Record<string, string> = {};
    d.students.forEach((s) => {
      if (s.submission) {
        map[s.submission.id] = s.submission.grade != null ? String(s.submission.grade) : '';
      }
    });
    return map;
  };

  // ---------- Create / edit ----------
  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, groupId: groups.length ? groups[0].id : '' });
    setNewFiles([]);
    setExistingUrls([]);
    setKeepUrls([]);
    setModalOpen(true);
  };

  const openEdit = (h: HomeworkItem) => {
    setEditing(h);
    setForm({
      groupId: h.groupId,
      title: h.title,
      description: h.description ?? '',
      dueAt: h.dueAt ? toInputValue(h.dueAt) : '',
    });
    setNewFiles([]);
    setExistingUrls(h.attachmentUrls ?? []);
    setKeepUrls(h.attachmentUrls ?? []);
    setModalOpen(true);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setNewFiles((prev) => [...prev, ...Array.from(files)]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!form.groupId) return toast(t('needGroup'), 'error');
    if (!form.title.trim()) return toast(t('needTitle'), 'error');

    const fd = new FormData();
    if (!editing) fd.append('groupId', form.groupId);
    fd.append('title', form.title.trim());
    fd.append('description', form.description.trim());
    fd.append('dueAt', form.dueAt ? new Date(form.dueAt).toISOString() : '');
    if (editing) fd.append('keepAttachmentUrls', JSON.stringify(keepUrls));
    newFiles.forEach((f) => fd.append('files', f));

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/homework/${editing.id}`, fd);
        toast(t('save') + ': ' + t('success'));
      } else {
        await api.post('/homework', fd);
        toast(t('homeworkAssigned'), 'success');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Submissions ----------
  const viewSubmissions = async (h: HomeworkItem) => {
    setSubsOpen(true);
    setSubsLoading(true);
    setSubs(null);
    setQuickMode(false);
    try {
      const { data: d } = await api.get(`/submissions/homework/${h.id}`);
      setSubs(d);
      setQuickGrades(buildQuickGrades(d));
    } catch (e: any) {
      toast(errMsg(e), 'error');
      setSubsOpen(false);
    } finally {
      setSubsLoading(false);
    }
  };

  const refreshSubs = async () => {
    if (!subs) return;
    const { data: d } = await api.get(`/submissions/homework/${subs.homework.id}`);
    setSubs(d);
    setQuickGrades(buildQuickGrades(d));
  };

  const saveGrade = async (grade: number | null, comment: string) => {
    if (!gradeTarget) return;
    setGrading(true);
    try {
      await api.patch(`/submissions/${gradeTarget.submission.id}/review`, { grade, comment });
      toast(t('gradeSaved'), 'success');
      setGradeTarget(null);
      await refreshSubs();
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setGrading(false);
    }
  };

  const receive = async (studentId: string) => {
    if (!subs) return;
    setReceivingId(studentId);
    try {
      await api.post(`/submissions/homework/${subs.homework.id}/student/${studentId}/receive`);
      toast(t('markReceived'), 'success');
      await refreshSubs();
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setReceivingId(null);
    }
  };

  const saveAll = async () => {
    if (!subs) return;
    const reviews = subs.students
      .filter((s) => s.submission)
      .map((s) => {
        const raw = quickGrades[s.submission!.id] ?? '';
        if (raw === '') return null;
        const g = parseInt(raw, 10);
        if (Number.isNaN(g) || g < 0 || g > 100) return null;
        return { submissionId: s.submission!.id, grade: g, comment: s.submission!.comment ?? '' };
      })
      .filter(Boolean) as { submissionId: string; grade: number; comment: string }[];

    if (!reviews.length) return toast(t('gradeRange'), 'error');
    setBulkSaving(true);
    try {
      await api.patch('/submissions/bulk-review', { reviews });
      toast(t('allGradesSaved'), 'success');
      await refreshSubs();
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirming) return;
    setDeleting(true);
    try {
      await api.delete(`/homework/${confirming}`);
      toast(t('delete') + ': ' + t('success'));
      setConfirming(null);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const submittedInfo = useMemo(() => {
    if (!subs) return { submitted: 0, notSubmitted: 0 };
    const submitted = subs.students.filter((s) => !!s.submission).length;
    return { submitted, notSubmitted: subs.students.length - submitted };
  }, [subs]);

  return (
    <div>
      <PageHeader
        title={t('homework')}
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('createHomework')}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} />
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="all">
            {t('selectGroup')} — {t('all')}
          </option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </div>

      {loading && !data && <Spinner label={t('loading')} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <div className="space-y-3">
              {data.items.map((h) => {
                const meta = homeworkStatusMeta(h);
                return (
                  <div
                    key={h.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                            {h.title}
                          </span>
                          <Badge color={meta.color} dot>
                            {t(meta.key)}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Badge color="indigo">{h.groupName}</Badge>
                          <span>
                            {t('deadline')}:{' '}
                            {h.dueAt ? fmtDateTime(h.dueAt) : t('noDeadline')}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {t('submittedCount')}: {h.submittedCount}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('notSubmittedStudents')}: {h.notSubmittedCount}
                          </span>
                          {h.attachmentUrls?.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <Paperclip className="h-3.5 w-3.5" /> {h.attachmentUrls.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconButton
                          onClick={() => viewSubmissions(h)}
                          className="hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-500/10"
                          title={t('view')}
                        >
                          <Eye className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          onClick={() => openEdit(h)}
                          className="hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-500/10"
                          title={t('edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          onClick={() => setConfirming(h.id)}
                          className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                          title={t('delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('edit') : t('createHomework')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? t('save') : t('assignHomework')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label={t('group')}
            value={form.groupId}
            onChange={(e) => setForm({ ...form, groupId: e.target.value })}
            disabled={!!editing}
          >
            <option value="">{t('selectGroup')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>

          <Input
            label={t('homeworkTitle')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={t('homeworkTitle')}
            maxLength={150}
          />

          <Textarea
            label={t('description')}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t('description')}
            className="min-h-[72px]"
          />

          <Input
            label={t('deadline')}
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
          />

          {/* Attachments (optional) */}
          <div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <Button variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()}>
              <Paperclip className="h-4 w-4" /> {t('attachmentsOptional')}
            </Button>
            <p className="mt-1.5 text-xs text-slate-400">{t('attachFilesHint')}</p>

            {(existingUrls.length > 0 || newFiles.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {existingUrls.map((url) => {
                  const kept = keepUrls.includes(url);
                  return (
                    <span
                      key={url}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                        kept
                          ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          : 'border-dashed border-slate-300 text-slate-400 line-through dark:border-slate-600'
                      }`}
                    >
                      <Paperclip className="h-3 w-3" />
                      {url.split('/').pop()}
                      <button
                        type="button"
                        onClick={() =>
                          setKeepUrls((prev) =>
                            prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
                          )
                        }
                        title={t('removeFile')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                {newFiles.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-xs text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200"
                  >
                    <Paperclip className="h-3 w-3" />
                    {f.name}
                    <button
                      type="button"
                      onClick={() => setNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      title={t('removeFile')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Submissions / grading modal */}
      <Modal
        open={subsOpen}
        onClose={() => setSubsOpen(false)}
        title={subs ? subs.homework.title : t('loading')}
        size="xl"
        footer={
          quickMode && subs ? (
            <>
              <Button variant="secondary" onClick={() => setSubsOpen(false)}>
                {t('close')}
              </Button>
              <Button onClick={saveAll} loading={bulkSaving}>
                {t('saveAll')}
              </Button>
            </>
          ) : undefined
        }
      >
        {subsLoading ? (
          <Spinner label={t('loading')} />
        ) : subs ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Badge color="indigo">{subs.homework.groupName}</Badge>
              <span>
                {t('deadline')}: {subs.homework.dueAt ? fmtDateTime(subs.homework.dueAt) : t('noDeadline')}
              </span>
              <span>· {t('submittedCount')}: {submittedInfo.submitted}/{subs.students.length}</span>
              <span>· {t('notSubmittedStudents')}: {submittedInfo.notSubmitted}</span>
            </div>

            {subs.homework.description && (
              <p className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {subs.homework.description}
              </p>
            )}

            {subs.homework.attachmentUrls?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {subs.homework.attachmentUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-slate-50 dark:border-slate-700 dark:text-primary-300 dark:hover:bg-slate-800"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {url.split('/').pop()}
                  </a>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <ListChecks className="h-4 w-4" /> {t('gradingList')}
              </span>
              <Button
                size="sm"
                variant={quickMode ? 'primary' : 'outline'}
                onClick={() => setQuickMode((v) => !v)}
              >
                <Zap className="h-4 w-4" /> {t('quickGrading')}
              </Button>
            </div>

            {subs.students.length === 0 ? (
              <EmptyState message={t('noStudentsInGroup')} />
            ) : quickMode ? (
              <div className="space-y-1">
                {subs.students.map((s) => (
                  <div
                    key={s.student.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar
                        url={s.student.avatarUrl}
                        name={`${s.student.firstName} ${s.student.lastName}`}
                        size="sm"
                      />
                      <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {s.student.firstName} {s.student.lastName}
                      </span>
                    </div>
                    {s.submission ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={quickGrades[s.submission.id] ?? ''}
                        onChange={(e) =>
                          setQuickGrades((p) => ({ ...p, [s.submission!.id]: e.target.value }))
                        }
                        placeholder="0–100"
                        className="h-10 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">—</span>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={receivingId === s.student.id}
                          onClick={() => receive(s.student.id)}
                        >
                          {t('markReceivedShort')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {subs.students.map((s) => {
                  const reviewed = !!(s.submission?.result || s.submission?.reviewedAt);
                  const meta = submissionStatusMeta(reviewed, s.status);
                  return (
                    <div key={s.student.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar
                          url={s.student.avatarUrl}
                          name={`${s.student.firstName} ${s.student.lastName}`}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                            {s.student.firstName} {s.student.lastName}
                          </div>
                          <div className="text-xs text-slate-400">
                            {s.submission
                              ? fmtDateTime(s.submission.submittedAt)
                              : t('didNotSubmit')}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge color={meta.color}>{t(meta.key)}</Badge>
                        <span className="w-9 text-center text-sm font-bold text-slate-800 dark:text-slate-100">
                          {s.submission?.grade ?? '—'}
                        </span>
                        {s.submission ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setGradeTarget({
                                submission: s.submission!,
                                studentName: `${s.student.firstName} ${s.student.lastName}`,
                              })
                            }
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {reviewed ? t('edit') : t('putGrade')}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={receivingId === s.student.id}
                            onClick={() => receive(s.student.id)}
                          >
                            {t('markReceivedShort')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <GradeModal
        open={!!gradeTarget}
        onClose={() => setGradeTarget(null)}
        submission={gradeTarget?.submission ?? null}
        studentName={gradeTarget?.studentName}
        saving={grading}
        onSave={saveGrade}
      />

      <ConfirmDialog
        open={!!confirming}
        title={t('delete')}
        message={t('deleteHomeworkConfirm')}
        onConfirm={doDelete}
        onCancel={() => setConfirming(null)}
        loading={deleting}
      />
    </div>
  );
}
