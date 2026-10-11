import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FileScope, Role } from '@prisma/client';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { extractFileId, uploadDir } from './files.util';

export type UploadKind = 'avatar' | 'image' | 'video' | 'voice' | 'file' | 'attachment';

const IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
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
  'application/zip',
  'application/x-rar-compressed',
];

@Injectable()
export class FilesService {
  private readonly logger = new Logger('FilesService');

  constructor(private prisma: PrismaService) {
    const dir = uploadDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private limits(): Record<UploadKind, { mimes: string[]; maxMb: number }> {
    const att = parseInt(process.env.MAX_ATTACHMENT_SIZE_MB || '10', 10);
    return {
      avatar: { mimes: IMAGE_MIMES, maxMb: parseInt(process.env.MAX_AVATAR_SIZE_MB || '5', 10) },
      image: { mimes: IMAGE_MIMES, maxMb: att },
      video: { mimes: VIDEO_MIMES, maxMb: parseInt(process.env.MAX_VIDEO_SIZE_MB || '200', 10) },
      voice: { mimes: VOICE_MIMES, maxMb: att },
      file: { mimes: [...DOC_MIMES, ...IMAGE_MIMES], maxMb: att },
      // Homework attachments: images, videos, PDFs and documents (all optional)
      attachment: {
        mimes: [...DOC_MIMES, ...IMAGE_MIMES, ...VIDEO_MIMES],
        maxMb: parseInt(process.env.MAX_VIDEO_SIZE_MB || '200', 10),
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

    const cfg = this.limits()[kind];
    const mime = (file.mimetype || '').toLowerCase();
    const maxBytes = cfg.maxMb * 1024 * 1024;

    const cleanup = () => {
      try {
        if (file.path && existsSync(file.path)) unlinkSync(file.path);
      } catch (e) {
        this.logger.warn(`Faylni o'chirishda xatolik: ${e}`);
      }
    };

    if (!cfg.mimes.includes(mime)) {
      cleanup();
      throw new BadRequestException(
        `Fayl turi ruxsat etilmagan (${mime}). Ruxsat: ${cfg.mimes.join(', ')}`,
      );
    }
    if (file.size > maxBytes) {
      cleanup();
      throw new BadRequestException(
        `Fayl hajmi juda katta. Maksimal ${cfg.maxMb} MB`,
      );
    }

    const record = await this.prisma.uploadedFile.create({
      data: {
        path: file.filename,
        filename: file.originalname,
        mimeType: mime,
        size: file.size,
        scope,
        scopeId,
        ownerId,
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

    const path = this.absPath(file.path);
    if (!existsSync(path)) throw new NotFoundException('Fayl serverda topilmadi');
    return { file, path };
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
      const p = this.absPath(file.path);
      if (existsSync(p)) unlinkSync(p);
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
}
