import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType, ReviewResult, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { computeStatus } from '../homework/homework.service';

/** Oddiy baholash: baho 0–100 (ixtiyoriy), izoh ixtiyoriy. */
export class ReviewDto {
  @IsOptional()
  @IsEnum(ReviewResult)
  result?: ReviewResult;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Baho 0 dan 100 gacha bo\'lishi kerak' })
  @Max(100, { message: 'Baho 0 dan 100 gacha bo\'lishi kerak' })
  grade?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class BulkReviewItemDto {
  @IsString()
  submissionId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  grade?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class BulkReviewDto {
  @IsArray()
  @ArrayMaxSize(200, { message: "Bir vaqtda 200 tadan ko'p topshiriqni baholab bo'lmaydi" })
  @ValidateNested({ each: true })
  @Type(() => BulkReviewItemDto)
  reviews: BulkReviewItemDto[];
}

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
  ) {}

  private serializeSubmission(sub: any) {
    return sub
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
      : null;
  }

  /** Uy vazifasi sahifasi: guruh o'quvchilari + ularning topshiriq holati. */
  async listForHomework(teacherId: string, homeworkId: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id: homeworkId },
      include: { group: { select: { id: true, name: true, teacherId: true } } },
    });
    if (!homework) throw new NotFoundException('Vazifa topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, homework.groupId);

    const [members, submissions] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: { groupId: homework.groupId },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
        orderBy: { student: { firstName: 'asc' } },
      }),
      this.prisma.submission.findMany({ where: { homeworkId } }),
    ]);
    const subMap = new Map(submissions.map((s) => [s.studentId, s]));
    const now = new Date();

    return {
      homework: {
        id: homework.id,
        title: homework.title,
        description: homework.description,
        dueAt: homework.dueAt,
        groupId: homework.groupId,
        groupName: homework.group.name,
        attachmentUrls: homework.attachmentUrls,
      },
      students: members.map((m) => {
        const sub = subMap.get(m.studentId) || null;
        return {
          student: m.student,
          submission: this.serializeSubmission(sub),
          status: computeStatus(homework.dueAt, sub, now),
        };
      }),
    };
  }

  /** Baholar bo'limi: o'quvchining shu guruhdagi barcha vazifalari. */
  async studentHomeworks(teacherId: string, studentId: string, groupId: string) {
    await this.access.assertTeacherOwnsGroup(teacherId, groupId);
    await this.access.assertStudentInGroup(studentId, groupId);

    const homeworks = await this.prisma.homework.findMany({
      where: { groupId },
      orderBy: [{ dueAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: { submissions: { where: { studentId } } },
    });
    const now = new Date();
    return homeworks.map((h) => {
      const sub = h.submissions[0] || null;
      return {
        homeworkId: h.id,
        title: h.title,
        dueAt: h.dueAt,
        status: computeStatus(h.dueAt, sub, now),
        submission: this.serializeSubmission(sub),
      };
    });
  }

  /** Baholar bo'limi: guruh o'quvchilari xulosasi. */
  async groupSummary(teacherId: string, groupId: string) {
    await this.access.assertTeacherOwnsGroup(teacherId, groupId);

    const [members, homeworks] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: { groupId },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true, isBlocked: true },
          },
        },
        orderBy: { student: { firstName: 'asc' } },
      }),
      this.prisma.homework.findMany({ where: { groupId }, select: { id: true } }),
    ]);

    const homeworkIds = homeworks.map((h) => h.id);
    const submissions = homeworkIds.length
      ? await this.prisma.submission.findMany({
          where: { homeworkId: { in: homeworkIds } },
        })
      : [];

    const byStudent = new Map<string, typeof submissions>();
    for (const s of submissions) {
      if (!byStudent.has(s.studentId)) byStudent.set(s.studentId, []);
      byStudent.get(s.studentId)!.push(s);
    }

    const students = members.map((m) => {
      const subs = byStudent.get(m.studentId) || [];
      const graded = subs.filter((s) => s.grade !== null);
      const reviewed = subs.filter((s) => s.result !== null);
      const unchecked = subs.filter((s) => s.result === null);
      const avg = graded.length
        ? Number(
            (graded.reduce((a, s) => a + (s.grade || 0), 0) / graded.length).toFixed(1),
          )
        : null;
      return {
        student: m.student,
        averageGrade: avg,
        gradedCount: reviewed.length,
        uncheckedCount: unchecked.length,
      };
    });

    return students;
  }

  /** Tekshirish (baho qo'yish) — natija ixtiyoriy, faqat baho/izoh yetarli. */
  async review(teacherId: string, submissionId: string, dto: ReviewDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        homework: { include: { group: { select: { id: true, teacherId: true, name: true } } } },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!submission) throw new NotFoundException('Topshiriq topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, submission.homework.groupId);

    const result = dto.result ?? submission.result ?? ReviewResult.DONE;
    // Faqat undefined bo'lsa mavjud qiymat saqlanadi; null yuborilsa tozalanadi.
    const grade = dto.grade === undefined ? submission.grade : dto.grade;
    const comment =
      dto.comment === undefined ? submission.comment : dto.comment.trim() || null;

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        result,
        grade,
        comment,
        reviewedAt: new Date(),
      },
    });

    // O'quvchiga bildirishnoma
    await this.notifications.create({
      userId: submission.studentId,
      type: NotificationType.HOMEWORK_REVIEWED,
      title: 'Uy vazifangiz tekshirildi',
      body: `"${submission.homework.title}" vazifangiz tekshirildi. Natija: ${
        result === ReviewResult.DONE ? 'BAJARILDI' : 'XATO'
      }${grade !== null && grade !== undefined ? `, baho: ${grade}` : ''}.`,
      link: '/my-homework',
    });

    return updated;
  }

  /** Tezkor baholash: bir nechta topshiriqqa bir vaqtda baho qo'yish. */
  async bulkReview(teacherId: string, dto: BulkReviewDto) {
    const items = (dto.reviews || []).filter((r) => r && r.submissionId);
    if (!items.length) return { updated: 0 };

    const submissions = await this.prisma.submission.findMany({
      where: { id: { in: items.map((i) => i.submissionId) } },
      include: {
        homework: { select: { id: true, title: true, group: { select: { teacherId: true } } } },
      },
    });
    const byId = new Map(submissions.map((s) => [s.id, s]));

    // Har bir topshiriq shu o'qituvchiga tegishli ekanini tekshiramiz
    for (const item of items) {
      const sub = byId.get(item.submissionId);
      if (!sub) continue;
      if (sub.homework.group.teacherId !== teacherId) {
        throw new ForbiddenException("Bu topshiriqqa ruxsat yo'q");
      }
    }

    const now = new Date();
    const targets: { item: BulkReviewItemDto; sub: (typeof submissions)[number] }[] = [];
    for (const item of items) {
      const sub = byId.get(item.submissionId);
      if (sub) targets.push({ item, sub });
    }

    // Hammasi bitta tranzaksiyada (atomik) yangilanadi.
    await this.prisma.$transaction(
      targets.map(({ item, sub }) =>
        this.prisma.submission.update({
          where: { id: item.submissionId },
          data: {
            result: sub.result ?? ReviewResult.DONE,
            grade: item.grade === undefined ? sub.grade : item.grade,
            comment:
              item.comment === undefined ? sub.comment : item.comment.trim() || null,
            reviewedAt: now,
          },
        }),
      ),
    );

    // O'quvchilarga bildirishnoma yuboramiz.
    for (const { item, sub } of targets) {
      const grade = item.grade === undefined ? sub.grade : item.grade;
      await this.notifications.create({
        userId: sub.studentId,
        type: NotificationType.HOMEWORK_REVIEWED,
        title: 'Uy vazifangiz tekshirildi',
        body: `"${sub.homework.title}" vazifangiz tekshirildi${
          grade !== null && grade !== undefined ? `, baho: ${grade}` : ''
        }.`,
        link: '/my-homework',
      });
    }

    return { updated: targets.length };
  }

  /** O'qituvchi o'quvchi topshirig'ini "qabul qilindi" deb belgilaydi (darsda). */
  async receive(teacherId: string, homeworkId: string, studentId: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id: homeworkId },
      include: { group: { select: { id: true, teacherId: true } } },
    });
    if (!homework) throw new NotFoundException('Vazifa topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, homework.groupId);
    await this.access.assertStudentInGroup(studentId, homework.groupId);

    const existing = await this.prisma.submission.findUnique({
      where: { homeworkId_studentId: { homeworkId, studentId } },
    });
    if (existing) return existing;

    return this.prisma.submission.create({
      data: {
        homeworkId,
        studentId,
        text: null,
        fileUrl: null,
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
  }
}
