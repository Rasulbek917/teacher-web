import React, { useCallback, useEffect, useState } from 'react';
import { Paperclip, Send, Star, MessageSquare, X } from 'lucide-react';
import { api, errMsg, fileUrl } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Input,
  Textarea,
  Modal,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  Pagination,
} from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { uploadFileChunked } from '../../lib/upload';
import { submissionStatusMeta } from '../../lib/homeworkStatus';
import type { Paginated, StudentHomeworkItem, StudentHomeworkDetail } from '../../lib/types';

const ACCEPT = 'image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt';

export function StudentHomeworkPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<StudentHomeworkItem> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState<StudentHomeworkDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/my/homework', {
        params: { page, pageSize: 10, search: debounced },
      });
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

  const openDetail = async (h: StudentHomeworkItem) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setAnswer('');
    setFile(null);
    try {
      const { data } = await api.get(`/my/homework/${h.id}`);
      setDetail(data);
      setAnswer(data.submission?.text ?? '');
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const submit = async () => {
    if (!detail) return;
    if (!answer.trim() && !file && !detail.submission) {
      toast(t('yourAnswer') + ': ' + t('optional'), 'error');
      return;
    }
    setSaving(true);
    try {
      let fileUrl: string | undefined;
      if (file) {
        const uploaded = await uploadFileChunked(file, {
          kind: 'file',
          scope: 'SUBMISSION',
          scopeId: detail.groupId,
        });
        fileUrl = uploaded.url;
      }
      await api.post(`/my/homework/${detail.id}/submit`, {
        text: answer.trim() || undefined,
        fileUrl,
      });
      toast(t('homeworkSubmitted'), 'success');
      const { data } = await api.get(`/my/homework/${detail.id}`);
      setDetail(data);
      setFile(null);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const reviewedOf = (sub: { result: string | null; reviewedAt?: string | null } | null) =>
    !!(sub?.result || sub?.reviewedAt);

  return (
    <div>
      <PageHeader title={t('myHomework')} />
      <div className="mb-4">
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
            <div className="space-y-3">
              {data.items.map((h) => {
                const meta = submissionStatusMeta(!!h.result, h.status);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => openDetail(h)}
                    className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-primary-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-500/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-800 dark:text-slate-100">
                          {h.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                          <span>{h.groupName}</span>
                          <span>· {t('deadline')}: {h.dueAt ? fmtDateTime(h.dueAt) : t('noDeadline')}</span>
                          {h.attachmentUrls?.length > 0 && (
                            <span className="flex items-center gap-1">
                              · <Paperclip className="h-3 w-3" /> {h.attachmentUrls.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge color={meta.color} dot>
                        {t(meta.key)}
                      </Badge>
                    </div>

                    {h.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                        {h.description}
                      </p>
                    )}

                    {!!h.result && (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        {h.grade != null ? (
                          <span className="flex items-center gap-1 font-bold text-amber-500">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {h.grade}
                          </span>
                        ) : (
                          <Badge color="green">{t('statusReviewed')}</Badge>
                        )}
                        {h.comment && (
                          <span className="truncate text-xs text-slate-400">{h.comment}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail?.title ?? t('loading')}
        size="lg"
      >
        {detailLoading || !detail ? (
          <Spinner label={t('loading')} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Badge color="indigo">{detail.groupName}</Badge>
              <span>
                {t('deadline')}: {detail.dueAt ? fmtDateTime(detail.dueAt) : t('noDeadline')}
              </span>
              <Badge color={submissionStatusMeta(reviewedOf(detail.submission), detail.status).color}>
                {t(submissionStatusMeta(reviewedOf(detail.submission), detail.status).key)}
              </Badge>
            </div>

            {detail.description && (
              <div className="rounded-xl bg-slate-100 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {detail.description}
              </div>
            )}

            {detail.attachmentUrls?.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {t('teacherAttachments')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.attachmentUrls.map((url) => (
                    <a
                      key={url}
                      href={fileUrl(url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-primary-600 hover:bg-slate-50 dark:border-slate-700 dark:text-primary-300 dark:hover:bg-slate-800"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {url.split('/').pop()}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {reviewedOf(detail.submission) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-900/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <MessageSquare className="h-4 w-4" /> {t('homeworkReviewed')}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {detail.submission?.grade != null ? (
                    <span className="flex items-center gap-1 font-bold text-amber-500">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {detail.submission.grade}
                    </span>
                  ) : (
                    <Badge color="green">{t('statusReviewed')}</Badge>
                  )}
                </div>
                {detail.submission?.comment && (
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                    {detail.submission.comment}
                  </p>
                )}
              </div>
            )}

            {detail.submission && !reviewedOf(detail.submission) && (
              <div className="text-xs text-slate-400">
                {t('statusSubmitted')}: {fmtDateTime(detail.submission.submittedAt)}
              </div>
            )}

            {!reviewedOf(detail.submission) && (
              <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                <Textarea
                  label={t('yourAnswer')}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={t('submissionPlaceholder')}
                  className="min-h-[80px]"
                />
                <div>
                  <input
                    type="file"
                    accept={ACCEPT}
                    id="student-hw-file"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('student-hw-file')?.click()}
                    >
                      <Paperclip className="h-4 w-4" /> {t('attachmentsOptional')}
                    </Button>
                    {file && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                        {file.name}
                        <button type="button" onClick={() => setFile(null)} title={t('removeFile')}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={submit} loading={saving}>
                    <Send className="h-4 w-4" /> {t('submitHomework')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
