import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from './telegram.service';

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
 * Ota-ona botga `/start <token>` yuboradi -> o'sha tokenli o'quvchiga ulanadi.
 * `/stop` -> ulanish bekor qilinadi.
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
            `Bu bot o'quv markazi tomonidan ota-onalarga bildirishnoma yuboradi:\n` +
            `• o'quvchi darsga kelmasa\n` +
            `• oylik to'lov muddati yaqinlashganda\n\n` +
            `Ulanish uchun o'qituvchi bergan havolani oching.\n` +
            `Ulanishni bekor qilish: /stop`,
        );
      }
      return;
    }

    if (cmd === '/stop') {
      const res = await this.prisma.studentProfile.updateMany({
        where: { parentTelegramChatId: String(chatId) },
        data: { parentTelegramChatId: null, telegramLinkedAt: null },
      });
      await this.telegram.sendMessage(
        chatId,
        res.count > 0
          ? `Bildirishnomalar o'chirildi. ❌\nQayta ulanish uchun havolani yana oching.`
          : `Siz hali ulanmagansiz.`,
      );
      return;
    }

    // Boshqa har qanday matn — qisqa yordam.
    await this.telegram.sendMessage(
      chatId,
      `Mavjud buyruqlar:\n/start — ulanish\n/stop — ulanishni bekor qilish`,
    );
  }

  private async link(chatId: number | string, token: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { telegramLinkToken: token },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!profile) {
      await this.telegram.sendMessage(
        chatId,
        `❌ Havola eskirgan yoki noto'g'ri.\nIltimos, o'qituvchidan yangi havola so'rang.`,
      );
      return;
    }

    await this.prisma.studentProfile.update({
      where: { id: profile.id },
      data: {
        parentTelegramChatId: String(chatId),
        telegramLinkedAt: new Date(),
      },
    });

    await this.telegram.sendMessage(
      chatId,
      `✅ Ulandingiz!\n\n` +
        `Endi ${profile.user.firstName} ${profile.user.lastName} haqidagi ` +
        `muhim xabarlar (darsga kelmasa, to'lov muddati) shu botga keladi.\n\n` +
        `Ulanishni bekor qilish: /stop`,
    );
  }
}
