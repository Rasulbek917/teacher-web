import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { ParentInfoService } from './parent-info.service';
import { TeacherInfoService } from './teacher-info.service';
import { PaymentReminderService } from './payment-reminder.service';
import { PaymentReminderController } from './payment-reminder.controller';

@Module({
  controllers: [TelegramController, PaymentReminderController],
  providers: [
    TelegramService,
    ParentInfoService,
    TeacherInfoService,
    PaymentReminderService,
  ],
  exports: [
    TelegramService,
    ParentInfoService,
    TeacherInfoService,
    PaymentReminderService,
  ],
})
export class TelegramModule {}
