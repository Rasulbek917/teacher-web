import { Module } from '@nestjs/common';
import { AiTestsController } from './ai-tests.controller';
import { AiTestsService } from './ai-tests.service';

@Module({
  controllers: [AiTestsController],
  providers: [AiTestsService],
})
export class AiTestsModule {}
