import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { PaymentReminderService } from './payment-reminder.service';
import { PaymentReminderController } from './payment-reminder.controller';

@Module({
  controllers: [TelegramController, PaymentReminderController],
  providers: [TelegramService, PaymentReminderService],
  exports: [TelegramService, PaymentReminderService],
})
export class TelegramModule {}
