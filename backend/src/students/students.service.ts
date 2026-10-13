import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import { FilesService } from '../files/files.service';
import { RealtimeGateway } from '../chat/realtime.gateway';
import { TelegramService } from '../telegram/telegram.service';
import { getPagination, paginate } from '../common/pagination';
import { sanitizeUser } from '../common/user.util';
import {
  CreateStudentDto,
  MembershipDto,
  UpdateStudentDto,
} from './dto/student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private files: FilesService,
    private realtime: RealtimeGateway,
    private telegram: TelegramService,
  ) {}

  /** Guruh chati ishtirokchisini qo'shadi. */
  private async addChatParticipant(studentId: string, groupId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { groupId } });
    if (!conv) return;
    await this.prisma.conversationParticipant.upsert({
      where: {
        conversationId_userId: { conversationId: conv.id, userId: studentId },
      },
      create: { conversationId: conv.id, userId: studentId },
      update: {},
    });
  }

  private async removeChatParticipant(studentId: string, groupId: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { groupId } });
    if (!conv) return;
    await this.prisma.conversationParticipant
      .delete({
        where: {
          conversationId_userId: { conversationId: conv.id, userId: studentId },
        },
      })
      .catch(() => undefined);
  }

  private async validateMemberships(teacherId: string, memberships: MembershipDto[]) {
    const ids = memberships.map((m) => m.groupId);
    const groups = await this.prisma.group.findMany({
      where: { id: { in: ids }, teacherId },
      select: { id: true },
    });
    if (groups.length !== new Set(ids).size) {
      throw new ForbiddenException('Ba\'zi guruhlar sizga tegishli emas');
    }
    return groups.map((g) => g.id);
  }

  async list(teacherId: string, query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query);
    const groupId = query.groupId as string | undefined;
    const status = query.status as string | undefined;

    const membershipFilter: any = { group: { teacherId } };
    if (groupId && groupId !== 'all') membershipFilter.groupId = groupId;

    const where: any = {
      role: Role.STUDENT,
      memberships: { some: membershipFilter },
    };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { login: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status === 'blocked') where.isBlocked = true;
    if (status === 'active') where.isBlocked = false;

    const [total, students] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { firstName: 'asc' },
        include: {
          studentProfile: true,
          memberships: {
            where: { group: { teacherId } },
            include: { group: { select: { id: true, name: true, monthlyPrice: true } } },
          },
        },
      }),
    ]);

    const items = students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone,
      parentPhone: s.studentProfile?.parentPhone || '',
      login: s.login,
      avatarUrl: s.avatarUrl,
      isBlocked: s.isBlocked,
      createdAt: s.createdAt,
      telegramLinked: !!s.studentProfile?.parentTelegramChatId,
      groups: s.memberships.map((m) => ({
        id: m.group.id,
        name: m.group.name,
        customPrice: m.customPrice,
        effectivePrice: m.customPrice ?? m.group.monthlyPrice,
      })),
    }));

    return paginate(items, total, page, pageSize);
  }

  async create(teacherId: string, dto: CreateStudentDto) {
    const login = dto.login.trim();
    await this.validateMemberships(teacherId, dto.memberships);

    let student = await this.prisma.user.findUnique({ where: { login } });
    let reused = false;

    if (student) {
      if (student.role !== Role.STUDENT) {
        throw new BadRequestException('Bu login band');
      }
      // Faqat shu o'qituvchining O'Z o'quvchisini boshqa guruhiga qo'shish mumkin.
      // Boshqa o'qituvchi guruhida bo'lsa — login band (egallab olishning oldini oladi).
      const foreignMembership = await this.prisma.groupMembership.findFirst({
        where: { studentId: student.id, group: { teacherId: { not: teacherId } } },
        select: { id: true },
      });
      if (foreignMembership) {
        throw new BadRequestException('Bu login band');
      }
      if (dto.parentPhone) {
        await this.prisma.studentProfile.upsert({
          where: { userId: student.id },
          create: { userId: student.id, parentPhone: dto.parentPhone.trim() },
          update: {},
        });
      }
      reused = true;
    } else {
      const passwordHash = await bcrypt.hash(dto.password, 10);
      student = await this.prisma.user.create({
        data: {
          role: Role.STUDENT,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone.trim(),
          login,
          passwordHash,
          studentProfile: {
            create: { parentPhone: dto.parentPhone.trim() },
          },
        },
      });
    }

    for (const m of dto.memberships) {
      await this.prisma.groupMembership.upsert({
        where: { groupId_studentId: { groupId: m.groupId, studentId: student.id } },
        create: {
          groupId: m.groupId,
          studentId: student.id,
          customPrice: m.customPrice ?? null,
        },
        update: { customPrice: m.customPrice ?? null },
      });
      await this.addChatParticipant(student.id, m.groupId);
    }

    return { id: student.id, reused };
  }

  async update(teacherId: string, id: string, dto: UpdateStudentDto) {
    const student = await this.prisma.user.findFirst({
      where: { id, role: Role.STUDENT },
      include: { studentProfile: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    await this.access.assertStudentInTeacherGroups(teacherId, id);

    const data: any = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();

    if (Object.keys(data).length) {
      await this.prisma.user.update({ where: { id }, data });
    }

    if (dto.parentPhone !== undefined) {
      await this.prisma.studentProfile.upsert({
        where: { userId: id },
        create: { userId: id, parentPhone: dto.parentPhone.trim() },
        update: { parentPhone: dto.parentPhone.trim() },
      });
    }

    if (dto.memberships) {
      await this.validateMemberships(teacherId, dto.memberships);
      const teacherGroupIds = await this.access.teacherGroupIds(teacherId);
      const current = await this.prisma.groupMembership.findMany({
        where: { studentId: id, groupId: { in: teacherGroupIds } },
        select: { groupId: true },
      });
      const wanted = new Set(dto.memberships.map((m) => m.groupId));

      // O'chirilishi kerak
      for (const c of current) {
        if (!wanted.has(c.groupId)) {
          await this.prisma.groupMembership
            .delete({
              where: { groupId_studentId: { groupId: c.groupId, studentId: id } },
            })
            .catch(() => undefined);
          await this.removeChatParticipant(id, c.groupId);
        }
      }
      // Qo'shilishi/yangilanishi kerak
      for (const m of dto.memberships) {
        await this.prisma.groupMembership.upsert({
          where: { groupId_studentId: { groupId: m.groupId, studentId: id } },
          create: { groupId: m.groupId, studentId: id, customPrice: m.customPrice ?? null },
          update: { customPrice: m.customPrice ?? null },
        });
        await this.addChatParticipant(id, m.groupId);
      }
    }

    return sanitizeUser(
      await this.prisma.user.findUnique({
        where: { id },
        include: { studentProfile: true },
      }),
    );
  }

  async setPassword(teacherId: string, id: string, newPassword: string) {
    await this.access.assertStudentInTeacherGroups(teacherId, id);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    // tokenVersion oshiriladi: o'quvchining barcha eski tokenlari kuchini yo'qotadi.
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { success: true };
  }

  /**
   * Ota-onaga Telegram ulanish havolasini beradi (kerak bo'lsa token yaratadi).
   * Havola: https://t.me/<bot>?start=<token>
   */
  async telegramLink(teacherId: string, id: string) {
    await this.access.assertStudentInTeacherGroups(teacherId, id);
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: id },
    });
    if (!profile) throw new NotFoundException("O'quvchi profili topilmadi");

    let token = profile.telegramLinkToken;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await this.prisma.studentProfile.update({
        where: { userId: id },
        data: { telegramLinkToken: token },
      });
    }

    return {
      linked: !!profile.parentTelegramChatId,
      botUsername: this.telegram.botUsername(),
      token,
      url: this.telegram.linkUrl(token),
    };
  }

  /** Ota-onaning Telegram ulanishini bekor qiladi. */
  async telegramUnlink(teacherId: string, id: string) {
    await this.access.assertStudentInTeacherGroups(teacherId, id);
    await this.prisma.studentProfile.updateMany({
      where: { userId: id },
      data: { parentTelegramChatId: null, telegramLinkedAt: null },
    });
    return { linked: false };
  }

  async setBlocked(teacherId: string, id: string, isBlocked: boolean) {
    await this.access.assertStudentInTeacherGroups(teacherId, id);
    const teacherGroupIds = await this.access.teacherGroupIds(teacherId);

    const otherMemberships = await this.prisma.groupMembership.count({
      where: { studentId: id, groupId: { notIn: teacherGroupIds } },
    });

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isBlocked },
      select: { id: true, isBlocked: true },
    });

    // Bloklanganda ochiq socket darhol uziladi (chiqarilmagan bo'lsa ham).
    if (isBlocked) this.realtime.disconnectUser(id);

    return {
      ...updated,
      affectsOtherTeachers: otherMemberships > 0,
      warning:
        isBlocked && otherMemberships > 0
          ? "Diqqat: bu o'quvchi boshqa o'qituvchi guruhida ham bor. Bloklash uning tizimga kirishini butunlay to'xtatadi."
          : null,
    };
  }

  async deletionInfo(teacherId: string, id: string) {
    await this.access.assertStudentInTeacherGroups(teacherId, id);
    const teacherGroupIds = await this.access.teacherGroupIds(teacherId);
    const [membershipsHere, totalMemberships, payments] = await Promise.all([
      this.prisma.groupMembership.count({
        where: { studentId: id, groupId: { in: teacherGroupIds } },
      }),
      this.prisma.groupMembership.count({ where: { studentId: id } }),
      this.prisma.payment.count({ where: { studentId: id } }),
    ]);
    return {
      groupsHere: membershipsHere,
      otherGroups: totalMemberships - membershipsHere,
      paymentsCount: payments,
      willDeleteAccount: totalMemberships - membershipsHere === 0,
    };
  }

  /**
   * O'quvchi o'chiriladi:
   * - shu o'qituvchi guruhlaridan chiqadi
   * - boshqa guruhlarda bo'lmasa, akkaunt butunlay o'chadi
   * - to'lov yozuvlari saqlanadi (studentName nusxasi bilan)
   */
  async remove(teacherId: string, id: string) {
    await this.access.assertStudentInTeacherGroups(teacherId, id);
    const teacherGroupIds = await this.access.teacherGroupIds(teacherId);

    // FAQAT shu o'qituvchi guruhlaridagi topshiriq javoblari o'chiriladi.
    // Boshqa o'qituvchi guruhidagi javoblar saqlanib qoladi (fayli bilan).
    const submissions = await this.prisma.submission.findMany({
      where: { studentId: id, homework: { groupId: { in: teacherGroupIds } } },
      select: { id: true, fileUrl: true },
    });

    const membershipsHere = await this.prisma.groupMembership.findMany({
      where: { studentId: id, groupId: { in: teacherGroupIds } },
      select: { groupId: true },
    });

    for (const m of membershipsHere) {
      await this.removeChatParticipant(id, m.groupId);
    }

    if (submissions.length) {
      await this.prisma.submission.deleteMany({
        where: { id: { in: submissions.map((s) => s.id) } },
      });
    }

    // Shu o'qituvchi guruhlaridan chiqarish
    await this.prisma.groupMembership.deleteMany({
      where: { studentId: id, groupId: { in: teacherGroupIds } },
    });

    const remaining = await this.prisma.groupMembership.count({ where: { studentId: id } });
    if (remaining === 0) {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { avatarUrl: true },
      });
      await this.prisma.user.delete({ where: { id } });
      await this.files.removeManyByUrls([user?.avatarUrl]);
      // Akkaunt o'chdi: ochiq socketni uzamiz.
      this.realtime.disconnectUser(id);
    }

    await this.files.removeManyByUrls(submissions.map((s) => s.fileUrl));
    return { deleted: true, accountDeleted: remaining === 0 };
  }
}
