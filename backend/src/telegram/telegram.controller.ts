import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { ParentInfoService } from './parent-info.service';
import { TeacherInfoService } from './teacher-info.service';

interface TgUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
}

/**
 * Telegram Bot webhook'i.
 *
 * Ota-ona yoki o'qituvchi botga `/start <token>` yuboradi -> o'sha tokenli
 * hisobga ulanadi. `/stop` -> ulanish bekor qilinadi.
 *
 * Bu endpoint `@Public()` (JWT talab qilmaydi), lekin Telegram tomonidan
 * yuboriladigan `secret_token` sarlavhasi tekshiriladi (agar sozlangan bo'lsa).
 */
@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger('TelegramWebhook');

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private parentInfo: ParentInfoService,
    private teacherInfo: TeacherInfoService,
  ) {}

  @Public()
  @Post('webhook')
  async webhook(
    @Body() update: TgUpdate,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (expected && secret !== expected) {
      // Noto'g'ri sarlavha — jimgina rad etamiz (200, chunki Telegram qayta yuborishi shart emas).
      this.logger.warn('Webhook: secret mos kelmadi');
      return { ok: true };
    }

    try {
      await this.handle(update);
    } catch (e) {
      this.logger.warn(`Webhook ishlashida xatolik: ${e}`);
    }
    return { ok: true };
  }

  private helpText(): string {
    return (
      `Mavjud buyruqlar:\n` +
      `/oylik — oylik to'lov / tushum\n` +
      `/davomat — bugungi davomat (o'qituvchi)\n` +
      `/homework — uyga vazifa\n` +
      `/grade — baholar\n` +
      `/stop — ulanishni bekor qilish\n` +
      `/start — qayta ulanish`
    );
  }

  private async handle(update: TgUpdate) {
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = (msg?.text || '').trim();
    if (chatId === undefined || chatId === null || !text) return;

    const [command, ...args] = text.split(/\s+/);
    const cmd = command.split('@')[0].toLowerCase(); // /start@Bot -> /start

    if (cmd === '/start') {
      const token = args[0];
      if (token) {
        await this.link(chatId, token);
      } else {
        await this.telegram.sendMessage(
          chatId,
          `Assalomu alaykum! 👋\n\n` +
            `Bu bot o'quv markazi uchun xizmat qiladi:\n` +
            `• ota-onaga — davomat, to'lov va uyga vazifa xabarlari\n` +
            `• o'qituvchiga — oylik tushum, davomat va dars eslatmalari\n\n` +
            `Ulanish uchun saytdagi «Sozlamalar → Telegram» bo'limidan ` +
            `olingan havolani oching.\n` +
            `Ulanishni bekor qilish: /stop\n\n` +
            this.helpText(),
        );
      }
      return;
    }

    if (cmd === '/stop') {
      const [students, teachers] = await Promise.all([
        this.prisma.studentProfile.updateMany({
          where: { parentTelegramChatId: String(chatId) },
          data: { parentTelegramChatId: null, telegramLinkedAt: null },
        }),
        this.prisma.teacherProfile.updateMany({
          where: { telegramChatId: String(chatId) },
          data: { telegramChatId: null, telegramLinkedAt: null },
        }),
      ]);
      await this.telegram.sendMessage(
        chatId,
        students.count + teachers.count > 0
          ? `Bildirishnomalar o'chirildi. ❌\nQayta ulanish uchun havolani yana oching.`
          : `Siz hali ulanmagansiz.`,
      );
      return;
    }

    if (cmd === '/oylik' || cmd === '/tolov' || cmd === '/payment') {
      const isTeacher = !!(await this.teacherInfo.linkedTeacher(String(chatId)));
      const reply = isTeacher
        ? await this.teacherInfo.oylikMessage(String(chatId))
        : await this.parentInfo.oylikMessage(String(chatId));
      await this.telegram.sendMessage(chatId, reply);
      return;
    }

    if (cmd === '/davomat' || cmd === '/attendance') {
      const reply = await this.teacherInfo.davomatMessage(String(chatId));
      await this.telegram.sendMessage(chatId, reply);
      return;
    }

    if (cmd === '/homework' || cmd === '/vazifa') {
      const reply = await this.parentInfo.homeworkMessage(String(chatId));
      await this.telegram.sendMessage(chatId, reply);
      return;
    }

    if (cmd === '/grade' || cmd === '/grades' || cmd === '/baholar') {
      const reply = await this.parentInfo.gradesMessage(String(chatId));
      await this.telegram.sendMessage(chatId, reply);
      return;
    }

    // Boshqa har qanday matn — qisqa yordam.
    await this.telegram.sendMessage(chatId, this.helpText());
  }

  private async link(chatId: number | string, token: string) {
    const chat = String(chatId);

    const student = await this.prisma.studentProfile.findUnique({
      where: { telegramLinkToken: token },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (student) {
      await this.prisma.studentProfile.update({
        where: { id: student.id },
        data: { parentTelegramChatId: chat, telegramLinkedAt: new Date() },
      });
      await this.telegram.sendMessage(
        chat,
        `✅ Ulandingiz!\n\n` +
          `Endi ${student.user.firstName} ${student.user.lastName} haqidagi ` +
          `muhim xabarlar (darsga kelmasa, to'lov muddati) shu botga keladi.\n\n` +
          `Shuningdek:\n` +
          `• /oylik — oylik to'lov holati\n` +
          `• /homework — uyga vazifa\n` +
          `• /grade — baholar\n\n` +
          `Ulanishni bekor qilish: /stop`,
      );
      return;
    }

    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { telegramLinkToken: token },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (teacher) {
      await this.prisma.teacherProfile.update({
        where: { id: teacher.id },
        data: { telegramChatId: chat, telegramLinkedAt: new Date() },
      });
      await this.telegram.sendMessage(
        chat,
        `✅ Ulandingiz, ${teacher.user.firstName}!\n\n` +
          `Endi bot orqali:\n` +
          `• /oylik — oylik tushum va qarzlar\n` +
          `• /davomat — bugungi davomat\n` +
          `• dars boshlanishidan 30 daqiqa oldin eslatma\n\n` +
          `Ulanishni bekor qilish: /stop`,
      );
      return;
    }

    await this.telegram.sendMessage(
      chat,
      `❌ Havola eskirgan yoki noto'g'ri.\n` +
        `Iltimos, saytdagi «Sozlamalar → Telegram» bo'limidan yangi havola oling.`,
    );
  }
}
