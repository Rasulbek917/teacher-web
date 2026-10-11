import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileScope, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { getPagination, paginate } from '../common/pagination';
import { sanitizeUser } from '../common/user.util';
import {
  CreateTeacherDto,
  UpdateTeacherDto,
} from './dto/teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private files: FilesService,
  ) {}

  async list(query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query);
    const where: any = { role: Role.TEACHER };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { login: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [total, teachers] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { teacherProfile: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const ids = teachers.map((t) => t.id);
    const counts: Record<string, { groups: number; students: number }> = {};
    if (ids.length) {
      const rows = await this.prisma.$queryRaw<
        { teacher_id: string; groups: number; students: number }[]
      >`
        SELECT g."teacherId" AS teacher_id,
               COUNT(DISTINCT g.id)::int AS groups,
               COUNT(DISTINCT gm."studentId")::int AS students
        FROM "Group" g
        LEFT JOIN "GroupMembership" gm ON gm."groupId" = g.id
        WHERE g."teacherId" = ANY(${ids}::text[])
        GROUP BY g."teacherId"
      `;
      for (const r of rows) {
        counts[r.teacher_id] = { groups: Number(r.groups), students: Number(r.students) };
      }
    }

    const items = teachers.map((t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      phone: t.phone,
      login: t.login,
      avatarUrl: t.avatarUrl,
      centerName: t.teacherProfile?.centerName || '',
      city: t.teacherProfile?.city || '',
      groupsCount: counts[t.id]?.groups || 0,
      studentsCount: counts[t.id]?.students || 0,
      createdAt: t.createdAt,
    }));

    return paginate(items, total, page, pageSize);
  }

  async create(dto: CreateTeacherDto) {
    const login = dto.login.trim();
    const exists = await this.prisma.user.findUnique({ where: { login } });
    if (exists) throw new BadRequestException('Bu login band');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        role: Role.TEACHER,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone.trim(),
        login,
        passwordHash,
        teacherProfile: {
          create: { centerName: dto.centerName.trim(), city: dto.city.trim() },
        },
      },
      include: { teacherProfile: true },
    });
    return sanitizeUser(user);
  }

  async update(id: string, dto: UpdateTeacherDto) {
    const teacher = await this.prisma.user.findFirst({
      where: { id, role: Role.TEACHER },
      include: { teacherProfile: true },
    });
    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");

    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.login !== undefined) {
      const login = dto.login.trim();
      const dup = await this.prisma.user.findUnique({ where: { login } });
      if (dup && dup.id !== id) throw new BadRequestException('Bu login band');
      data.login = login;
    }
    if (dto.newPassword) {
      data.passwordHash = await bcrypt.hash(dto.newPassword, 10);
      // Parol o'zgardi: eski tokenlarni bekor qilamiz.
      data.tokenVersion = { increment: 1 };
    }

    const profileData: any = {};
    if (dto.centerName !== undefined) profileData.centerName = dto.centerName.trim();
    if (dto.city !== undefined) profileData.city = dto.city.trim();

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(Object.keys(profileData).length
          ? { teacherProfile: { upsert: { create: profileData, update: profileData } } }
          : {}),
      },
      include: { teacherProfile: true },
    });
    return sanitizeUser(updated);
  }

  /** O'chirishdan oldin ko'rsatiladigan ma'lumot (modal uchun). */
  async deletionInfo(id: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id, role: Role.TEACHER },
      select: { id: true, firstName: true, lastName: true, login: true },
    });
    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");

    const groupIds = (
      await this.prisma.group.findMany({ where: { teacherId: id }, select: { id: true } })
    ).map((g) => g.id);

    let students = 0;
    if (groupIds.length) {
      const rows = await this.prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(DISTINCT "studentId")::int AS c
        FROM "GroupMembership"
        WHERE "groupId" = ANY(${groupIds}::text[])
      `;
      students = Number(rows[0]?.c || 0);
    }

    return {
      teacher,
      groupsCount: groupIds.length,
      studentsCount: students,
    };
  }

  /**
   * O'qituvchini butunlay o'chiradi (bitta tranzaksiyada).
   * - Guruhlari, o'quvchilari (faqat shu o'qituvchiga tegishli bo'lganlar),
   *   darslari, uy vazifalari, topshiriqlari, baholari, davomati, to'lovlari,
   *   chatlari o'chadi.
   * - Boshqa o'qituvchilarning guruhida ham bo'lgan o'quvchilar SAQLANADI
   *   (faqat shu o'qituvchi guruhlaridan chiqadi).
   * - Yuklangan fayllar serverdan ham o'chiriladi.
   */
  async remove(id: string, confirmLogin: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id, role: Role.TEACHER },
      select: { id: true, login: true },
    });
    if (!teacher) throw new NotFoundException("O'qituvchi topilmadi");
    if (confirmLogin.trim() !== teacher.login) {
      throw new BadRequestException('Login noto\'g\'ri. Tasdiqlash uchun aniq loginni yozing');
    }

    const groupIds = (
      await this.prisma.group.findMany({ where: { teacherId: id }, select: { id: true } })
    ).map((g) => g.id);

    // Faqat shu o'qituvchiga tegishli (boshqa guruhda yo'q) o'quvchilar
    let exclusiveStudentIds: string[] = [];
    if (groupIds.length) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT gm."studentId" AS id
        FROM "GroupMembership" gm
        WHERE gm."groupId" = ANY(${groupIds}::text[])
          AND NOT EXISTS (
            SELECT 1 FROM "GroupMembership" other
            JOIN "Group" og ON og.id = other."groupId"
            WHERE other."studentId" = gm."studentId"
              AND og."teacherId" <> ${id}
          )
      `;
      exclusiveStudentIds = rows.map((r) => r.id);
    }

    // Chat conversation id lari (fayllar uchun)
    const convRows = await this.prisma.conversation.findMany({
      where: {
        OR: [
          groupIds.length ? { groupId: { in: groupIds } } : { id: '__none__' },
          { participants: { some: { userId: id } } },
        ],
      },
      select: { id: true },
    });
    const conversationIds = convRows.map((c) => c.id);

    const ownerIds = [id, ...exclusiveStudentIds];

    // Fayl yozuvlarini oldindan yig'ib olamiz
    const fileRows = await this.prisma.uploadedFile.findMany({
      where: {
        OR: [
          { ownerId: { in: ownerIds } },
          groupIds.length ? { scopeId: { in: groupIds } } : { id: '__none__' },
          conversationIds.length ? { scopeId: { in: conversationIds } } : { id: '__none__' },
        ],
      },
      select: { id: true },
    });

    // Asosiy DB o'chirish (tranzaksiya)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      if (exclusiveStudentIds.length) {
        await tx.user.deleteMany({ where: { id: { in: exclusiveStudentIds }, role: Role.STUDENT } });
      }
    });

    // Fayllar (disk + yozuv) - best effort
    for (const f of fileRows) {
      await this.files.removeById(f.id);
    }
    await this.prisma.uploadedFile
      .deleteMany({ where: { ownerId: { in: ownerIds } } })
      .catch(() => undefined);

    return {
      deleted: true,
      deletedStudents: exclusiveStudentIds.length,
    };
  }
}
