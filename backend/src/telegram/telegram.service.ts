import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatDate } from '../common/date.util';

/**
 * Telegram Bot API bilan past darajadagi ishlash uchun xizmat.
 *
 * Bu yerda faqat HTTP chaqiruvlar va yordamchi matn funksiyalari bor.
 * Bot tokeni `TELEGRAM_BOT_TOKEN` muhit o'zgaruvchisidan olinadi. Token
 * bo'lmasa, barcha yuborish amallari jimgina o'tkazib yuboriladi (sayt
 * ishlashdan to'xtamaydi).
 */

const API_BASE = 'https://api.telegram.org';

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** Oy raqami (1-12) -> o'zbekcha oy nomi. */
export function monthNameUz(month: number): string {
  return UZ_MONTHS[((month - 1) % 12 + 12) % 12];
}

/** 150000 -> "150 000 so'm". */
export function formatSum(n: number): string {
  const s = String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${s} so'm`;
}

export interface PaymentMessageInput {
  studentName: string;
  groupName: string;
  monthName: string;
  debt: number;
  dueDate: Date;
  offsetDays: number;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger('Telegram');
  private username: string | null = null;
  private webhookSet = false;

  constructor(private prisma: PrismaService) {}

  private token(): string {
    return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  }

  enabled(): boolean {
    return this.token().length > 0;
  }

  /** Bot API ga so'rov yuboradi. Xatolik bo'lsa null qaytaradi. */
  private async api(method: string, payload?: Record<string, any>): Promise<any | null> {
    if (!this.enabled()) return null;
    try {
      const res = await fetch(`${API_BASE}/bot${this.token()}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const data: any = await res.json().catch(() => null);
      if (!data?.ok) {
        this.logger.warn(`Telegram ${method} xato: ${JSON.stringify(data)}`);
        return null;
      }
      return data.result;
    } catch (e) {
      this.logger.warn(`Telegram ${method} tarmoq xatosi: ${e}`);
      return null;
    }
  }

  /** Bot ma'lumotini oladi (username uchun). */
  async getMe(): Promise<any | null> {
    const me = await this.api('getMe');
    if (me?.username) this.username = me.username;
    return me;
  }

  /** Bot username (getMe orqali yoki env'dan). */
  botUsername(): string {
    return this.username || (process.env.TELEGRAM_BOT_USERNAME || '').trim();
  }

  /** Ota-ona uchun ulanish havolasi. */
  linkUrl(token: string): string {
    const u = this.botUsername();
    return u ? `https://t.me/${u}?start=${token}` : '';
  }

  /** Webhook manzili (env'dan yoki CORS_ORIGIN'dan). */
  private webhookUrl(): string {
    const explicit = (process.env.TELEGRAM_WEBHOOK_URL || '').trim();
    if (explicit) return explicit;
    const origin = (process.env.CORS_ORIGIN || '').trim().replace(/\/+$/, '');
    if (origin && origin.startsWith('https://') && !origin.includes('localhost')) {
      return `${origin}/api/telegram/webhook`;
    }
    return '';
  }

  /** Webhook'ni o'rnatadi (idempotent). */
  async setupWebhook(): Promise<any> {
    if (!this.enabled()) return { ok: false, reason: 'token yo\'q' };
    const url = this.webhookUrl();
    if (!url) return { ok: false, reason: 'webhook URL noma\'lum' };
    const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    const result = await this.api('setWebhook', {
      url,
      secret_token: secret || undefined,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    if (result !== null || !this.enabled()) {
      this.webhookSet = true;
    }
    return { ok: true, url, result };
  }

  async deleteWebhook(): Promise<any> {
    return this.api('deleteWebhook', { drop_pending_updates: true });
  }

  /** Bot menyusidagi buyruqlarni o'rnatadi (idempotent). */
  async setCommands(): Promise<any> {
    return this.api('setMyCommands', {
      commands: [
        { command: 'homework', description: 'Uyga vazifa' },
        { command: 'grade', description: 'Baholar' },
        { command: 'stop', description: 'Ulanishni bekor qilish' },
        { command: 'start', description: 'Qayta ulanish' },
      ],
    });
  }

  async webhookInfo(): Promise<any> {
    return this.api('getWebhookInfo');
  }

  /** Matnli xabar yuboradi. Muvaffaqiyatli bo'lsa true. */
  async sendMessage(chatId: string | number, text: string): Promise<boolean> {
    if (!this.enabled() || !chatId) return false;
    const res = await this.api('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
    return res !== null;
  }

  /** Hisobga olish uchun: ota-onaga yuborilgan xabar jurnalga yoziladi. */
  async logNotification(input: {
    studentId: string;
    groupId?: string | null;
    kind: string;
    dedupeKey: string;
    periodYear?: number;
    periodMonth?: number;
    offsetDays?: number;
  }): Promise<void> {
    try {
      await this.prisma.parentNotificationLog.create({
        data: {
          studentId: input.studentId,
          groupId: input.groupId ?? null,
          kind: input.kind,
          dedupeKey: input.dedupeKey,
          periodYear: input.periodYear ?? null,
          periodMonth: input.periodMonth ?? null,
          offsetDays: input.offsetDays ?? null,
        },
      });
    } catch {
      // dedupeKey band bo'lsa — e'tiborsiz qoldiramiz.
    }
  }

  async alreadyLogged(dedupeKey: string): Promise<boolean> {
    const found = await this.prisma.parentNotificationLog.findUnique({
      where: { dedupeKey },
      select: { id: true },
    });
    return !!found;
  }

  /** Bir nechta dedupe kalitni bitta so'rovda tekshiradi (N+1 oldini oladi). */
  async alreadyLoggedMany(dedupeKeys: string[]): Promise<Set<string>> {
    if (!dedupeKeys.length) return new Set();
    const rows = await this.prisma.parentNotificationLog.findMany({
      where: { dedupeKey: { in: dedupeKeys } },
      select: { dedupeKey: true },
    });
    return new Set(rows.map((r) => r.dedupeKey));
  }

  /** Bir nechta jurnal yozuvini bitta so'rovda saqlaydi. */
  async logNotificationsMany(
    items: {
      studentId: string;
      groupId?: string | null;
      kind: string;
      dedupeKey: string;
      periodYear?: number;
      periodMonth?: number;
      offsetDays?: number;
    }[],
  ): Promise<void> {
    if (!items.length) return;
    try {
      await this.prisma.parentNotificationLog.createMany({
        data: items.map((i) => ({
          studentId: i.studentId,
          groupId: i.groupId ?? null,
          kind: i.kind,
          dedupeKey: i.dedupeKey,
          periodYear: i.periodYear ?? null,
          periodMonth: i.periodMonth ?? null,
          offsetDays: i.offsetDays ?? null,
        })),
        skipDuplicates: true,
      });
    } catch {
      // Xatolar yutiladi — bildirishnoma saqlashni buzmasligi kerak.
    }
  }

  // ---------------- Xabar matnlari (o'zbekcha) ----------------

  buildPaymentMessage(kind: string, input: PaymentMessageInput): string {
    const { studentName, monthName, debt, dueDate, offsetDays, groupName } = input;
    const date = formatDate(dueDate);
    const debtStr = formatSum(debt);
    if (kind === 'PAYMENT_WEEK_BEFORE') {
      return (
        `Hurmatli ota-ona! 👋\n\n` +
        `${studentName} uchun ${monthName} oyi to'lovi: ${debtStr}.\n` +
        `${groupName ? `Guruh: ${groupName}\n` : ''}` +
        `To'lov muddati: ${date} — 7 kun qoldi.\n\n` +
        `Iltimos, o'z vaqtida to'lang.`
      );
    }
    if (kind === 'PAYMENT_DUE') {
      return (
        `Hurmatli ota-ona! 📅\n\n` +
        `Bugun ${studentName} uchun ${monthName} oyi to'lov muddati.\n` +
        `${groupName ? `Guruh: ${groupName}\n` : ''}` +
        `To'lov summasi: ${debtStr}.\n\n` +
        `Iltimos, to'lovni amalga oshiring.`
      );
    }
    // PAYMENT_OVERDUE
    return (
      `Hurmatli ota-ona! ⚠️\n\n` +
      `${studentName} uchun ${monthName} oyi bo'yicha qarz: ${debtStr}.\n` +
      `${groupName ? `Guruh: ${groupName}\n` : ''}` +
      `To'lov muddati ${date} edi (${offsetDays} kun o'tdi).\n\n` +
      `Iltimos, to'lovni amalga oshiring.`
    );
  }

  buildAbsenceMessage(input: {
    studentName: string;
    groupName: string;
    dateStr: string;
  }): string {
    return (
      `Hurmatli ota-ona! ⚠️\n\n` +
      `${input.studentName} ${input.dateStr} kuni ${input.groupName} darsiga kelmadi.\n\n` +
      `Iltimos, o'qituvchi bilan bog'laning.`
    );
  }

  // ---------------- Ishga tushish ----------------

  async onModuleInit() {
    if (!this.enabled()) {
      this.logger.log('TELEGRAM_BOT_TOKEN yo\'q — Telegram bildirishnomalari o\'chirilgan.');
      return;
    }
    try {
      await this.getMe();
      this.logger.log(`Telegram bot: @${this.botUsername()}`);
    } catch (e) {
      this.logger.warn(`getMe xatosi: ${e}`);
    }
    // Bot menyusidagi buyruqlar (/homework, /grade, ...).
    try {
      await this.setCommands();
    } catch (e) {
      this.logger.warn(`setMyCommands xatosi: ${e}`);
    }
    // Webhook faqat haqiqiy (https) manzil mavjud bo'lganda o'rnatiladi.
    if (this.webhookUrl()) {
      try {
        await this.setupWebhook();
        this.logger.log('Telegram webhook o\'rnatildi.');
      } catch (e) {
        this.logger.warn(`Webhook o'rnatishda xatolik: ${e}`);
      }
    }
  }
}
