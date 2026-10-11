import { Module } from '@nestjs/common';
import {
  StatisticsController,
  StudentStatisticsController,
} from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  controllers: [StatisticsController, StudentStatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
