import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileScope, NotificationType, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access/access.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getPagination, paginate } from '../common/pagination';
import { CreateHomeworkDto, UpdateHomeworkDto } from './dto/homework.dto';

export type ApiStatus = 'SUBMITTED' | 'LATE' | 'MISSING' | 'PENDING';

/** O'quvchi topshirig'i holati (muddat ixtiyoriy bo'lishi mumkin). */
export function computeStatus(
  dueAt: Date | null,
  submission: { status: SubmissionStatus } | null,
  now = new Date(),
): ApiStatus {
  if (submission) return submission.status as ApiStatus;
  return dueAt && now.getTime() > dueAt.getTime() ? 'MISSING' : 'PENDING';
}

@Injectable()
export class HomeworkService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private files: FilesService,
    private notifications: NotificationsService,
  ) {}

  private async saveAttachments(
    files: Express.Multer.File[] | undefined,
    groupId: string,
    ownerId: string,
  ): Promise<string[]> {
    const urls: string[] = [];
    if (!files?.length) return urls;
    for (const file of files) {
      const saved = await this.files.save(
        file,
        'attachment',
        FileScope.GROUP,
        groupId,
        ownerId,
      );
      urls.push(saved.url);
    }
    return urls;
  }

  // ---------------- Teacher ----------------
  async list(teacherId: string, query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query);
    const where: any = { group: { teacherId } };
    if (query.groupId && query.groupId !== 'all') where.groupId = query.groupId;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [total, homeworks] = await Promise.all([
      this.prisma.homework.count({ where }),
      this.prisma.homework.findMany({
        where,
        skip,
        take,
        orderBy: [{ dueAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: {
          group: { select: { id: true, name: true, _count: { select: { memberships: true } } } },
        },
      }),
    ]);

    const ids = homeworks.map((h) => h.id);
    const now = new Date();
    const submittedMap = new Map<string, { submitted: number; unchecked: number }>();
    if (ids.length) {
      const subs = await this.prisma.submission.findMany({
        where: { homeworkId: { in: ids } },
        select: { homeworkId: true, result: true },
      });
      for (const s of subs) {
        const cur = submittedMap.get(s.homeworkId) ?? { submitted: 0, unchecked: 0 };
        cur.submitted += 1;
        if (s.result === null) cur.unchecked += 1;
        submittedMap.set(s.homeworkId, cur);
      }
    }

    const items = homeworks.map((h) => {
      const totalStudents = h.group._count.memberships;
      const submitted = submittedMap.get(h.id)?.submitted || 0;
      return {
        id: h.id,
        groupId: h.groupId,
        groupName: h.group.name,
        title: h.title,
        description: h.description,
        dueAt: h.dueAt,
        attachmentUrls: h.attachmentUrls,
        createdAt: h.createdAt,
        totalStudents,
        submittedCount: submitted,
        notSubmittedCount: Math.max(0, totalStudents - submitted),
        uncheckedCount: submittedMap.get(h.id)?.unchecked || 0,
        isPastDue: !!h.dueAt && now.getTime() > h.dueAt.getTime(),
      };
    });

    return paginate(items, total, page, pageSize);
  }

  async create(
    teacherId: string,
    dto: CreateHomeworkDto,
    files?: Express.Multer.File[],
  ) {
    await this.access.assertTeacherOwnsGroup(teacherId, dto.groupId);
    const attachmentUrls = await this.saveAttachments(files, dto.groupId, teacherId);
    return this.prisma.homework.create({
      data: {
        groupId: dto.groupId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        attachmentUrls,
      },
    });
  }

  async update(
    teacherId: string,
    id: string,
    dto: UpdateHomeworkDto,
    files?: Express.Multer.File[],
  ) {
    const homework = await this.prisma.homework.findUnique({ where: { id } });
    if (!homework) throw new NotFoundException('Vazifa topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, homework.groupId);

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;

    let attachments = [...homework.attachmentUrls];
    if (dto.keepAttachmentUrls !== undefined) {
      let keep: string[] = [];
      try {
        const parsed = JSON.parse(dto.keepAttachmentUrls);
        // Faqat mavjud (shu vazifaga tegishli) URL larni saqlaymiz.
        if (Array.isArray(parsed)) {
          keep = parsed.filter(
            (u) => typeof u === 'string' && attachments.includes(u),
          );
        }
      } catch {
        keep = [];
      }
      const removed = attachments.filter((u) => !keep.includes(u));
      if (removed.length) await this.files.removeManyByUrls(removed);
      attachments = keep;
    }
    const added = await this.saveAttachments(files, homework.groupId, teacherId);
    data.attachmentUrls = [...attachments, ...added];

    return this.prisma.homework.update({ where: { id }, data });
  }

  async remove(teacherId: string, id: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id },
      include: { submissions: { select: { fileUrl: true } } },
    });
    if (!homework) throw new NotFoundException('Vazifa topilmadi');
    await this.access.assertTeacherOwnsGroup(teacherId, homework.groupId);

    await this.prisma.homework.delete({ where: { id } });
    await this.files.removeManyByUrls([
      ...homework.attachmentUrls,
      ...homework.submissions.map((s) => s.fileUrl),
    ]);
    return { deleted: true };
  }

  // ---------------- Student ----------------
  async forStudent(studentId: string, query: any) {
    const { page, pageSize, skip, take, search } = getPagination(query);
    const groupIds = await this.access.studentGroupIds(studentId);
    const where: any = { groupId: { in: groupIds } };
    if (query.groupId && query.groupId !== 'all') where.groupId = query.groupId;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [total, homeworks] = await Promise.all([
      this.prisma.homework.count({ where }),
      this.prisma.homework.findMany({
        where,
        skip,
        take,
        orderBy: [{ dueAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: {
          group: { select: { id: true, name: true } },
          submissions: { where: { studentId } },
        },
      }),
    ]);
    const now = new Date();
    const items = homeworks.map((h) => {
      const sub = h.submissions[0] || null;
      return {
        id: h.id,
        groupId: h.groupId,
        groupName: h.group.name,
        title: h.title,
        description: h.description,
        dueAt: h.dueAt,
        attachmentUrls: h.attachmentUrls,
        status: computeStatus(h.dueAt, sub, now),
        result: sub?.result ?? null,
        grade: sub?.grade ?? null,
        comment: sub?.comment ?? null,
        submittedAt: sub?.submittedAt ?? null,
      };
    });
    return paginate(items, total, page, pageSize);
  }

  async studentDetail(studentId: string, id: string) {
    const homework = await this.prisma.homework.findUnique({
      where: { id },
      include: {
        group: { select: { id: true, name: true, teacherId: true } },
        submissions: { where: { studentId } },
      },
    });
    if (!homework) throw new NotFoundException('Vazifa topilmadi');
    await this.access.assertStudentInGroup(studentId, homework.groupId);

    const sub = homework.submissions[0] || null;
    return {
      id: homework.id,
      groupId: homework.groupId,
      groupName: homework.group.name,
      title: homework.title,
      description: homework.description,
      dueAt: homework.dueAt,
      attachmentUrls: homework.attachmentUrls,
      status: computeStatus(homework.dueAt, sub),
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
      teacherId: homework.group.teacherId,
    };
  }

  async submit(
    studentId: string,
    homeworkId: string,
    text: string | undefined,
    file?: Express.Multer.File,
  ) {
    const homework = await this.prisma.homework.findUnique({
      where: { id: homeworkId },
      include: { group: { select: { id: true, teacherId: true, name: true } } },
    });
    if (!homework) throw new NotFoundException('Vazifa topilmadi');
    await this.access.assertStudentInGroup(studentId, homework.groupId);

    const existing = await this.prisma.submission.findUnique({
      where: { homeworkId_studentId: { homeworkId, studentId } },
    });
    if (existing?.reviewedAt) {
      throw new ForbiddenException('Tekshirilgan vazifani o\'zgartirib bo\'lmaydi');
    }
    // Bo'sh javob (na matn, na fayl) yuborilmasin. Qayta topshirishda eski
    // matn/fayl saqlanib qolsa ham bo'sh hisoblanmaydi.
    const hasExistingContent = !!(existing?.text || existing?.fileUrl);
    if (!text?.trim() && !file && !hasExistingContent) {
      throw new BadRequestException('Javob matni yoki fayl kerak');
    }

    const now = new Date();
    const status: SubmissionStatus =
      homework.dueAt && now.getTime() > homework.dueAt.getTime()
        ? SubmissionStatus.LATE
        : SubmissionStatus.SUBMITTED;

    let fileUrl = existing?.fileUrl ?? null;
    if (file) {
      const saved = await this.files.save(
        file,
        'file',
        FileScope.SUBMISSION,
        homework.groupId,
        studentId,
      );
      if (existing?.fileUrl) await this.files.removeByUrl(existing.fileUrl);
      fileUrl = saved.url;
    }

    // text berilmagan bo'lsa mavjud matn saqlanadi (bo'sh matn uni o'chirmaydi).
    const newText =
      text !== undefined ? text.trim() || null : (existing?.text ?? null);

    const submission = await this.prisma.submission.upsert({
      where: { homeworkId_studentId: { homeworkId, studentId } },
      create: {
        homeworkId,
        studentId,
        text: newText,
        fileUrl,
        status,
        submittedAt: now,
      },
      update: { text: newText, fileUrl, status, submittedAt: now },
    });

    // O'qituvchiga bildirishnoma
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true },
    });
    await this.notifications.create({
      userId: homework.group.teacherId,
      type: NotificationType.HOMEWORK_SUBMITTED,
      title: 'Uy vazifasi topshirildi',
      body: `${student?.firstName} ${student?.lastName} "${homework.title}" vazifasini topshirdi.`,
      link: '/homework',
    });

    return submission;
  }
}
