import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, Bell } from 'lucide-react';
import { api } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { useI18n } from '../i18n/i18n';
import { PageHeader, Button, Spinner, ErrorState, EmptyState, Pagination } from '../components/ui';
import type { NotificationItem, NotificationsResponse } from '../lib/types';
import { fmtDateTime } from '../lib/format';

export function NotificationsPage() {
  const { t } = useI18n();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/notifications', { params: { page, pageSize: 20 } });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    socket?.on('notification:new', onRefresh);
    socket?.on('notification:refresh', onRefresh);
    return () => {
      socket?.off('notification:new', onRefresh);
      socket?.off('notification:refresh', onRefresh);
    };
  }, [socket, load]);

  const markRead = async (n: NotificationItem) => {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      load();
    }
    if (n.link) navigate(n.link);
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all').catch(() => {});
    load();
  };

  return (
    <div>
      <PageHeader
        title={t('notifications')}
        action={
          data && data.unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="h-4 w-4" /> {t('markAllRead')}
            </Button>
          ) : undefined
        }
      />

      {loading && !data && <Spinner label={t('loading')} />}
      {error && !data && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message={t('noNotifications')} icon={<Bell className="h-7 w-7" />} />
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
              {data.items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n)}
                  className={`flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                    !n.isRead ? 'bg-primary-50/60 dark:bg-primary-900/20' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      n.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-primary-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{n.title}</span>
                    <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{n.body}</span>
                    <span className="mt-1 block text-xs text-slate-400">{fmtDateTime(n.createdAt)}</span>
                  </span>
                  {n.link && <span className="text-xs font-medium text-primary-500">{t('open')}</span>}
                </button>
              ))}
            </div>
          )}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
