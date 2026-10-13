import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, KeyRound, Ban, CheckCircle2, XCircle, Send } from 'lucide-react';
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
import { formatPhoneInput, isValidPhone, fmtDate, fmtMoney } from '../../lib/format';
import type { GroupOption, Paginated, StudentListItem, StudentDeletionInfo } from '../../lib/types';

interface MembershipForm {
  groupId: string;
  customPrice: string;
}

const emptyForm = {
  firstName: '',
  lastName: '',
  phone: '',
  parentPhone: '',
  login: '',
  password: '',
  memberships: [{ groupId: '', customPrice: '' }] as MembershipForm[],
};

export function StudentsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<StudentListItem> | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groupId, setGroupId] = useState('all');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StudentListItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [pwdTarget, setPwdTarget] = useState<StudentListItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const [delInfo, setDelInfo] = useState<StudentDeletionInfo | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [tgTarget, setTgTarget] = useState<StudentListItem | null>(null);
  const [tgInfo, setTgInfo] = useState<
    { linked: boolean; url: string; botUsername: string } | null
  >(null);
  const [tgLoading, setTgLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/students', {
        params: { page, pageSize: 20, search: debounced, groupId, status },
      });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, groupId, status, t]);

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

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      memberships: groups.length ? [{ groupId: groups[0].id, customPrice: '' }] : [],
    });
    setModalOpen(true);
  };

  const openEdit = (s: StudentListItem) => {
    setEditing(s);
    setForm({
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone,
      parentPhone: s.parentPhone || '',
      login: s.login,
      password: '',
      memberships:
        s.groups.length > 0
          ? s.groups.map((g) => ({ groupId: g.id, customPrice: g.customPrice ? String(g.customPrice) : '' }))
          : groups.length
            ? [{ groupId: groups[0].id, customPrice: '' }]
            : [],
    });
    setModalOpen(true);
  };

  const updateMembership = (i: number, patch: Partial<MembershipForm>) => {
    setForm((f) => ({
      ...f,
      memberships: f.memberships.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    }));
  };

  const removeMembership = (i: number) => {
    setForm((f) => ({ ...f, memberships: f.memberships.filter((_, j) => j !== i) }));
  };

  const selectedIds = form.memberships.map((m) => m.groupId);
  const available: GroupOption[] = groups.filter((g) => !selectedIds.includes(g.id));

  const save = async () => {
    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      toast('Ism/Familiya: kamida 2 belgi', 'error');
      return;
    }
    if (!isValidPhone(form.phone)) {
      toast(t('invalidPhone'), 'error');
      return;
    }
    if (!form.parentPhone || !isValidPhone(form.parentPhone)) {
      toast('Ota-onasi telefoni: ' + '+998 XX XXX XX XX', 'error');
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
    const memberships = form.memberships
      .filter((m) => m.groupId)
      .map((m) => ({
        groupId: m.groupId,
        customPrice: m.customPrice ? parseInt(m.customPrice, 10) : undefined,
      }))
      .filter((m) => m.customPrice === undefined || !isNaN(m.customPrice));
    if (memberships.length === 0) {
      toast(t('group') + ': kamida 1 guruh', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/students/${editing.id}`, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone,
          parentPhone: form.parentPhone,
          memberships,
        });
        toast(t('edit') + ': ' + t('success'));
      } else {
        await api.post('/students', {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone,
          parentPhone: form.parentPhone,
          login: form.login.trim(),
          password: form.password,
          memberships,
        });
        toast(t('addStudent') + ': ' + t('success'));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!pwdTarget) return;
    if (newPassword.length < 6) {
      toast(t('password') + ': kamida 6 belgi', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      await api.patch(`/students/${pwdTarget.id}/password`, { newPassword });
      toast(t('resetPassword') + ': ' + t('success'));
      setPwdTarget(null);
      setNewPassword('');
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const toggleBlock = async (s: StudentListItem) => {
    try {
      const { data } = await api.patch(`/students/${s.id}/block`, {
        isBlocked: !s.isBlocked,
      });
      // Boshqa o'qituvchi guruhida ham bo'lsa, backend ogohlantiradi.
      if (data?.warning) toast(data.warning);
      else toast(s.isBlocked ? t('unblock') : t('block'));
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const askDelete = async (s: StudentListItem) => {
    try {
      const { data } = await api.get(`/students/${s.id}/deletion-info`);
      setDelInfo(data);
      setConfirming(s.id);
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const doDelete = async () => {
    if (!confirming) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/students/${confirming}`);
      toast(
        data.accountDeleted ? t('delete') + ': ' + t('success') : t('delete') + ': ' + t('success'),
      );
      setConfirming(null);
      setDelInfo(null);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openTelegram = async (s: StudentListItem) => {
    setTgTarget(s);
    setTgInfo(null);
    setTgLoading(true);
    try {
      const { data } = await api.post(`/students/${s.id}/telegram-link`);
      setTgInfo(data);
    } catch (e: any) {
      toast(errMsg(e), 'error');
      setTgTarget(null);
    } finally {
      setTgLoading(false);
    }
  };

  const copyTgLink = async () => {
    if (!tgInfo?.url) return;
    try {
      await navigator.clipboard.writeText(tgInfo.url);
      toast(t('linkCopied'));
    } catch {
      toast(tgInfo.url);
    }
  };

  const unlinkTg = async () => {
    if (!tgTarget) return;
    try {
      await api.post(`/students/${tgTarget.id}/telegram-unlink`);
      toast(t('telegramUnlinked'));
      setTgInfo((i) => (i ? { ...i, linked: false } : i));
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('students')}
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('addStudent')}
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} />
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="all">{t('selectGroup')} — {t('all')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">{t('all')}</option>
          <option value="active">{t('active')}</option>
          <option value="blocked">{t('blocked')}</option>
        </Select>
      </div>

      {loading && !data && <Spinner label={t('loading')} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {data.items.map((s) => (
                <div
                  key={s.id}
                  className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar url={s.avatarUrl} name={`${s.firstName} ${s.lastName}`} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                            {s.firstName} {s.lastName}
                          </span>
                          {s.isBlocked ? (
                            <Badge color="red">{t('blocked')}</Badge>
                          ) : (
                            <Badge color="green">{t('active')}</Badge>
                          )}
                          {s.telegramLinked && (
                            <Badge color="blue" dot>
                              {t('telegramLinked')}
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-400">@{s.login} · {s.phone}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {s.groups.map((g) => (
                            <span
                              key={g.id}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {g.name}
                              {g.customPrice !== null && <span className="text-amber-500"> •</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
                      <button
                        type="button"
                        onClick={() => openTelegram(s)}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-900/30"
                        title={t('telegramLink')}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30"
                        title={t('edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPwdTarget(s);
                          setNewPassword('');
                        }}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-900/30"
                        title={t('resetPassword')}
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleBlock(s)}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-900/30"
                        title={s.isBlocked ? t('unblock') : t('block')}
                      >
                        {s.isBlocked ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(s)}
                        className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        title={t('delete')}
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
        title={editing ? t('editStudent') : t('addStudent')}
        size="xl"
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
            <Input label={t('firstName')} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input label={t('lastName')} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input
              label={t('phone')}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })}
              placeholder="+998 90 123 45 67"
              inputMode="tel"
            />
            <Input
              label={t('parentPhone')}
              value={form.parentPhone}
              onChange={(e) => setForm({ ...form, parentPhone: formatPhoneInput(e.target.value) })}
              placeholder="+998 90 123 45 67"
              inputMode="tel"
            />
            <Input label={t('login')} value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} disabled={!!editing} />
            {!editing && (
              <Input
                label={t('password')}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Kamida 6 belgi"
              />
            )}
          </div>

          <div>
            <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('group')} * ({t('customPrice')})
            </div>
            <div className="space-y-2">
              {form.memberships.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={m.groupId} onChange={(e) => updateMembership(i, { groupId: e.target.value })} className="flex-1">
                    {!m.groupId && <option value="">{t('selectGroup')}</option>}
                    {groups
                      .filter((g) => g.id === m.groupId || !selectedIds.includes(g.id))
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({fmtMoney(g.monthlyPrice)})
                        </option>
                      ))}
                  </Select>
                  <Input
                    value={m.customPrice}
                    onChange={(e) => updateMembership(i, { customPrice: e.target.value })}
                    placeholder="Narx"
                    inputMode="numeric"
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() => removeMembership(i)}
                    disabled={form.memberships.length <= 1}
                    className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 dark:hover:bg-red-900/30"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              ))}
              {available.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, memberships: [...f.memberships, { groupId: available[0].id, customPrice: '' }] }))}
                >
                  <Plus className="h-4 w-4" /> {t('group')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Reset password */}
      <ConfirmDialog
        open={!!pwdTarget}
        title={t('resetPassword')}
        danger={false}
        message={
          <div>
            <p className="mb-2">{pwdTarget?.firstName} {pwdTarget?.lastName}</p>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('newPassword')}
            />
          </div>
        }
        confirmText={t('save')}
        onConfirm={resetPassword}
        onCancel={() => setPwdTarget(null)}
        confirmDisabled={newPassword.length < 6}
        loading={savingPwd}
      />

      {/* Telegram ulash */}
      <Modal
        open={!!tgTarget}
        onClose={() => setTgTarget(null)}
        title={t('telegramLink')}
        size="md"
        footer={<Button onClick={() => setTgTarget(null)}>{t('close')}</Button>}
      >
        {tgTarget && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-100">
                {tgTarget.firstName} {tgTarget.lastName}
              </div>
              <div className="text-xs text-slate-500">{tgTarget.parentPhone}</div>
            </div>
            {tgLoading ? (
              <Spinner label={t('loading')} />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {t('parentTelegram')}:
                  </span>
                  {tgInfo?.linked ? (
                    <Badge color="blue" dot>
                      {t('telegramLinked')}
                    </Badge>
                  ) : (
                    <Badge color="slate">{t('telegramNotLinked')}</Badge>
                  )}
                </div>
                {tgInfo?.url && (
                  <div className="space-y-2">
                    <div className="break-all rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {tgInfo.url}
                    </div>
                    <p className="text-xs text-slate-400">{t('telegramLinkHint')}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={copyTgLink}>
                        {t('copyLink')}
                      </Button>
                      <a href={tgInfo.url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="subtle">
                          {t('telegramOpenBot')}
                        </Button>
                      </a>
                      {tgInfo.linked && (
                        <Button size="sm" variant="ghost" onClick={unlinkTg}>
                          {t('unlinkTelegram')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirming}
        title={t('delete')}
        message={
          delInfo ? (
            <span>
              Bu guruhlardan chiqariladi: <b>{delInfo.groupsHere}</b> · boshqa guruhlar: <b>{delInfo.otherGroups}</b>
              <br />
              To'lov yozuvlari: <b>{delInfo.paymentsCount}</b>
              {delInfo.willDeleteAccount && (
                <span className="mt-2 block rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
                  O'quvchi hisobi butunlay o'chiriladi. To'lov yozuvlari saqlanadi.
                </span>
              )}
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