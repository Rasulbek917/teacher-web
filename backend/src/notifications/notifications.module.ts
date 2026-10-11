import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { LessonReminderService } from './lesson-reminder.service';
import { LessonReminderController } from './lesson-reminder.controller';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [NotificationsController, LessonReminderController],
  providers: [NotificationsService, LessonReminderService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
