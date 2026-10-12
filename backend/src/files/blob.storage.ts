import { del, get, list, put } from '@vercel/blob';

/**
 * Fayllarni saqlash drayveri.
 *
 * - VPS (docker): fayllar diskda (`uploads/` volume) saqlanadi — `BLOB_READ_WRITE_TOKEN`
 *   berilmagan bo'lsa shu rejim ishlaydi.
 * - Vercel: fayl tizimi vaqtinchalik (stateless), shuning uchun fayllar Vercel Blob'ga
 *   yoziladi — `BLOB_READ_WRITE_TOKEN` berilganda avtomatik yoqiladi.
 *
 * Shu tarzda bir xil kod ikkala muhitda ham ishlaydi.
 */
export function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Blob'ga kirish turi. Private (standart) — fayllar faqat avtorizatsiyalangan
 * `FilesController` orqali beriladi. Agar saqlash store'i faqat public'ni
 * qo'llasa, `BLOB_ACCESS=public` qilib qo'ying.
 */
export function blobAccess(): 'public' | 'private' {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
}

/** Manzil http(s) URL (blob) yoki lokal fayl nomi (disk) ekanini aniqlaydi. */
export function isRemotePath(p?: string | null): boolean {
  return !!p && /^https?:\/\//i.test(p);
}

export async function uploadToBlob(
  pathname: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const res = await put(pathname, body, {
    access: blobAccess(),
    contentType,
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return res.url;
}

export async function deleteFromBlob(url: string): Promise<void> {
  await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
}

export async function getBlobStream(url: string) {
  return get(url, {
    access: blobAccess(),
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

// ---------------- Bo'laklangan (chunked) yuklash uchun vaqtinchalik bloblar ----------------
//
// Vercel'da har bir so'rov boshqa konteyner nusxasiga tushishi mumkin, shuning
// uchun bo'laklar xotirada emas, umumiy saqlashda (Blob) saqlanadi. Manzil
// deterministik (random suffiks yo'q) bo'lishi kerak — prefiks bo'yicha ro'yxat
// olib, bo'laklarni indeks bo'yicha yig'amiz.

/** Bo'lakni deterministik manzilga yozadi (qayta yuklashda ustiga yoziladi). */
export async function putChunkBlob(pathname: string, body: Buffer): Promise<void> {
  await put(pathname, body, {
    access: blobAccess(),
    contentType: 'application/octet-stream',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export interface ChunkBlobInfo {
  url: string;
  pathname: string;
  size: number;
}

/** Prefiks ostidagi barcha bo'lak bloblarini qaytaradi (sahifalab). */
export async function listChunkBlobs(prefix: string): Promise<ChunkBlobInfo[]> {
  const out: ChunkBlobInfo[] = [];
  let cursor: string | undefined;
  for (;;) {
    const res = await list({
      prefix,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      cursor,
      limit: 1000,
    });
    for (const b of res.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size });
    if (!res.hasMore || !res.cursor) break;
    cursor = res.cursor;
  }
  return out;
}

/** Blob tarkibini buferga o'qiydi. */
export async function readBlobBuffer(url: string): Promise<Buffer> {
  const res = await get(url, {
    access: blobAccess(),
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!res || res.statusCode !== 200 || !res.stream) {
    throw new Error(`Blob o'qib bo'lmadi: ${url}`);
  }
  const parts: Buffer[] = [];
  for await (const chunk of res.stream as unknown as AsyncIterable<Buffer>) {
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}

/** Prefiks ostidagi barcha bo'lak bloblarini o'chiradi. */
export async function deleteChunkBlobs(prefix: string): Promise<void> {
  const blobs = await listChunkBlobs(prefix);
  if (blobs.length) {
    await del(
      blobs.map((b) => b.url),
      { token: process.env.BLOB_READ_WRITE_TOKEN },
    );
  }
}
