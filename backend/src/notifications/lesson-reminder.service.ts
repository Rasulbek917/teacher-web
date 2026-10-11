import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationType } from '@prisma/client';
import { atTimeOnDay, dayOfWeek, dateOnly, formatDate } from '../common/date.util';

@Injectable()
export class LessonReminderService {
  private readonly logger = new Logger('LessonReminder');
  private running = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Har minutda tekshiradi: dars boshlanishiga R minut qolganda xabar yuboradi. */
  @Cron('0 * * * * *')
  async checkLessons() {
    if (this.running) return;
    this.running = true;
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

    const groups = await this.prisma.group.findMany({
      where: { lessonDays: { has: todayDow } },
      select: {
        id: true,
        name: true,
        lessonTime: true,
        teacherId: true,
        memberships: { select: { studentId: true } },
      },
    });

    for (const g of groups) {
      const start = atTimeOnDay(now, g.lessonTime);
      const diffMin = (start.getTime() - now.getTime()) / 60000;
      if (diffMin < 0 || diffMin > reminderMinutes) continue;

      const key = `lesson:${g.id}:${dateOnly(now).toISOString().slice(0, 10)}`;
      // O'qituvchi
      await this.notifications.create({
        userId: g.teacherId,
        type: NotificationType.LESSON_SOON,
        title: 'Dars vaqtiga oz qoldi',
        body: `${g.name} guruhi darsi ${g.lessonTime} da boshlanadi.`,
        link: '/groups',
        dedupeKey: `${key}:${g.teacherId}`,
      });
      // O'quvchilar
      const studentIds = g.memberships.map((m) => m.studentId);
      await this.notifications.createForUsers(studentIds, {
        type: NotificationType.LESSON_SOON,
        title: 'Dars vaqtiga oz qoldi',
        body: `${g.name} guruhi darsi ${g.lessonTime} da boshlanadi.`,
        link: '/',
        dedupeKeyPrefix: key,
      });
    }
  }
}
