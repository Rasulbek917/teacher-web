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
import { MaterialsService } from './materials.service';
import { CreateMaterialDto, MaterialsQueryDto, RemoveImageDto, UpdateMaterialDto } from './dto/material.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { multerOptions } from '../files/multer.config';

@Roles(Role.TEACHER)
@Controller('materials')
export class MaterialsController {
  constructor(private materials: MaterialsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: MaterialsQueryDto) {
    return this.materials.list(user.id, query);
  }

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions()))
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMaterialDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.materials.create(user.id, dto, files);
  }

  @Patch(':id')
  @UseInterceptors(FilesInterceptor('files', 10, multerOptions()))
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.materials.update(user.id, id, dto, files);
  }

  @Delete(':id/images')
  removeImage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RemoveImageDto,
  ) {
    return this.materials.removeImage(user.id, id, body.url);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.materials.remove(user.id, id);
  }
}

@Roles(Role.STUDENT)
@Controller('my/materials')
export class StudentMaterialsController {
  constructor(private materials: MaterialsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: MaterialsQueryDto) {
    return this.materials.forStudent(user.id, query);
  }
}
