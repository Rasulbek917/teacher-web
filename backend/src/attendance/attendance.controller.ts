import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { AttendanceQueryDto, SaveAttendanceDto } from './dto/attendance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Roles(Role.TEACHER)
@Controller('attendance')
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query() query: AttendanceQueryDto) {
    return this.attendance.getForDate(
      user.id,
      query.groupId,
      query.date || '',
      query.homeworkId,
    );
  }

  @Post()
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveAttendanceDto) {
    return this.attendance.save(user.id, dto);
  }
}
