import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { LessonReminderService } from './lesson-reminder.service';
import { LessonReminderController } from './lesson-reminder.controller';
import { ChatModule } from '../chat/chat.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [ChatModule, TelegramModule],
  controllers: [NotificationsController, LessonReminderController],
  providers: [NotificationsService, LessonReminderService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
