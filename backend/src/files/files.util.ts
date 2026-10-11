import { join, resolve } from 'path';

export function uploadDir(): string {
  // Doim absolyut yo'l qaytaradi (res.sendFile absolyut yo'l talab qiladi).
  return resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
}

/** `/api/files/<id>` ko'rinishidagi URL'dan fayl id sini ajratib oladi. */
export function extractFileId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/files\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
