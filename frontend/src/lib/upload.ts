import { api } from './api';

export type UploadKind = 'avatar' | 'image' | 'video' | 'voice' | 'file' | 'attachment';
/** FilesController uchun scope qiymatlari (prisma FileScope enum bilan mos). */
export type UploadScope = 'AVATAR' | 'GROUP' | 'CONVERSATION' | 'SUBMISSION';

export interface UploadedFileResult {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Vercel /api proksi bitta so'rovda ~4.5MB dan katta body'ni qabul qilmaydi.
 * Shuning uchun katta fayllar 3.5MB li bo'laklarga bo'linib, har biri alohida
 * `POST /api/files/upload` so'rovi orqali yuboriladi. So'nggi bo'lakda backend
 * faylni yig'ib saqlaydi va natijani qaytaradi. Kichik fayllar ham bir bo'lak
 * sifatida xuddi shu yo'ldan o'tadi (ikkita kod yo'li saqlanmaydi).
 */
export async function uploadFileChunked(
  file: File,
  opts: { kind: UploadKind; scope: UploadScope; scopeId?: string | null },
): Promise<UploadedFileResult> {
  const CHUNK_SIZE = 3.5 * 1024 * 1024; // ~3.5MB — proksi limitidan sezilarli kichik
  const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const uploadId = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);

  for (let i = 0; i < total; i++) {
    const start = i * CHUNK_SIZE;
    const chunk = file.slice(start, start + CHUNK_SIZE);
    const fd = new FormData();
    fd.append('uploadId', uploadId);
    fd.append('chunkIndex', String(i));
    fd.append('totalChunks', String(total));
    fd.append('filename', file.name);
    fd.append('mimeType', file.type || 'application/octet-stream');
    fd.append('size', String(file.size));
    fd.append('kind', opts.kind);
    fd.append('scope', opts.scope);
    if (opts.scopeId) fd.append('scopeId', opts.scopeId);
    fd.append('file', chunk, `chunk-${i}.part`);

    const isLast = i === total - 1;
    // Oxirgi bo'lakda server barcha bo'laklarni yig'ib saqlaydi — bu boshqa
    // bo'laklarga qaraganda sekinroq bo'ladi, shuning uchun vaqtni uzaytiramiz.
    const { data } = await api.post(
      '/files/upload',
      fd,
      isLast ? { timeout: 600000 } : undefined,
    );
    if (data?.file) return data.file as UploadedFileResult;
    // `ok` davom etadi: keyingi bo'lak yuboriladi.
  }
  throw new Error('Yuklash yakunlanmadi');
}