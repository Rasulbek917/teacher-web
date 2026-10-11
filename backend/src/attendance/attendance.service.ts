import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import { computeStatus } from '../homework/homework.service';
import { dateOnly, parseDateOnly } from '../common/date.util';
import { SaveAttendanceDto } from './dto/attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  /**
   * Bitta so'rovda: o'quvchilar + sanadagi davomat + tanlangan vazifa bo'yicha
   * topshiriq holati (N+1 so'rovlarsiz).
   */
  async getForDate(
    teacherId: string,
    groupId: string,
    dateStr: string,
    homeworkId?: string,
  ) {
    await this.access.assertTeacherOwnsGroup(teacherId, groupId);

    const date = dateOnly(dateStr ? parseDateOnly(dateStr) : new Date());

    const [group, members, attendances, homeworks] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, name: true, lessonTime: true, monthlyPrice: true },
      }),
      this.prisma.groupMembership.findMany({
        where: { groupId },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
        orderBy: { student: { firstName: 'asc' } },
      }),
      this.prisma.attendance.findMany({ where: { groupId, date } }),
      this.prisma.homework.findMany({
        where: { groupId },
        orderBy: [{ dueAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        select: { id: true, title: true, dueAt: true },
      }),
    ]);

    if (!group) throw new NotFoundException('Guruh topilmadi');

    const selectedHomework =
      homeworks.find((h) => h.id === homeworkId) || homeworks[0] || null;

    const submissions = selectedHomework
      ? await this.prisma.submission.findMany({
          where: { homeworkId: selectedHomework.id },
        })
      : [];
    const subMap = new Map(submissions.map((s) => [s.studentId, s]));
    const attMap = new Map(attendances.map((a) => [a.studentId, a]));
    const now = new Date();

    const students = members.map((m) => {
      const att = attMap.get(m.studentId);
      const sub = subMap.get(m.studentId) || null;
      const status = selectedHomework
        ? computeStatus(selectedHomework.dueAt, sub, now)
        : null;
      return {
        student: m.student,
        present: att ? att.present : null,
        homeworkStatus: status,
        submission: sub
          ? {
              id: sub.id,
              text: sub.text,
              fileUrl: sub.fileUrl,
              submittedAt: sub.submittedAt,
              status: sub.status,
              result: sub.result,
              grade: sub.grade,
              comment: sub.comment,
              reviewedAt: sub.reviewedAt,
            }
          : null,
      };
    });

    const present = students.filter((s) => s.present === true).length;
    const absent = students.filter((s) => s.present === false).length;
    const submitted = students.filter((s) => s.submission).length;
    const notSubmitted = students.filter((s) => !s.submission).length;

    return {
      group,
      date: date.toISOString(),
      dateOnly: dateStr || date.toISOString().slice(0, 10),
      homeworks,
      selectedHomework,
      students,
      summary: { present, absent, submitted, notSubmitted },
    };
  }

  async save(teacherId: string, dto: SaveAttendanceDto) {
    await this.access.assertTeacherOwnsGroup(teacherId, dto.groupId);
    const date = dateOnly(parseDateOnly(dto.date));

    const memberIds = new Set(
      (
        await this.prisma.groupMembership.findMany({
          where: { groupId: dto.groupId },
          select: { studentId: true },
        })
      ).map((m) => m.studentId),
    );

    await this.prisma.$transaction(
      dto.records
        .filter((r) => memberIds.has(r.studentId))
        .map((r) =>
          this.prisma.attendance.upsert({
            where: {
              studentId_groupId_date: {
                studentId: r.studentId,
                groupId: dto.groupId,
                date,
              },
            },
            create: {
              studentId: r.studentId,
              groupId: dto.groupId,
              date,
              present: r.present,
            },
            update: { present: r.present },
          }),
        ),
    );

    return { success: true };
  }
}
