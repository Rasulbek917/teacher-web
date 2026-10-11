import { Injectable, NotFoundException } from '@nestjs/common';
import { ReviewResult, SubmissionStatus, Submission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import {
  dateOnly,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from '../common/date.util';
import { computeStatus } from '../homework/homework.service';

interface Range {
  start: Date;
  end: Date;
}

@Injectable()
export class StatisticsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  private weekRange(ref: Date): Range {
    return { start: startOfWeek(ref), end: endOfWeek(ref) };
  }
  private monthRange(ref: Date): Range {
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }

  private pct(part: number, total: number): number {
    if (!total) return 0;
    return Number(((part / total) * 100).toFixed(1));
  }

  private async buildStats(
    groupIds: string[],
    range: Range,
    studentId?: string,
  ) {
    if (!groupIds.length) {
      return {
        totals: {
          lessonsCount: 0,
          attendancePct: 0,
          homeworksCount: 0,
          submissionPct: 0,
          avgGrade: null,
        },
        students: [],
      };
    }
    const sDate = dateOnly(range.start);
    const eDate = dateOnly(range.end);
    const now = new Date();

    const membershipWhere: any = { groupId: { in: groupIds } };
    if (studentId) membershipWhere.studentId = studentId;
    const members = await this.prisma.groupMembership.findMany({
      where: membershipWhere,
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    const attendanceWhere: any = {
      groupId: { in: groupIds },
      date: { gte: sDate, lte: eDate },
    };
    if (studentId) attendanceWhere.studentId = studentId;

    // Muddat (dueAt) ixtiyoriy: muddatsiz vazifalar createdAt bo'yicha hisobga olinadi.
    const homeworks = await this.prisma.homework.findMany({
      where: {
        groupId: { in: groupIds },
        OR: [
          { dueAt: { gte: range.start, lte: range.end } },
          { dueAt: null, createdAt: { gte: range.start, lte: range.end } },
        ],
      },
      select: { id: true, dueAt: true, groupId: true },
    });
    const homeworkIds = homeworks.map((h) => h.id);

    const attendance = await this.prisma.attendance.findMany({
      where: attendanceWhere,
    });
    let submissions: Submission[] = [];
    if (homeworkIds.length) {
      submissions = await this.prisma.submission.findMany({
        where: {
          homeworkId: { in: homeworkIds },
          ...(studentId ? { studentId } : {}),
        },
      });
    }

    const lessonsCount = new Set(attendance.map((a) => a.date.toISOString())).size;
    const totalPresent = attendance.filter((a) => a.present).length;
    const totalAbsent = attendance.filter((a) => !a.present).length;
    const totalSubmitted = submissions.length;
    const allGrades = submissions.map((s) => s.grade).filter((g): g is number => g !== null);

    const attByStudent = new Map<string, { present: number; absent: number }>();
    for (const a of attendance) {
      if (!attByStudent.has(a.studentId)) attByStudent.set(a.studentId, { present: 0, absent: 0 });
      const rec = attByStudent.get(a.studentId)!;
      if (a.present) rec.present += 1;
      else rec.absent += 1;
    }
    const subByStudent = new Map<string, typeof submissions>();
    for (const s of submissions) {
      if (!subByStudent.has(s.studentId)) subByStudent.set(s.studentId, []);
      subByStudent.get(s.studentId)!.push(s);
    }
    const studentIds = members.map((m) => m.studentId);
    const homeworkByGroup = new Map<string, { id: string; dueAt: Date | null }[]>();
    for (const h of homeworks) {
      if (!homeworkByGroup.has(h.groupId)) homeworkByGroup.set(h.groupId, []);
      homeworkByGroup.get(h.groupId)!.push(h);
    }

    const students = members.map((m) => {
      const att = attByStudent.get(m.studentId) || { present: 0, absent: 0 };
      const subs = subByStudent.get(m.studentId) || [];
      const groupHomeworks = homeworkByGroup.get(m.groupId) || [];
      const submittedIds = new Set(subs.map((s) => s.homeworkId));
      const missed = groupHomeworks.filter(
        (h) => !submittedIds.has(h.id) && !!h.dueAt && now.getTime() > h.dueAt.getTime(),
      ).length;
      const grades = subs.map((s) => s.grade).filter((g): g is number => g !== null);
      return {
        student: m.student,
        present: att.present,
        absent: att.absent,
        attendancePct: this.pct(att.present, att.present + att.absent),
        homework: {
          assigned: groupHomeworks.length,
          submitted: subs.length,
          missed,
          late: subs.filter((s) => s.status === SubmissionStatus.LATE).length,
          done: subs.filter((s) => s.result === ReviewResult.DONE).length,
          wrong: subs.filter((s) => s.result === ReviewResult.WRONG).length,
        },
        avgGrade: grades.length
          ? Number((grades.reduce((a, g) => a + g, 0) / grades.length).toFixed(1))
          : null,
      };
    });

    return {
      totals: {
        lessonsCount,
        attendancePct: this.pct(totalPresent, totalPresent + totalAbsent),
        homeworksCount: homeworks.length,
        // To'g'ri maxraj: vazifalar soni × o'quvchilar soni (100% dan oshmaydi).
        submissionPct: this.pct(totalSubmitted, homeworks.length * members.length),
        avgGrade: allGrades.length
          ? Number(
              (allGrades.reduce((a, g) => a + g, 0) / allGrades.length).toFixed(1),
            )
          : null,
      },
      students,
      _studentIds: studentIds,
    };
  }

  async groupStatistics(groupId: string, teacherId: string, dateStr?: string) {
    await this.access.assertTeacherOwnsGroup(teacherId, groupId);
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, level: true, lessonDays: true, lessonTime: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const ref = dateStr ? new Date(dateStr) : new Date();
    const week = await this.buildStats([groupId], this.weekRange(ref));
    const month = await this.buildStats([groupId], this.monthRange(ref));

    return {
      group,
      referenceDate: ref.toISOString(),
      week: { start: this.weekRange(ref).start, end: this.weekRange(ref).end, ...week },
      month: { start: this.monthRange(ref).start, end: this.monthRange(ref).end, ...month },
    };
  }

  async studentDetailForTeacher(
    teacherId: string,
    studentId: string,
    groupId: string,
    unit: string,
    dateStr?: string,
  ) {
    await this.access.assertTeacherOwnsGroup(teacherId, groupId);
    await this.access.assertStudentInGroup(studentId, groupId);
    const ref = dateStr ? new Date(dateStr) : new Date();
    const range = unit === 'month' ? this.monthRange(ref) : this.weekRange(ref);
    const detail = await this.buildDetail([groupId], studentId, range);
    return { range: { start: range.start, end: range.end }, ...detail };
  }

  private async buildDetail(groupIds: string[], studentId: string, range: Range) {
    const sDate = dateOnly(range.start);
    const eDate = dateOnly(range.end);
    const now = new Date();

    const attendance = await this.prisma.attendance.findMany({
      where: { groupId: { in: groupIds }, studentId, date: { gte: sDate, lte: eDate } },
      orderBy: { date: 'asc' },
    });
    const homeworks = await this.prisma.homework.findMany({
      where: {
        groupId: { in: groupIds },
        OR: [
          { dueAt: { gte: range.start, lte: range.end } },
          { dueAt: null, createdAt: { gte: range.start, lte: range.end } },
        ],
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      include: { submissions: { where: { studentId } } },
    });
    return {
      days: attendance.map((a) => ({ date: a.date, present: a.present })),
      homeworks: homeworks.map((h) => {
        const sub = h.submissions[0] || null;
        return {
          id: h.id,
          title: h.title,
          dueAt: h.dueAt,
          status: computeStatus(h.dueAt, sub, now),
          result: sub?.result ?? null,
          grade: sub?.grade ?? null,
        };
      }),
    };
  }

  async myStatistics(studentId: string, unit: string, dateStr?: string, groupId?: string) {
    const groupIds = groupId
      ? [groupId]
      : await this.access.studentGroupIds(studentId);
    if (groupId) {
      await this.access.assertStudentInGroup(studentId, groupId);
    }
    const ref = dateStr ? new Date(dateStr) : new Date();
    const week = await this.buildStats(groupIds, this.weekRange(ref), studentId);
    const month = await this.buildStats(groupIds, this.monthRange(ref), studentId);

    const detailRange = unit === 'month' ? this.monthRange(ref) : this.weekRange(ref);
    const detail = await this.buildDetail(groupIds, studentId, detailRange);

    return {
      referenceDate: ref.toISOString(),
      week: { start: this.weekRange(ref).start, end: this.weekRange(ref).end, ...week },
      month: { start: this.monthRange(ref).start, end: this.monthRange(ref).end, ...month },
      detail,
    };
  }
}
