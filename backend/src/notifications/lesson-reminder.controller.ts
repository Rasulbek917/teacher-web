import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { LessonReminderService } from './lesson-reminder.service';

/**
 * Dars eslatmalarini tashqi scheduler orqali ishga tushirish endpointi.
 *
 * - VPS'da: `@Cron` (LessonReminderService) har daqiqada o'zi ishlaydi.
 * - Vercel'da: doimiy process bo'lmagani uchun bu endpoint Vercel Cron yoki
 *   boshqa scheduler tomonidan chaqiriladi (GET yoki POST).
 *
 * Himoya: `CRON_SECRET` berilgan bo'lsa, quyidagilardan biri bo'lishi shart:
 *   - `Authorization: Bearer <CRON_SECRET>` (Vercel Cron shuni yuboradi),
 *   - `x-cron-secret: <CRON_SECRET>`,
 *   - `?secret=<CRON_SECRET>` (oddiy ping xizmatlari uchun qulay).
 */
@Controller('cron')
export class LessonReminderController {
  constructor(private readonly reminders: LessonReminderService) {}

  private assertCron(
    authorization?: string,
    secret?: string,
    querySecret?: string,
  ) {
    const expected = process.env.CRON_SECRET;
    if (expected) {
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
  }

  @Public()
  @Post('lesson-reminders')
  async runPost(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
    @Query('secret') querySecret?: string,
  ) {
    this.assertCron(authorization, secret, querySecret);
    await this.reminders.checkLessons();
    return { ok: true };
  }

  @Public()
  @Get('lesson-reminders')
  async runGet(
    @Headers('authorization') authorization?: string,
    @Headers('x-cron-secret') secret?: string,
    @Query('secret') querySecret?: string,
  ) {
    this.assertCron(authorization, secret, querySecret);
    await this.reminders.checkLessons();
    return { ok: true };
  }
}

