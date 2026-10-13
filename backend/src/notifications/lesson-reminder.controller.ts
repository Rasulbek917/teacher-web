import { Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { LessonReminderService } from './lesson-reminder.service';

/**
 * Dars eslatmalarini tashqi scheduler orqali ishga tushirish endpointi.
 *
 * - VPS'da: `@Cron` (LessonReminderService) har daqiqada o'zi ishlaydi.
 * - Vercel'da: doimiy process bo'lmagani uchun bu endpoint Vercel Cron yoki
 *   boshqa scheduler tomonidan chaqiriladi (GET yoki POST).
 *
 * Himoya: `CRON_SECRET` berilgan bo'lsa, so'rovda
 * `Authorization: Bearer <CRON_SECRET>` yoki `x-cron-secret: <CRON_SECRET>`
 * bo'lishi shart. (Vercel Cron aynan `Authorization: Bearer` yuboradi.)
 */
@Controller('cron')
export class LessonReminderController {
  constructor(private readonly reminders: LessonReminderService) {}

  private assertCron(authorization?: string, secret?: string) {
    const expected = process.env.CRON_SECRET;
    if (expected) {
      const bearer = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined;
      if (secret !== expected && bearer !== expected) {
        throw new ForbiddenException('Ruxsat yo\'q');
      }
    }
  }

  @Public()
  @Post('lesson-reminders')
  async runPost(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    this.assertCron(authorization, secret);
    await this.reminders.checkLessons();
    return { ok: true };
  }

  @Public()
  @Get('lesson-reminders')
  async runGet(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
  ) {
    this.assertCron(authorization, secret);
    await this.reminders.checkLessons();
    return { ok: true };
  }
}

