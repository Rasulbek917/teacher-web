import React, { useEffect, useState } from 'react';
import { Wallet, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api, errMsg } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import { PageHeader, Spinner, EmptyState, Badge } from '../../components/ui';
import { fmtMoney, fmtDate, MONTH_NAMES, yearMonthNow } from '../../lib/format';
import type { StudentPaymentEntry } from '../../lib/types';

export function StudentPaymentsPage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<StudentPaymentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/my/payments')
      .then(({ data }) => setEntries(data))
      .catch((e) => setError(errMsg(e, t('error'))))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = yearMonthNow();

  const statusColor = (s: string) => (s === 'PAID' ? 'green' : s === 'PARTIAL' ? 'amber' : 'red');
  const statusLabel = (s: string) => (s === 'PAID' ? t('paid') : s === 'PARTIAL' ? t('partial') : t('unpaid'));

  return (
    <div>
      <PageHeader title={t('myPayments')} />
      {loading ? (
        <Spinner label={t('loading')} />
      ) : error ? (
        <EmptyState message={error} />
      ) : entries.length === 0 ? (
        <EmptyState message={t('empty')} icon={<Wallet className="h-7 w-7" />} />
      ) : (
        <div className="space-y-5">
          {entries.map((e) => (
            <section key={e.groupId} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary-500" />
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{e.groupName}</span>
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400">{fmtMoney(e.price)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {e.months.map((m) => {
                  const isCurrent = m.year === now.year && m.month === now.month;
                  return (
                    <div
                      key={`${m.year}-${m.month}`}
                      className={`rounded-xl border p-3 ${
                        isCurrent
                          ? 'border-primary-400 bg-primary-50/60 dark:border-primary-700 dark:bg-primary-900/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {MONTH_NAMES[m.month - 1]} {m.year}
                        </span>
                        {m.status === 'PAID' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : m.status === 'PARTIAL' ? (
                          <Clock className="h-4 w-4 text-amber-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="mt-1.5">
                        <Badge color={statusColor(m.status)}>{statusLabel(m.status)}</Badge>
                      </div>
                      {m.amount > 0 && (
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{fmtMoney(m.amount)}</div>
                      )}
                      {m.paidAt && <div className="text-xs text-slate-400">{fmtDate(m.paidAt)}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}