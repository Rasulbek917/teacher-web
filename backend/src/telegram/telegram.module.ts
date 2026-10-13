import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { ParentInfoService } from './parent-info.service';
import { PaymentReminderService } from './payment-reminder.service';
import { PaymentReminderController } from './payment-reminder.controller';

@Module({
  controllers: [TelegramController, PaymentReminderController],
  providers: [TelegramService, ParentInfoService, PaymentReminderService],
  exports: [TelegramService, ParentInfoService, PaymentReminderService],
})
export class TelegramModule {}
