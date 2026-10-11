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
import { TeachersService } from './teachers.service';
import {
  CreateTeacherDto,
  DeleteTeacherDto,
  UpdateTeacherDto,
} from './dto/teacher.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Roles(Role.SUPER_ADMIN)
@Controller('teachers')
export class TeachersController {
  constructor(private teachers: TeachersService) {}

  @Get()
  list(@Query() query: any) {
    return this.teachers.list(query);
  }

  @Post()
  create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }

  @Get(':id/deletion-info')
  deletionInfo(@Param('id') id: string) {
    return this.teachers.deletionInfo(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto: DeleteTeacherDto) {
    return this.teachers.remove(id, dto.login);
  }
}
