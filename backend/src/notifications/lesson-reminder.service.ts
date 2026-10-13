import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationType } from '@prisma/client';
import { atTimeOnDay, dayOfWeek, dateOnly, formatDate } from '../common/date.util';
import { TelegramService } from '../telegram/telegram.service';

interface LessonSend {
  chatId: string;
  text: string;
  studentId: string;
  groupId: string;
  key: string;
}

@Injectable()
export class LessonReminderService {
  private readonly logger = new Logger('LessonReminder');
  private running = false;
  private lastRunAt = 0;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private telegram: TelegramService,
  ) {}

  /**
   * Har minutda tekshiradi: dars boshlanishiga R minut qolganda xabar yuboradi.
   *
   * `throttleMs` — bir vaqtning o'zida bir necha marta chaqirilsa (masalan
   * sayt ochiq turganda frontend har X daqiqada so'raydi), ortiqcha ish
   * qilmaslik uchun minimal interval.
   */
  @Cron('0 * * * * *')
  async checkLessons(throttleMs = 0) {
    if (this.running) return;
    if (throttleMs > 0 && Date.now() - this.lastRunAt < throttleMs) return;
    this.running = true;
    this.lastRunAt = Date.now();
    try {
      await this.run();
    } catch (e) {
      this.logger.error(`Eslatma tekshiruvida xatolik: ${e}`);
    } finally {
      this.running = false;
    }
  }

  private async run() {
    const now = new Date();
    const reminderMinutes = parseInt(process.env.LESSON_REMINDER_MINUTES || '30', 10);
    const todayDow = dayOfWeek(now);
    const ymd = dateOnly(now).toISOString().slice(0, 10);

    const groups = await this.prisma.group.findMany({
      where: { lessonDays: { has: todayDow } },
      select: {
        id: true,
        name: true,
        lessonTime: true,
        teacherId: true,
        teacher: {
          select: { teacherProfile: { select: { telegramChatId: true } } },
        },
        memberships: {
          select: {
            studentId: true,
            student: {
              select: { studentProfile: { select: { parentTelegramChatId: true } } },
            },
          },
        },
      },
    });

    const tz = this.telegram.enabled();
    const sends: LessonSend[] = [];

    for (const g of groups) {
      const start = atTimeOnDay(now, g.lessonTime);
      const diffMin = (start.getTime() - now.getTime()) / 60000;
      if (diffMin < 0 || diffMin > reminderMinutes) continue;

      const key = `lesson:${g.id}:${ymd}`;
      const body = `${g.name} guruhi darsi ${g.lessonTime} da boshlanadi.`;
      // Ilova ichidagi bildirishnomalar.
      await this.notifications.create({
        userId: g.teacherId,
        type: NotificationType.LESSON_SOON,
        title: 'Dars vaqtiga oz qoldi',
        body,
        link: '/groups',
        dedupeKey: `${key}:${g.teacherId}`,
      });
      const studentIds = g.memberships.map((m) => m.studentId);
      await this.notifications.createForUsers(studentIds, {
        type: NotificationType.LESSON_SOON,
        title: 'Dars vaqtiga oz qoldi',
        body,
        link: '/',
        dedupeKeyPrefix: key,
      });

      if (!tz) continue;

      // Telegram: o'qituvchi.
      const teacherChat = g.teacher?.teacherProfile?.telegramChatId;
      if (teacherChat) {
        sends.push({
          chatId: teacherChat,
          text: this.telegram.buildLessonSoonMessage({
            groupName: g.name,
            lessonTime: g.lessonTime,
            minutesLeft: diffMin,
            forTeacher: true,
          }),
          studentId: g.teacherId,
          groupId: g.id,
          key: `LESSON:${g.id}:${ymd}:${g.teacherId}`,
        });
      }
      // Telegram: ota-onalar.
      for (const m of g.memberships) {
        const parentChat = m.student.studentProfile?.parentTelegramChatId;
        if (!parentChat) continue;
        sends.push({
          chatId: parentChat,
          text: this.telegram.buildLessonSoonMessage({
            groupName: g.name,
            lessonTime: g.lessonTime,
            minutesLeft: diffMin,
          }),
          studentId: m.studentId,
          groupId: g.id,
          key: `LESSON:${g.id}:${ymd}:${m.studentId}`,
        });
      }
    }

    if (!sends.length) return;
    const existing = await this.telegram.alreadyLoggedMany(sends.map((s) => s.key));
    const logRows: {
      studentId: string;
      groupId: string;
      kind: string;
      dedupeKey: string;
    }[] = [];
    for (const s of sends) {
      if (existing.has(s.key)) continue;
      const ok = await this.telegram.sendMessage(s.chatId, s.text);
      if (ok) {
        logRows.push({
          studentId: s.studentId,
          groupId: s.groupId,
          kind: 'LESSON_SOON',
          dedupeKey: s.key,
        });
      }
    }
    await this.telegram.logNotificationsMany(logRows);
  }
}
