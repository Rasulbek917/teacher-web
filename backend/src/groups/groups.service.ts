import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import { FilesService } from '../files/files.service';
import { getPagination, paginate } from '../common/pagination';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private files: FilesService,
  ) {}

  async list(teacherId: string, query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query);
    const where: any = { teacherId };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [total, groups] = await Promise.all([
      this.prisma.group.count({ where }),
      this.prisma.group.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { memberships: true } } },
      }),
    ]);

    const items = groups.map((g) => ({
      id: g.id,
      name: g.name,
      level: g.level,
      lessonDays: g.lessonDays,
      lessonTime: g.lessonTime,
      monthlyPrice: g.monthlyPrice,
      studentsCount: g._count.memberships,
      createdAt: g.createdAt,
    }));
    return paginate(items, total, page, pageSize);
  }

  /** Dropdown uchun qisqa ro'yxat. */
  async options(teacherId: string) {
    const groups = await this.prisma.group.findMany({
      where: { teacherId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, level: true, monthlyPrice: true },
    });
    return groups;
  }

  /** Guruh sahifasi: guruh + o'quvchilari. */
  async detail(teacherId: string, id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, teacherId },
      include: {
        memberships: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                login: true,
                avatarUrl: true,
                isBlocked: true,
              },
            },
          },
          orderBy: { student: { firstName: 'asc' } },
        },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    return {
      id: group.id,
      name: group.name,
      level: group.level,
      lessonDays: group.lessonDays,
      lessonTime: group.lessonTime,
      monthlyPrice: group.monthlyPrice,
      createdAt: group.createdAt,
      students: group.memberships.map((m) => ({
        id: m.student.id,
        firstName: m.student.firstName,
        lastName: m.student.lastName,
        phone: m.student.phone,
        login: m.student.login,
        avatarUrl: m.student.avatarUrl,
        isBlocked: m.student.isBlocked,
        customPrice: m.customPrice,
        effectivePrice: m.customPrice ?? group.monthlyPrice,
      })),
    };
  }

  async create(teacherId: string, dto: CreateGroupDto) {
    const group = await this.prisma.group.create({
      data: {
        teacherId,
        name: dto.name.trim(),
        level: dto.level.trim(),
        lessonDays: dto.lessonDays,
        lessonTime: dto.lessonTime,
        monthlyPrice: dto.monthlyPrice,
      },
    });

    // Guruh chati yaratiladi va o'qituvchi a'zo qilinadi
    await this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        groupId: group.id,
        participants: { create: { userId: teacherId } },
      },
    });

    return group;
  }

  async update(teacherId: string, id: string, dto: UpdateGroupDto) {
    await this.access.assertTeacherOwnsGroup(teacherId, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.level !== undefined) data.level = dto.level.trim();
    if (dto.lessonDays !== undefined) data.lessonDays = dto.lessonDays;
    if (dto.lessonTime !== undefined) data.lessonTime = dto.lessonTime;
    if (dto.monthlyPrice !== undefined) data.monthlyPrice = dto.monthlyPrice;
    return this.prisma.group.update({ where: { id }, data });
  }

  /** O'chirishdan oldin ma'lumot. */
  async deletionInfo(teacherId: string, id: string) {
    await this.access.assertTeacherOwnsGroup(teacherId, id);
    const [materials, homeworks, students] = await Promise.all([
      this.prisma.material.count({ where: { groupId: id } }),
      this.prisma.homework.count({ where: { groupId: id } }),
      this.prisma.groupMembership.count({ where: { groupId: id } }),
    ]);
    return { materialsCount: materials, homeworksCount: homeworks, studentsCount: students };
  }

  async remove(teacherId: string, id: string) {
    await this.access.assertTeacherOwnsGroup(teacherId, id);
    // Chat fayllarini o'chirish uchun suhbat id sini oldin olamiz.
    const convId = await this.conversationId(id);
    // Fayllar (material, vazifa biriktirmalari, topshiriqlar) yig'iladi
    const materials = await this.prisma.material.findMany({
      where: { groupId: id },
      select: { fileUrl: true, imageUrls: true },
    });
    const homeworks = await this.prisma.homework.findMany({
      where: { groupId: id },
      select: { attachmentUrls: true },
    });
    const submissions = await this.prisma.submission.findMany({
      where: { homework: { groupId: id } },
      select: { fileUrl: true },
    });

    // Guruh cascade bilan o'chadi (material, vazifa, topshiriq, davomat, a'zolik, chat)
    await this.prisma.group.delete({ where: { id } });

    // Fayllarni o'chirish (best effort)
    const urls: (string | null | undefined)[] = [];
    for (const m of materials) {
      urls.push(m.fileUrl, ...m.imageUrls);
    }
    for (const h of homeworks) urls.push(...h.attachmentUrls);
    for (const s of submissions) urls.push(s.fileUrl);
    await this.files.removeManyByUrls(urls);
    // Guruh chati fayllari (rasm/video/ovoz) ham diskdan o'chiriladi.
    if (convId) await this.files.removeConversationFiles(convId);

    return { deleted: true };
  }

  /** O'quvchi uchun: a'zo bo'lgan guruhlar va jadvali. */
  async forStudent(studentId: string) {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { studentId },
      include: {
        group: {
          include: {
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
    return memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      level: m.group.level,
      lessonDays: m.group.lessonDays,
      lessonTime: m.group.lessonTime,
      monthlyPrice: m.group.monthlyPrice,
      customPrice: m.customPrice,
      effectivePrice: m.customPrice ?? m.group.monthlyPrice,
      teacher: m.group.teacher,
    }));
  }

  // Group chat conversation id
  async conversationId(groupId: string): Promise<string | null> {
    const c = await this.prisma.conversation.findUnique({
      where: { groupId },
      select: { id: true },
    });
    return c?.id ?? null;
  }
}
