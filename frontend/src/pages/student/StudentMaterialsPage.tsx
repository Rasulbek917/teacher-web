import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Play, Image as ImageIcon, X } from 'lucide-react';
import { api, fileUrl } from '../../lib/api';
import { useI18n } from '../../i18n/i18n';
import {
  PageHeader,
  Button,
  Input,
  Badge,
  Spinner,
  EmptyState,
  ErrorState,
  Pagination,
} from '../../components/ui';
import { VideoPlayer, youtubeEmbed } from '../../components/VideoPlayer';
import type { MaterialItem, Paginated } from '../../lib/types';

export function StudentMaterialsPage() {
  const { t } = useI18n();
  const location = useLocation();
  const tab = location.pathname === '/images' ? 'IMAGE' : 'VIDEO';
  const [data, setData] = useState<Paginated<MaterialItem> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/my/materials', {
        params: { page, pageSize: 12, search: debounced, type: tab },
      });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, tab, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setDebounced(search.trim());
  }, [search, tab]);

  return (
    <div>
      <PageHeader title={tab === 'IMAGE' ? t('images') : t('videoLessons')} />
      <div className="mb-4 flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} className="max-w-sm" />
      </div>

      {loading && !data && <Spinner label={t('loading')} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.items.map((m) => (
                <div key={m.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  <div className="aspect-video w-full bg-slate-950">
                    {m.type === 'VIDEO' && m.videoSource === 'UPLOAD' && m.fileUrl ? (
                      <VideoPlayer src={m.fileUrl} />
                    ) : m.type === 'VIDEO' && m.videoSource === 'YOUTUBE' && m.youtubeUrl ? (
                      <iframe
                        src={youtubeEmbed(m.youtubeUrl)}
                        title={m.title}
                        className="h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : m.type === 'IMAGE' && m.imageUrls.length ? (
                      <img
                        src={fileUrl(m.imageUrls[0])}
                        alt=""
                        className="h-full w-full cursor-pointer object-cover"
                        onClick={() => setPreview(fileUrl(m.imageUrls[0]))}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-slate-600" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <Badge color={m.type === 'VIDEO' ? 'indigo' : 'blue'}>
                        {m.type === 'VIDEO' ? t('videoLesson') : t('imageLesson')}
                      </Badge>
                      <span className="text-xs text-slate-400">{m.groupName}</span>
                    </div>
                    <h3 className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{m.title}</h3>
                    {m.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{m.description}</p>}
                    {m.type === 'IMAGE' && m.imageUrls.length > 1 && (
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {m.imageUrls.map((url) => (
                          <img
                            key={url}
                            src={fileUrl(url)}
                            alt=""
                            className="aspect-square w-full cursor-pointer rounded-lg object-cover"
                            onClick={() => setPreview(fileUrl(url))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" onClick={() => setPreview(null)}>
          <button className="absolute right-4 top-4 text-white" onClick={() => setPreview(null)}>
            <X className="h-7 w-7" />
          </button>
          <img src={preview} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}