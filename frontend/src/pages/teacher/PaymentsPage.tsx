import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
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
  StatCard,
  Spinner,
  ErrorState,
  EmptyState,
  Pagination,
  Avatar,
} from '../../components/ui';
import { fmtMoney, fmtDate, MONTH_NAMES, yearMonthNow } from '../../lib/format';
import type { GroupOption, PaymentsResponse, PaymentRow } from '../../lib/types';

export function PaymentsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const now = yearMonthNow();
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [year, setYear] = useState(now.year);
  const [month, setMonth] = useState(now.month);
  const [groupId, setGroupId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [target, setTarget] = useState<PaymentRow | null>(null);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [saving, setSaving] = useState(false);

  const [cancelling, setCancelling] = useState<PaymentRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/payments', {
        params: { page, pageSize: 50, search: debounced, year, month, groupId },
      });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, year, month, groupId, t]);

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

  const openMark = (row: PaymentRow) => {
    setTarget(row);
    setAmount(String(row.amount || row.price));
    const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
    setPaidAt(d.toISOString().slice(0, 16));
  };

  const savePayment = async () => {
    if (!target) return;
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt < 0) {
      toast(t('amount') + ': noto\'g\'ri', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/payments/mark-paid', {
        studentId: target.studentId,
        groupId: target.groupId,
        periodYear: year,
        periodMonth: month,
        amount: amt,
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
      });
      toast(t('markPaid') + ': ' + t('success'));
      setTarget(null);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    if (!cancelling?.paymentId) return;
    try {
      await api.delete(`/payments/${cancelling.paymentId}`);
      toast(t('cancelPayment') + ': ' + t('success'));
      setCancelling(null);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const years = Array.from({ length: 4 }, (_, i) => now.year - i);

  const statusColor = (s: string) => (s === 'PAID' ? 'green' : s === 'PARTIAL' ? 'amber' : 'red');
  const statusLabel = (s: string) => (s === 'PAID' ? t('paid') : s === 'PARTIAL' ? t('partial') : t('unpaid'));

  const paidCount = data ? data.items.filter((i) => i.status === 'PAID').length : 0;

  return (
    <div>
      <PageHeader title={t('payments')} />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <Select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </Select>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="all">{t('selectGroup')} — {t('all')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} />
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatCard icon={<Wallet className="h-5 w-5" />} label={t('monthIncome')} value={fmtMoney(data.sum)} />
          <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label={t('paidList')} value={paidCount} tone="green" />
          <StatCard icon={<AlertCircle className="h-5 w-5" />} label={t('unpaidCount')} value={data.unpaid} tone="red" />
        </div>
      )}

      {loading && !data && <Spinner label={t('loading')} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <>
              {/* Mobil: kartalar */}
              <div className="space-y-3 md:hidden">
                {data.items.map((row) => (
                  <div
                    key={row.studentId + row.groupId}
                    className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar url={row.student.avatarUrl} name={`${row.student.firstName} ${row.student.lastName}`} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                            {row.student.firstName} {row.student.lastName}
                          </div>
                          <div className="truncate text-xs text-slate-400">{row.groupName}</div>
                        </div>
                      </div>
                      <Badge color={statusColor(row.status)}>{statusLabel(row.status)}</Badge>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{fmtMoney(row.amount)}</div>
                        <div className="truncate text-xs text-slate-400">
                          {t('monthlyPrice')}: {fmtMoney(row.price)}
                          {row.paidAt && <> · {fmtDate(row.paidAt)}</>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => openMark(row)}>
                          {t('markPaid')}
                        </Button>
                        {row.paymentId && (
                          <button
                            type="button"
                            onClick={() => setCancelling(row)}
                            className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                            title={t('cancelPayment')}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: jadval */}
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block dark:border-slate-700 dark:bg-slate-900">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                    <th className="px-4 py-3">{t('student')}</th>
                    <th className="px-4 py-3">{t('group')}</th>
                    <th className="px-4 py-3">{t('monthlyPrice')}</th>
                    <th className="px-4 py-3">{t('amount')}</th>
                    <th className="px-4 py-3">{t('status')}</th>
                    <th className="px-4 py-3 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.studentId + row.groupId} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar url={row.student.avatarUrl} name={`${row.student.firstName} ${row.student.lastName}`} size="sm" />
                          <div>
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {row.student.firstName} {row.student.lastName}
                            </div>
                            <div className="text-xs text-slate-400">{row.student.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.groupName}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtMoney(row.price)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                        {fmtMoney(row.amount)}
                        {row.paidAt && <div className="text-xs font-normal text-slate-400">{fmtDate(row.paidAt)}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={statusColor(row.status)}>{statusLabel(row.status)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => openMark(row)}>
                            {t('markPaid')}
                          </Button>
                          {row.paymentId && (
                            <button
                              type="button"
                              onClick={() => setCancelling(row)}
                              className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                              title={t('cancelPayment')}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {/* Mark paid */}
      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={t('markPaid')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>{t('cancel')}</Button>
            <Button onClick={savePayment} loading={saving}>{t('save')}</Button>
          </>
        }
      >
        {target && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-100">
                {target.student.firstName} {target.student.lastName}
              </div>
              <div className="text-xs text-slate-500">{target.groupName} · {MONTH_NAMES[month - 1]} {year}</div>
            </div>
            <Input
              label={t('amount')}
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(target.price)}
            />
            <Input
              label={t('date')}
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
            <div className="text-xs text-slate-400">
              {t('monthlyPrice')}: {fmtMoney(target.price)}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelling}
        title={t('cancelPayment')}
        message={t('cancelPayment') + '?'}
        onConfirm={doCancel}
        onCancel={() => setCancelling(null)}
      />
    </div>
  );
}