import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, Eye, Users } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Input,
  Select,
  Modal,
  ConfirmDialog,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  Pagination,
  Avatar,
} from '../../components/ui';
import { dayName, fmtDate, fmtLessonDays, fmtMoney, dayShort } from '../../lib/format';
import type { GroupListItem, GroupDetail, GroupDeletionInfo, Paginated } from '../../lib/types';

const emptyForm = { name: '', level: '', lessonDays: [] as number[], lessonTime: '14:00', monthlyPrice: '' };

export function GroupsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<GroupListItem> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GroupListItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [viewGroup, setViewGroup] = useState<GroupDetail | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const [delInfo, setDelInfo] = useState<GroupDeletionInfo | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/groups', { params: { page, pageSize: 20, search: debounced } });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setTimeout(() => {
      setPage(1);
      setDebounced(search.trim());
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (g: GroupListItem) => {
    setEditing(g);
    setForm({
      name: g.name,
      level: g.level,
      lessonDays: [...g.lessonDays],
      lessonTime: g.lessonTime,
      monthlyPrice: String(g.monthlyPrice),
    });
    setModalOpen(true);
  };

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      lessonDays: f.lessonDays.includes(d) ? f.lessonDays.filter((x) => x !== d) : [...f.lessonDays, d],
    }));
  };

  const save = async () => {
    if (form.name.trim().length < 1) {
      toast(t('groupName') + ': majburiy', 'error');
      return;
    }
    if (form.lessonDays.length === 0) {
      toast(t('lessonDays') + ': kamida 1 kun', 'error');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.lessonTime)) {
      toast(t('lessonTime') + ': HH:MM', 'error');
      return;
    }
    const price = parseInt(form.monthlyPrice, 10);
    if (isNaN(price) || price < 0) {
      toast(t('monthlyPrice') + ': noto\'g\'ri', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        level: form.level.trim() || 'Beginner',
        lessonDays: [...form.lessonDays].sort((a, b) => a - b),
        lessonTime: form.lessonTime,
        monthlyPrice: price,
      };
      if (editing) {
        await api.patch(`/groups/${editing.id}`, payload);
        toast(t('edit') + ': ' + t('success'));
      } else {
        await api.post('/groups', payload);
        toast(t('createGroup') + ': ' + t('success'));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const view = async (g: GroupListItem) => {
    setViewOpen(true);
    setViewGroup(null);
    setViewLoading(true);
    try {
      const { data: d } = await api.get(`/groups/${g.id}`);
      setViewGroup(d);
    } catch (e: any) {
      toast(errMsg(e), 'error');
      setViewOpen(false);
    } finally {
      setViewLoading(false);
    }
  };

  const askDelete = async (g: GroupListItem) => {
    try {
      const { data } = await api.get(`/groups/${g.id}/deletion-info`);
      setDelInfo(data);
      setConfirming(g.id);
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const doDelete = async () => {
    if (!confirming) return;
    setDeleting(true);
    try {
      await api.delete(`/groups/${confirming}`);
      toast(t('delete') + ': ' + t('success'));
      setConfirming(null);
      setDelInfo(null);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('groups')}
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('createGroup')}
          </Button>
        }
      />

      <div className="mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} className="max-w-sm" />
      </div>

      {loading && !data && <Spinner label={t('loading')} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.items.map((g) => (
                <div
                  key={g.id}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-slate-800 dark:text-slate-100">{g.name}</span>
                        <Badge color="indigo">{g.level}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {fmtLessonDays(g.lessonDays)} · {g.lessonTime}
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {fmtMoney(g.monthlyPrice)}
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                        <Users className="h-3.5 w-3.5" /> {g.studentsCount} {t('students').toLowerCase()}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => view(g)}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title={t('open')}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(g)}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(g)}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {/* Create/Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('edit') : t('createGroup')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={save} loading={saving}>
              {t('save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={t('groupName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label={t('level')} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="Beginner / Elementary / ..." />
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{t('lessonDays')} *</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`touch-target min-w-11 shrink-0 rounded-xl border px-2 text-sm font-bold ${
                    form.lessonDays.includes(d)
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                  title={dayName(d)}
                >
                  {dayShort(d)}
                </button>
              ))}
            </div>
            <div className="mt-1 text-xs text-slate-400">{form.lessonDays.map((d) => dayName(d)).join(', ')}</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('lessonTime')}
              type="time"
              value={form.lessonTime}
              onChange={(e) => setForm({ ...form, lessonTime: e.target.value })}
            />
            <Input
              label={t('monthlyPrice')}
              type="number"
              inputMode="numeric"
              value={form.monthlyPrice}
              onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })}
              placeholder="300000"
            />
          </div>
        </div>
      </Modal>

      {/* View students in group */}
      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={viewGroup?.name ?? ''} size="lg">
        {viewGroup && !viewLoading ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm text-slate-500">
              <Badge color="indigo">{viewGroup.level}</Badge>
              <span>{fmtLessonDays(viewGroup.lessonDays)} · {viewGroup.lessonTime}</span>
              <span>{fmtMoney(viewGroup.monthlyPrice)}</span>
            </div>
            {viewGroup.students.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{t('empty')}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {viewGroup.students.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar url={s.avatarUrl} name={`${s.firstName} ${s.lastName}`} size="sm" />
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {s.firstName} {s.lastName}
                        </div>
                        <div className="text-xs text-slate-400">@{s.login}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {fmtMoney(s.effectivePrice)}
                      </div>
                      {s.customPrice !== null && (
                        <div className="text-xs text-amber-500">{t('customPrice')}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Spinner label={t('loading')} />
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirming}
        title={t('delete')}
        message={
          delInfo ? (
            <span>
              {t('deleteGroupConfirm')}
              <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <div>{t('videosRasmsMaterials')}: {delInfo.materialsCount}</div>
                <div>{t('homework')}: {delInfo.homeworksCount}</div>
                <div>{t('students')}: {delInfo.studentsCount}</div>
              </div>
            </span>
          ) : (
            t('loading')
          )
        }
        confirmText={t('delete')}
        onConfirm={doDelete}
        onCancel={() => {
          setConfirming(null);
          setDelInfo(null);
        }}
        loading={deleting}
      />
    </div>
  );
}