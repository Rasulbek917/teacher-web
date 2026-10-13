import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { LessonReminderService } from './lesson-reminder.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private notifications: NotificationsService,
    private lessonReminders: LessonReminderService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }

  /**
   * Sayt ochiq turganda dars eslatmalarini tekshiradi. Vercel (Hobby) da
   * daqiqalik cron ishlamagani uchun bu eng kamida har 5 daqiqada bir marta
   * chaqiriladi; server tomonda 60 sekunddan tez-tez ishlamaydi.
   */
  @Post('lesson-check')
  lessonCheck() {
    this.lessonReminders.checkLessons(60_000);
    return { ok: true };
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
