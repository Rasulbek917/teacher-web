import { Module } from '@nestjs/common';
import {
  PaymentsController,
  StudentPaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController, StudentPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
