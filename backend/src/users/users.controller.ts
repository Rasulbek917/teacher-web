import { BadRequestException, Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { FilesService } from '../files/files.service';

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

  /** O'quvchi/o'qituvchi o'z Telegramini ulashi uchun holat va havola. */
  @Get('me/telegram')
  telegramStatus(@CurrentUser() user: AuthUser) {
    return this.users.telegramStatus(user.id);
  }

  @Post('me/telegram/unlink')
  telegramUnlink(@CurrentUser() user: AuthUser) {
    return this.users.telegramUnlinkSelf(user.id);
  }

  /**
   * Avatar fayli avval POST /api/files/upload orqali yuklanadi
   * (scope=AVATAR), so'ng shu yerda URL beriladi. URL avval shu
   * foydalanuvchi yuklagan haqiqiy avatar fayli ekani tekshiriladi.
   */
  @Post('me/avatar')
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @Body() body: { fileUrl?: string },
  ) {
    if (!body.fileUrl) throw new BadRequestException('Fayl yuklanmadi');
    const owned = await this.files.isOwnedAvatarFile(body.fileUrl, user.id);
    if (!owned) {
      throw new BadRequestException("Avatar fayli ruxsat etilmagan");
    }
    return this.users.setAvatar(user.id, body.fileUrl);
  }
}
