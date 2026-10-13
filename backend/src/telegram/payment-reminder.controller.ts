import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PaymentReminderService } from './payment-reminder.service';
import { TelegramService } from './telegram.service';

/**
 * Tashqi scheduler (Vercel Cron yoki boshqa) orqali to'lov eslatmalarini
 * ishga tushirish endpointi. VPS'da `@Cron` o'zi ishlaydi.
 *
 * Himoya: `CRON_SECRET` berilgan bo'lsa, `Authorization: Bearer <CRON_SECRET>`,
 * `x-cron-secret: <CRON_SECRET>` yoki `?secret=<CRON_SECRET>` bo'lishi shart.
 */
@Controller('cron')
export class PaymentReminderController {
  constructor(
    private readonly reminders: PaymentReminderService,
    private readonly telegram: TelegramService,
  ) {}

  private assertCron(
    authorization?: string,
    secret?: string,
    querySecret?: string,
  ) {
    const expected = process.env.CRON_SECRET;
    if (!expected) return;
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;
    if (
      secret !== expected &&
      bearer !== expected &&
      querySecret !== expected
    ) {
      throw new ForbiddenException('Ruxsat yo\'q');
    }
  }

  private async runReminders(
    authorization?: string,
    secret?: string,
    querySecret?: string,
  ) {
    this.assertCron(authorization, secret, querySecret);
    return this.reminders.run();
  }

  private async setupTelegram(
    authorization?: string,
    secret?: string,
    querySecret?: string,
  ) {
    this.assertCron(authorization, secret, querySecret);
    const setup = await this.telegram.setupWebhook();
    const info = await this.telegram.webhookInfo();
    return { setup, info };
  }

  @Public()
  @Post('payment-reminders')
  postReminders(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
    @Query('secret') querySecret?: string,
  ) {
    return this.runReminders(authorization, secret, querySecret);
  }

  @Public()
  @Get('payment-reminders')
  getReminders(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
    @Query('secret') querySecret?: string,
  ) {
    return this.runReminders(authorization, secret, querySecret);
  }

  /** Telegram webhook'ni (qayta) o'rnatish — sozlashni tekshirish uchun. */
  @Public()
  @Post('telegram-setup')
  postSetup(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
    @Query('secret') querySecret?: string,
  ) {
    return this.setupTelegram(authorization, secret, querySecret);
  }

  @Public()
  @Get('telegram-setup')
  getSetup(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
    @Query('secret') querySecret?: string,
  ) {
    return this.setupTelegram(authorization, secret, querySecret);
  }
}
