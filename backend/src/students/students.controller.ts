import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { StudentsService } from './students.service';
import {
  CreateStudentDto,
  SetStudentBlockedDto,
  SetStudentPasswordDto,
  UpdateStudentDto,
} from './dto/student.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Roles(Role.TEACHER)
@Controller('students')
export class StudentsController {
  constructor(private students: StudentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.students.list(user.id, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.students.create(user.id, dto);
  }

  @Get(':id/deletion-info')
  deletionInfo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.students.deletionInfo(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.update(user.id, id, dto);
  }

  @Patch(':id/password')
  setPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetStudentPasswordDto,
  ) {
    return this.students.setPassword(user.id, id, dto.newPassword);
  }

  @Patch(':id/block')
  setBlocked(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetStudentBlockedDto,
  ) {
    return this.students.setBlocked(user.id, id, dto.isBlocked);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.students.remove(user.id, id);
  }
}
