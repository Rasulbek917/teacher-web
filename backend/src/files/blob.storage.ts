import { del, get, put } from '@vercel/blob';

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
