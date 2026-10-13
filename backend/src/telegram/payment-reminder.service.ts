import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnly, TASHKENT_OFFSET_MS } from '../common/date.util';
import { TelegramService, monthNameUz } from './telegram.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// Muddati o'tgandan keyin necha kun davomida eslatma yuboriladi (to'lanmaguncha).
const OVERDUE_WINDOW_DAYS = 62;

export interface ReminderRunResult {
  checked: number;
  sent: number;
  skipped: number;
}

/**
 * Oylik to'lov eslatmalari.
 *
 * Jadval (muddat sanasi = D):
 *   - D - 7 kun  -> PAYMENT_WEEK_BEFORE ("1 hafta qoldi")
 *   - D          -> PAYMENT_DUE ("bugun muddat")
 *   - D + 2, +4, ... -> PAYMENT_OVERDUE (har 2 kunda, to'lanmaguncha)
 *
 * Faqat to'lamagan (UNPAID) yoki qisman to'lagan (PARTIAL) o'quvchilarning
 * Telegramga ulangan ota-onalariga yuboriladi. Har bir xabar bir marta.
 */
@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger('PaymentReminder');
  private running = false;

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
  ) {}

  /** Har kuni 09:00 (Tashkent) da ishga tushadi. */
  @Cron('0 0 9 * * *', { timeZone: 'Asia/Tashkent' })
  async daily() {
    if (this.running) return;
    this.running = true;
    try {
      const res = await this.run();
      this.logger.log(
        `To'lov eslatmalari: tekshirildi=${res.checked}, yuborildi=${res.sent}, o'tkazildi=${res.skipped}`,
      );
    } catch (e) {
      this.logger.error(`To'lov eslatmalarida xatolik: ${e}`);
    } finally {
      this.running = false;
    }
  }

  async run(): Promise<ReminderRunResult> {
    const result: ReminderRunResult = { checked: 0, sent: 0, skipped: 0 };
    if (!this.telegram.enabled()) {
      this.logger.warn('Telegram tokeni yo\'q — eslatmalar yuborilmadi.');
      return result;
    }

    const today = dateOnly(new Date());
    const from = new Date(today.getTime() - OVERDUE_WINDOW_DAYS * DAY_MS);
    const to = new Date(today.getTime() + 8 * DAY_MS);

    const deadlines = await this.prisma.paymentDeadline.findMany({
      where: { dueDate: { gte: from, lte: to } },
    });

    for (const d of deadlines) {
      // offset = bugun - muddat (kunlarda): -7 = bir hafta oldin, 0 = muddat kuni, >0 = kechikkan.
      const offset = Math.round((today.getTime() - d.dueDate.getTime()) / DAY_MS);
      let kind: string | null = null;
      if (offset === -7) kind = 'PAYMENT_WEEK_BEFORE';
      else if (offset === 0) kind = 'PAYMENT_DUE';
      else if (offset > 0 && offset % 2 === 0) kind = 'PAYMENT_OVERDUE';
      if (!kind) continue;

      result.checked++;

      const memberships = await this.prisma.groupMembership.findMany({
        where: { group: { teacherId: d.teacherId } },
        include: {
          group: { select: { id: true, name: true, monthlyPrice: true } },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              studentProfile: {
                select: { parentTelegramChatId: true },
              },
            },
          },
        },
      });
      if (!memberships.length) continue;

      const studentIds = [...new Set(memberships.map((m) => m.studentId))];
      const groupIds = [...new Set(memberships.map((m) => m.groupId))];
      const [payments, logs] = await Promise.all([
        this.prisma.payment.findMany({
          where: {
            teacherId: d.teacherId,
            periodYear: d.periodYear,
            periodMonth: d.periodMonth,
            studentId: { in: studentIds },
            groupId: { in: groupIds },
          },
        }),
        this.prisma.parentNotificationLog.findMany({
          where: {
            periodYear: d.periodYear,
            periodMonth: d.periodMonth,
            kind,
          },
          select: { dedupeKey: true },
        }),
      ]);
      const payMap = new Map(payments.map((p) => [`${p.studentId}:${p.groupId}`, p]));
      const logSet = new Set(logs.map((l) => l.dedupeKey));

      // Oy tugashidan keyin qo'shilganlarni o'tkazib yuborish uchun chegara.
      const periodEndExclusive = new Date(
        Date.UTC(d.periodYear, d.periodMonth, 1) - TASHKENT_OFFSET_MS,
      );
      const monthName = monthNameUz(d.periodMonth);

      for (const m of memberships) {
        if (m.joinedAt >= periodEndExclusive) continue;

        const price = m.customPrice ?? m.group.monthlyPrice;
        const payment = payMap.get(`${m.studentId}:${m.groupId}`);
        const amount = payment?.amount ?? 0;
        if (amount >= price) continue; // to'langan — eslatma kerak emas

        const chatId = m.student.studentProfile?.parentTelegramChatId;
        if (!chatId) {
          result.skipped++; // ota-ona hali ulanmagan
          continue;
        }

        const dedupeKey = `PAY:${kind}:${offset}:${m.studentId}:${m.groupId}:${d.periodYear}-${d.periodMonth}`;
        if (logSet.has(dedupeKey)) continue;

        const debt = price - amount;
        const text = this.telegram.buildPaymentMessage(kind, {
          studentName: `${m.student.firstName} ${m.student.lastName}`,
          groupName: m.group.name,
          monthName,
          debt,
          dueDate: d.dueDate,
          offsetDays: offset,
        });

        const ok = await this.telegram.sendMessage(chatId, text);
        if (ok) {
          await this.telegram.logNotification({
            studentId: m.studentId,
            groupId: m.groupId,
            kind,
            dedupeKey,
            periodYear: d.periodYear,
            periodMonth: d.periodMonth,
            offsetDays: offset,
          });
          logSet.add(dedupeKey);
          result.sent++;
        }
      }
    }

    return result;
  }
}
