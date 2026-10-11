import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { LessonReminderService } from './lesson-reminder.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, LessonReminderService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
