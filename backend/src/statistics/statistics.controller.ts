import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StatisticsService } from './statistics.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import {
  MyStatQueryDto,
  StatGroupQueryDto,
  StatStudentQueryDto,
} from './dto/statistics.dto';

@Roles(Role.TEACHER)
@Controller('statistics')
export class StatisticsController {
  constructor(private statistics: StatisticsService) {}

  @Get('group')
  group(@CurrentUser() user: AuthUser, @Query() query: StatGroupQueryDto) {
    return this.statistics.groupStatistics(query.groupId, user.id, query.date);
  }

  @Get('student')
  student(@CurrentUser() user: AuthUser, @Query() query: StatStudentQueryDto) {
    return this.statistics.studentDetailForTeacher(
      user.id,
      query.studentId,
      query.groupId,
      query.unit || 'week',
      query.date,
    );
  }
}

@Roles(Role.STUDENT)
@Controller('my/statistics')
export class StudentStatisticsController {
  constructor(private statistics: StatisticsService) {}

  @Get()
  my(@CurrentUser() user: AuthUser, @Query() query: MyStatQueryDto) {
    return this.statistics.myStatistics(
      user.id,
      query.unit || 'week',
      query.date,
      query.groupId,
    );
  }
}
