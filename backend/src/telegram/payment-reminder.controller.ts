import { Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PaymentReminderService } from './payment-reminder.service';
import { TelegramService } from './telegram.service';

/**
 * Tashqi scheduler (Vercel Cron yoki boshqa) orqali to'lov eslatmalarini
 * ishga tushirish endpointi. VPS'da `@Cron` o'zi ishlaydi.
 *
 * Vercel Cron GET so'rov yuboradi va (CRON_SECRET o'rnatilgan bo'lsa)
 * `Authorization: Bearer <CRON_SECRET>` sarlavhasini avtomatik qo'shadi.
 * Shuning uchun har ikkala metod (GET/POST) qo'llab-quvvatlanadi.
 */
@Controller('cron')
export class PaymentReminderController {
  constructor(
    private readonly reminders: PaymentReminderService,
    private readonly telegram: TelegramService,
  ) {}

  private assertCron(authorization?: string, secret?: string) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return;
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    if (secret !== expected && bearer !== expected) {
      throw new ForbiddenException('Ruxsat yo\'q');
    }
  }

  private async runReminders(authorization?: string, secret?: string) {
    this.assertCron(authorization, secret);
    return this.reminders.run();
  }

  private async setupTelegram(authorization?: string, secret?: string) {
    this.assertCron(authorization, secret);
    const setup = await this.telegram.setupWebhook();
    const info = await this.telegram.webhookInfo();
    return { setup, info };
  }

  @Public()
  @Post('payment-reminders')
  postReminders(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    return this.runReminders(authorization, secret);
  }

  @Public()
  @Get('payment-reminders')
  getReminders(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    return this.runReminders(authorization, secret);
  }

  /** Telegram webhook'ni (qayta) o'rnatish — sozlashni tekshirish uchun. */
  @Public()
  @Post('telegram-setup')
  postSetup(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    return this.setupTelegram(authorization, secret);
  }

  @Public()
  @Get('telegram-setup')
  getSetup(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    return this.setupTelegram(authorization, secret);
  }
}
