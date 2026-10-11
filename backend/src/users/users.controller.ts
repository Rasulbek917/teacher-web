import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';
import { multerOptions, uploadMaxMb } from '../files/multer.config';
import { FileScope } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(
    private users: UsersService,
    private files: FilesService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Patch('me/preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.users.updatePreferences(user.id, dto);
  }

  @Patch('me/password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.id, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', multerOptions(uploadMaxMb.avatar)))
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const saved = await this.files.save(file, 'avatar', FileScope.AVATAR, null, user.id);
    return this.users.setAvatar(user.id, saved.url);
  }
}
