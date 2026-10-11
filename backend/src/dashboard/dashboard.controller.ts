import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { DashboardQueryDto } from './dto/dashboard.dto';

@Roles(Role.TEACHER)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  teacher(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.dashboard.teacherDashboard(user.id, query);
  }
}

@Roles(Role.SUPER_ADMIN)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get()
  admin() {
    return this.dashboard.adminDashboard();
  }
}
