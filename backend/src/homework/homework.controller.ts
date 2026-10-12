import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { HomeworkService } from './homework.service';
import {
  CreateHomeworkDto,
  HomeworkQueryDto,
  SubmitHomeworkDto,
  UpdateHomeworkDto,
} from './dto/homework.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { multerOptions } from '../files/multer.config';

@Roles(Role.TEACHER)
@Controller('homework')
export class HomeworkController {
  constructor(private homework: HomeworkService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: HomeworkQueryDto) {
    return this.homework.list(user.id, query);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions()))
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHomeworkDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.homework.create(user.id, dto, files);
  }

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions()))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateHomeworkDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.homework.update(user.id, id, dto, files);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.homework.remove(user.id, id);
  }
}

@Roles(Role.STUDENT)
@Controller('my/homework')
export class StudentHomeworkController {
  constructor(private homework: HomeworkService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: HomeworkQueryDto) {
    return this.homework.forStudent(user.id, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.homework.studentDetail(user.id, id);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitHomeworkDto,
  ) {
    return this.homework.submit(user.id, id, dto.text, undefined, dto.fileUrl);
  }
}
