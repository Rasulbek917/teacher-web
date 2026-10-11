import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, X, Video, Image as ImageIcon, Youtube, Upload } from 'lucide-react';
import { api, errMsg, fileUrl } from '../../lib/api';
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
} from '../../components/ui';
import { VideoPlayer, youtubeEmbed } from '../../components/VideoPlayer';
import { fmtDate } from '../../lib/format';
import type { GroupOption, MaterialItem, Paginated } from '../../lib/types';

export function MaterialsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState<Paginated<MaterialItem> | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [groupId, setGroupId] = useState('all');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialItem | null>(null);
  const [form, setForm] = useState<any>({});
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/materials', {
        params: { page, pageSize: 12, search: debounced, groupId, type: type || undefined },
      });
      setData(d);
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [page, debounced, groupId, type, t]);

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
      groupId: groups.length ? groups[0].id : '',
      title: '',
      description: '',
      type: 'VIDEO',
      videoSource: 'UPLOAD',
      youtubeUrl: '',
    });
    setFiles([]);
    setModalOpen(true);
  };

  const openEdit = (m: MaterialItem) => {
    setEditing(m);
    setForm({
      groupId: m.groupId,
      title: m.title,
      description: m.description ?? '',
      type: m.type,
      videoSource: m.videoSource ?? 'UPLOAD',
      youtubeUrl: m.youtubeUrl ?? '',
    });
    setFiles([]);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.groupId) {
      toast(t('selectGroup'), 'error');
      return;
    }
    if (form.title.trim().length < 1) {
      toast(t('title') + ': majburiy', 'error');
      return;
    }
    if (form.type === 'VIDEO') {
      if (form.videoSource === 'YOUTUBE' && !/^https?:\/\/.+/i.test(form.youtubeUrl)) {
        toast(t('youtubeUrl') + ': noto\'g\'ri', 'error');
        return;
      }
      if (form.videoSource === 'UPLOAD' && !editing && files.length === 0) {
        toast(t('uploadVideo'), 'error');
        return;
      }
    } else if (form.type === 'IMAGE' && !editing && files.length === 0) {
      toast(t('uploadImages'), 'error');
      return;
    }

    const fd = new FormData();
    fd.append('groupId', form.groupId);
    fd.append('title', form.title.trim());
    if (form.description) fd.append('description', form.description);
    if (!editing) {
      fd.append('type', form.type);
      if (form.type === 'VIDEO') {
        fd.append('videoSource', form.videoSource);
        if (form.videoSource === 'YOUTUBE') fd.append('youtubeUrl', form.youtubeUrl.trim());
      }
    } else if (form.type === 'VIDEO' && form.videoSource === 'YOUTUBE') {
      fd.append('youtubeUrl', form.youtubeUrl.trim());
    }
    files.forEach((f) => fd.append('files', f));

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/materials/${editing.id}`, fd);
        toast(t('edit') + ': ' + t('success'));
      } else {
        await api.post('/materials', fd);
        toast(t('addMaterial') + ': ' + t('success'));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeImage = async (m: MaterialItem, url: string) => {
    try {
      await api.delete(`/materials/${m.id}/images`, { data: { url } });
      toast(t('delete') + ': ' + t('success'));
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const doDelete = async () => {
    if (!confirming) return;
    try {
      await api.delete(`/materials/${confirming}`);
      toast(t('delete') + ': ' + t('success'));
      setConfirming(null);
      load();
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('videosRasmsMaterials')}
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t('addMaterial')}
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
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('all')}</option>
          <option value="VIDEO">{t('videoLesson')}</option>
          <option value="IMAGE">{t('imageLesson')}</option>
        </Select>
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
                <div
                  key={m.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                >
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
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-slate-600" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge color={m.type === 'VIDEO' ? 'indigo' : 'blue'}>
                            {m.type === 'VIDEO' ? t('videoLesson') : t('imageLesson')}
                          </Badge>
                          <span className="text-xs text-slate-400">{m.groupName}</span>
                        </div>
                        <h3 className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{m.title}</h3>
                        {m.description && (
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{m.description}</p>
                        )}
                        <div className="mt-1 text-xs text-slate-400">{fmtDate(m.createdAt)}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/30"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(m.id)}
                          className="touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {m.type === 'IMAGE' && m.imageUrls.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {m.imageUrls.map((url) => (
                          <div key={url} className="group relative">
                            <img src={fileUrl(url)} alt="" className="aspect-square w-full rounded-lg object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage(m, url)}
                              className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"
                              title={t('delete')}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
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

      {/* Create/Edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('edit') : t('addMaterial')}
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

          {!editing && (
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{t('type')}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'VIDEO', videoSource: 'UPLOAD' })}
                  className={`touch-target flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                    form.type === 'VIDEO'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Video className="h-5 w-5" /> {t('videoLesson')}
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'IMAGE' })}
                  className={`touch-target flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                    form.type === 'IMAGE'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  <ImageIcon className="h-5 w-5" /> {t('imageLesson')}
                </button>
              </div>
            </div>
          )}

          <Input
            label={t('title')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            label={t('description')}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          {form.type === 'VIDEO' && !editing && (
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{t('type')}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, videoSource: 'UPLOAD' })}
                  className={`touch-target flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                    form.videoSource === 'UPLOAD'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Upload className="h-4 w-4" /> {t('uploadVideo')}
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, videoSource: 'YOUTUBE' })}
                  className={`touch-target flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                    form.videoSource === 'YOUTUBE'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Youtube className="h-4 w-4" /> YouTube
                </button>
              </div>
            </div>
          )}

          {form.type === 'VIDEO' && form.videoSource === 'YOUTUBE' && (
            <Input
              label={t('youtubeUrl')}
              value={form.youtubeUrl}
              onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
              placeholder="https://youtube.com/watch?v=..."
            />
          )}

          {(form.type === 'IMAGE' || (form.type === 'VIDEO' && form.videoSource === 'UPLOAD')) && (
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                {form.type === 'IMAGE' ? t('uploadImages') : t('uploadVideo')}
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple={form.type === 'IMAGE'}
                accept={form.type === 'IMAGE' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm,quicktime,video/x-msvideo,video/x-matroska'}
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {t('upload')}
              </Button>
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {f.name}
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              {editing?.type === 'IMAGE' && editing.imageUrls.length > 0 && (
                <div className="mt-2 text-xs text-slate-400">
                  Yangi fayllar mavjud rasmlarga qo'shiladi.
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        title={t('delete')}
        message={t('delete') + '?'}
        onConfirm={doDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}