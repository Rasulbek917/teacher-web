import { Module } from '@nestjs/common';
import {
  AdminDashboardController,
  DashboardController,
} from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController, AdminDashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
