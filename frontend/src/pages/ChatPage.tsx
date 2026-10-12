import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  Plus,
  ArrowLeft,
  Pencil,
  Trash2,
  Check,
  CheckCheck,
  X,
  Users,
  MessageCircle,
} from 'lucide-react';
import { api, errMsg, fileUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { useSocket } from '../context/SocketContext';
import {
  PageHeader,
  Button,
  Input,
  Modal,
  ConfirmDialog,
  Avatar,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  cx,
} from '../components/ui';
import { VideoPlayer } from '../components/VideoPlayer';
import { fmtTime, fmtDate } from '../lib/format';
import { uploadFileChunked } from '../lib/upload';
import type { ChatMessage, ChatUser, Contact, ConversationItem, MessageType } from '../lib/types';

export function ChatPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const { socket } = useSocket();

  const [convs, setConvs] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [menuFor, setMenuFor] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [delTarget, setDelTarget] = useState<ChatMessage | null>(null);

  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Presence: online foydalanuvchilar to'plami (socket orqali yangilanadi).
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  // Profil oynasi: avatar/ism bosilganda ochiladi.
  const [viewUser, setViewUser] = useState<ChatUser | null>(null);

  const [preview, setPreview] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadConvs = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/conversations');
      setConvs(data);
      return data as ConversationItem[];
    } catch (e: any) {
      setError(errMsg(e, t('error')));
      return [];
    } finally {
      setLoadingConvs(false);
    }
  }, [t]);

  useEffect(() => {
    loadConvs();
  }, [loadConvs]);

  const loadMessages = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setLoadingMsgs(true);
      try {
        const { data } = await api.get(`/chat/conversations/${id}/messages`, { params: { limit: 100 } });
        setMessages(data);
        api.post(`/chat/conversations/${id}/read`).catch(() => {});
        setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      } catch (e: any) {
        if (!silent) toast(errMsg(e), 'error');
      } finally {
        if (!silent) setLoadingMsgs(false);
      }
    },
    [toast],
  );

  /** Foydalanuvchi online (kamida bitta socket ulangan)mi. */
  const isOnline = useCallback((id?: string | null) => (id ? onlineUsers.has(id) : false), [onlineUsers]);

  const openConversation = (id: string) => {
    setActiveId(id);
    setMenuFor(null);
    loadMessages(id);
  };

  // Socket real-time
  useEffect(() => {
    if (!socket) return;
    const onNew = (m: ChatMessage) => {
      if (m.conversationId === activeIdRef.current) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.senderId !== user?.id) api.post(`/chat/conversations/${m.conversationId}/read`).catch(() => {});
      }
      setConvs((prev) => {
        const exists = prev.find((c) => c.id === m.conversationId);
        if (!exists) {
          loadConvs();
          return prev;
        }
        const updated = prev
          .map((c) =>
            c.id === m.conversationId
              ? {
                  ...c,
                  lastMessage: {
                    text: m.text,
                    type: m.type,
                    senderId: m.senderId,
                    senderName: `${m.sender.firstName} ${m.sender.lastName}`,
                    createdAt: m.createdAt,
                  },
                  unreadCount:
                    m.conversationId === activeIdRef.current || m.senderId === user?.id
                      ? 0
                      : c.unreadCount + 1,
                }
              : c,
          )
          .sort((a, b) => {
            const ta = a.lastMessage?.createdAt ?? '';
            const tb = b.lastMessage?.createdAt ?? '';
            return tb.localeCompare(ta);
          });
        return updated;
      });
    };
    const onUpdated = (m: ChatMessage) => {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    };
    const onDeleted = (p: { conversationId: string; fileUrl: string | null }) => {
      if (activeIdRef.current === p.conversationId) loadMessages(p.conversationId);
    };
    const onRead = (p: { conversationId: string; userId: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.conversationId === p.conversationId && !m.readBy.includes(p.userId)
            ? { ...m, readBy: [...m.readBy, p.userId] }
            : m,
        ),
      );
    };
    // Presence: dastlabki ro'yxat va keyingi o'zgarishlar.
    const onPresenceInit = (ids: string[]) => setOnlineUsers(new Set(Array.isArray(ids) ? ids : []));
    const onPresenceUpdate = (p: { userId: string; online: boolean }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        if (p.online) next.add(p.userId);
        else next.delete(p.userId);
        return next;
      });
    };
    // Socket (qayta) ulanganda suhbatlar va ochiq xabarlarni yangilaymiz —
    // bu "xabar turib qolishi" muammosini bartaraf etadi.
    const onConnect = () => {
      loadConvs();
      if (activeIdRef.current) loadMessages(activeIdRef.current, true);
    };
    socket.on('message:new', onNew);
    socket.on('message:updated', onUpdated);
    socket.on('message:deleted', onDeleted);
    socket.on('message:read', onRead);
    socket.on('presence:init', onPresenceInit);
    socket.on('presence:update', onPresenceUpdate);
    socket.on('connect', onConnect);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:updated', onUpdated);
      socket.off('message:deleted', onDeleted);
      socket.off('message:read', onRead);
      socket.off('presence:init', onPresenceInit);
      socket.off('presence:update', onPresenceUpdate);
      socket.off('connect', onConnect);
    };
  }, [socket, user?.id, loadConvs, loadMessages]);

  // Oyna fokusga qaytganda va tarmoq tiklanganda ma'lumotni yangilaymiz.
  useEffect(() => {
    const refresh = () => {
      loadConvs();
      if (activeIdRef.current) loadMessages(activeIdRef.current, true);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadConvs, loadMessages]);

  // Socket uzilgan bo'lsa — zaxira (fallback) so'rov bilan yangilab turamiz.
  useEffect(() => {
    const timer = setInterval(() => {
      if (socket?.connected) return;
      loadConvs();
      if (activeIdRef.current) loadMessages(activeIdRef.current, true);
    }, 15000);
    return () => clearInterval(timer);
  }, [socket, loadConvs, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeId]);

  const send = async () => {
    if (!activeId || !text.trim()) return;
    setSending(true);
    try {
      const { data } = await api.post(`/chat/conversations/${activeId}/messages`, {
        type: 'TEXT',
        text: text.trim(),
      });
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
      setText('');
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setSending(false);
    }
  };

  const uploadAndSend = async (file: File, kind: MessageType) => {
    if (!activeId) return;
    setUploading(true);
    try {
      // Chat fayllari ham bo'laklab yuklanadi (Vercel 4.5MB so'rov limiti).
      const up = await uploadFileChunked(file, {
        kind: kind === 'IMAGE' ? 'image' : kind === 'VIDEO' ? 'video' : kind === 'VOICE' ? 'voice' : 'file',
        scope: 'CONVERSATION',
        scopeId: activeId,
      });
      const { data } = await api.post(`/chat/conversations/${activeId}/messages`, {
        type: kind,
        fileUrl: up.url,
        text: undefined,
      });
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
    } catch (e: any) {
      toast(errMsg(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const openContacts = async () => {
    setContactsOpen(true);
    try {
      const { data } = await api.get('/chat/contacts');
      setContacts(data);
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const startDirect = async (c: Contact) => {
    try {
      const { data } = await api.post('/chat/direct', { userId: c.id });
      setContactsOpen(false);
      const list = await loadConvs();
      if (list.some((x) => x.id === data.id)) {
        openConversation(data.id);
      } else {
        openConversation(data.id);
      }
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const saveEdit = async () => {
    if (!editTarget || !editText.trim()) return;
    try {
      await api.patch(`/chat/messages/${editTarget.id}`, { text: editText.trim() });
      toast(t('save') + ': ' + t('success'));
      setEditTarget(null);
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const doDelete = async () => {
    if (!delTarget) return;
    try {
      await api.delete(`/chat/messages/${delTarget.id}`);
      setMessages((prev) => prev.filter((x) => x.id !== delTarget.id));
      setDelTarget(null);
      toast(t('delete') + ': ' + t('success'));
    } catch (e: any) {
      toast(errMsg(e), 'error');
    }
  };

  const active = convs.find((c) => c.id === activeId) || null;

  const renderMessage = (m: ChatMessage) => {
    const mine = m.senderId === user?.id;
    const seen = mine && m.readBy.length > 0;
    return (
      <div key={m.id} className={cx('flex gap-2', mine ? 'justify-end' : 'justify-start')}>
        {!mine && (
          <button
            type="button"
            onClick={() => setViewUser(m.sender)}
            className="relative mt-1 shrink-0"
            title={`${m.sender.firstName} ${m.sender.lastName}`}
          >
            <Avatar url={m.sender.avatarUrl} name={`${m.sender.firstName} ${m.sender.lastName}`} size="xs" />
            <OnlineDot online={isOnline(m.senderId)} />
          </button>
        )}
        <div className={cx('max-w-[78%]', mine ? 'items-end' : 'items-start')}>
          {!mine && active?.type === 'GROUP' && (
            <div className="mb-0.5 pl-1 text-[11px] font-medium text-primary-500">
              {m.sender.firstName} {m.sender.lastName}
            </div>
          )}
          <div
            className={cx(
              'relative rounded-2xl px-3 py-2 text-sm shadow-sm',
              mine
                ? 'rounded-br-md bg-primary-600 text-white'
                : 'rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100',
            )}
          >
            {m.type === 'TEXT' && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
            {m.type === 'IMAGE' && m.fileUrl && (
              <img
                src={fileUrl(m.fileUrl)}
                alt=""
                className="max-h-72 cursor-pointer rounded-lg object-cover"
                onClick={() => setPreview(fileUrl(m.fileUrl))}
              />
            )}
            {m.type === 'VIDEO' && m.fileUrl && (
              <div className="w-64 max-w-full">
                <VideoPlayer src={m.fileUrl} />
              </div>
            )}
            {m.type === 'VOICE' && m.fileUrl && (
              <audio src={fileUrl(m.fileUrl)} controls className="max-w-full" />
            )}
            {m.type === 'FILE' && m.fileUrl && (
              <a
                href={fileUrl(m.fileUrl)}
                target="_blank"
                rel="noreferrer"
                className={cx(
                  'flex items-center gap-2 underline',
                  mine ? 'text-white' : 'text-primary-600 dark:text-primary-300',
                )}
              >
                <Paperclip className="h-4 w-4" /> {t('open')}
              </a>
            )}
            <div className={cx('mt-1 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-white/70' : 'text-slate-400')}>
              {m.editedAt && <span>· {t('edit')}</span>}
              <span>{fmtTime(m.createdAt)}</span>
              {mine && (seen ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />)}
            </div>
          </div>
          {mine && (
            <div className="mt-0.5 flex justify-end">
              <button
                type="button"
                onClick={() => setMenuFor(m)}
                className="rounded px-1 text-[11px] text-slate-400 hover:text-slate-600"
              >
                •••
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const canDirect = true;

  return (
    <div>
      <PageHeader
        title={t('chat')}
        action={
          canDirect ? (
            <Button variant="outline" size="sm" onClick={openContacts}>
              <Plus className="h-4 w-4" /> {t('add')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversations list */}
        <div className={cx('rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900', activeId && 'hidden lg:block')}>
          {loadingConvs ? (
            <Spinner label={t('loading')} />
          ) : convs.length === 0 ? (
            <EmptyState message={t('empty')} icon={<MessageCircle className="h-7 w-7" />} />
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              {convs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={cx(
                    'flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50',
                    activeId === c.id && 'bg-primary-50 dark:bg-primary-900/20',
                  )}
                >
                  {c.type === 'GROUP' ? (
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
                      <Users className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="relative shrink-0">
                      <Avatar url={c.avatarUrl} name={c.title} size="sm" />
                      <OnlineDot online={isOnline(c.otherUser?.id)} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{c.title}</span>
                      {c.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    {c.lastMessage && (
                      <div className="truncate text-xs text-slate-400">
                        {c.lastMessage.senderId === user?.id ? '' : c.lastMessage.senderName + ': '}
                        {c.lastMessage.type === 'TEXT'
                          ? c.lastMessage.text
                          : c.lastMessage.type === 'IMAGE'
                            ? '🖼 ' + t('imageLesson')
                            : c.lastMessage.type === 'VIDEO'
                              ? '🎬 ' + t('videoLesson')
                              : c.lastMessage.type === 'VOICE'
                                ? '🎤'
                                : '📎 ' + t('attachment')}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div
          className={cx(
            'flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
            !activeId && 'hidden lg:flex',
          )}
        >
          {!active ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <EmptyState message={t('typeMessage')} icon={<MessageCircle className="h-7 w-7" />} />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {active.type === 'GROUP' ? (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
                    <Users className="h-5 w-5" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => active.otherUser && setViewUser(active.otherUser)}
                    className="relative shrink-0"
                  >
                    <Avatar url={active.avatarUrl} name={active.title} size="sm" />
                    <OnlineDot online={isOnline(active.otherUser?.id)} />
                  </button>
                )}
                {active.type === 'DIRECT' && active.otherUser ? (
                  <button
                    type="button"
                    onClick={() => active.otherUser && setViewUser(active.otherUser)}
                    className="min-w-0 text-left"
                  >
                    <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{active.title}</div>
                    <div className={cx('text-xs', isOnline(active.otherUser.id) ? 'text-emerald-500' : 'text-slate-400')}>
                      {isOnline(active.otherUser.id) ? t('online') : t('offline')}
                    </div>
                  </button>
                ) : (
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{active.title}</span>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-3" style={{ minHeight: '45vh', maxHeight: '60vh' }}>
                {loadingMsgs ? (
                  <Spinner />
                ) : messages.length === 0 ? (
                  <EmptyState message={t('empty')} />
                ) : (
                  messages.map(renderMessage)
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-slate-200 p-2.5 dark:border-slate-700">
                <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndSend(f, 'IMAGE'); e.target.value = ''; }} />
                <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndSend(f, 'VIDEO'); e.target.value = ''; }} />
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAndSend(f, 'FILE'); e.target.value = ''; }} />
                <div className="flex items-end gap-1.5">
                  <button type="button" onClick={() => imageRef.current?.click()} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t('imageLesson')}>
                    <ImageIcon className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => videoRef.current?.click()} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t('videoLesson')}>
                    <VideoIcon className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => fileRef.current?.click()} className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t('attachment')}>
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={t('typeMessage')}
                    rows={1}
                    className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <MicUpload onUpload={(f) => uploadAndSend(f, 'VOICE')} t={t} />
                  <Button onClick={send} disabled={!text.trim() || sending} loading={sending} className="!px-3">
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
                {uploading && <div className="mt-1 text-xs text-slate-400">{t('uploading')}</div>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Message actions */}
      <Modal open={!!menuFor} onClose={() => setMenuFor(null)} size="sm" title={t('actions')}>
        <div className="space-y-2">
          <Button
            variant="outline"
            fullWidth
            onClick={() => {
              setEditTarget(menuFor);
              setEditText(menuFor?.text ?? '');
              setMenuFor(null);
            }}
          >
            <Pencil className="h-4 w-4" /> {t('editLink')}
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              setDelTarget(menuFor);
              setMenuFor(null);
            }}
          >
            <Trash2 className="h-4 w-4" /> {t('deleteLink')}
          </Button>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} size="sm" title={t('edit')}
        footer={<><Button variant="secondary" onClick={() => setEditTarget(null)}>{t('cancel')}</Button><Button onClick={saveEdit}>{t('save')}</Button></>}>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-600 dark:bg-slate-800"
          rows={3}
        />
      </Modal>

      <ConfirmDialog open={!!delTarget} title={t('delete')} message={t('delete') + '?'} onConfirm={doDelete} onCancel={() => setDelTarget(null)} />

      {/* Contacts */}
      <Modal open={contactsOpen} onClose={() => setContactsOpen(false)} title={t('chat')} size="sm">
        {contacts.length === 0 ? (
          <EmptyState message={t('empty')} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {contacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => startDirect(c)}
                className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="relative shrink-0">
                  <Avatar url={c.avatarUrl} name={`${c.firstName} ${c.lastName}`} size="sm" />
                  <OnlineDot online={isOnline(c.id)} />
                </div>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className={cx('text-xs', isOnline(c.id) ? 'text-emerald-500' : 'text-slate-400')}>
                    {isOnline(c.id) ? t('online') : t('offline')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Profile (avatar/ism bosilganda) */}
      <Modal open={!!viewUser} onClose={() => setViewUser(null)} size="sm" title={t('profile')}>
        {viewUser && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="relative">
              <Avatar
                url={viewUser.avatarUrl}
                name={`${viewUser.firstName} ${viewUser.lastName}`}
                size="xl"
              />
              <OnlineDot online={isOnline(viewUser.id)} className="h-5 w-5 border-4" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {viewUser.firstName} {viewUser.lastName}
              </div>
              <div className={cx('text-sm', isOnline(viewUser.id) ? 'text-emerald-500' : 'text-slate-400')}>
                {isOnline(viewUser.id) ? t('online') : t('offline')}
              </div>
            </div>
            {viewUser.role && (
              <Badge color="indigo">
                {viewUser.role === 'TEACHER'
                  ? t('teacher')
                  : viewUser.role === 'STUDENT'
                    ? t('student')
                    : t('roleAdmin')}
              </Badge>
            )}
          </div>
        )}
      </Modal>

      {/* Image preview */}
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

/** Ovozli xabar yozish tugmasi */
function MicUpload({ onUpload, t }: { onUpload: (file: File) => void; t: (k: string) => string }) {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        onUpload(file);
        stream.getTracks().forEach((tr) => tr.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      alert('Mikrofon mavjud emas yoki ruxsat berilmagan');
    }
  };

  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      className={cx(
        'touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
        recording ? 'bg-red-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
      )}
      title={recording ? 'Stop' : 'Ovozli xabar'}
    >
      <Mic className="h-5 w-5" />
    </button>
  );
}

/** Avatar burchagidagi online/offline holat nuqtasi. */
function OnlineDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900',
        online ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
        className,
      )}
      aria-hidden
    />
  );
}