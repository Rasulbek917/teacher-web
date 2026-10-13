import { Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PaymentReminderService } from './payment-reminder.service';
import { TelegramService } from './telegram.service';

/**
 * Tashqi scheduler (Vercel Cron yoki boshqa) orqali to'lov eslatmalarini
 * ishga tushirish endpointi. VPS'da `@Cron` o'zi ishlaydi.
 *
 * Himoya: `CRON_SECRET` berilgan bo'lsa `Authorization: Bearer <secret>`
 * yoki `x-cron-secret: <secret>` bo'lishi shart.
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

  @Public()
  @Post('payment-reminders')
  async run(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    this.assertCron(authorization, secret);
    return this.reminders.run();
  }

  /** Telegram webhook'ni (qayta) o'rnatish — sozlashni tekshirish uchun. */
  @Public()
  @Post('telegram-setup')
  async setup(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    this.assertCron(authorization, secret);
    const setup = await this.telegram.setupWebhook();
    const info = await this.telegram.webhookInfo();
    return { setup, info };
  }
}
