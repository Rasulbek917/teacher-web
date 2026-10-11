import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Input,
  Modal,
  ConfirmDialog,
  Badge,
  Avatar,
  Spinner,
  ErrorState,
  EmptyState,
  Pagination,
  DataTable,
} from '../../components/ui';
import { formatPhoneInput, isValidPhone, fmtDate } from '../../lib/format';
import type { Paginated, TeacherListItem, TeacherDeletionInfo } from '../../lib/types';

const empty = {
  firstName: '',
  lastName: '',
  phone: '',
  login: '',
  password: '',
  centerName: '',
  city: '',
};

export function TeachersPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<TeacherListItem> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherListItem | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const [delInfo, setDelInfo] = useState<TeacherDeletionInfo | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [typedLogin, setTypedLogin] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/teachers', { params: { page, pageSize: 20, search: debounced } });
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
    setForm(empty);
    setModalOpen(true);
  };

  const openEdit = (teacher: TeacherListItem) => {
    setEditing(teacher);
    setForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      phone: teacher.phone,
      login: teacher.login,
      password: '',
      centerName: teacher.centerName,
      city: teacher.city,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      toast('Ism/Familiya: kamida 2 belgi', 'error');
      return;
    }
    if (!isValidPhone(form.phone)) {
      toast(t('invalidPhone'), 'error');
      return;
    }
    if (!/^[A-Za-z0-9_]{4,}$/.test(form.login.trim())) {
      toast('Login: a-z, A-Z, 0-9, _ — kamida 4 belgi', 'error');
      return;
    }
    if (!editing && form.password.length < 6) {
      toast(t('password') + ': kamida 6 belgi', 'error');
      return;
    }
    if (editing && form.password && form.password.length < 6) {
      toast(t('password') + ': kamida 6 belgi', 'error');
      return;
    }
    if (form.centerName.trim().length < 2 || form.city.trim().length < 2) {
      toast(t('centerName') + '/' + t('city') + ': kamida 2 belgi', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone,
        login: form.login.trim(),
        centerName: form.centerName.trim(),
        city: form.city.trim(),
      };
      if (editing) {
        if (form.password) payload.newPassword = form.password;
        await api.patch(`/teachers/${editing.id}`, payload);
        toast(t('editTeacher') + ': ' + t('success'));
      } else {
        payload.password = form.password;
        await api.post('/teachers', payload);
        toast(t('addTeacher') + ': ' + t('success'));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const askDelete = async (teacher: TeacherListItem) => {
    try {
      const { data } = await api.get(`/teachers/${teacher.id}/deletion-info`);
      setDelInfo(data);
      setConfirming(teacher.id);
      setTypedLogin('');
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const doDelete = async () => {
    if (!confirming || !delInfo) return;
    if (typedLogin !== delInfo.teacher.login) {
      toast("Login noto'g'ri", 'error');
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/teachers/${confirming}`, { data: { login: typedLogin } });
      toast(t('teacherDeleted'));
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
        title={t('teachers')}
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('addTeacher')}
          </Button>
        }
      />

      <div className="mb-4 flex gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('search')}
          className="max-w-sm"
        />
      </div>

      {loading && !data && <Spinner label={t('loading')} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <DataTable
              columns={[
                { key: 'name', label: t('name') },
                { key: 'center', label: t('centerName') },
                { key: 'phone', label: t('phone') },
                { key: 'counts', label: t('groups') + '/' + t('students') },
                { key: 'created', label: t('registeredAt') },
                { key: 'actions', label: t('actions'), className: 'text-right' },
              ]}
              rows={data.items}
              renderRow={(r: TeacherListItem) => [
                <div key="n" className="flex items-center gap-2.5">
                  <Avatar url={r.avatarUrl} name={`${r.firstName} ${r.lastName}`} size="sm" />
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">
                      {r.firstName} {r.lastName}
                    </div>
                    <div className="text-xs text-slate-400">@{r.login}</div>
                  </div>
                </div>,
                <div key="c" className="text-slate-600 dark:text-slate-300">
                  {r.centerName}
                  <div className="text-xs text-slate-400">{r.city}</div>
                </div>,
                <span key="p" className="text-slate-600 dark:text-slate-300">{r.phone}</span>,
                <span key="g" className="text-slate-600 dark:text-slate-300">
                  {r.groupsCount} / {r.studentsCount}
                </span>,
                <span key="d" className="text-slate-500">{fmtDate(r.createdAt)}</span>,
                <div key="a" className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => askDelete(r)}
                    className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>,
              ]}
            />
          )}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {/* Create/Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('editTeacher') : t('addTeacher')}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('firstName')} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Input label={t('lastName')} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          <Input
            label={t('phone')}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
            placeholder="+998 90 123 45 67"
            inputMode="tel"
          />
          <Input label={t('registerTeacher')} value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <Input label={t('centerName')} value={form.centerName} onChange={(e) => setForm({ ...form, centerName: e.target.value })} />
          <Input label={t('city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input
            label={editing ? t('setNewPassword') : t('password')}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Kamida 6 belgi"
          />
        </div>
      </Modal>

      {/* Delete confirm with typed login */}
      <ConfirmDialog
        open={!!confirming}
        title={t('deleteTeacherConfirm') ? t('delete') : t('delete')}
        message={
          delInfo ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge color="red">{delInfo.teacher.firstName} {delInfo.teacher.lastName}</Badge>
              </div>
              <p>
                {t('deleteTeacherConfirm', { n1: delInfo.groupsCount, n2: delInfo.studentsCount })}
              </p>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('typeLoginToConfirm')} <b>{delInfo.teacher.login}</b>
                </div>
                <Input value={typedLogin} onChange={(e) => setTypedLogin(e.target.value)} autoComplete="off" />
              </div>
            </div>
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
        confirmDisabled={typedLogin !== delInfo?.teacher.login}
        loading={deleting}
      />
    </div>
  );
}