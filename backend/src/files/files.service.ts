import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FileScope, Role } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { extractFileId, uploadDir } from './files.util';
import { mimeExtension } from './multer.config';
import {
  blobEnabled,
  deleteChunkBlobs,
  deleteFromBlob,
  isRemotePath,
  listChunkBlobs,
  putChunkBlob,
  readBlobBuffer,
  uploadToBlob,
} from './blob.storage';

export type UploadKind = 'avatar' | 'image' | 'video' | 'voice' | 'file' | 'attachment';

/** Bo'laklangan yuklash uchun har bir bo'lak so'rovidagi meta ma'lumotlar. */
export interface ChunkUploadMeta {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  filename: string;
  mimeType: string;
  size: number;
  kind: UploadKind;
  scope: FileScope;
  scopeId: string | null;
}

// Ruxsat etilgan turlar. FAQAT xavfsiz (inline bajarilmaydigan) turlar —
// `text/html`, `image/svg+xml` kabi skript ishlatishi mumkin bo'lgan turlar
// ataylab kiritilmagan.
const IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/tiff',
];
const VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/3gpp',
  'video/x-m4v',
  'video/mpeg',
  'video/ogg',
];
const VOICE_MIMES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
];
const DOC_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'application/rtf',
  'text/rtf',
  'application/zip',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
];

/**
 * Fayl kengaytmasidan xavfsiz MIME turni aniqlaydi. Ba'zi brauzerlar (ayniqsa
 * Windows/telefon) fayl turini bilmasa `application/octet-stream` yuboradi —
 * shunda kengaytmadan turni tiklaymiz (faqat yuqoridagi xavfsiz ro'yxatdan).
 */
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  m4v: 'video/x-m4v',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
};

function inferMimeFromName(name?: string): string | null {
  if (!name) return null;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_MIME[ext] ?? null;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger('FilesService');

  constructor(private prisma: PrismaService) {
    // Vercel Blob rejimida lokal papka kerak emas (fayl tizimi vaqtinchalik bo'lishi mumkin).
    if (!blobEnabled()) {
      const dir = uploadDir();
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      // Yarim qolgan bo'lak papkalarini tozalaymiz — restartdan keyin ularni
      // davom ettirib bo'lmaydi.
      const chunks = join(dir, '.chunks');
      if (existsSync(chunks)) rmSync(chunks, { recursive: true, force: true });
    }
  }

  private limits(): Record<UploadKind, { mimes: string[]; maxMb: number }> {
    // Uy vazifasi biriktirmalari va chat/file yuklashlar uchun maksimal hajm (MB).
    // Vercel proksi 4.5MB so'rov limiti tufayli katta fayllar bo'laklab
    // yuklanadi (FilesController /files/upload), shuning uchun bu qiymat
    // disk/blob saqlash uchun yuqori bo'lishi mumkin.
    const att = parseInt(process.env.MAX_ATTACHMENT_SIZE_MB || '250', 10);
    return {
      avatar: { mimes: IMAGE_MIMES, maxMb: parseInt(process.env.MAX_AVATAR_SIZE_MB || '5', 10) },
      image: { mimes: IMAGE_MIMES, maxMb: att },
      video: { mimes: VIDEO_MIMES, maxMb: parseInt(process.env.MAX_VIDEO_SIZE_MB || '250', 10) },
      voice: { mimes: VOICE_MIMES, maxMb: att },
      file: { mimes: [...DOC_MIMES, ...IMAGE_MIMES], maxMb: att },
      // Homework attachments: images, videos, PDFs and documents (all optional)
      attachment: {
        mimes: [...DOC_MIMES, ...IMAGE_MIMES, ...VIDEO_MIMES],
        maxMb: att,
      },
    };
  }

  async save(
    file: Express.Multer.File | undefined,
    kind: UploadKind,
    scope: FileScope,
    scopeId: string | null,
    ownerId: string,
  ) {
    if (!file) throw new BadRequestException('Fayl yuklanmadi');

    const cleanup = () => {
      try {
        if (file.path && existsSync(file.path)) unlinkSync(file.path);
      } catch (e) {
        this.logger.warn(`Faylni o'chirishda xatolik: ${e}`);
      }
    };

    try {
      return await this.saveBuffer({
        buffer: file.buffer,
        diskPath: file.path,
        diskFilename: file.filename,
        originalname: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        kind,
        scope,
        scopeId,
        ownerId,
      });
    } catch (e) {
      cleanup();
      throw e;
    }
  }

  /**
   * Buffer'dan faylni validatsiya qilib saqlaydi (multer'siz bo'laklangan
   * yuklash yo'li uchun). Vercel Blob yoki diskka yozadi va DB yozuvini yaratadi.
   */
  async saveBuffer(input: {
    buffer: Buffer | undefined;
    originalname: string;
    mimeType: string;
    size: number;
    kind: UploadKind;
    scope: FileScope;
    scopeId: string | null;
    ownerId: string;
    diskPath?: string;
    diskFilename?: string;
  }) {
    const cfg = this.limits()[input.kind];
    let mime = (input.mimeType || '').toLowerCase();
    const maxBytes = cfg.maxMb * 1024 * 1024;

    // Ba'zi brauzerlar turni bilmasa `application/octet-stream` (yoki bo'sh)
    // yuboradi. Bunday holatda avval kengaytmadan xavfsiz turni tiklaymiz,
    // aks holda biriktirma/fayl uchun octet-stream sifatida qabul qilamiz
    // (octet-stream inline bajarilmaydi — xavfsiz).
    if (!cfg.mimes.includes(mime)) {
      const inferred = inferMimeFromName(input.originalname);
      if (inferred && cfg.mimes.includes(inferred)) {
        mime = inferred;
      } else if (
        (mime === 'application/octet-stream' || mime === '') &&
        (input.kind === 'file' || input.kind === 'attachment')
      ) {
        mime = 'application/octet-stream';
      } else {
        throw new BadRequestException(
          `Fayl turi qo'llab-quvvatlanmaydi (${mime || 'noma\'lum'}). ` +
            `Rasm, video, PDF yoki hujjat yuklang.`,
        );
      }
    }
    const totalSize = Number(input.size) || input.buffer?.byteLength || 0;
    if (totalSize > maxBytes) {
      throw new BadRequestException(
        `Fayl hajmi juda katta. Maksimal ${cfg.maxMb} MB`,
      );
    }

    const storedPath = await this.storeBuffer({
      buffer: input.buffer,
      diskPath: input.diskPath,
      diskFilename: input.diskFilename,
      mime,
    });

    const record = await this.prisma.uploadedFile.create({
      data: {
        path: storedPath,
        filename: input.originalname,
        mimeType: mime,
        size: Math.max(1, Math.min(totalSize, 2147483647)),
        scope: input.scope,
        scopeId: input.scopeId,
        ownerId: input.ownerId,
      },
    });

    return {
      id: record.id,
      url: `/api/files/${record.id}`,
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
    };
  }

  /** Vercel Blob yoki diskka saqlaydi va saqlangan yo'lni qaytaradi. */
  private async storeBuffer(opts: {
    buffer?: Buffer;
    diskPath?: string;
    diskFilename?: string;
    mime: string;
  }): Promise<string> {
    if (blobEnabled()) {
      if (!opts.buffer) throw new BadRequestException('Fayl buferi topilmadi');
      const pathname = randomBytes(16).toString('hex') + mimeExtension(opts.mime);
      return uploadToBlob(pathname, opts.buffer, opts.mime);
    }
    // Disk rejimi: multer allaqachon yozgan bo'lsa shu faylni ishlatamiz
    // (bo'laklangan yuklashda esa yig'ilgan buffer'ni o'zimiz yozamiz).
    if (opts.diskPath && opts.diskFilename) return opts.diskFilename;
    if (!opts.buffer) throw new BadRequestException('Fayl buferi topilmadi');
    const filename = randomBytes(16).toString('hex') + mimeExtension(opts.mime);
    const dir = uploadDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), opts.buffer);
    return filename;
  }

  /** DB yozuvi bo'yicha fayl absolyut yo'lini qaytaradi. */
  private absPath(filePath: string): string {
    return join(uploadDir(), filePath);
  }

  async authorize(id: string, userId: string) {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Fayl topilmadi');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new ForbiddenException('Ruxsat yo\'q');

    let allowed = false;
    if (file.scope === FileScope.AVATAR) {
      allowed = true;
    } else if (file.scope === FileScope.CONVERSATION) {
      if (file.scopeId) {
        const part = await this.prisma.conversationParticipant.findUnique({
          where: {
            conversationId_userId: {
              conversationId: file.scopeId,
              userId,
            },
          },
        });
        allowed = !!part;
      }
    } else if (file.scope === FileScope.GROUP) {
      // Guruh materiallari: egasi, guruh o'qituvchisi yoki guruh a'zosi.
      if (file.ownerId === userId) allowed = true;
      if (!allowed && file.scopeId) {
        const group = await this.prisma.group.findUnique({
          where: { id: file.scopeId },
          select: { teacherId: true },
        });
        if (group && group.teacherId === userId) allowed = true;
        if (!allowed) {
          const membership = await this.prisma.groupMembership.findUnique({
            where: { groupId_studentId: { groupId: file.scopeId, studentId: userId } },
          });
          if (membership) allowed = true;
        }
      }
    } else if (file.scope === FileScope.SUBMISSION) {
      // Topshiriq fayllari: FAQAT fayl egasi yoki guruh o'qituvchisi.
      // Boshqa o'quvchilar ko'ra olmaydi.
      if (file.ownerId === userId) allowed = true;
      if (!allowed && file.scopeId) {
        const group = await this.prisma.group.findUnique({
          where: { id: file.scopeId },
          select: { teacherId: true },
        });
        if (group && group.teacherId === userId) allowed = true;
      }
    }

    if (!allowed) throw new ForbiddenException('Bu faylga ruxsat yo\'q');

    // Vercel Blob: controller URL'ni stream qiladi (public URL'ni oshkor qilmaymiz).
    if (isRemotePath(file.path)) {
      return { file, path: undefined as string | undefined, remoteUrl: file.path };
    }
    const path = this.absPath(file.path);
    if (!existsSync(path)) throw new NotFoundException('Fayl serverda topilmadi');
    return { file, path, remoteUrl: undefined as string | undefined };
  }

  /** URL bo'yicha fayl yozuvini va diskdagi faylni o'chiradi. */
  async removeByUrl(url?: string | null) {
    const id = extractFileId(url);
    if (!id) return;
    await this.removeById(id);
  }

  async removeById(id: string) {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) return;
    try {
      if (isRemotePath(file.path)) {
        await deleteFromBlob(file.path);
      } else {
        const p = this.absPath(file.path);
        if (existsSync(p)) unlinkSync(p);
      }
    } catch (e) {
      this.logger.warn(`Faylni o'chirishda xatolik: ${e}`);
    }
    await this.prisma.uploadedFile.delete({ where: { id } }).catch(() => undefined);
  }

  async removeManyByUrls(urls: (string | null | undefined)[]) {
    for (const u of urls) {
      await this.removeByUrl(u);
    }
  }

  /**
   * Yuklangan yoki yuklanayotgan vaqtinchalik faylni diskdan o'chiradi
   * (DB yozuvi yaratilmagan bo'lsa ham). Xatolik holatida ishlatiladi.
   */
  discard(file?: Express.Multer.File) {
    if (!file?.path) return;
    try {
      if (existsSync(file.path)) unlinkSync(file.path);
    } catch (e) {
      this.logger.warn(`Faylni o'chirishda xatolik: ${e}`);
    }
  }

  /**
   * URL bo'yicha faylni FAQAT u shu suhbatga tegishli va shu egasi
   * yuklagan bo'lsa o'chiradi. Aks holda hech narsa qilmaydi.
   */
  async removeConversationFileOwnedBy(
    url: string | null | undefined,
    conversationId: string,
    ownerId: string,
  ) {
    const id = extractFileId(url);
    if (!id) return;
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) return;
    if (
      file.scope !== FileScope.CONVERSATION ||
      file.scopeId !== conversationId ||
      file.ownerId !== ownerId
    ) {
      return;
    }
    await this.removeById(id);
  }

  /** URL bo'yicha fayl yozuvi shu suhbatga va shu egasiga tegishlimi. */
  async isOwnedConversationFile(
    url: string | null | undefined,
    conversationId: string,
    ownerId: string,
  ): Promise<boolean> {
    const id = extractFileId(url);
    if (!id) return false;
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    return (
      !!file &&
      file.scope === FileScope.CONVERSATION &&
      file.scopeId === conversationId &&
      file.ownerId === ownerId
    );
  }

  /** Suhbatga tegishli barcha chat fayllarini o'chiradi (guruh o'chirilganda). */
  async removeConversationFiles(conversationId: string) {
    const files = await this.prisma.uploadedFile.findMany({
      where: { scope: FileScope.CONVERSATION, scopeId: conversationId },
      select: { id: true },
    });
    for (const f of files) await this.removeById(f.id);
  }

  // ---------------- Bo'laklangan (chunked) yuklash ----------------
  //
  // MUHIM: Vercel'da har bir so'rov boshqa konteyner nusxasiga tushishi mumkin,
  // shuning uchun bo'laklarni jarayon xotirasida (Map) saqlab bo'lmaydi. Bo'laklar
  // umumiy saqlashda — Vercel Blob yoki lokal diskda — saqlanadi, oxirgi bo'lak
  // kelganda o'sha yerdan o'qib yig'iladi va vaqtinchalik bo'laklar o'chiriladi.

  /** Bo'laklar saqlanadigan prefiks/papka (blob manzili shu bilan boshlanadi). */
  private chunkPrefix(uploadId: string) {
    return `chunks/${uploadId}/`;
  }

  private chunkKey(index: number) {
    return String(index).padStart(6, '0');
  }

  private async putChunk(uploadId: string, index: number, buffer: Buffer) {
    if (blobEnabled()) {
      await putChunkBlob(`${this.chunkPrefix(uploadId)}${this.chunkKey(index)}`, buffer);
      return;
    }
    const dir = join(uploadDir(), '.chunks', uploadId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, this.chunkKey(index)), buffer);
  }

  private async listChunkIndices(uploadId: string): Promise<Set<number>> {
    if (blobEnabled()) {
      const blobs = await listChunkBlobs(this.chunkPrefix(uploadId));
      return new Set(
        blobs
          .map((b) => parseInt(b.pathname.split('/').pop() || '', 10))
          .filter((n) => Number.isInteger(n)),
      );
    }
    const dir = join(uploadDir(), '.chunks', uploadId);
    if (!existsSync(dir)) return new Set();
    return new Set(
      readdirSync(dir)
        .map((f) => parseInt(f, 10))
        .filter((n) => Number.isInteger(n)),
    );
  }

  private async getChunk(uploadId: string, index: number): Promise<Buffer> {
    const key = this.chunkKey(index);
    if (blobEnabled()) {
      const blobs = await listChunkBlobs(`${this.chunkPrefix(uploadId)}${key}`);
      if (!blobs.length) throw new BadRequestException("Bo'lak topilmadi");
      return readBlobBuffer(blobs[0].url);
    }
    return readFileSync(join(uploadDir(), '.chunks', uploadId, key));
  }

  private async deleteChunks(uploadId: string) {
    if (blobEnabled()) {
      await deleteChunkBlobs(this.chunkPrefix(uploadId));
      return;
    }
    const dir = join(uploadDir(), '.chunks', uploadId);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  /**
   * Katta faylni bo'laklab yuklash uchun bitta bo'lakni qabul qiladi.
   * Har bir bo'lak ≤ 4MB (Vercel proksi limitidan kichik). So'nggi bo'lak
   * kelganda barcha bo'laklar yig'ilib saqlanadi va natija qaytariladi.
   */
  async addChunk(
    userId: string,
    role: Role,
    meta: ChunkUploadMeta,
    buffer: Buffer | undefined,
  ): Promise<{
    done: boolean;
    file?: { id: string; url: string; filename: string; mimeType: string; size: number };
  }> {
    if (!buffer || buffer.byteLength === 0) {
      throw new BadRequestException("Fayl bo'lagi yuklanmadi");
    }

    const { uploadId, chunkIndex, totalChunks, filename, mimeType, kind, scope, scopeId, size } =
      meta;

    if (!/^[A-Za-z0-9_-]{8,64}$/.test(uploadId || '')) {
      throw new BadRequestException("Noto'g'ri uploadId");
    }
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 1000) {
      throw new BadRequestException("Bo'laklar soni noto'g'ri");
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks) {
      throw new BadRequestException("Bo'lak indeksi noto'g'ri");
    }
    if (!Number.isFinite(size) || size <= 0 || size > 512 * 1024 * 1024) {
      throw new BadRequestException("Fayl hajmi noto'g'ri");
    }

    // Holat xotirada saqlanmagani uchun har bir bo'lak uchun (bo'lakni
    // yozishdan oldin) huquqni tekshiramiz.
    const allowed = await this.canUpload(userId, role, scope, scopeId);
    if (!allowed) {
      throw new ForbiddenException("Bu joyga fayl yuklashga ruxsat yo'q");
    }

    await this.putChunk(uploadId, chunkIndex, buffer);

    // Mijoz bo'laklarni ketma-ket yuboradi; faqat oxirgi indeks kelganda
    // yig'amiz (avvalgi so'rovlar boshqa nusxaga tushgan bo'lsa ham bo'laklar
    // umumiy saqlashda turibdi).
    if (chunkIndex !== totalChunks - 1) return { done: false };

    const present = await this.listChunkIndices(uploadId);
    if (present.size < totalChunks) return { done: false };

    // Yig'ish: to'liq hajmni oldindan band qilib, bo'laklarni birma-bir
    // ko'chiramiz — bir vaqtda xotirada faqat bitta bo'lak va natija bo'ladi.
    const assembled = Buffer.allocUnsafe(size);
    let offset = 0;
    for (let i = 0; i < totalChunks; i++) {
      const b = await this.getChunk(uploadId, i);
      if (offset + b.byteLength > size) {
        await this.deleteChunks(uploadId);
        throw new BadRequestException("Bo'laklar hajmi mos kelmadi");
      }
      b.copy(assembled, offset);
      offset += b.byteLength;
    }
    await this.deleteChunks(uploadId);
    if (offset !== size) {
      throw new BadRequestException(
        `Fayl hajmi mos kelmadi (kutilgan: ${size}, olindi: ${offset})`,
      );
    }

    const file = await this.saveBuffer({
      buffer: assembled,
      originalname: filename,
      mimeType,
      size,
      kind,
      scope,
      scopeId,
      ownerId: userId,
    });
    return { done: true, file };
  }

  /** Foydalanuvchi berilgan scope / scopeId ga fayl yuklay oladimi. */
  async canUpload(
    userId: string,
    role: Role,
    scope: FileScope,
    scopeId: string | null,
  ): Promise<boolean> {
    if (scope === FileScope.AVATAR) return true;
    if (!scopeId) return false;
    if (scope === FileScope.GROUP) {
      if (role !== Role.TEACHER) return false;
      const g = await this.prisma.group.findUnique({
        where: { id: scopeId },
        select: { teacherId: true },
      });
      return !!g && g.teacherId === userId;
    }
    if (scope === FileScope.CONVERSATION) {
      const p = await this.prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId: scopeId, userId } },
      });
      return !!p;
    }
    if (scope === FileScope.SUBMISSION) {
      const g = await this.prisma.group.findUnique({
        where: { id: scopeId },
        select: { teacherId: true },
      });
      if (g && g.teacherId === userId) return true;
      const m = await this.prisma.groupMembership.findUnique({
        where: { groupId_studentId: { groupId: scopeId, studentId: userId } },
      });
      return !!m;
    }
    return false;
  }

  /** URL shu guruhga va shu egasiga tegishli biriktirma faylimi. */
  async isOwnedGroupFile(
    url: string | null | undefined,
    groupId: string,
    ownerId: string,
  ): Promise<boolean> {
    const id = extractFileId(url);
    if (!id) return false;
    const f = await this.prisma.uploadedFile.findUnique({ where: { id } });
    return (
      !!f && f.scope === FileScope.GROUP && f.scopeId === groupId && f.ownerId === ownerId
    );
  }

  /** URL shu guruh topshirig'i faylimi (o'quvchi egasi). */
  async isOwnedSubmissionFile(
    url: string | null | undefined,
    groupId: string,
    ownerId: string,
  ): Promise<boolean> {
    const id = extractFileId(url);
    if (!id) return false;
    const f = await this.prisma.uploadedFile.findUnique({ where: { id } });
    return (
      !!f &&
      f.scope === FileScope.SUBMISSION &&
      f.scopeId === groupId &&
      f.ownerId === ownerId
    );
  }

  /** URL avatar faylimi (shu foydalanuvchi yuklagan). */
  async isOwnedAvatarFile(
    url: string | null | undefined,
    ownerId: string,
  ): Promise<boolean> {
    const id = extractFileId(url);
    if (!id) return false;
    const f = await this.prisma.uploadedFile.findUnique({ where: { id } });
    return !!f && f.scope === FileScope.AVATAR && f.ownerId === ownerId;
  }
}
