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
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Roles(Role.STUDENT)
@Controller('my/groups')
export class StudentGroupsController {
  constructor(private groups: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.groups.forStudent(user.id);
  }
}

@Roles(Role.TEACHER)
@Controller('groups')
export class GroupsController {
  constructor(private groups: GroupsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: any) {
    return this.groups.list(user.id, query);
  }

  @Get('options')
  options(@CurrentUser() user: AuthUser) {
    return this.groups.options(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groups.create(user.id, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.groups.detail(user.id, id);
  }

  @Get(':id/deletion-info')
  deletionInfo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.groups.deletionInfo(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.groups.remove(user.id, id);
  }
}
