import { Module } from '@nestjs/common';
import {
  PaymentsController,
  StudentPaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [PaymentsController, StudentPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
