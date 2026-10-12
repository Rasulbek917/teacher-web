import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileScope, MaterialType, VideoSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import { FilesService } from '../files/files.service';
import { getPagination, paginate } from '../common/pagination';
import { normalizeYoutube } from '../common/youtube.util';
import {
  CreateMaterialDto,
  UpdateMaterialDto,
} from './dto/material.dto';

@Injectable()
export class MaterialsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private files: FilesService,
  ) {}

  private map(m: any, groupName?: string) {
    return {
      id: m.id,
      groupId: m.groupId,
      groupName: groupName ?? m.group?.name,
      type: m.type,
      title: m.title,
      description: m.description,
      videoSource: m.videoSource,
      fileUrl: m.fileUrl,
      youtubeUrl: m.youtubeUrl,
      imageUrls: m.imageUrls,
      createdAt: m.createdAt,
    };
  }

  /** Bo'laklab yuklangan rasm URL'larini (JSON massiv) tekshirib oladi. */
  private async resolveImageUrls(
    raw: string | undefined,
    groupId: string,
    ownerId: string,
  ): Promise<string[]> {
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException("Rasm URL'lari noto'g'ri formatda");
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException("Rasm URL'lari noto'g'ri formatda");
    }
    const urls: string[] = [];
    for (const u of parsed) {
      if (typeof u !== 'string' || u.length > 500) {
        throw new BadRequestException("Rasm URL'lari noto'g'ri formatda");
      }
      const owned = await this.files.isOwnedGroupFile(u, groupId, ownerId);
      if (!owned) {
        throw new BadRequestException('Rasm bu guruhga tegishli emas');
      }
      urls.push(u);
    }
    return urls;
  }

  // ---- Teacher ----
  async list(teacherId: string, query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query);
    const where: any = { group: { teacherId } };
    if (query.groupId && query.groupId !== 'all') where.groupId = query.groupId;
    if (query.type) where.type = query.type;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [total, rows] = await Promise.all([
      this.prisma.material.count({ where }),
      this.prisma.material.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { group: { select: { name: true } } },
      }),
    ]);
    return paginate(rows.map((m) => this.map(m)), total, page, pageSize);
  }

  async create(
    teacherId: string,
    dto: CreateMaterialDto,
    files: Express.Multer.File[],
  ) {
    await this.access.assertTeacherOwnsGroup(teacherId, dto.groupId);

    if (dto.type === MaterialType.VIDEO) {
      const source = dto.videoSource;
      if (source === VideoSource.YOUTUBE) {
        const normalized = normalizeYoutube(dto.youtubeUrl || '');
        if (!normalized) {
          throw new BadRequestException('YouTube havolasi noto\'g\'ri');
        }
        return this.prisma.material.create({
          data: {
            groupId: dto.groupId,
            type: MaterialType.VIDEO,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            videoSource: VideoSource.YOUTUBE,
            youtubeUrl: normalized,
          },
        });
      }
      // UPLOAD: multipart fayl yoki bo'laklab yuklangan URL.
      let fileUrl: string | null = null;
      if (dto.fileUrl) {
        const owned = await this.files.isOwnedGroupFile(
          dto.fileUrl,
          dto.groupId,
          teacherId,
        );
        if (!owned) {
          throw new BadRequestException('Video fayl bu guruhga tegishli emas');
        }
        fileUrl = dto.fileUrl;
      } else {
        const video = files?.[0];
        if (!video) throw new BadRequestException('Video fayl yuklanmadi');
        const saved = await this.files.save(
          video,
          'video',
          FileScope.GROUP,
          dto.groupId,
          teacherId,
        );
        fileUrl = saved.url;
      }
      return this.prisma.material.create({
        data: {
          groupId: dto.groupId,
          type: MaterialType.VIDEO,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          videoSource: VideoSource.UPLOAD,
          fileUrl,
        },
      });
    }

    // IMAGE
    const byUrls = await this.resolveImageUrls(dto.imageUrls, dto.groupId, teacherId);
    const urlFromFiles: string[] = [];
    if (files?.length) {
      for (const f of files) {
        const saved = await this.files.save(f, 'image', FileScope.GROUP, dto.groupId, teacherId);
        urlFromFiles.push(saved.url);
      }
    }
    const urls = [...byUrls, ...urlFromFiles];
    if (urls.length === 0) {
      throw new BadRequestException('Kamida bitta rasm yuklang');
    }
    return this.prisma.material.create({
      data: {
        groupId: dto.groupId,
        type: MaterialType.IMAGE,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        imageUrls: urls,
      },
    });
  }

  async update(
    teacherId: string,
    id: string,
    dto: UpdateMaterialDto,
    files: Express.Multer.File[],
  ) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, material.groupId);

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;

    if (material.type === MaterialType.VIDEO && material.videoSource === VideoSource.YOUTUBE) {
      if (dto.youtubeUrl !== undefined) {
        const normalized = normalizeYoutube(dto.youtubeUrl);
        if (!normalized) throw new BadRequestException('YouTube havolasi noto\'g\'ri');
        data.youtubeUrl = normalized;
      }
    }

    // Yangi fayllar (ixtiyoriy)
    if (material.type === MaterialType.VIDEO && material.videoSource === VideoSource.UPLOAD) {
      // multipart fayl avval, aks holda bo'laklab yuklangan URL.
      if (files?.length) {
        const saved = await this.files.save(files[0], 'video', FileScope.GROUP, material.groupId, teacherId);
        if (material.fileUrl) await this.files.removeByUrl(material.fileUrl);
        data.fileUrl = saved.url;
      } else if (dto.fileUrl) {
        const owned = await this.files.isOwnedGroupFile(
          dto.fileUrl,
          material.groupId,
          teacherId,
        );
        if (!owned) {
          throw new BadRequestException('Video fayl bu guruhga tegishli emas');
        }
        if (material.fileUrl && material.fileUrl !== dto.fileUrl) {
          await this.files.removeByUrl(material.fileUrl);
        }
        data.fileUrl = dto.fileUrl;
      }
    } else if (material.type === MaterialType.IMAGE) {
      // Yangi rasmlar qo'shiladi (multipart fayllar + bo'laklab yuklangan URL'lar)
      const urls: string[] = [...material.imageUrls];
      const byUrls = await this.resolveImageUrls(dto.imageUrls, material.groupId, teacherId);
      urls.push(...byUrls);
      if (files?.length) {
        for (const f of files) {
          const saved = await this.files.save(f, 'image', FileScope.GROUP, material.groupId, teacherId);
          urls.push(saved.url);
        }
      }
      if (urls.length !== material.imageUrls.length) data.imageUrls = urls;
    }

    return this.prisma.material.update({ where: { id }, data });
  }

  async removeImage(teacherId: string, id: string, url: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, material.groupId);
    // Faqat shu materialga tegishli rasmni o'chirish mumkin (ixtiyoriy URL emas).
    if (!material.imageUrls.includes(url)) {
      throw new NotFoundException('Bu rasm materialga tegishli emas');
    }
    const urls = material.imageUrls.filter((u) => u !== url);
    await this.prisma.material.update({ where: { id }, data: { imageUrls: urls } });
    await this.files.removeByUrl(url);
    return { success: true };
  }

  async remove(teacherId: string, id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, material.groupId);
    await this.prisma.material.delete({ where: { id } });
    await this.files.removeManyByUrls([material.fileUrl, ...material.imageUrls]);
    return { deleted: true };
  }

  // ---- Student ----
  async forStudent(studentId: string, query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query);
    const groupIds = await this.access.studentGroupIds(studentId);
    const where: any = { groupId: { in: groupIds } };
    if (query.type) where.type = query.type;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [total, rows] = await Promise.all([
      this.prisma.material.count({ where }),
      this.prisma.material.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { group: { select: { name: true } } },
      }),
    ]);
    return paginate(rows.map((m) => this.map(m)), total, page, pageSize);
  }
}
