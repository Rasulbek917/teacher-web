import { diskStorage, memoryStorage } from 'multer';
import { randomBytes } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { uploadDir } from './files.util';
import { blobEnabled } from './blob.storage';

/**
 * Faqat ruxsat etilgan MIME turlari uchun xavfsiz kengaytmalar.
 * Kengaytma originalname'dan emas, MIME turidan olinadi — bu `.html` kabi
 * xavfli fayllar yuklanishining oldini oladi.
 */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/x-msvideo': '.avi',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
};

export function mimeExtension(mime: string): string {
  return MIME_EXT[(mime || '').toLowerCase()] || '.bin';
}

/** Tur bo'yicha maksimal hajm (MB). Avatar kichik; qolganlari bo'laklab yuklanadi. */
export const uploadMaxMb = {
  avatar: 5,
  image: 10,
  voice: 10,
  file: 250,
  attachment: 250,
  video: 250,
} as const;

export function multerOptions(maxMb: number = uploadMaxMb.attachment) {
  // Vercel Blob rejimida xotiraga o'qiymiz (lokal disk vaqtinchalik/read-only),
  // aks holda diskka yozamiz (VPS).
  const storage = blobEnabled()
    ? memoryStorage()
    : diskStorage({
        destination: (_req, _file, cb) => {
          const dir = uploadDir();
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, randomBytes(16).toString('hex') + mimeExtension(file.mimetype));
        },
      });
  return {
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 },
  };
}

/**
 * Bo'laklab (chunk) yuklash uchun multer sozlamalari. Har bir bo'lak kichik
 * (<= 4MB) bo'lgani uchun har doim xotiraga o'qiladi — bu `file.buffer`
 * mavjudligini kafolatlaydi (diskda saqlash rejimida ham).
 */
export function chunkMulterOptions(maxMb: number) {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024 },
  };
}
