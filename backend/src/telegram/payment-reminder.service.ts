import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  dateOnly,
  monthOf,
  TASHKENT_OFFSET_MS,
  yearOf,
} from '../common/date.util';
import { TelegramService, monthNameUz } from './telegram.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// Muddati o'tgandan keyin necha kun davomida eslatma yuboriladi (to'lanmaguncha).
const OVERDUE_WINDOW_DAYS = 62;

const PAYMENT_KINDS = [
  'PAYMENT_WEEK_BEFORE',
  'PAYMENT_DUE',
  'PAYMENT_OVERDUE',
] as const;

/** O'qituvchi qo'lda bosgan "Eslatmalarni yuborish" tugmasi turi. */
const MANUAL_KIND = 'PAYMENT_REMIND';

export interface ReminderRunResult {
  /** Ko'rib chiqilgan davr (oy) soni. */
  checked: number;
  /** Muvaffaqiyatli yuborilgan xabarlar soni. */
  sent: number;
  /** Telegramga ulanmaganligi uchun o'tkazib yuborilganlar. */
  skipped: number;
  /** Yuqoridagining sinonimi (aniqroq nom). */
  notLinked: number;
  /** Shu davr uchun eslatma allaqachon yuborilgan (takror yuborilmadi). */
  alreadySent: number;
  /** Qo'lda yuborilgan rejimmi. */
  manual: boolean;
}

/**
 * Oylik to'lov eslatmalari.
 *
 * Avtomatik jadval (muddat sanasi = D):
 *   - D - 7 kun  -> PAYMENT_WEEK_BEFORE ("1 hafta qoldi")
 *   - D          -> PAYMENT_DUE ("bugun muddat")
 *   - D + 2, +4, ... -> PAYMENT_OVERDUE (har 2 kunda, to'lanmaguncha)
 *
 * Qo'lda rejim (o'qituvchi tugmani bosganda, `runForTeacher`): jadvaldan qat'i
 * nazar, tanlangan oy uchun to'lamagan (UNPAID/PARTIAL) va Telegramga ulangan
 * barcha ota-onalarga hoziroq eslatma yuboradi. Bir kunda bir marta (dedupe).
 *
 * Faqat UNPAID yoki PARTIAL o'quvchilarning Telegramga ulangan ota-onalariga
 * yuboriladi.
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
        `To'lov eslatmalari: tekshirildi=${res.checked}, yuborildi=${res.sent}, ulangan yo'q=${res.notLinked}`,
      );
    } catch (e) {
      this.logger.error(`To'lov eslatmalarida xatolik: ${e}`);
    } finally {
      this.running = false;
    }
  }

  /** Rejalashtirilgan (avtomatik) ishga tushirish. */
  async run(): Promise<ReminderRunResult> {
    return this.runCore(undefined, undefined, false);
  }

  /**
   * Bitta o'qituvchi uchun eslatmalarni darhol ishga tushiradi (qo'lda
   * "Eslatmalarni yuborish" tugmasi). Jadvalga bog'lanmaydi: tanlangan oy
   * uchun to'lamagan va ulangan barcha ota-onalarga hoziroq yuboriladi.
   */
  async runForTeacher(
    teacherId: string,
    period?: { year: number; month: number },
  ): Promise<ReminderRunResult> {
    return this.runCore(teacherId, period, true);
  }

  private emptyResult(manual: boolean): ReminderRunResult {
    return {
      checked: 0,
      sent: 0,
      skipped: 0,
      notLinked: 0,
      alreadySent: 0,
      manual,
    };
  }

  private async runCore(
    teacherFilter?: string,
    period?: { year: number; month: number },
    manual = false,
  ): Promise<ReminderRunResult> {
    const result = this.emptyResult(manual);
    if (!this.telegram.enabled()) {
      this.logger.warn('Telegram tokeni yo\'q — eslatmalar yuborilmadi.');
      return result;
    }

    const today = dateOnly(new Date());

    // --- Qo'lda rejim: jadval cheklovisiz, tanlangan oy uchun hoziroq ---
    if (manual) {
      const year = period?.year ?? yearOf(new Date());
      const month = period?.month ?? monthOf(new Date());
      const where: any = { periodYear: year, periodMonth: month };
      if (teacherFilter) where.teacherId = teacherFilter;
      const deadline = await this.prisma.paymentDeadline.findFirst({ where });
      const teacherId = teacherFilter ?? deadline?.teacherId;
      if (!teacherId) return result;
      result.checked++;
      await this.runPeriod(
        teacherId,
        year,
        month,
        deadline?.dueDate ?? null,
        result,
        today,
        true,
      );
      return result;
    }

    // --- Avtomatik rejim: faqat jadvalga mos muddatlar ---
    const from = new Date(today.getTime() - OVERDUE_WINDOW_DAYS * DAY_MS);
    const to = new Date(today.getTime() + 8 * DAY_MS);

    const deadlineWhere: any = {};
    if (teacherFilter) deadlineWhere.teacherId = teacherFilter;
    if (period) {
      deadlineWhere.periodYear = period.year;
      deadlineWhere.periodMonth = period.month;
    } else {
      deadlineWhere.dueDate = { gte: from, lte: to };
    }

    const deadlines = await this.prisma.paymentDeadline.findMany({
      where: deadlineWhere,
    });

    for (const d of deadlines) {
      // offset = bugun - muddat (kunlarda): -7 = bir hafta oldin, 0 = muddat kuni, >0 = kechikkan.
      const offset = Math.round(
        (today.getTime() - d.dueDate.getTime()) / DAY_MS,
      );
      if (!(offset === -7 || (offset >= 0 && offset <= OVERDUE_WINDOW_DAYS))) {
        continue;
      }

      result.checked++;
      await this.runPeriod(
        d.teacherId,
        d.periodYear,
        d.periodMonth,
        d.dueDate,
        result,
        today,
        false,
      );
    }

    return result;
  }

  /** Bitta davr (o'qituvchi + yil + oy) uchun eslatmalarni yuboradi. */
  private async runPeriod(
    teacherId: string,
    year: number,
    month: number,
    dueDate: Date | null,
    result: ReminderRunResult,
    today: Date,
    manual: boolean,
  ): Promise<void> {
    const offset = dueDate
      ? Math.round((today.getTime() - dueDate.getTime()) / DAY_MS)
      : null;

    const memberships = await this.prisma.groupMembership.findMany({
      where: { group: { teacherId } },
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
    if (!memberships.length) return;

    const studentIds = [...new Set(memberships.map((m) => m.studentId))];
    const groupIds = [...new Set(memberships.map((m) => m.groupId))];
    const [payments, logs] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          teacherId,
          periodYear: year,
          periodMonth: month,
          studentId: { in: studentIds },
          groupId: { in: groupIds },
        },
      }),
      this.prisma.parentNotificationLog.findMany({
        where: {
          periodYear: year,
          periodMonth: month,
          kind: { in: [...PAYMENT_KINDS, MANUAL_KIND] },
        },
        select: { dedupeKey: true, studentId: true, groupId: true, kind: true },
      }),
    ]);
    const payMap = new Map(
      payments.map((p) => [`${p.studentId}:${p.groupId}`, p]),
    );
    const logSet = new Set(logs.map((l) => l.dedupeKey));
    // Avtomatik eslatma yuborilgan (student:group) juftliklar — catch-up uchun.
    const reminded = new Set(
      logs
        .filter((l) => (PAYMENT_KINDS as readonly string[]).includes(l.kind))
        .map((l) => `${l.studentId}:${l.groupId ?? ''}`),
    );

    // Oy tugashidan keyin qo'shilganlarni o'tkazib yuborish uchun chegara.
    const periodEndExclusive = new Date(
      Date.UTC(year, month, 1) - TASHKENT_OFFSET_MS,
    );
    const monthName = monthNameUz(month);
    const todayKey = today.toISOString().slice(0, 10);

    for (const m of memberships) {
      if (m.joinedAt >= periodEndExclusive) continue;

      const price = m.customPrice ?? m.group.monthlyPrice;
      const payment = payMap.get(`${m.studentId}:${m.groupId}`);
      const amount = payment?.amount ?? 0;
      if (amount >= price) continue; // to'langan — eslatma kerak emas

      let kind: string | null = null;
      let dedupeKey: string | null = null;

      if (manual) {
        // Qo'lda: jadvalga qaramay, kuniga bir marta.
        kind = MANUAL_KIND;
        dedupeKey = `PAY:${MANUAL_KIND}:${todayKey}:${m.studentId}:${m.groupId}:${year}-${month}`;
      } else {
        const off = offset as number;
        const hadReminder = reminded.has(`${m.studentId}:${m.groupId}`);
        if (off === -7) {
          kind = 'PAYMENT_WEEK_BEFORE';
        } else if (off === 0) {
          // Muddat kuni: oldin yuborilmagan bo'lsa hoziroq, aks holda hech narsa.
          if (!hadReminder) kind = 'PAYMENT_DUE';
        } else if (!hadReminder) {
          // Muddat o'tib ketgan, lekin avval hech qanday eslatma bo'lmagan
          // (masalan, muddat kunidan keyin belgilangan) — hoziroq xabar.
          kind = 'PAYMENT_DUE';
        } else if (off % 2 === 0) {
          kind = 'PAYMENT_OVERDUE';
        }
        if (!kind) continue;
        dedupeKey = `PAY:${kind}:${off}:${m.studentId}:${m.groupId}:${year}-${month}`;
      }

      if (logSet.has(dedupeKey)) {
        result.alreadySent++;
        continue;
      }

      const chatId = m.student.studentProfile?.parentTelegramChatId;
      if (!chatId) {
        result.skipped++;
        result.notLinked++;
        continue;
      }

      const debt = price - amount;
      const text = this.telegram.buildPaymentMessage(kind, {
        studentName: `${m.student.firstName} ${m.student.lastName}`,
        groupName: m.group.name,
        monthName,
        debt,
        dueDate,
        offsetDays: offset ?? 0,
      });

      const ok = await this.telegram.sendMessage(chatId, text);
      if (ok) {
        await this.telegram.logNotification({
          studentId: m.studentId,
          groupId: m.groupId,
          kind,
          dedupeKey,
          periodYear: year,
          periodMonth: month,
          offsetDays: offset ?? undefined,
        });
        logSet.add(dedupeKey);
        reminded.add(`${m.studentId}:${m.groupId}`);
        result.sent++;
      }
    }
  }
}
